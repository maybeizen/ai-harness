import { z } from 'zod';
const endpoint = z
  .string()
  .max(2048)
  .refine((value) => {
    try {
      const url = new URL(value);
      const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
      return (
        !url.username &&
        !url.password &&
        !url.search &&
        !url.hash &&
        (url.protocol === 'https:' || (url.protocol === 'http:' && local))
      );
    } catch {
      return false;
    }
  }, 'Use HTTPS, or HTTP on localhost, without URL credentials or query secrets.');
const common = {
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(80),
  enabled: z.boolean(),
  credentialRef: z.string().uuid().nullable().default(null),
  timeoutMs: z.number().int().min(1000).max(60000).default(15000),
};
export const mcpServerConfigSchema = z
  .discriminatedUnion('transport', [
    z
      .object({ ...common, transport: z.literal('http'), url: endpoint })
      .strict(),
    z
      .object({
        ...common,
        transport: z.literal('stdio'),
        command: z.string().min(1).max(4096),
        args: z.array(z.string().max(4096)).max(32).default([]),
        workspaceId: z.string().uuid(),
      })
      .strict(),
  ])
  .refine(
    (config) =>
      new TextEncoder().encode(JSON.stringify(config)).byteLength <= 16384,
    'MCP configuration exceeds16KiB.',
  );
export const mcpOperationSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('list') }).strict(),
  z
    .object({ action: z.literal('save'), config: mcpServerConfigSchema })
    .strict(),
  z
    .object({
      action: z.enum(['remove', 'disconnect', 'discover', 'tools']),
      id: z.string().uuid(),
    })
    .strict(),
  z
    .object({
      action: z.literal('connect'),
      id: z.string().uuid(),
      approved: z.literal(true).optional(),
    })
    .strict(),
  z
    .object({
      action: z.literal('connect-auth'),
      id: z.string().uuid(),
      expectedRevision: z.string().regex(/^[a-f0-9]{64}$/),
      bearer: z.string().min(1).max(8192).optional(),
    })
    .strict(),
]);
export const mcpToolSummarySchema = z
  .object({
    name: z.string(),
    modelName: z.string(),
    description: z.string(),
    enabled: z.boolean(),
    reason: z.string().nullable(),
  })
  .strict();
export const mcpServerSummarySchema = z
  .object({
    config: mcpServerConfigSchema,
    revision: z.string().regex(/^[a-f0-9]{64}$/),
    status: z.enum([
      'disabled',
      'disconnected',
      'connecting',
      'connected',
      'error',
      'unsupported',
    ]),
    toolCount: z.number().int().nonnegative(),
    enabledToolCount: z.number().int().nonnegative(),
    error: z
      .object({ code: z.string(), message: z.string() })
      .strict()
      .nullable(),
  })
  .strict();
export type McpServerConfig = z.infer<typeof mcpServerConfigSchema>;
export type McpOperation = z.infer<typeof mcpOperationSchema>;
export type McpToolSummary = z.infer<typeof mcpToolSummarySchema>;
export type McpServerSummary = z.infer<typeof mcpServerSummarySchema>;
export const mcpCallResultSchema = z
  .object({
    content: z
      .array(
        z
          .object({ type: z.string(), text: z.string().optional() })
          .passthrough(),
      )
      .max(256),
    structuredContent: z.record(z.string(), z.unknown()).optional(),
    isError: z.boolean().optional(),
  })
  .passthrough();
