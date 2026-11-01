import type Database from 'better-sqlite3';
import type { ProviderMessage } from '@harness/providers';
import { AgentFailure, type ToolCall } from './permissions';
export interface AgentCheckpoint {
  step: number;
  groups: ProviderMessage[][];
  summary: string;
  queued: ToolCall[];
  assistant: ProviderMessage[];
  reportedTokens: number | null;
  findingsReported: boolean;
}
export class CheckpointStore {
  constructor(private db: Database.Database) {}
  save(id: string, checkpoint: AgentCheckpoint) {
    const data = JSON.stringify(checkpoint);
    if (Buffer.byteLength(data) > 700000)
      throw new AgentFailure(
        'CONTEXT_LIMIT',
        'The saved transcript exceeds its storage budget.',
      );
    const changed = this.db
      .prepare('UPDATE agent_sessions SET checkpoint=? WHERE id=?')
      .run(data, id);
    if (changed.changes !== 1)
      throw new AgentFailure('NOT_FOUND', 'This task does not exist.');
  }
  load(id: string): AgentCheckpoint | null {
    const row = this.db
      .prepare('SELECT checkpoint FROM agent_sessions WHERE id=?')
      .get(id) as { checkpoint: string | null } | undefined;
    if (!row) throw new AgentFailure('NOT_FOUND', 'This task does not exist.');
    if (!row.checkpoint) return null;
    let value: Partial<AgentCheckpoint>;
    try {
      value = JSON.parse(row.checkpoint) as Partial<AgentCheckpoint>;
    } catch {
      throw new AgentFailure(
        'INVALID_REQUEST',
        'The saved transcript could not be read.',
      );
    }
    if (
      typeof value.step !== 'number' ||
      !Array.isArray(value.groups) ||
      typeof value.summary !== 'string' ||
      value.summary.length > 16000
    )
      throw new AgentFailure(
        'INVALID_REQUEST',
        'The saved transcript could not be read.',
      );
    return {
      step: value.step,
      groups: value.groups,
      summary: value.summary,
      queued: Array.isArray(value.queued) ? value.queued : [],
      assistant: Array.isArray(value.assistant) ? value.assistant : [],
      reportedTokens:
        typeof value.reportedTokens === 'number' ? value.reportedTokens : null,
      findingsReported: value.findingsReported === true,
    };
  }
}
