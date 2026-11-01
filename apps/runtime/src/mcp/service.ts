import type Database from 'better-sqlite3';
import { createHash } from 'node:crypto';
import {
  mcpOperationSchema,
  type McpOperation,
  type McpServerSummary,
  type AgentRequest,
} from '@harness/contracts';
import { ProviderFailure } from '@harness/providers';
import { AgentFailure } from '../agent/permissions';
import type { IsolatedExecutor } from '../agent/toolbox';
import type { McpConnection } from './connection';
import { openMcpConnection } from './stdio';
import { readSaved, summarize, type SavedMcp } from './records';
import { redactMcpStatus } from './status';
import { mcpFailure } from './http';
import { normalizeMcpResult } from './results';
export class Mcps {
  private active = new Map<string, McpConnection>();
  private states = new Map<
    string,
    { status: McpServerSummary['status']; error: McpServerSummary['error'] }
  >();
  private closing = false;
  private epochs = new Map<string, number>();
  constructor(
    private db: Database.Database,
    private executor?: IsolatedExecutor,
  ) {}
  status() {
    const rows = this.db
      .prepare('SELECT id FROM mcp_servers ORDER BY id')
      .all() as { id: string }[];
    return redactMcpStatus(rows, (id) => {
      try {
        const saved = this.saved(id);
        const summary = this.summary(saved);
        return {
          id: saved.config.id,
          name: saved.config.name,
          enabled: saved.config.enabled,
          transport: saved.config.transport,
          status: summary.status,
          toolCount: summary.toolCount,
          enabledToolCount: summary.enabledToolCount,
          error: summary.error,
        };
      } catch {
        return null;
      }
    });
  }
  private saved(id: string) {
    return readSaved(this.db, id);
  }
  private summary(saved: SavedMcp) {
    return summarize(
      saved,
      this.active.get(saved.config.id),
      this.states.get(saved.config.id),
    );
  }
  private async disconnect(id: string) {
    const epoch = (this.epochs.get(id) ?? 0) + 1;
    this.epochs.set(id, epoch);
    const connection = this.active.get(id);
    this.active.delete(id);
    this.states.set(id, { status: 'disconnected', error: null });
    await connection?.close();
    return epoch;
  }
  private async connect(
    id: string,
    bearer?: string,
    expectedRevision?: string,
    approved = false,
  ) {
    const saved = this.saved(id);
    if (expectedRevision !== undefined && saved.revision !== expectedRevision)
      mcpFailure(
        'MCP_CONFIG_CHANGED',
        'The MCP endpoint or credential configuration changed. Review it again before connecting.',
      );
    if (!saved.config.enabled)
      mcpFailure('MCP_DISABLED', 'Enable this server before connecting.');
    if (saved.config.credentialRef && !bearer)
      mcpFailure(
        'MCP_AUTH_REQUIRED',
        'This server requires a credential from secure native storage.',
      );
    const epoch = await this.disconnect(id);
    if (this.closing || this.epochs.get(id) !== epoch)
      mcpFailure(
        'MCP_STALE_TOOL',
        'This connection was superseded or the app is closing.',
      );
    const connection = openMcpConnection(
      this.db,
      this.executor,
      saved.config,
      saved.revision,
      bearer,
      approved,
    );
    this.active.set(id, connection);
    this.states.set(id, { status: 'connecting', error: null });
    try {
      await connection.connect();
      if (
        this.active.get(id) !== connection ||
        this.saved(id).revision !== saved.revision ||
        this.closing
      )
        mcpFailure(
          'MCP_STALE_TOOL',
          'This configuration changed while connecting.',
        );
      this.states.set(id, { status: 'connected', error: null });
      return this.summary(saved);
    } catch (error) {
      const isolated =
        error instanceof AgentFailure && error.code === 'ISOLATION_UNAVAILABLE';
      if (this.active.get(id) === connection) {
        this.active.delete(id);
        this.states.set(id, {
          status: 'error',
          error: isolated
            ? {
                code: 'ISOLATION_UNAVAILABLE',
                message:
                  'Bubblewrap or required Linux namespaces are unavailable. No host process was started.',
              }
            : {
                code: 'MCP_CONNECTION',
                message:
                  'MCP connection failed. Check endpoint, authentication, protocol and response limits.',
              },
        });
      }
      await connection.close();
      if (isolated)
        mcpFailure(
          'ISOLATION_UNAVAILABLE',
          'Bubblewrap or required Linux namespaces are unavailable. No host process was started.',
        );
      if (error instanceof ProviderFailure) throw error;
      mcpFailure(
        'MCP_CONNECTION',
        'MCP connection failed. Check endpoint, authentication, protocol and response limits.',
      );
    }
  }
  async dispatch(candidate: McpOperation): Promise<unknown> {
    if (this.closing) mcpFailure('UNAVAILABLE', 'The MCP runtime is closing.');
    const operation = mcpOperationSchema.parse(candidate);
    try {
      if (operation.action === 'list') {
        const rows = this.db
          .prepare('SELECT id FROM mcp_servers ORDER BY id')
          .all() as { id: string }[];
        if (rows.length > 16)
          mcpFailure(
            'MCP_STORAGE',
            'The saved MCP registry exceeds its configured limit.',
          );
        return rows.map((row) => this.summary(this.saved(row.id)));
      }
      if (operation.action === 'save') {
        const count = this.db
          .prepare('SELECT count(*) AS count FROM mcp_servers')
          .get() as { count: number };
        const existed = this.db
          .prepare('SELECT id FROM mcp_servers WHERE id=?')
          .get(operation.config.id);
        if (!existed && count.count >= 16)
          mcpFailure('MCP_LIMIT', 'At most16 MCP servers can be configured.');
        const epoch = await this.disconnect(operation.config.id);
        if (this.closing || this.epochs.get(operation.config.id) !== epoch)
          mcpFailure(
            'MCP_STALE_TOOL',
            'The MCP configuration changed during this operation.',
          );
        const data = JSON.stringify(operation.config);
        const revision = createHash('sha256').update(data).digest('hex');
        this.db
          .prepare(
            'INSERT INTO mcp_servers(id,config,revision) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET config=excluded.config,revision=excluded.revision',
          )
          .run(operation.config.id, data, revision);
        return this.summary({ config: operation.config, revision });
      }
      if (operation.action === 'connect' || operation.action === 'connect-auth')
        return await this.connect(
          operation.id,
          operation.action === 'connect-auth' ? operation.bearer : undefined,
          operation.action === 'connect-auth'
            ? operation.expectedRevision
            : undefined,
          operation.action === 'connect' && operation.approved === true,
        );
      if (operation.action === 'disconnect') {
        this.saved(operation.id);
        await this.disconnect(operation.id);
        return null;
      }
      if (operation.action === 'remove') {
        this.saved(operation.id);
        const epoch = await this.disconnect(operation.id);
        if (this.epochs.get(operation.id) !== epoch)
          mcpFailure(
            'MCP_STALE_TOOL',
            'The MCP configuration changed while removing it.',
          );
        if (this.closing)
          mcpFailure('UNAVAILABLE', 'The MCP runtime is closing.');
        this.db.prepare('DELETE FROM mcp_servers WHERE id=?').run(operation.id);
        return null;
      }
      const connection = this.active.get(operation.id);
      if (
        !connection ||
        connection.closed ||
        this.states.get(operation.id)?.status !== 'connected'
      )
        mcpFailure(
          'MCP_DISCONNECTED',
          'Connect this server before inspecting tools.',
        );
      if (operation.action === 'discover') await connection.discover();
      return connection.summaries;
    } catch (error) {
      if (error instanceof ProviderFailure) throw error;
      mcpFailure(
        'MCP_ERROR',
        'The MCP operation failed. Check local configuration and server connectivity.',
      );
    }
  }
  definitions(request: Pick<AgentRequest, 'mode'>) {
    if (['ask', 'plan', 'review', 'security'].includes(request.mode)) return [];
    const definitions = [];
    for (const [id, connection] of this.active) {
      if (
        connection.closed ||
        this.states.get(id)?.status !== 'connected' ||
        !this.saved(id).config.enabled
      )
        continue;
      for (const tool of connection.tools.values())
        definitions.push({
          ...tool.definition,
          effect: 'external' as const,
          approvalLabel: `External MCP: ${connection.config.name} • ${connection.config.transport === 'http' ? connection.config.url : 'local process'} • ${tool.summary.name}`,
        });
    }
    return definitions;
  }
  async execute(name: string, input: unknown, signal: AbortSignal) {
    signal.throwIfAborted();
    const connection = [...this.active.values()].find((item) =>
      item.tools.has(name),
    );
    if (
      !connection ||
      this.saved(connection.config.id).revision !== connection.revision ||
      this.states.get(connection.config.id)?.status !== 'connected'
    )
      mcpFailure(
        'MCP_STALE_TOOL',
        'The MCP tool changed or disconnected; request approval again.',
      );
    try {
      return normalizeMcpResult(
        await connection.call(name, input, signal),
        connection.bearer,
      );
    } catch (error) {
      if (signal.aborted)
        mcpFailure(
          'CANCELLED',
          'The MCP call was cancelled. Remote effects may require inspection.',
        );
      if (error instanceof ProviderFailure) throw error;
      mcpFailure(
        'MCP_TOOL_ERROR',
        'The MCP tool failed or timed out. Inspect remote effects before retrying.',
      );
    }
  }
  async close() {
    this.closing = true;
    await Promise.allSettled(
      [...this.active.keys()].map((id) => this.disconnect(id)),
    );
  }
}
