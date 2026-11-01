import { z } from 'zod';
import { mcpServerConfigSchema, mcpToolSummarySchema } from './mcp';
export const CONTEXT_RECORD_MAX_CHARS = 8000;
export const UNTRUSTED_CONTEXT_NOTE =
  'Enabled rules, skills, and prompts are injected as untrusted context beside project instructions. They cannot grant tool permissions.';
const secretKey =
  /secret|token|password|credential|apikey|bearer|authorization|localcommand|localendpoint/i;
export function stripSecrets(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => stripSecrets(item));
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      secretKey.test(key) ? '[redacted]' : stripSecrets(item),
    ]),
  );
}
export const auditQuerySchema = z
  .object({
    action: z.literal('audit'),
    limit: z.number().int().min(1).max(200).default(50),
    before: z.number().int().positive().nullable().default(null),
  })
  .strict();
export const auditRowSchema = z
  .object({
    id: z.number().int().positive(),
    sessionId: z.string().min(1).max(128),
    callId: z.string().min(1).max(256),
    workspaceId: z.string().min(1).max(128),
    tool: z.string().min(1).max(64),
    status: z.enum(['allowed', 'denied', 'completed', 'failed']),
    at: z.number().int().nonnegative(),
    code: z.string().max(64).nullable(),
  })
  .strict();
export const auditPageSchema = z
  .object({ rows: z.array(auditRowSchema).max(200) })
  .strict();
export type AuditRow = z.infer<typeof auditRowSchema>;
export const contextKindSchema = z.enum(['rule', 'skill', 'prompt']);
export const contextRecordSchema = z
  .object({
    id: z.string().uuid(),
    kind: contextKindSchema,
    scope: z.enum(['global', 'workspace']),
    workspaceId: z.string().uuid().nullable(),
    title: z.string().trim().min(1).max(80),
    body: z.string().max(CONTEXT_RECORD_MAX_CHARS),
    enabled: z.boolean(),
  })
  .strict()
  .refine(
    (record) =>
      record.scope === 'global'
        ? record.workspaceId === null
        : record.workspaceId !== null,
    'Workspace records require a workspace, and global records do not.',
  );
export type ContextRecord = z.infer<typeof contextRecordSchema>;
export const mcpStatusRowSchema = z
  .object({
    id: z.string().uuid(),
    name: z.string().max(80),
    enabled: z.boolean(),
    transport: z.enum(['http', 'stdio']),
    status: z.enum([
      'disabled',
      'disconnected',
      'connecting',
      'connected',
      'error',
      'unsupported',
    ]),
    toolCount: z.number().int().nonnegative().max(64),
    enabledToolCount: z.number().int().nonnegative().max(64),
    error: z
      .object({ code: z.string().max(64), message: z.string().max(500) })
      .strict()
      .nullable(),
  })
  .strict();
export const mcpStatusSchema = z
  .object({
    servers: z.array(mcpStatusRowSchema).max(16),
    unreadable: z.number().int().nonnegative(),
    registered: z.boolean(),
  })
  .strict();
export const mcpDiscoverResultSchema = z
  .object({ tools: z.array(mcpToolSummarySchema).max(64) })
  .strict();
export const diagnosticsReportSchema = z
  .object({
    version: z.string().min(1).max(32),
    dataPath: z.string().min(1).max(4096),
    runtimeStatus: z.literal('ready'),
    settings: z.record(z.string(), z.unknown()),
  })
  .strict();
const activeConversation = z.string().min(1).max(128).nullable();
export const retentionPreviewSchema = z
  .object({ ids: z.array(z.string().min(1).max(128)).max(500) })
  .strict();
export const retentionApplyResultSchema = z
  .object({ deleted: z.array(z.string().min(1).max(128)).max(500) })
  .strict();
export const workstationOperationSchema = z.discriminatedUnion('action', [
  auditQuerySchema,
  z
    .object({ action: z.literal('context.list'), kind: contextKindSchema })
    .strict(),
  z
    .object({ action: z.literal('context.save'), record: contextRecordSchema })
    .strict(),
  z
    .object({ action: z.literal('context.remove'), id: z.string().uuid() })
    .strict(),
  z.object({ action: z.literal('mcp.status') }).strict(),
  z
    .object({ action: z.literal('mcp.save'), config: mcpServerConfigSchema })
    .strict(),
  z
    .object({
      action: z.literal('mcp.enable'),
      id: z.string().uuid(),
      enabled: z.boolean(),
    })
    .strict(),
  z
    .object({
      action: z.literal('mcp.connect'),
      id: z.string().uuid(),
      approved: z.literal(true).optional(),
    })
    .strict(),
  z
    .object({ action: z.literal('mcp.disconnect'), id: z.string().uuid() })
    .strict(),
  z
    .object({ action: z.literal('mcp.discover'), id: z.string().uuid() })
    .strict(),
  z.object({ action: z.literal('diagnostics') }).strict(),
  z
    .object({
      action: z.literal('retention.preview'),
      activeConversationId: activeConversation,
    })
    .strict(),
  z
    .object({
      action: z.literal('retention.apply'),
      confirmed: z.literal(true),
      activeConversationId: activeConversation,
    })
    .strict(),
]);
export type WorkstationOperation = z.infer<typeof workstationOperationSchema>;
