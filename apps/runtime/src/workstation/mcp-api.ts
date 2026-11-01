import {
  mcpDiscoverResultSchema,
  mcpServerSummarySchema,
  mcpStatusSchema,
  type WorkstationOperation,
} from '@harness/contracts';
import { ProviderFailure } from '@harness/providers';
import type { Mcps } from '../mcp/service';
function unavailable(): never {
  throw new ProviderFailure({
    code: 'UNAVAILABLE',
    message: 'MCP is not registered with the runtime.',
  });
}
function unregistered() {
  return mcpStatusSchema.parse({
    servers: [],
    unreadable: 0,
    registered: false,
  });
}
export async function runMcp(
  mcps: Mcps | undefined,
  operation: WorkstationOperation,
) {
  if (
    operation.action !== 'mcp.status' &&
    operation.action !== 'mcp.save' &&
    operation.action !== 'mcp.enable' &&
    operation.action !== 'mcp.connect' &&
    operation.action !== 'mcp.disconnect' &&
    operation.action !== 'mcp.discover'
  )
    return undefined;
  if (!mcps) {
    if (operation.action === 'mcp.status') return unregistered();
    unavailable();
  }
  if (operation.action === 'mcp.status') return mcps.status();
  if (operation.action === 'mcp.save') {
    await mcps.dispatch({ action: 'save', config: operation.config });
    return mcps.status();
  }
  if (operation.action === 'mcp.enable') {
    const listed = mcpServerSummarySchema
      .array()
      .parse(await mcps.dispatch({ action: 'list' }));
    const saved = listed.find((item) => item.config.id === operation.id);
    if (!saved)
      throw new ProviderFailure({
        code: 'MCP_NOT_FOUND',
        message: 'This MCP server is not configured.',
      });
    await mcps.dispatch({
      action: 'save',
      config: { ...saved.config, enabled: operation.enabled },
    });
    return mcps.status();
  }
  if (operation.action === 'mcp.connect') {
    await mcps.dispatch({
      action: 'connect',
      id: operation.id,
      ...(operation.approved ? { approved: operation.approved } : {}),
    });
    return mcps.status();
  }
  if (operation.action === 'mcp.disconnect') {
    await mcps.dispatch({ action: 'disconnect', id: operation.id });
    return mcps.status();
  }
  if (operation.action === 'mcp.discover') {
    const tools = await mcps.dispatch({ action: 'discover', id: operation.id });
    return mcpDiscoverResultSchema.parse({ tools });
  }
  return undefined;
}
