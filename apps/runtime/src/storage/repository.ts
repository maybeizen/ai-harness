import { ProjectRepository } from './projects';
import {
  deleteConversationRecords,
  saveConversation,
} from './conversation-record';
import { historyPage, legacyHistory } from './history';
import { outboundMessages, dispatchTransfer } from './transfer';
import type Database from 'better-sqlite3';
import {
  conversationSchema,
  settingsSchema,
  type Conversation,
  type GenerationInput,
  type Settings,
  type StorageOperation,
  projectOperationSchema,
} from '@harness/contracts';
import { ProviderFailure } from '@harness/providers';
import { instructionContext } from '../agent/project-context';
import { loadPromptImages } from './prompt-images';
export function storageFailure() {
  return new ProviderFailure({
    code: 'STORAGE_ERROR',
    message:
      'Local data could not be saved or loaded. Check available disk space and retry.',
  });
}
export class Repository {
  private projects: ProjectRepository;
  constructor(
    private db: Database.Database,
    private directory?: string,
  ) {
    this.projects = new ProjectRepository(db);
    this.guarded(() =>
      this.db.transaction(() => {
        const rows = this.db
          .prepare(
            `SELECT data FROM conversations WHERE instr(data, '"streaming"') > 0`,
          )
          .all() as { data: string }[];
        for (const row of rows) {
          let candidate: unknown;
          try {
            candidate = JSON.parse(row.data);
          } catch {
            continue;
          }
          const parsed = conversationSchema.safeParse(candidate);
          if (!parsed.success) continue;
          const conversation = parsed.data;
          let changed = false;
          for (const message of conversation.messages) {
            if (message.status === 'streaming') {
              message.status = 'stopped';
              changed = true;
            }
          }
          if (changed) this.write(conversation);
        }
      })(),
    );
  }

  private guarded<T>(operation: () => T): T {
    try {
      return operation();
    } catch (error) {
      if (error instanceof ProviderFailure) throw error;
      throw storageFailure();
    }
  }
  get(id: string): Conversation | null {
    return this.guarded(() => {
      const row = this.db
        .prepare('SELECT data FROM conversations WHERE id = ?')
        .get(id) as { data: string } | undefined;
      return row ? conversationSchema.parse(JSON.parse(row.data)) : null;
    });
  }
  projectInstructions(id: string): string {
    return this.guarded(() => instructionContext(this.db, id));
  }
  private write(conversation: Conversation) {
    saveConversation(this.db, conversation);
  }
  providerMessages(input: GenerationInput, vision: boolean) {
    return outboundMessages(this.db, this.directory, input, vision);
  }
  promptImages(messages: GenerationInput['messages']) {
    return loadPromptImages(this.db, this.directory, messages);
  }
  dispatch(operation: StorageOperation): unknown {
    return this.guarded(() => {
      const transferred = dispatchTransfer(this.db, this.directory, operation);
      if (transferred !== undefined) return transferred;
      const projectOperation = projectOperationSchema.safeParse(operation);
      if (projectOperation.success)
        return this.projects.dispatch(projectOperation.data);
      if (operation.action === 'draft.get') {
        const row = this.db
          .prepare('SELECT text FROM conversation_drafts WHERE id=?')
          .get(operation.id) as { text: string } | undefined;
        return row?.text ?? '';
      }
      if (operation.action === 'draft.set') {
        if (operation.text)
          this.db
            .prepare(
              'INSERT INTO conversation_drafts(id,text) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET text=excluded.text',
            )
            .run(operation.id, operation.text);
        else
          this.db
            .prepare('DELETE FROM conversation_drafts WHERE id=?')
            .run(operation.id);
        return null;
      }
      if (operation.action === 'history.page')
        return historyPage(this.db, operation);
      if (operation.action === 'list') return legacyHistory(this.db);
      if (operation.action === 'get') return this.get(operation.id);
      if (operation.action === 'delete') {
        this.db.transaction(() => {
          deleteConversationRecords(this.db, operation.id);
          this.db
            .prepare('DELETE FROM conversations WHERE id=?')
            .run(operation.id);
          this.db
            .prepare('DELETE FROM conversation_drafts WHERE id=?')
            .run(operation.id);
          // Deletion must remain possible even when settings need recovery.
          const row = this.db
            .prepare('SELECT data FROM settings WHERE id=1')
            .get() as { data: string } | undefined;
          if (!row) return;
          let settings: Settings;
          try {
            settings = settingsSchema.parse(JSON.parse(row.data));
          } catch {
            return;
          }
          if (settings.activeConversation === operation.id)
            this.setSettings({ ...settings, activeConversation: null });
        })();
        return null;
      }
      if (operation.action === 'update') {
        const conversation = this.get(operation.id);
        if (!conversation)
          throw new ProviderFailure({
            code: 'NOT_FOUND',
            message: 'This conversation no longer exists.',
          });
        this.write({
          ...conversation,
          title: operation.title,
          pinned: operation.pinned,
          ...(operation.provider !== undefined
            ? { provider: operation.provider }
            : {}),
          ...(operation.model !== undefined ? { model: operation.model } : {}),
          ...(operation.mode !== undefined ? { mode: operation.mode } : {}),
        });
        return null;
      }
      if (operation.action === 'settings.get') return this.settings();
      if (operation.action !== 'settings.set') throw storageFailure();
      this.setSettings(operation.settings);
      return null;
    });
  }
  private settings(): Settings {
    const row = this.db
      .prepare('SELECT data FROM settings WHERE id=1')
      .get() as { data: string } | undefined;
    return settingsSchema.parse(row ? JSON.parse(row.data) : {});
  }

