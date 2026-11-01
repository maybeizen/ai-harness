import type Database from 'better-sqlite3';
import { AgentFailure } from './permissions';
export interface PatchRecord {
  workspaceId: string;
  path: string;
  beforeText: string;
  afterText: string;
  beforeHash: string | null;
  afterHash: string;
  sessionId: string;
}
export class PatchStore {
  constructor(private db: Database.Database) {}
  record(row: PatchRecord) {
    this.db
      .prepare(
        `INSERT INTO agent_patches(workspace_id,path,before_text,after_text,before_hash,after_hash,session_id,updated_at)
         VALUES(?,?,?,?,?,?,?,?)
         ON CONFLICT(workspace_id,path) DO UPDATE SET
           before_text=excluded.before_text,
           after_text=excluded.after_text,
           before_hash=excluded.before_hash,
           after_hash=excluded.after_hash,
           session_id=excluded.session_id,
           updated_at=excluded.updated_at`,
      )
      .run(
        row.workspaceId,
        row.path,
        row.beforeText,
        row.afterText,
        row.beforeHash,
        row.afterHash,
        row.sessionId,
        Date.now(),
      );
  }
  get(workspaceId: string, path: string): PatchRecord | null {
    const row = this.db
      .prepare(
        'SELECT workspace_id,path,before_text,after_text,before_hash,after_hash,session_id FROM agent_patches WHERE workspace_id=? AND path=?',
      )
      .get(workspaceId, path) as
      | {
          workspace_id: string;
          path: string;
          before_text: string;
          after_text: string;
          before_hash: string | null;
          after_hash: string;
          session_id: string;
        }
      | undefined;
    if (!row) return null;
    return {
      workspaceId: row.workspace_id,
      path: row.path,
      beforeText: row.before_text,
      afterText: row.after_text,
      beforeHash: row.before_hash,
      afterHash: row.after_hash,
      sessionId: row.session_id,
    };
  }
  list(workspaceId: string) {
    const rows = this.db
      .prepare(
        'SELECT path,before_hash,after_hash FROM agent_patches WHERE workspace_id=? ORDER BY path',
      )
      .all(workspaceId) as {
      path: string;
      before_hash: string | null;
      after_hash: string;
    }[];
    return rows.map((row) => ({
      path: row.path,
      beforeHash: row.before_hash,
      afterHash: row.after_hash,
    }));
  }
  remove(workspaceId: string, path: string) {
    const changed = this.db
      .prepare('DELETE FROM agent_patches WHERE workspace_id=? AND path=?')
      .run(workspaceId, path);
    if (changed.changes !== 1)
      throw new AgentFailure(
        'NOT_FOUND',
        'This path has no applied patch to accept or roll back.',
      );
  }
}
