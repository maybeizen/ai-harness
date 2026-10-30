import { createApp } from 'vue';
import { createPinia } from 'pinia';
import {
  connectionKinds,
  connectionLabels,
  type ConnectionSummary,
  type ConnectionKind,
  type GenerationInput,
  type ChatEvent,
  type Conversation,
  settingsSchema,
} from '@harness/contracts';
import type { Backend, Discovery } from '../src/transport/backend';
import { backendKey } from '../src/transport/backend';
import App from '../src/App.vue';
import '../src/styles.css';
const connected = new Set<ConnectionKind>(
  JSON.parse(
    localStorage.getItem('fixture.connections') ?? '[]',
  ) as ConnectionKind[],
);
const saved = new Map<string, Conversation>(
  (
    JSON.parse(
      localStorage.getItem('fixture.conversations') ?? '[]',
    ) as Conversation[]
  ).map((item) => [item.id, item]),
);
let settings = settingsSchema.parse(
  JSON.parse(localStorage.getItem('fixture.settings') ?? '{}'),
);
function persist() {
  localStorage.setItem(
    'fixture.conversations',
    JSON.stringify([...saved.values()]),
  );
  localStorage.setItem('fixture.connections', JSON.stringify([...connected]));
}
const requests: GenerationInput[] = [];
const copied: string[] = [];
const tasks = new Map<
  string,
  {
    input: GenerationInput;
    receive: (event: ChatEvent) => void;
    sequence: number;
    timers: ReturnType<typeof setTimeout>[];
  }