  private setSettings(settings: Settings) {
    this.db
      .prepare(
        'INSERT INTO settings(id,data) VALUES (1,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data',
      )
      .run(JSON.stringify(settingsSchema.parse(settings)));
  }
  begin(input: GenerationInput) {
    this.guarded(() =>
      this.db.transaction(() => {
        const context = input.messages.filter(
          (message) => message.id !== input.generationId,
        );
        const variant = input.messages.find(
          (message) => message.id === input.generationId,
        );
        const existing = this.get(input.conversationId);
        const conversation: Conversation = existing ?? {
          id: input.conversationId,
          title: (
            context.find((message) => message.role === 'user')?.text.trim() ||
            'New conversation'
          ).slice(0, 200),
          pinned: false,
          updatedAt: Date.now(),
          messages: [],
        };
        if (
          !conversation.messages.length &&
          conversation.title === 'New conversation'
        )
          conversation.title = (
            context.find((message) => message.role === 'user')?.text.trim() ||
            'New conversation'
          ).slice(0, 200);
        const ids = new Set(conversation.messages.map((message) => message.id));
        const incomingIds = new Set<string>();
        for (const message of context) {
          const previous = conversation.messages.find(
            (saved) => saved.id === message.id,
          );
          if (
            incomingIds.has(message.id) ||
            (previous &&
              (previous.role !== message.role ||
                previous.text !== message.text))
          )
            throw new ProviderFailure({
              code: 'INVALID_REQUEST',
              message:
                'Conversation context conflicts with saved messages. Reopen this conversation and retry.',
            });
          incomingIds.add(message.id);
          if (!ids.has(message.id)) {
            conversation.messages.push({
              ...message,
              status: 'completed',
              createdAt: message.createdAt ?? Date.now(),
            });
            ids.add(message.id);
          }
        }
        if (ids.has(input.generationId))
          throw new ProviderFailure({
            code: 'INVALID_REQUEST',
            message: 'This response already exists.',
          });
        conversation.messages.push({
          id: input.generationId,
          role: 'assistant',
          text: '',
          status: 'streaming',
          createdAt: Date.now(),
          modelName: variant?.modelName ?? input.modelId,
          connectionId: input.connectionId,
          model: variant?.model ?? {
            connectionId: input.connectionId,
            modelId: input.modelId,
            name: variant?.modelName ?? input.modelId,
          },
          ...(variant?.parentId ? { parentId: variant.parentId } : {}),
        });
        conversation.updatedAt = Date.now();
        this.write(conversation);
        const storedDraft = this.db
          .prepare('SELECT text FROM conversation_drafts WHERE id=?')
          .get(input.conversationId) as { text: string } | undefined;
        if (storedDraft?.text.trim() === context.at(-1)?.text)
          this.db
            .prepare('DELETE FROM conversation_drafts WHERE id=?')
            .run(input.conversationId);
      })(),
    );
  }
  progress(
    input: GenerationInput,
    text: string,
    status: 'streaming' | 'completed' | 'stopped' | 'error',
  ) {
    this.guarded(() =>
      this.db.transaction(() => {
        const conversation = this.get(input.conversationId);
        const message = conversation?.messages.find(
          (message) => message.id === input.generationId,
        );
        if (!conversation || !message) throw storageFailure();
        message.text += text;
        message.status = status;
        conversation.updatedAt = Date.now();
        this.write(conversation);
      })(),
    );
  }
}
