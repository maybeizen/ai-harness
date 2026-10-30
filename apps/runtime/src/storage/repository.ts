import type Database from 'better-sqlite3';
import {
  conversationSchema,
  settingsSchema,
  MAX_MESSAGE_BYTES,
  type Conversation,
  type ConversationSummary,
  type GenerationInput,
  type Settings,
  type StorageOperation,
} from '@harness/contracts';
import { ProviderFailure } from '@harness/providers';
export function storageFailure() {
  return new ProviderFailure({
    code: 'STORAGE_ERROR',
    message:
      'Local data could not be saved or loaded. Check available disk space and retry.',
  });
}
export class Repository {
  constructor(private db: Database.Database) {
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
  private write(conversation: Conversation) {
    if (conversation.messages.length > 1000)
      throw new ProviderFailure({
        code: 'CONTEXT_LIMIT',
        message:
          'This conversation has reached its message limit. Start a new chat.',
      });
    const parsed = conversationSchema.parse(conversation);
    const data = JSON.stringify(parsed);
    if (Buffer.byteLength(data) > MAX_MESSAGE_BYTES - 32768)
      throw new ProviderFailure({
        code: 'CONTEXT_LIMIT',
        message:
          'This conversation has reached its storage limit. Start a new chat.',
      });
    this.db
      .prepare(
        'INSERT INTO conversations(id, updated_at, pinned, data) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET updated_at=excluded.updated_at, pinned=excluded.pinned, data=excluded.data',
      )
      .run(parsed.id, parsed.updatedAt, Number(parsed.pinned), data);
  }
  dispatch(operation: StorageOperation): unknown {
    return this.guarded(() => {
      if (operation.action === 'list') {
        const rows = this.db
          .prepare(
            'SELECT id, updated_at, pinned, data FROM conversations ORDER BY pinned DESC, updated_at DESC, id LIMIT 200',
          )
          .all() as {
          id: string;
          updated_at: number;
          pinned: number;
          data: string;
        }[];
        return rows.map((row): ConversationSummary => {
          let title = 'Unreadable conversation';
          try {
            const parsed = conversationSchema.safeParse(JSON.parse(row.data));
            if (parsed.success) title = parsed.data.title;
          } catch {
            /* Preserve damaged rows for explicit load errors and recovery. */
          }
          return {
            id: row.id,
            title,
            pinned: Boolean(row.pinned),
            updatedAt: row.updated_at,
          };
        });
      }
      if (operation.action === 'get') return this.get(operation.id);
      if (operation.action === 'delete') {
        this.db.transaction(() => {
          this.db
            .prepare('DELETE FROM conversations WHERE id=?')
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
        });
        return null;
      }
      if (operation.action === 'settings.get') return this.settings();
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
        const existing = this.get(input.conversationId);
        const conversation: Conversation = existing ?? {
          id: input.conversationId,
          title: (
            input.messages
              .find((message) => message.role === 'user')
              ?.text.trim() || 'New conversation'
          ).slice(0, 200),
          pinned: false,
          updatedAt: Date.now(),
          messages: [],
        };
        const ids = new Set(conversation.messages.map((message) => message.id));
        const incomingIds = new Set<string>();
        for (const message of input.messages) {
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
            conversation.messages.push({ ...message, status: 'completed' });
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
          modelName: input.modelId,
          connectionId: input.connectionId,
        });
        conversation.updatedAt = Date.now();
        this.write(conversation);
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
