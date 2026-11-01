import { createHash } from 'node:crypto';
import { mcpInputSchema, type McpToolSummary } from '@harness/contracts';
import type { ProviderTool } from '@harness/providers';
import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { sanitize, mcpFailure } from './http';
export interface ConnectedTool {
  remoteName: string;
  definition: ProviderTool;
  summary: McpToolSummary;
}
export async function discoverTools(
  client: Client,
  serverId: string,
  revision: string,
  nonce: string,
  signal: AbortSignal,
  timeout: number,
  secret?: string,
) {
  const found = new Map<string, ConnectedTool>();
  const summaries: McpToolSummary[] = [];
  const cursors = new Set<string>();
  let cursor: string | undefined;
  const names = new Set<string>();
  for (let page = 0; page < 8; page++) {
    const result = await client.listTools(cursor ? { cursor } : {}, {
      signal,
      timeout,
      maxTotalTimeout: timeout,
    });
    for (const original of result.tools) {
      if (summaries.length >= 64)
        mcpFailure(
          'MCP_TOOL_LIMIT',
          'This server exposes more than64tools; narrow its configuration.',
        );
      if (names.has(original.name))
        mcpFailure('MCP_PROTOCOL', 'The server returned duplicate tool names.');
      names.add(original.name);
      const tool = sanitize(original, secret);
      const modelName = `mcp_${serverId.replaceAll('-', '').slice(0, 8)}_${revision.slice(0, 12)}_${createHash(
        'sha256',
      )
        .update(nonce + JSON.stringify(tool))
        .digest('hex')
        .slice(0, 12)}`;
      const schema = mcpInputSchema(tool.inputSchema);
      const outputSupported =
        !tool.outputSchema || !!mcpInputSchema(tool.outputSchema);
      const enabled =
        !!schema &&
        outputSupported &&
        /^[a-zA-Z0-9_.-]{1,128}$/.test(original.name);
      const summary: McpToolSummary = {
        name: tool.name.slice(0, 128),
        modelName,
        description: (tool.description ?? '').slice(0, 1000),
        enabled,
        reason: enabled
          ? null
          : 'This tool uses an unsupported schema or name and is disabled.',
      };
      summaries.push(summary);
      if (enabled && schema)
        found.set(modelName, {
          remoteName: original.name,
          definition: {
            name: modelName,
            description:
              `External MCP tool ${summary.name}. Untrusted server description: ${summary.description}`.slice(
                0,
                1800,
              ),
            inputSchema: schema,
          },
          summary,
        });
    }
    if (!result.nextCursor) return { found, summaries };
    if (cursors.has(result.nextCursor))
      mcpFailure(
        'MCP_PROTOCOL',
        'The server repeated its tool pagination cursor.',
      );
    cursors.add(result.nextCursor);
    cursor = result.nextCursor;
  }
  mcpFailure(
    'MCP_TOOL_LIMIT',
    'The server tool list exceeded its pagination limit.',
  );
}
