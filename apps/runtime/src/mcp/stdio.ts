import type { Readable } from 'node:stream';
import type Database from 'better-sqlite3';
import {
  ReadBuffer,
  serializeMessage,
} from '@modelcontextprotocol/sdk/shared/stdio.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import type { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js';
import type { McpServerConfig } from '@harness/contracts';
import type { IsolatedExecutor, IsolatedStdio } from '../agent/toolbox';
import { McpConnection } from './connection';
import { mcpFailure } from './http';
const limit = 524288;
class IsolatedMcpTransport implements Transport {
  onclose?: () => void;
  onerror?: (error: Error) => void;
  onmessage?: (message: JSONRPCMessage) => void;
  private session: IsolatedStdio | undefined = undefined;
  private buffer = new ReadBuffer({ maxBufferSize: limit });
  private readonly controller = new AbortController();
  private opened = false;
  private stopped = false;
  constructor(
    private readonly open: (signal: AbortSignal) => Promise<IsolatedStdio>,
  ) {}
  async start() {
    if (this.opened)
      throw new Error('The isolated MCP transport is already started.');
    this.opened = true;
    this.session = await this.open(this.controller.signal);
    const stdout: Readable = this.session.stdout;
    stdout.on('data', (chunk: Buffer) => {
      try {
        this.buffer.append(chunk);
        for (;;) {
          const message = this.buffer.readMessage();
          if (!message) break;
          this.onmessage?.(message);
        }
      } catch (error) {
        this.onerror?.(
          error instanceof Error ? error : new Error('MCP stdio read failed.'),
        );
        void this.close();
      }
    });
    stdout.on('error', (error: Error) => this.onerror?.(error));
  }
  async send(message: JSONRPCMessage) {
    const session = this.session;
    if (!session) throw new Error('The isolated MCP transport is not started.');
    const payload = serializeMessage(message);
    if (Buffer.byteLength(payload) > limit)
      throw new Error('MCP stdio message exceeds its limit.');
    await new Promise<void>((resolve, reject) => {
      session.stdin.write(payload, (error) =>
        error ? reject(error) : resolve(),
      );
    });
  }
  async close() {
    if (this.stopped) return;
    this.stopped = true;
    this.controller.abort();
    await this.session?.close();
    this.session = undefined;
    this.onclose?.();
  }
}
function workspaceRoot(db: Database.Database, id: string) {
  const row = db
    .prepare('SELECT path FROM workspace_directories WHERE id=?')
    .get(id) as { path: string } | undefined;
  if (!row)
    mcpFailure(
      'WORKSPACE_UNAVAILABLE',
      'Register the workspace before starting a local MCP process.',
    );
  return row.path;
}
export function openMcpConnection(
  db: Database.Database,
  executor: IsolatedExecutor | undefined,
  config: McpServerConfig,
  revision: string,
  bearer: string | undefined,
  approved: boolean,
) {
  if (config.transport !== 'stdio')
    return new McpConnection(config, revision, bearer);
  if (!approved)
    mcpFailure(
      'PERMISSION_DENIED',
      'Local MCP processes require an explicit approval before they start.',
    );
  if (!executor?.isolated || !executor.openStdio)
    mcpFailure(
      'ISOLATION_UNAVAILABLE',
      'Local stdio MCP runs only inside the isolated executor and is unavailable.',
    );
  const root = workspaceRoot(db, config.workspaceId);
  const transport = new IsolatedMcpTransport((signal) =>
    executor.openStdio!(
      {
        command: config.command,
        args: config.args,
        timeoutMs: config.timeoutMs,
        root,
      },
      signal,
    ),
  );
  return new McpConnection(config, revision, undefined, transport);
}
