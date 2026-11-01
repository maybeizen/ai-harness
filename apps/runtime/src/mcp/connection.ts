import { randomUUID } from 'node:crypto';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import type { McpServerConfig, McpToolSummary } from '@harness/contracts';
import { secureFetch, mcpFailure } from './http';
import { boundedValidator } from './schema';
import { discoverTools, type ConnectedTool } from './tools';
export class McpConnection {
  readonly controller = new AbortController();
  readonly client: Client;
  readonly transport: Transport;
  tools = new Map<string, ConnectedTool>();
  summaries: McpToolSummary[] = [];
  busy = false;
  closed = false;
  private callController: AbortController | undefined;
  constructor(
    readonly config: McpServerConfig,
    readonly revision: string,
    readonly bearer?: string,
    installed?: Transport,
  ) {
    if (config.transport === 'http') {
      const endpoint = new URL(config.url);
      this.transport = new StreamableHTTPClientTransport(endpoint, {
        requestInit: {
          redirect: 'error',
          ...(bearer ? { headers: { Authorization: `Bearer ${bearer}` } } : {}),
        },
        fetch: secureFetch(
          endpoint,
          this.controller.signal,
          config.timeoutMs,
          () => this.callController?.signal,
        ),
        redirectPolicy: 'same-origin',
        reconnectionOptions: {
          maxRetries: 0,
          initialReconnectionDelay: 1000,
          maxReconnectionDelay: 1000,
          reconnectionDelayGrowFactor: 1,
        },
      });
    } else if (!installed)
      mcpFailure(
        'ISOLATION_UNAVAILABLE',
        'Local stdio MCP runs only inside the isolated executor and is unavailable.',
      );
    else this.transport = installed;
    this.client = new Client(
      { name: 'axioden', version: '0.1.0' },
      {
        capabilities: {},
        enforceStrictCapabilities: true,
        jsonSchemaValidator: boundedValidator,
      },
    );
    this.client.onclose = () => {
      this.closed = true;
      this.tools.clear();
      this.summaries = [];
    };
    this.client.onerror = () => {
      if (this.callController?.signal.aborted) return;
      this.controller.abort();
      this.closed = true;
      this.tools.clear();
      this.summaries = [];
      void this.client.close().catch(() => undefined);
    };
  }
  async connect() {
    await this.client.connect(this.transport, {
      signal: this.controller.signal,
      timeout: this.config.timeoutMs,
      maxTotalTimeout: this.config.timeoutMs,
    });
    await this.discover();
  }
  async discover() {
    if (this.busy)
      mcpFailure(
        'BUSY',
        'Wait for the active MCP call before refreshing tools.',
      );
    this.tools.clear();
    this.summaries = [];
    const result = await discoverTools(
      this.client,
      this.config.id,
      this.revision,
      randomUUID(),
      this.controller.signal,
      this.config.timeoutMs,
      this.bearer,
    );
    this.tools = result.found;
    this.summaries = result.summaries;
  }
  async call(name: string, input: unknown, signal: AbortSignal) {
    if (this.busy)
      mcpFailure('BUSY', 'This MCP server already has an active call.');
    const tool = this.tools.get(name);
    if (!tool)
      mcpFailure(
        'MCP_STALE_TOOL',
        'This tool changed or disconnected. Refresh it and request approval again.',
      );
    const parsed = tool.definition.inputSchema.safeParse(input);
    if (!parsed.success)
      mcpFailure(
        'INVALID_TOOL_CALL',
        'The MCP tool arguments do not match the approved schema.',
      );
    if (Buffer.byteLength(JSON.stringify(parsed.data)) > 32768)
      mcpFailure(
        'MCP_INPUT_LIMIT',
        'The MCP arguments exceed their context limit.',
      );
    this.busy = true;
    this.callController = new AbortController();
    const abort = () => this.callController?.abort();
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort();
    try {
      return await this.client.callTool(
        {
          name: tool.remoteName,
          arguments: parsed.data as Record<string, unknown>,
        },
        undefined,
        {
          signal: AbortSignal.any([
            signal,
            this.controller.signal,
            this.callController.signal,
          ]),
          timeout: this.config.timeoutMs,
          maxTotalTimeout: this.config.timeoutMs,
        },
      );
    } finally {
      signal.removeEventListener('abort', abort);
      this.callController = undefined;
      this.busy = false;
    }
  }
  async close() {
    this.closed = true;
    this.tools.clear();
    this.summaries = [];
    this.callController?.abort();
    const http = this.transport as Transport & {
      terminateSession?: () => Promise<void>;
    };
    try {
      await http.terminateSession?.();
    } catch {
      this.controller.abort();
    } finally {
      this.controller.abort();
      await this.client.close();
    }
  }
}
