import type Database from 'better-sqlite3';
import {
  agentRequestSchema,
  agentEventSchema,
  agentStatusSchema,
  type AgentRequest,
  type AgentEvent,
  type AgentPoll,
  type AgentSummary,
  type AgentStatus,
} from '@harness/contracts';
import { AgentFailure } from './permissions';
import type { AuditRecord } from './types';
import { instructionContext } from './project-context';
export class AgentPersistence {
  constructor(private db: Database.Database) {
    this.guard(() =>
      this.db.transaction(() => {
        const active = this.db
          .prepare(
            "SELECT id FROM agent_sessions WHERE status IN ('reserved','running')",
          )
          .all() as { id: string }[];
        for (const row of active)
          this.append(row.id, {
            type: 'status',
            sessionId: row.id,
            status: 'resumable',
            step: 0,
            message:
              'This task was interrupted. Continue it to resume from the saved step.',
          });
      })(),
    );
  }
  projectInstructions(conversationId?: string, workspaceId?: string | null) {
    return this.guard(() =>
      instructionContext(this.db, conversationId, workspaceId),
    );
  }
  private guard<T>(operation: () => T): T {
    try {
      return operation();
    } catch (error) {
      if (error instanceof AgentFailure) throw error;
      throw new AgentFailure(
        'STORAGE_ERROR',
        'Agent history could not be saved or loaded. Check local storage and retry.',
      );
    }
  }
  get(
    id: string,
  ): { request: AgentRequest | null; status: AgentStatus } | null {
    return this.guard(() => {
      const row = this.db
        .prepare('SELECT request,status FROM agent_sessions WHERE id=?')
        .get(id) as { request: string; status: string } | undefined;
      if (!row) return null;
      return {
        request:
          row.request === 'null'
            ? null
            : agentRequestSchema.parse(JSON.parse(row.request)),
        status: agentStatusSchema.parse(row.status),
      };
    });
  }
  reserve(request: AgentRequest) {
    const result = this.guard(() =>
      this.db.transaction(() => {
        const existing = this.get(request.id);
        if (existing) {
          if (existing.status === 'cancelled' && !existing.request)
            this.db
              .prepare('UPDATE agent_sessions SET request=? WHERE id=?')
              .run(JSON.stringify(request), request.id);
          return existing.status === 'cancelled' ? 'cancelled' : 'busy';
        }
        const count = this.db
          .prepare(
            "SELECT count(*) AS count FROM agent_sessions WHERE status IN ('reserved','running')",
          )
          .get() as { count: number };
        if (count.count >= 3)
          throw new AgentFailure(
            'BUSY',
            'At most three pending or running agent tasks are allowed.',
          );
        const now = Date.now();
        this.db
          .prepare(
            "INSERT INTO agent_sessions(id,request,status,created_at,updated_at) VALUES(?,?,'reserved',?,?)",
          )
          .run(
            request.id,
            JSON.stringify(agentRequestSchema.parse(request)),
            now,
            now,
          );
      })(),
    );
    if (result)
      throw new AgentFailure(
        result === 'cancelled' ? 'CANCELLED' : 'BUSY',
        result === 'cancelled'
          ? 'This task was cancelled before starting.'
          : 'This task identifier already exists.',
      );
  }
  cancelBeforeStart(id: string) {
    this.guard(() =>
      this.db.transaction(() => {
        const existing = this.get(id);
        if (existing && existing.status !== 'reserved') return;
        if (!existing) {
          const count = this.db
            .prepare(
              "SELECT count(*) AS count FROM agent_sessions WHERE request='null'",
            )
            .get() as { count: number };
          if (count.count >= 1024)
            throw new AgentFailure(
              'BUSY',
              'Early-cancellation tracking is full. No additional cancellation was acknowledged.',
            );
          const now = Date.now();
          this.db
            .prepare(
              "INSERT INTO agent_sessions(id,request,status,created_at,updated_at) VALUES(?,'null','cancelled',?,?)",
            )
            .run(id, now, now);
        }
        this.append(id, {
          type: 'status',
          sessionId: id,
          status: 'cancelled',
          step: 0,
          message: 'Cancelled before the task started.',
        });
      })(),
    );
  }
  markRunning(id: string) {
    this.guard(() =>
      this.db.transaction(() => {
        const saved = this.get(id);
        if (
          !saved?.request ||
          (saved.status !== 'reserved' && saved.status !== 'resumable')
        )
          throw new AgentFailure(
            saved?.status === 'cancelled' ? 'CANCELLED' : 'INVALID_REQUEST',
            'This task is not reserved for starting.',
          );
        this.db
          .prepare(
            "UPDATE agent_sessions SET status='running',updated_at=? WHERE id=?",
          )
          .run(Date.now(), id);
      })(),
    );
  }
  append(parentId: string, event: AgentEvent) {
    this.guard(() =>
      this.db.transaction(() => {
        const parsed = agentEventSchema.parse(event);
        const row = this.db
          .prepare(
            'SELECT event_count,event_bytes FROM agent_sessions WHERE id=?',
          )
          .get(parentId) as
          { event_count: number; event_bytes: number } | undefined;
        if (!row)
          throw new AgentFailure('NOT_FOUND', 'This task does not exist.');
        const data = JSON.stringify(parsed);
        if (Buffer.byteLength(data) > 60000)
          throw new AgentFailure(
            'OUTPUT_LIMIT',
            'An agent event exceeded its storage limit.',
          );
        const terminal =
          parsed.type === 'status' &&
          parsed.sessionId === parentId &&
          parsed.status !== 'running';
        const bytes = Buffer.byteLength(data);
        if (
          !terminal &&
          (row.event_count >= 10000 ||
            row.event_bytes + bytes > 32 * 1024 * 1024)
        )
          throw new AgentFailure(
            'OUTPUT_LIMIT',
            'The task reached its stored event limit.',
          );
        this.db
          .prepare(
            'UPDATE agent_sessions SET event_count=event_count+1,event_bytes=event_bytes+? WHERE id=?',
          )
          .run(bytes, parentId);
        this.db
          .prepare(
            'INSERT INTO agent_events(session_id,sequence,data) VALUES(?,?,?)',
          )
          .run(parentId, row.event_count + 1, data);
        if (
          parsed.type === 'status' &&
          parsed.sessionId === parentId &&
          parsed.status !== 'running'
        )
          this.db
            .prepare(
              'UPDATE agent_sessions SET status=?,updated_at=? WHERE id=?',
            )
            .run(parsed.status, Date.now(), parentId);
        else
          this.db
            .prepare('UPDATE agent_sessions SET updated_at=? WHERE id=?')
            .run(Date.now(), parentId);
      })(),
    );
  }
  audit(record: AuditRecord) {
    this.guard(() =>
      this.db
        .prepare(
          'INSERT INTO agent_audit(session_id,call_id,workspace_id,tool,status,at,code) VALUES(?,?,?,?,?,?,?)',
        )
        .run(
          record.sessionId,
          record.callId,
          record.workspaceId,
          record.tool,
          record.status,
          record.at,
          record.code ?? null,
        ),
    );
  }
  poll(id: string, after: number): AgentPoll {
    return this.guard(() => {
      const saved = this.get(id);
      if (!saved)
        throw new AgentFailure('NOT_FOUND', 'This task does not exist.');
      const rows = this.db
        .prepare(
          'SELECT sequence,data FROM agent_events WHERE session_id=? AND sequence>? ORDER BY sequence LIMIT 20',
        )
        .all(id, after) as { sequence: number; data: string }[];
      const events: AgentPoll['events'] = [];
      let bytes = 0;
      for (const row of rows) {
        const item = {
          sequence: row.sequence,
          event: agentEventSchema.parse(JSON.parse(row.data)),
        };
        const size = Buffer.byteLength(JSON.stringify(item));
        if (bytes + size > 524288) break;
        bytes += size;
        events.push(item);
      }
      return {
        id,
        status: saved.status,
        events,
        nextCursor: events.at(-1)?.sequence ?? after,
      };
    });
  }
  list(): AgentSummary[] {
    return this.guard(() => {
      const rows = this.db
        .prepare(
          "SELECT id,request,status,created_at,updated_at FROM agent_sessions WHERE request!='null' ORDER BY updated_at DESC,id LIMIT 100",
        )
        .all() as {
        id: string;
        request: string;
        status: string;
        created_at: number;
        updated_at: number;
      }[];
      return rows.map((row) => {
        const request = agentRequestSchema.parse(JSON.parse(row.request));
        return {
          id: row.id,
          workspaceId: request.workspaceId,
          mode: request.mode,
          policy: request.policy,
          promptPreview: request.prompt.slice(0, 200),
          status: agentStatusSchema.parse(row.status),
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        };
      });
    });
  }
}
