import { createApp } from 'vue';
import { createPinia } from 'pinia';
import {
  connectionKinds,
  connectionProfiles,
  type ConnectionSummary,
  type ConnectionKind,
  type GenerationInput,
  type ChatEvent,
  type Conversation,
  type HistoryFilter,
  type Project,
  settingsSchema,
} from '@harness/contracts';
import type { Backend, Discovery } from '../src/transport/backend';
import { backendKey } from '../src/transport/backend';
import { agentBackendKey } from '../src/transport/agent';
import { fixtureAgent, fixtureWorkspace } from './workflow-fixture';
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
  localStorage.setItem(
    'fixture.projects',
    JSON.stringify([...projects.values()]),
  );
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
const projects = new Map<string, Project>(
  (
    JSON.parse(localStorage.getItem('fixture.projects') ?? '[]') as Project[]
  ).map((item) => [item.id, item]),
);
function matchesHistory(item: Conversation, filter: HistoryFilter) {
  if (filter.kind === 'archived') return Boolean(item.archived);
  if (item.archived) return false;
  if (filter.kind === 'project') return item.projectId === filter.id;
  if (filter.kind === 'directory') return item.directoryId === filter.id;
  if (filter.kind === 'general') return !item.projectId;
  return true;
}
const backend: Backend = {
  openWorkspace: () => Promise.resolve(fixtureWorkspace.directory),
  workspace: (operation) => fixtureWorkspace.handle(operation),
  storage: (operation) => {
    switch (operation.action) {
      case 'conversation.create': {
        if (saved.has(operation.id))
          return Promise.reject(new Error('This conversation already exists.'));
        const item: Conversation = {
          id: operation.id,
          title: operation.title,
          pinned: false,
          updatedAt: Date.now(),
          messages: [],
          projectId: operation.projectId,
          directoryId:
            operation.directoryId ??
            (operation.projectId
              ? projects.get(operation.projectId)?.directoryId
              : null) ??
            null,
          archived: false,
        };
        saved.set(item.id, item);
        persist();
        return Promise.resolve(item);
      }
      case 'project.list':
        return Promise.resolve(
          [...projects.values()]
            .filter((item) => operation.includeArchived || !item.archived)
            .map(({ instructions: _ignored, ...summary }) => {
              void _ignored;
              return summary;
            }),
        );
      case 'project.get':
        return Promise.resolve(
          structuredClone(projects.get(operation.id) ?? null),
        );
      case 'project.create': {
        const project = {
          ...operation.project,
          id: crypto.randomUUID(),
          updatedAt: Date.now(),
        };
        projects.set(project.id, project);
        persist();
        return Promise.resolve(project);
      }
      case 'project.update': {
        const project = { ...operation.project, updatedAt: Date.now() };
        projects.set(project.id, project);
        persist();
        return Promise.resolve(project);
      }
      case 'project.delete':
        projects.delete(operation.id);
        for (const item of saved.values())
          if (item.projectId === operation.id) item.projectId = null;
        persist();
        return Promise.resolve(null);
      case 'conversation.associate': {
        const item = saved.get(operation.id);
        if (item) {
          item.projectId = operation.projectId;
          item.directoryId =
            operation.directoryId ??
            (operation.projectId
              ? projects.get(operation.projectId)?.directoryId
              : null) ??
            null;
        }
        persist();
        return Promise.resolve(item ?? null);
      }
      case 'conversation.archive': {
        const item = saved.get(operation.id);
        if (item) item.archived = operation.archived;
        persist();
        return Promise.resolve(item ?? null);
      }

      case 'draft.get':
        return Promise.resolve(
          localStorage.getItem(`fixture.draft.${operation.id}`) ?? '',
        );
      case 'draft.set':
        localStorage.setItem(`fixture.draft.${operation.id}`, operation.text);
        return Promise.resolve(null);
      case 'history.page': {
        const sorted = [...saved.values()]
          .filter(
            (item) =>
              matchesHistory(item, operation.filter) &&
              item.title
                .toLocaleLowerCase()
                .includes(operation.query.toLocaleLowerCase()),
          )
          .sort(
            (a, b) =>
              Number(b.pinned) - Number(a.pinned) ||
              b.updatedAt - a.updatedAt ||
              a.id.localeCompare(b.id),
          );
        const cursor = operation.cursor;
        const after = cursor
          ? sorted.filter(
              (item) =>
                Number(item.pinned) < Number(cursor.pinned) ||
                (item.pinned === cursor.pinned &&
                  item.updatedAt < cursor.updatedAt) ||
                (item.pinned === cursor.pinned &&
                  item.updatedAt === cursor.updatedAt &&
                  item.id > cursor.id),
            )
          : sorted;
        const items = after
          .slice(0, operation.limit)
          .map(({ id, title, pinned, updatedAt }) => ({
            id,
            title,
            pinned,
            updatedAt,
          }));
        const last = items.at(-1);
        return Promise.resolve({
          items,
          nextCursor:
            after.length > operation.limit && last
              ? { id: last.id, pinned: last.pinned, updatedAt: last.updatedAt }
              : null,
        });
      }
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
      default:
        return Promise.reject(
          new Error(
            'This deterministic fixture does not handle that storage operation.',
          ),
        );
    }
  },
  health: () =>
    Promise.resolve({ status: 'ready', protocol: 2, storage: 'ready' }),
  list: () =>
    Promise.resolve(
      connectionKinds.map((id): ConnectionSummary => {
        const profile = connectionProfiles[id];
        return {
          id,
          label: profile.label,
          provider: profile.provider,
          method: profile.method,
          configured: connected.has(id),
          status: connected.has(id) ? 'checking' : 'disconnected',
          storage: connected.has(id) ? 'session' : 'none',
          account: null,
          executable: null,
        };
      }),
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
createApp(App)
  .use(createPinia())
  .provide(backendKey, backend)
  .provide(agentBackendKey, fixtureAgent)
  .mount('#app');