>();
const models = [
  { id: 'fixture-one', name: 'Fixture One', verified: false, available: true },
  { id: 'fixture-two', name: 'Fixture Two', verified: false, available: true },
];
function discovery(id: ConnectionKind): Promise<Discovery> {
  connected.add(id);
  persist();
  return Promise.resolve({ connectionId: id, models: structuredClone(models) });
}
const backend: Backend = {
  storage: (operation) => {
    switch (operation.action) {
      case 'list':
        return Promise.resolve(
          [...saved.values()].map((item) => ({
            id: item.id,
            title: item.title,
            pinned: item.pinned,
            updatedAt: item.updatedAt,
          })),
        );
      case 'get':
        return Promise.resolve(
          structuredClone(saved.get(operation.id) ?? null),
        );
      case 'update': {
        const item = saved.get(operation.id);
        if (item) {
          item.title = operation.title;
          item.pinned = operation.pinned;
        }
        persist();
        return Promise.resolve(null);
      }
      case 'delete':
        saved.delete(operation.id);
        persist();
        return Promise.resolve(null);
      case 'settings.get':
        return Promise.resolve(structuredClone(settings));
      case 'settings.set':
        settings = structuredClone(operation.settings);
        localStorage.setItem('fixture.settings', JSON.stringify(settings));
        return Promise.resolve(null);
    }
  },
  health: () =>
    Promise.resolve({ status: 'ready', protocol: 2, storage: 'ready' }),
  list: () =>
    Promise.resolve(
      connectionKinds.map((id): ConnectionSummary => ({
        id,
        label: connectionLabels[id],
        provider:
          id === 'chatgpt' || id === 'openai'
            ? 'openai'
            : id === 'claude-client' || id === 'anthropic'
              ? 'anthropic'
              : id === 'google'
                ? 'google'
                : 'xai',
        method:
          id === 'chatgpt'
            ? 'subscription'
            : id === 'claude-client'
              ? 'official-client'
              : 'api-key',
        configured: connected.has(id),
        status: connected.has(id) ? 'checking' : 'disconnected',
        storage: connected.has(id) ? 'session' : 'none',
        account: null,
        executable: null,
      })),
    ),
  refresh: discovery,
  connectApi: (id) => discovery(id),
  connectChatgpt: () => discovery('chatgpt'),
  connectClaude: () => discovery('claude-client'),
  cancelSignIn: () => Promise.resolve(),
  disconnect: (id) => {
    connected.delete(id);
    persist();
    return Promise.resolve();
  },
  start(input, receive) {
    requests.push(structuredClone(input));
    const previous = saved.get(input.conversationId);
    const conversation: Conversation = {
      id: input.conversationId,
      title:
        previous?.title ??
        (input.messages[0]?.text.slice(0, 80) || 'New conversation'),
      pinned: previous?.pinned ?? false,
      updatedAt: Date.now(),
      messages: [
        ...input.messages.map((message) => ({
          ...message,
          status: 'completed' as const,
        })),
        {
          id: input.generationId,
          role: 'assistant',
          text: '',
          status: 'streaming',
          modelName: models.find((model) => model.id === input.modelId)?.name,
          connectionId: input.connectionId,
        },
      ],
    };
    saved.set(input.conversationId, conversation);
    persist();
    const task = {
      input,
      receive,
      sequence: 0,
      timers: [] as ReturnType<typeof setTimeout>[],
    };
    tasks.set(input.generationId, task);
    const send = (
      event:
        | Omit<
            Extract<ChatEvent, { type: 'text' }>,
            'generationId' | 'conversationId' | 'sequence'
          >
        | Omit<
            Extract<ChatEvent, { type: 'done' }>,
            'generationId' | 'conversationId' | 'sequence'
          >
        | Omit<
            Extract<ChatEvent, { type: 'error' }>,
            'generationId' | 'conversationId' | 'sequence'
          >,
    ) => {
      const message = conversation.messages.at(-1);
      if (message) {
        if (event.type === 'text') message.text += event.text;
        else if (event.type === 'error') message.status = 'error';
        else
          message.status =
            event.status === 'completed' ? 'completed' : 'stopped';
      }
      persist();
      receive({
        ...event,
        generationId: input.generationId,
        conversationId: input.conversationId,
        sequence: task.sequence++,
      });
    };
    const prompt = input.messages.at(-1)?.text ?? '';
    task.timers.push(
      setTimeout(
        () =>
          send({
            type: 'text',
            text: '# A useful reply\n\n**Clear thinking** starts with a good question.\n\n```javascript\nconst idea = "hello";\nconsole.log(idea);\n```\n\n',
          }),
        20,
      ),
    );
    if (prompt.includes('slow'))
      task.timers.push(
        setTimeout(
          () =>
            send({
              type: 'text',
              text: 'A partial response waiting for cancellation.',
            }),
          50,
        ),
      );
    else if (prompt.includes('provider error'))
      task.timers.push(
        setTimeout(() => {
          send({
            type: 'error',
            error: {
              code: 'RATE_LIMIT',
              message: 'Provider rate limit reached. Try again later.',
            },
          });
          tasks.delete(input.generationId);
        }, 70),
      );
    else
      task.timers.push(
        setTimeout(() => {
          send({
            type: 'text',
            text: prompt.includes('long')
              ? '\n' +
                Array.from(
                  { length: 65 },
                  (_, i) =>
                    `Paragraph ${i + 1}: Some useful context for this conversation.\n\n`,
                ).join('')
              : 'This is a **deterministic browser-test reply**, not live inference.',
          });
          send({ type: 'done', status: 'completed' });
          tasks.delete(input.generationId);
        }, 100),
      );
    return Promise.resolve(() => {
      task.timers.forEach(clearTimeout);
      tasks.delete(input.generationId);
    });
  },
  cancel: (id) => {
    const task = tasks.get(id);
    if (task) {
      task.timers.forEach(clearTimeout);
      const message = saved.get(task.input.conversationId)?.messages.at(-1);
      if (message) message.status = 'stopped';
      persist();
      task.receive({
        type: 'done',
        generationId: id,
        conversationId: task.input.conversationId,
        sequence: task.sequence++,
        status: 'cancelled',
      });
      tasks.delete(id);
    }
    return Promise.resolve();
  },
  open: () => Promise.resolve(),
  copy: (text) => {
    copied.push(text);
    return Promise.resolve();
  },
};
declare global {
  interface Window {
    chatFixture: { requests: GenerationInput[]; copied: string[] };
  }
}
window.chatFixture = { requests, copied };
createApp(App).use(createPinia()).provide(backendKey, backend).mount('#app');
