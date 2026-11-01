import { it, expect, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  agentPollSchema,
  agentRequestSchema,
  directorySchema,
  type AgentEvent,
} from '@harness/contracts';
import type { ProviderTurnEvent, ProviderTurnInput } from '@harness/providers';
import { openDatabase } from '../storage/database';
import { Workspaces } from '../workspaces/service';
import { AgentService } from './service';
import { AgentPersistence } from './persistence';
import { CheckpointStore } from './checkpoint';
const usage = {
  inputTokens: 20,
  outputTokens: 10,
  totalTokens: 30,
  inputTokenDetails: {
    noCacheTokens: 20,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
  },
  outputTokenDetails: { textTokens: 10, reasoningTokens: 0 },
};
const finish = (): ProviderTurnEvent => ({
  type: 'finish',
  reason: 'stop',
  usage,
  messages: [],
});
it('continues an interrupted session from its transcript and pending approval', async () => {
  const root = await mkdtemp(join(tmpdir(), 'agent-resume-'));
  const databasePath = join(root, 'data.sqlite');
  let db = openDatabase(databasePath);
  const firstWorkspaces = new Workspaces(db);
  const workspace = directorySchema.parse(
    await firstWorkspaces.dispatch({ action: 'register', path: root }),
  );
  const input = agentRequestSchema.parse({
    id: randomUUID(),
    workspaceId: workspace.id,
    mode: 'edit',
    policy: 'manual',
    prompt: 'Resume the edit.',
  });
  try {
    const persistence = new AgentPersistence(db);
    persistence.reserve(input);
    persistence.markRunning(input.id);
    new CheckpointStore(db).save(input.id, {
      step: 1,
      groups: [],
      summary: 'Read the fixture.',
      queued: [
        {
          id: 'write-1',
          name: 'write_file',
          input: {
            path: 'resumed.txt',
            text: 'restored',
            expectedHash: null,
          },
        },
      ],
      assistant: [],
      reportedTokens: 30,
      findingsReported: false,
    });
    await firstWorkspaces.close();
    db.close();
    db = openDatabase(databasePath);
    let sawSummary = false;
    let baseURL: string | undefined;
    const service = new AgentService(db, new Workspaces(db), async function* (
      turn: ProviderTurnInput,
    ) {
      await Promise.resolve();
      sawSummary = JSON.stringify(turn.messages).includes('Read the fixture.');
      baseURL = turn.baseURL;
      yield { type: 'text', text: 'Continued.' };
      yield finish();
    });
    expect(new AgentPersistence(db).get(input.id)?.status).toBe('resumable');
    await service.dispatch({
      action: 'resume',
      id: input.id,
      connectionId: 'custom',
      modelId: 'fixture',
      credential: '',
      baseURL: 'http://127.0.0.1:9/v1',
    });
    let approval: Extract<AgentEvent, { type: 'approval' }> | undefined;
    await vi.waitFor(async () => {
      const polled = agentPollSchema.parse(
        await service.dispatch({ action: 'poll', id: input.id, after: 0 }),
      );
      approval = polled.events
        .map((item) => item.event)
        .find((item) => item.type === 'approval');
      expect(approval).toBeDefined();
    });
    await expect(readFile(join(root, 'resumed.txt'))).rejects.toThrow();
    await service.dispatch({
      action: 'approve',
      decision: {
        id: approval!.approval.id,
        requestHash: approval!.approval.requestHash,
        decision: 'allow',
      },
    });
    await vi.waitFor(async () => {
      expect(
        agentPollSchema.parse(
          await service.dispatch({ action: 'poll', id: input.id, after: 0 }),
        ).status,
      ).toBe('completed');
    });
    expect(await readFile(join(root, 'resumed.txt'), 'utf8')).toBe('restored');
    expect(sawSummary).toBe(true);
    expect(baseURL).toBe('http://127.0.0.1:9/v1');
    const saved = JSON.stringify(
      db.prepare('SELECT * FROM agent_sessions').all(),
    );
    expect(saved).not.toContain('PRIVATE');
    await service.close();
  } finally {
    db.close();
    await rm(root, { recursive: true, force: true });
  }
});
it('stores provider-usage compaction in the following turn', async () => {
  const root = await mkdtemp(join(tmpdir(), 'agent-compact-'));
  const db = openDatabase(':memory:');
  const workspaces = new Workspaces(db);
  const workspace = directorySchema.parse(
    await workspaces.dispatch({ action: 'register', path: root }),
  );
  const input = agentRequestSchema.parse({
    id: randomUUID(),
    workspaceId: workspace.id,
    mode: 'agent',
    policy: 'full',
    prompt: 'List twice',
    maxContextTokens: 4000,
    maxSteps: 4,
  });
  let turn = 0;
  let sawSummary = false;
  const service = new AgentService(db, workspaces, async function* (next) {
    await Promise.resolve();
    if (
      JSON.stringify(next.messages).includes('Stored summary of earlier turns')
    )
      sawSummary = true;
    if (turn++ < 2) {
      yield {
        type: 'call',
        id: `list-${turn}`,
        name: 'list_directory',
        input: { path: '' },
      };
      yield {
        type: 'finish',
        reason: 'tool-calls',
        usage: { ...usage, totalTokens: 50000 },
        messages: [
          {
            role: 'assistant',
            content: [
              {
                type: 'tool-call',
                toolCallId: `list-${turn}`,
                toolName: 'list_directory',
                input: { path: '' },
              },
            ],
          },
        ],
      };
    } else {
      yield { type: 'text', text: 'Done.' };
      yield finish();
    }
  });
  try {
    await service.dispatch({ action: 'reserve', request: input });
    await service.dispatch({
      action: 'start',
      id: input.id,
      connectionId: 'openai',
      modelId: 'fixture',
      credential: 'private',
    });
    await vi.waitFor(async () => {
      expect(
        agentPollSchema.parse(
          await service.dispatch({ action: 'poll', id: input.id, after: 0 }),
        ).status,
      ).toBe('completed');
    });
    expect(sawSummary).toBe(true);
    const checkpoint = new CheckpointStore(db).load(input.id);
    expect(checkpoint?.summary).toContain('list_directory');
  } finally {
    await service.close();
    await workspaces.close();
    db.close();
    await rm(root, { recursive: true, force: true });
  }
});
