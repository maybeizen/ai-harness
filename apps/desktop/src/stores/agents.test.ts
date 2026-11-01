// @vitest-environment jsdom
import { beforeEach, it, expect, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import type * as AgentTransport from '../transport/agent';
import type { AgentOperation } from '@harness/contracts';
import { useAgentsStore } from './agents';
const backend = vi.hoisted(() => ({
  start: vi.fn(),
  resume: vi.fn(),
  operation: vi.fn<(operation: AgentOperation) => Promise<unknown>>(),
}));
vi.mock('../transport/agent', async (importOriginal) => ({
  ...(await importOriginal<typeof AgentTransport>()),
  useAgentBackend: () => backend,
}));
vi.mock('./settings', () => ({
  useSettingsStore: () => ({
    settings: {
      activeDirectory: '00000000-0000-4000-8000-000000000001',
      selectedMode: 'agent',
      permissionPolicy: 'manual',
    },
  }),
}));
vi.mock('./connections', () => ({
  useConnectionsStore: () => ({
    selected: 'openai',
    modelId: 'fixture',
    ready: true,
  }),
}));
const chatState = vi.hoisted(() => ({
  draft: 'Task',
  conversationId: '00000000-0000-4000-8000-000000000005',
  flushDraft: vi.fn<() => Promise<void>>(),
  selection: vi.fn(() =>
    Promise.resolve({
      provider: 'openai' as const,
      model: 'fixture',
      mode: 'agent' as const,
      sources: {
        provider: 'global' as const,
        model: 'global' as const,
        mode: 'global' as const,
      },
    }),
  ),
}));
vi.mock('./chat', () => ({ useChatStore: () => chatState }));
const id = '00000000-0000-4000-8000-000000000002';
beforeEach(() => {
  setActivePinia(createPinia());
  vi.resetAllMocks();
  chatState.draft = 'Task';
  chatState.conversationId = '00000000-0000-4000-8000-000000000005';
  chatState.flushDraft.mockResolvedValue(undefined);
  chatState.selection.mockResolvedValue({
    provider: 'openai',
    model: 'fixture',
    mode: 'agent',
    sources: { provider: 'global', model: 'global', mode: 'global' },
  });
});
it('continues byte-limited terminal pages until an empty page rather than assuming 20 records', async () => {
  vi.useFakeTimers();
  backend.operation.mockImplementation((operation) => {
    if (operation.action === 'list') return Promise.resolve([]);
    if (operation.action !== 'poll') return Promise.resolve(null);
    const after = operation.after;
    return Promise.resolve({
      id,
      status: 'completed',
      events:
        after < 3
          ? [
              {
                sequence: after + 1,
                event: {
                  type: 'text',
                  sessionId: id,
                  text: `part${after + 1}`,
                },
              },
            ]
          : [],
      nextCursor: Math.min(after + 1, 3),
    });
  });
  const store = useAgentsStore();
  try {
    await store.select(id);
    await vi.advanceTimersByTimeAsync(600);
    expect(store.events).toHaveLength(3);
    expect(
      backend.operation.mock.calls.filter((call) => call[0].action === 'poll'),
    ).toHaveLength(4);
  } finally {
    store.$dispose();
    vi.useRealTimers();
  }
});
it('rejects stale activity from an earlier selected task', async () => {
  let release!: (value: unknown) => void;
  backend.operation
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    )
    .mockResolvedValue({ id, status: 'completed', events: [], nextCursor: 0 });
  const store = useAgentsStore();
  const first = store.select('00000000-0000-4000-8000-000000000003');
  await store.select(id);
  release({
    id: '00000000-0000-4000-8000-000000000003',
    status: 'running',
    events: [
      { sequence: 1, event: { type: 'text', sessionId: id, text: 'stale' } },
    ],
    nextCursor: 1,
  });
  await first;
  expect(store.selectedId).toBe(id);
  expect(store.events).toEqual([]);
  store.$dispose();
});

it('preserves a different conversation draft and task selected during delayed authentication', async () => {
  let accept!: () => void;
  backend.start.mockReturnValue(
    new Promise<void>((resolve) => {
      accept = resolve;
    }),
  );
  backend.operation.mockImplementation((operation) =>
    Promise.resolve(
      operation.action === 'list'
        ? []
        : { id, status: 'completed', events: [], nextCursor: 0 },
    ),
  );
  const store = useAgentsStore();
  const sending = store.send();
  chatState.conversationId = '00000000-0000-4000-8000-000000000009';
  chatState.draft = 'New unsent prompt';
  await store.select(id);
  accept();
  await sending;
  expect(chatState.draft).toBe('New unsent prompt');
  expect(chatState.flushDraft).not.toHaveBeenCalled();
  expect(store.selectedId).toBe(id);
  store.$dispose();
});
it('rejects an oversized task without leaving startup stuck', async () => {
  chatState.draft = 'x'.repeat(65537);
  const store = useAgentsStore();
  await store.send();
  expect(store.starting).toBe(false);
  expect(store.error?.code).toBe('INVALID_REQUEST');
  expect(backend.start).not.toHaveBeenCalled();
  store.$dispose();
});
