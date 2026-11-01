import { createHash } from 'node:crypto';
import type Database from 'better-sqlite3';
import {
  mcpServerConfigSchema,
  type McpServerConfig,
  type McpServerSummary,
} from '@harness/contracts';
import { mcpFailure } from './http';
export interface SavedMcp {
  config: McpServerConfig;
  revision: string;
}
export function readSaved(db: Database.Database, id: string): SavedMcp {
  const row = db
    .prepare('SELECT config,revision FROM mcp_servers WHERE id=?')
    .get(id) as { config: string; revision: string } | undefined;
  if (!row) mcpFailure('MCP_NOT_FOUND', 'This MCP server is not configured.');
  const config = mcpServerConfigSchema.parse(JSON.parse(row.config));
  if (config.id !== id)
    mcpFailure(
      'MCP_STORAGE',
      'The MCP server identifier does not match its saved configuration.',
    );
  if (
    createHash('sha256').update(JSON.stringify(config)).digest('hex') !==
    row.revision
  )
    mcpFailure(
      'MCP_STORAGE',
      'The MCP configuration revision is invalid. Preserve its data and repair the configuration.',
    );
  return { config, revision: row.revision };
}
export function summarize(
  saved: SavedMcp,
  connection:
    | { closed: boolean; summaries: unknown[]; tools: { size: number } }
    | undefined,
  state:
    | { status: McpServerSummary['status']; error: McpServerSummary['error'] }
    | undefined,
): McpServerSummary {
  return {
    ...saved,
    status: !saved.config.enabled
      ? 'disabled'
      : connection?.closed
        ? 'disconnected'
        : (state?.status ?? 'disconnected'),
    error: state?.error ?? null,
    toolCount: connection?.summaries.length ?? 0,
    enabledToolCount: connection?.tools.size ?? 0,
  };
}
