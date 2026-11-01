import { mcpStatusSchema, type McpServerSummary } from '@harness/contracts';
export function redactMcpStatus(
  rows: Array<{ id: string }>,
  read: (id: string) => {
    id: string;
    name: string;
    enabled: boolean;
    transport: 'http' | 'stdio';
    status: McpServerSummary['status'];
    toolCount: number;
    enabledToolCount: number;
    error: McpServerSummary['error'];
  } | null,
) {
  const servers = [];
  let unreadable = 0;
  for (const row of rows) {
    const server = read(row.id);
    if (!server) {
      unreadable += 1;
      continue;
    }
    servers.push({
      ...server,
      error: server.error
        ? {
            code: server.error.code.slice(0, 64),
            message: server.error.message.slice(0, 500),
          }
        : null,
    });
  }
  return mcpStatusSchema.parse({ servers, unreadable, registered: true });
}
