import { mcpCallResultSchema } from '@harness/contracts';
import { sanitize, mcpFailure } from './http';
export function normalizeMcpResult(raw: unknown, secret?: string) {
  const result = mcpCallResultSchema.parse(sanitize(raw, secret));
  if (Buffer.byteLength(JSON.stringify(result)) > 131072)
    mcpFailure(
      'MCP_OUTPUT_LIMIT',
      'The MCP result exceeds128KiB. Request a smaller result.',
    );
  const content = result.content
    .filter(
      (item): item is typeof item & { text: string } =>
        item.type === 'text' && typeof item.text === 'string',
    )
    .map((item) => ({ type: 'text' as const, text: item.text }));
  if (result.isError)
    mcpFailure(
      'MCP_TOOL_ERROR',
      content
        .map((item) => item.text)
        .join('\n')
        .slice(0, 2000) || 'The MCP tool reported an error.',
    );
  return {
    content,
    ...(result.structuredContent
      ? { structuredContent: result.structuredContent }
      : {}),
    nonTextContentOmitted: result.content.length - content.length,
  };
}
