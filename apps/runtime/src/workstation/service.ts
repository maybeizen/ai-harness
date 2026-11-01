import type Database from 'better-sqlite3';
import {
  auditPageSchema,
  auditRowSchema,
  contextRecordSchema,
  diagnosticsReportSchema,
  settingsSchema,
  stripSecrets,
  workstationOperationSchema,
  type ContextRecord,
  type WorkstationOperation,
} from '@harness/contracts';
import { ProviderFailure } from '@harness/providers';
import { ZodError } from 'zod';
import type { Mcps } from '../mcp/service';
import { deleteConversationRecords } from '../storage/conversation-record';
import { runMcp } from './mcp-api';
import { retentionSelection } from './retention';
function failure(code: string, message: string): never {
  throw new ProviderFailure({ code, message });
}
export class Workstation {
  constructor(
    private db: Database.Database,
    private dataPath: string,
    private version = '0.1.0',
    private mcps?: Mcps,
  ) {}
  async dispatch(candidate: unknown, busy: readonly string[] = []) {
    try {
      return await this.run(workstationOperationSchema.parse(candidate), busy);
    } catch (error) {
      if (error instanceof ProviderFailure) throw error;
      if (error instanceof ZodError)
        failure('INVALID_REQUEST', 'The workstation request is invalid.');
      failure(
        'STORAGE_ERROR',
        'Local workstation data could not be saved or loaded.',
      );
    }
  }
  private async run(operation: WorkstationOperation, busy: readonly string[]) {
    if (operation.action === 'audit') return this.audit(operation);
    if (operation.action === 'context.list')
      return this.listContext(operation.kind);
    if (operation.action === 'context.save')
      return this.saveContext(operation.record);
    if (operation.action === 'context.remove')
      return this.removeContext(operation.id);
    if (
      operation.action === 'mcp.status' ||
      operation.action === 'mcp.save' ||
      operation.action === 'mcp.enable' ||
      operation.action === 'mcp.connect' ||
      operation.action === 'mcp.disconnect' ||
      operation.action === 'mcp.discover'
    )
      return runMcp(this.mcps, operation);
    if (operation.action === 'diagnostics') return this.diagnostics();
    const protectedIds = new Set(busy);
    if (operation.activeConversationId)
      protectedIds.add(operation.activeConversationId);
    const ids = this.retentionIds(protectedIds);
    if (operation.action === 'retention.preview') return { ids };
    this.db.transaction(() => {
      for (const id of ids) {
        if (protectedIds.has(id))
          failure(
            'INVALID_REQUEST',
            'The active conversation cannot be deleted by retention.',
          );
        deleteConversationRecords(this.db, id);
        this.db.prepare('DELETE FROM conversation_drafts WHERE id=?').run(id);
        this.db.prepare('DELETE FROM conversations WHERE id=?').run(id);
      }
    })();
    return { deleted: ids };
  }
  private audit(operation: Extract<WorkstationOperation, { action: 'audit' }>) {
    const rows = (
      operation.before == null
        ? this.db
            .prepare(
              'SELECT id, session_id, call_id, workspace_id, tool, status, at, code FROM agent_audit ORDER BY id DESC LIMIT ?',
            )
            .all(operation.limit)
        : this.db
            .prepare(
              'SELECT id, session_id, call_id, workspace_id, tool, status, at, code FROM agent_audit WHERE id < ? ORDER BY id DESC LIMIT ?',
            )
            .all(operation.before, operation.limit)
    ) as Record<string, unknown>[];
    return auditPageSchema.parse({
      rows: rows.flatMap((row) => {
        const parsed = auditRowSchema.safeParse({
          id: row['id'],
          sessionId: row['session_id'],
          callId: row['call_id'],
          workspaceId: row['workspace_id'],
          tool: row['tool'],
          status: row['status'],
          at: row['at'],
          code: row['code'] ?? null,
        });
        return parsed.success ? [parsed.data] : [];
      }),
    });
  }
  private listContext(kind: ContextRecord['kind']) {
    const rows = this.db
      .prepare(
        'SELECT id, kind, scope, workspace_id, title, body, enabled FROM context_records WHERE kind=? ORDER BY title, id',
      )
      .all(kind) as Record<string, unknown>[];
    return rows.map((row) => this.record(row));
  }
  private saveContext(record: ContextRecord) {
    const count = this.db
      .prepare('SELECT count(*) AS count FROM context_records WHERE kind=?')
      .get(record.kind) as { count: number };
    const existed = this.db
      .prepare('SELECT id FROM context_records WHERE id=?')
      .get(record.id);
    if (!existed && count.count >= 32)
      failure('CONTEXT_LIMIT', 'At most 32 records of this kind can be saved.');
    this.db
      .prepare(
        `INSERT INTO context_records(id, kind, scope, workspace_id, title, body, enabled)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET kind=excluded.kind, scope=excluded.scope,
           workspace_id=excluded.workspace_id, title=excluded.title, body=excluded.body,
           enabled=excluded.enabled`,
      )
      .run(
        record.id,
        record.kind,
        record.scope,
        record.workspaceId,
        record.title,
        record.body,
        Number(record.enabled),
      );
    return record;
  }
  private removeContext(id: string) {
    const result = this.db
      .prepare('DELETE FROM context_records WHERE id=?')
      .run(id);
    if (!result.changes)
      failure('NOT_FOUND', 'That rules or skills record no longer exists.');
    return null;
  }
  private record(row: Record<string, unknown>) {
    return contextRecordSchema.parse({
      id: row['id'],
      kind: row['kind'],
      scope: row['scope'],
      workspaceId: row['workspace_id'],
      title: row['title'],
      body: row['body'],
      enabled: Boolean(row['enabled']),
    });
  }
  private diagnostics() {
    const row = this.db
      .prepare('SELECT data FROM settings WHERE id=1')
      .get() as { data: string } | undefined;
    const settings = stripSecrets(
      settingsSchema.parse(row ? JSON.parse(row.data) : {}),
    );
    return diagnosticsReportSchema.parse({
      version: this.version,
      dataPath: this.dataPath,
      runtimeStatus: 'ready',
      settings,
    });
  }
  private retentionIds(protectedIds: ReadonlySet<string>) {
    const settings = this.savedSettings();
    const rows = this.db
      .prepare('SELECT id, updated_at FROM conversations')
      .all() as { id: string; updated_at: number }[];
    return retentionSelection(
      rows.map((row) => ({ id: row.id, updatedAt: row.updated_at })),
      settings.retention,
      protectedIds,
      Date.now(),
    );
  }
  private savedSettings() {
    const row = this.db
      .prepare('SELECT data FROM settings WHERE id=1')
      .get() as { data: string } | undefined;
    return settingsSchema.parse(row ? JSON.parse(row.data) : {});
  }
}
