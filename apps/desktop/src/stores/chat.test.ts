// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import type {
  Conversation,
  StorageOperation,
  GenerationInput,
  ChatEvent,
} from '@harness/contracts';
import { useChatStore } from './chat';
import { useSettingsStore } from './settings';
const backend = vi.hoisted(() => ({
  storage: vi.fn<(operation: StorageOperation) => Promise<unknown>>(),
  start: vi.fn(),
  cancel: vi.fn(),
  copy: vi.fn(),
}));
vi.mock('../transport/backend', () => ({ useBackend: () => backend }));
vi.mock('./connections', () => ({
  useConnectionsStore: () => ({
    ready: true,
    selected: 'openai',
    modelId: 'test',
    model: { name: 'Test' },
    failModel: vi.fn(),
  }),
}));
function conversation(id: string): Conversation {
  return {
    id,
    title: id,
    pinned: false,
    updatedAt: 1,
    messages: [
      { id: `${id}-message`, role: 'user', text: id, status: 'completed' },
    ],
  };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}
beforeEach(() => {
  setActivePinia(createPinia());
  vi.clearAllMocks();
  backend.storage.mockResolvedValue([]);
  backend.cancel.mockResolvedValue(undefined);
  backend.copy.mockResolvedValue(undefined);
  backend.start.mockResolvedValue(() => undefined);
});
it('ignores an older conversation load that finishes after a later selection', async () => {
  const first = deferred<Conversation>();
  const second = deferred<Conversation>();
  backend.storage.mockImplementation(
    (operation: { action: string; id?: string }) =>
      operation.id === 'first' ? first.promise : second.promise,
  );
  const chat = useChatStore();
  const loadingFirst = chat.selectConversation('first');
  const loadingSecond = chat.selectConversation('second');
  second.resolve(conversation('second'));
  await loadingSecond;
  first.resolve(conversation('first'));
  await loadingFirst;
  expect(chat.conversationId).toBe('second');
  expect(chat.messages[0]?.text).toBe('second');
  expect(useSettingsStore().settings.activeConversation).toBe('second');
});
it('new chat invalidates an unfinished history load', async () => {
  const pending = deferred<Conversation>();
  backend.storage.mockReturnValue(pending.promise);
  const chat = useChatStore();
  const loading = chat.selectConversation('old');
  await chat.newChat();
  const freshId = chat.conversationId;
  pending.resolve(conversation('old'));
  await loading;
  expect(chat.conversationId).toBe(freshId);
  expect(chat.messages).toEqual([]);
});
it('a failed deletion preserves the conversation and reports failure', async () => {
  const chat = useChatStore();
  chat.messages = conversation('current').messages;
  const id = chat.conversationId;
  backend.storage.mockRejectedValue(new Error('disk unavailable'));
  expect(await chat.deleteConversation(id)).toBe(false);
  expect(chat.messages).toHaveLength(1);
  expect(chat.conversationId).toBe(id);
  expect(chat.error).not.toBeNull();
});
it('preserves the submitted draft when the native start command fails', async () => {
  const chat = useChatStore();
  chat.draft = 'Do not lose this';
  backend.start.mockRejectedValue(new Error('runtime unavailable'));
  backend.storage.mockImplementation((operation) =>
    Promise.resolve(operation.action === 'get' ? null : []),
  );
  await chat.send();
  expect(chat.draft).toBe('Do not lose this');
  expect(chat.active).toBe(false);
  expect(chat.messages).toEqual([]);
  expect(
    backend.storage.mock.calls.every(
      ([operation]) =>
        operation.action === 'list' || operation.action === 'get',
    ),
  ).toBe(true);
});
it('a late new-chat cancellation cannot overwrite a newer selection', async () => {
  const stopped = deferred<void>();
  backend.cancel.mockReturnValue(stopped.promise);
  backend.storage.mockImplementation((operation: { action: string }) =>
    Promise.resolve(operation.action === 'get' ? conversation('selected') : []),
  );
  const chat = useChatStore();
  chat.draft = 'slow';
  await chat.send();
  const creating = chat.newChat();
  const selecting = chat.selectConversation('selected');
  stopped.resolve(undefined);
  await Promise.all([creating, selecting]);
  expect(chat.conversationId).toBe('selected');
  expect(chat.messages[0]?.text).toBe('selected');
});
it('deleting during an existing stop waits for cancellation before deleting storage', async () => {
  const pending = deferred<void>();
  backend.cancel.mockReturnValue(pending.promise);
  const chat = useChatStore();
  chat.draft = 'running';
  await chat.send();
  const stopping = chat.stop();
  const deleting = chat.deleteConversation(chat.conversationId);
  await Promise.resolve();
  expect(
    backend.storage.mock.calls.some(
      ([operation]) => operation.action === 'delete',
    ),
  ).toBe(false);
  pending.resolve(undefined);
  await Promise.all([stopping, deleting]);
  expect(backend.cancel).toHaveBeenCalledTimes(1);
  expect(
    backend.storage.mock.calls.some(
      ([operation]) => operation.action === 'delete',
    ),
  ).toBe(true);
});
it('a lost start acknowledgement restores accepted messages without duplicating the draft', async () => {
  let accepted: Conversation | null = null;
  backend.start.mockImplementation(
    (input: {
      conversationId: string;
      messages: { id: string; role: 'user' | 'assistant'; text: string }[];
    }) => {
      accepted = {
        ...conversation(input.conversationId),
        messages: input.messages.map((message) => ({
          ...message,
          status: 'completed' as const,
        })),
      };
      return Promise.reject(new Error('acknowledgement lost'));
    },
  );
  backend.storage.mockImplementation((operation) =>
    Promise.resolve(operation.action === 'get' ? accepted : []),
  );
  const chat = useChatStore();
  chat.draft = 'Accepted once';
  await chat.send();
  expect(chat.draft).toBe('');
  expect(chat.messages.map((message) => message.text)).toEqual([
    'Accepted once',
  ]);
  expect(chat.active).toBe(false);
});
it('blocks another send after completion until pending cancellation settles', async () => {
  const pending = deferred<void>();
  backend.cancel.mockReturnValue(pending.promise);
  const chat = useChatStore();
  chat.draft = 'first';
  await chat.send();
  const first = backend.start.mock.calls[0] as [
    GenerationInput,
    (event: ChatEvent) => void,
  ];
  const stopping = chat.stop();
  first[1]({
    type: 'done',
    status: 'completed',
    generationId: first[0].generationId,
    conversationId: first[0].conversationId,
    sequence: 0,
  });
  chat.draft = 'second';
  expect(chat.canSend).toBe(false);
  await chat.send();
  expect(backend.start).toHaveBeenCalledTimes(1);
  pending.resolve(undefined);
  await stopping;
  expect(chat.canSend).toBe(true);
});
it('a cancellation failure keeps the active conversation and allows cancellation retry', async () => {
  backend.cancel.mockRejectedValueOnce(new Error('native cancellation failed'));
  const chat = useChatStore();
  chat.draft = 'running';
  await chat.send();
  const original = chat.conversationId;
  await chat.newChat();
  expect(chat.conversationId).toBe(original);
  expect(chat.active).toBe(true);
  expect(chat.stopping).toBe(false);
  expect(chat.error).not.toBeNull();
  chat.draft = 'blocked';
  expect(chat.canSend).toBe(false);
  await chat.stop();
  expect(chat.active).toBe(false);
  expect(backend.cancel).toHaveBeenCalledTimes(2);
});
it('blocks another send while a rejected start is being reconciled', async () => {
  const pending = deferred<Conversation | null>();
  backend.start.mockRejectedValueOnce(new Error('lost acknowledgement'));
  backend.storage.mockImplementation((operation) =>
    operation.action === 'get' ? pending.promise : Promise.resolve([]),
  );
  const chat = useChatStore();
  chat.draft = 'first';
  const sending = chat.send();
  await Promise.resolve();
  await Promise.resolve();
  chat.draft = 'second';
  expect(chat.canSend).toBe(false);
  await chat.send();
  expect(backend.start).toHaveBeenCalledTimes(1);
  pending.resolve(null);
  await sending;
  expect(chat.draft).toBe('second');
  expect(chat.canSend).toBe(true);
});
it('blocks sending while a conversation switch is loading', async () => {
  const pending = deferred<Conversation>();
  backend.storage.mockReturnValue(pending.promise);
  const chat = useChatStore();
  chat.draft = 'old draft';
  const selecting = chat.selectConversation('target');
  expect(chat.canSend).toBe(false);
  await chat.send();
  expect(backend.start).not.toHaveBeenCalled();
  pending.resolve(conversation('target'));
  await selecting;
  expect(chat.conversationId).toBe('target');
  expect(chat.historyLoading).toBe(false);
});
