import { it, expect, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { agentRequestSchema, type AgentEvent } from '@harness/contracts';
import type {
  ProviderTurnEvent,
  ProviderTurnInput,
  ProviderMessage,
} from '@harness/providers';
import { Toolbox } from './toolbox';
import { createAgentSession, type AgentOptions } from './engine';
import { AgentSessions } from './sessions';
const request = () =>
  agentRequestSchema.parse({
    id: randomUUID(),
    workspaceId: randomUUID(),
    mode: 'agent',
    policy: 'manual',
    prompt: 'Create a.txt',
  });
const usage = {
  inputTokens: 1,
  outputTokens: 1,
  totalTokens: 2,
  inputTokenDetails: {
    noCacheTokens: 1,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
  },
  outputTokenDetails: { textTokens: 1, reasoningTokens: 0 },
};
function finish(
  messages: ProviderMessage[] = [],
  reason: 'stop' | 'tool-calls' = 'stop',
): ProviderTurnEvent {
  return { type: 'finish', reason, usage, messages };
}
function options(root: string, events: AgentEvent[]): AgentOptions {
  return {
    kind: 'openai',
    modelId: 'fixture',
    credential: 'fixture-secret',
    toolbox: new Toolbox({
      get: (id) =>
        Promise.resolve({ id, path: root, name: 'fixture', available: true }),
      dispatch: () => Promise.resolve({ entries: [] }),
    }),
    emit: (event) => {
      events.push(event);
      return Promise.resolve();
    },
    approve: (item) =>
      Promise.resolve({
        id: item.id,
        requestHash: item.requestHash,
        decision: 'allow',
      }),
    audit: () => Promise.resolve(),
  };
}
it('runs a genuine structured tool turn only after exact approval and continues with tool results', async () => {
  const root = await mkdtemp(join(tmpdir(), 'agent-loop-'));
  const events: AgentEvent[] = [];
  let step = 0;
  let continuation: ProviderMessage[] = [];
  const configuration = options(root, events);
  configuration.turn = async function* (input: ProviderTurnInput) {
    await Promise.resolve();
    if (step++ === 0) {
      yield {
        type: 'call',
        id: 'write1',
        name: 'write_file',
        input: { path: 'a.txt', text: 'created', expectedHash: null },
      };
      yield finish(
        [
          {
            role: 'assistant',
            content: [
              {
                type: 'tool-call',
                toolCallId: 'write1',
                toolName: 'write_file',
                input: { path: 'a.txt', text: 'created', expectedHash: null },
              },
            ],
          },
        ],
        'tool-calls',
      );
    } else {
      continuation = input.messages;
      yield { type: 'text', text: 'Created a.txt.' };
      yield finish();
    }
  };
  try {
    const result = await createAgentSession(request(), configuration).run();
    expect(result.status).toBe('completed');
    expect(result.steps).toBe(2);
    expect(await readFile(join(root, 'a.txt'), 'utf8')).toBe('created');
    expect(events.some((item) => item.type === 'approval')).toBe(true);
    expect(continuation.some((message) => message.role === 'tool')).toBe(true);
    expect(events.findIndex((item) => item.type === 'approval')).toBeLessThan(
      events.findIndex(
        (item) => item.type === 'tool' && item.status === 'running',
      ),
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
it('cancels a paused approval without performing the file effect', async () => {
  const root = await mkdtemp(join(tmpdir(), 'agent-cancel-'));
  const events: AgentEvent[] = [];
  let ready!: () => void;
  const waiting = new Promise<void>((resolve) => {
    ready = resolve;
  });
  const configuration = options(root, events);
  configuration.approve = () => {
    ready();
    return new Promise(() => undefined);
  };
  configuration.turn = async function* () {
    await Promise.resolve();
    yield {
      type: 'call',
      id: 'write',
      name: 'write_file',
      input: { path: 'a.txt', text: 'no', expectedHash: null },
    };
    yield finish([], 'tool-calls');
  };
  const session = createAgentSession(request(), configuration);
  try {
    const running = session.run();
    await waiting;
    session.cancel();
    expect((await running).status).toBe('cancelled');
    await expect(readFile(join(root, 'a.txt'))).rejects.toThrow();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
it('bounds duplicate calls, session concurrency and step counts without running arbitrary commands', async () => {
  const events: AgentEvent[] = [];
  const configuration = options('/unused', events);
  let step = 0;
  configuration.turn = async function* () {
    await Promise.resolve();
    yield {
      type: 'call',
      id: `list${step++}`,
      name: 'list_directory',
      input: { path: '' },
    };
    yield finish([], 'tool-calls');
  };
  const initial = request();
  expect(
    configuration.toolbox
      .definitions(initial)
      .some((tool) => tool.name === 'execute_command'),
  ).toBe(false);
  const outcome = await createAgentSession(
    { ...initial, maxSteps: 2 },
    configuration,
  ).run();
  expect(outcome.status).toBe('limited');
  expect(outcome.steps).toBe(2);
  const waiting = options('/unused', []);
  let started!: () => void;
  const ready = new Promise<void>((resolve) => {
    started = resolve;
  });
  waiting.turn = async function* (input) {
    started();
    await new Promise<void>((resolve) =>
      input.signal.addEventListener('abort', () => resolve(), { once: true }),
    );
    input.signal.throwIfAborted();
    yield finish();
  };
  const sessions = new AgentSessions(1);
  const running = sessions.start(request(), waiting);
  await ready;
  expect(() => sessions.start(request(), waiting)).toThrow('limit');
  await sessions.close();
  expect((await running).status).toBe('cancelled');
  expect(sessions.active).toBe(0);
});
it('reports a failed tool honestly and limits repeated operations', async () => {
  const events: AgentEvent[] = [];
  const configuration = options('/unused', events);
  let index = 0;
  configuration.turn = async function* () {
    await Promise.resolve();
    yield {
      type: 'call',
      id: `missing${index++}`,
      name: 'execute_command',
      input: { command: 'unsafe' },
    };
    yield finish([], 'tool-calls');
  };
  const audit = vi.fn<AgentOptions['audit']>(() => Promise.resolve());
  configuration.audit = audit;
  const outcome = await createAgentSession(request(), configuration).run();
  expect(outcome.status).toBe('limited');
  expect(events.some((item) => item.type === 'result' && !item.ok)).toBe(true);
  expect(index).toBe(4);
  expect(JSON.stringify(audit.mock.calls)).not.toContain('unsafe');
  expect(JSON.stringify(audit.mock.calls)).not.toContain('fixture-secret');
});
it('delegates real independent child sessions with two-child concurrency and no recursive delegation', async () => {
  const events: AgentEvent[] = [];
  const configuration = options('/unused', events);
  const initial = { ...request(), mode: 'multitask' as const };
  const sessions = new AgentSessions(3);
  let activeChildren = 0;
  let peak = 0;
  let release!: () => void;
  const barrier = new Promise<void>((resolve) => {
    release = resolve;
  });
  let parentTurn = 0;
  const childPrompts: string[] = [];
  configuration.turn = async function* (input) {
    await Promise.resolve();
    const user = input.messages.find(
      (message) => message.role === 'user',
    )?.content;
    if (typeof user === 'string' && user.startsWith('child-')) {
      expect(input.tools.some((tool) => tool.name === 'delegate_tasks')).toBe(
        false,
      );
      childPrompts.push(user);
      activeChildren++;
      peak = Math.max(peak, activeChildren);
      if (activeChildren === 2) release();
      await barrier;
      yield { type: 'text', text: `Finished ${user}` };
      activeChildren--;
      yield finish();
    } else if (parentTurn++ === 0) {
      expect(input.tools.some((tool) => tool.name === 'delegate_tasks')).toBe(
        true,
      );
      yield {
        type: 'call',
        id: 'delegate',
        name: 'delegate_tasks',
        input: {
          tasks: [
            { prompt: 'child-a' },
            { prompt: 'child-b' },
            { prompt: 'child-c' },
          ],
        },
      };
      yield finish([], 'tool-calls');
    } else {
      yield finish();
    }
  };
  const outcome = await sessions.start(initial, configuration);
  expect(outcome.status).toBe('completed');
  expect(peak).toBe(2);
  expect(childPrompts).toEqual(['child-a', 'child-b', 'child-c']);
  expect(sessions.active).toBe(0);
  expect(
    events.filter(
      (event) => event.type === 'subtask' && event.status === 'completed',
    ),
  ).toHaveLength(3);
});
it('denies a changed approval and never writes the requested file', async () => {
  const root = await mkdtemp(join(tmpdir(), 'agent-deny-'));
  const events: AgentEvent[] = [];
  const configuration = options(root, events);
  let count = 0;
  configuration.approve = (item) =>
    Promise.resolve({
      id: item.id,
      requestHash: '0'.repeat(64),
      decision: 'allow',
    });
  configuration.turn = async function* () {
    await Promise.resolve();
    if (count++ === 0) {
      yield {
        type: 'call',
        id: 'change',
        name: 'write_file',
        input: { path: 'no.txt', text: 'unsafe', expectedHash: null },
      };
      yield finish([], 'tool-calls');
    } else {
      yield { type: 'text', text: 'The operation was denied.' };
      yield finish();
    }
  };
  const audit = vi.fn<AgentOptions['audit']>(() => Promise.resolve());
  configuration.audit = audit;
  try {
    await createAgentSession(request(), configuration).run();
    await expect(readFile(join(root, 'no.txt'))).rejects.toThrow();
    expect(events.some((event) => event.type === 'result' && !event.ok)).toBe(
      true,
    );
    expect(
      audit.mock.calls.some(([record]) => record.status === 'denied'),
    ).toBe(true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
it('aborts upstream on cancellation before its first output and respects context limits', async () => {
  const events: AgentEvent[] = [];
  const configuration = options('/unused', events);
  let begin!: () => void;
  const ready = new Promise<void>((resolve) => {
    begin = resolve;
  });
  let aborted = false;
  configuration.turn = async function* (input) {
    begin();
    await new Promise<void>((resolve) =>
      input.signal.addEventListener(
        'abort',
        () => {
          aborted = true;
          resolve();
        },
        { once: true },
      ),
    );
    input.signal.throwIfAborted();
    yield finish();
  };
  const session = createAgentSession(request(), configuration);
  const running = session.run();
  await ready;
  session.cancel();
  expect((await running).status).toBe('cancelled');
  expect(aborted).toBe(true);
  const impossible = createAgentSession(
    { ...request(), prompt: 'x'.repeat(5000), maxContextBytes: 4096 },
    options('/unused', []),
  );
  expect((await impossible.run()).status).toBe('limited');
});
