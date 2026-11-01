import { z } from 'zod';
export const agentModes = [
  'ask',
  'plan',
  'edit',
  'agent',
  'multitask',
  'debug',
  'review',
  'security',
] as const;
export const agentModeSchema = z.enum(agentModes);
export const permissionPolicySchema = z.enum(['manual', 'automatic', 'full']);
export const agentRequestSchema = z
  .object({
    id: z.string().uuid(),
    workspaceId: z.string().uuid(),
    conversationId: z.string().min(1).max(128).optional(),
    mode: agentModeSchema,
    policy: permissionPolicySchema,
    automaticCreateText: z.boolean().default(true),
    prompt: z.string().min(1).max(65536),
    maxSteps: z.number().int().min(1).max(50).default(12),
    timeoutMs: z.number().int().min(1000).max(600000).default(180000),
    maxContextBytes: z.number().int().min(4096).max(524288).default(131072),
    maxContextTokens: z.number().int().min(256).max(200000).default(32000),
  })
  .strict();
export const approvalSchema = z
  .object({
    id: z.string().uuid(),
    sessionId: z.string().uuid(),
    callId: z.string().min(1).max(256),
    workspaceId: z.string().uuid(),
    requestHash: z.string().regex(/^[a-f0-9]{64}$/),
    tool: z.string().min(1).max(64),
    summary: z.string().max(32768),
    expiresAt: z.number().int(),
  })
  .strict();
export const approvalDecisionSchema = z
  .object({
    id: z.string().uuid(),
    requestHash: z.string().regex(/^[a-f0-9]{64}$/),
    decision: z.enum(['allow', 'deny']),
  })
  .strict();
export const agentEventSchema = z.discriminatedUnion('type', [
  z
    .object({
      type: z.literal('subtask'),
      sessionId: z.string(),
      childSessionId: z.string(),
      title: z.string().max(200),
      status: z.enum(['running', 'completed', 'cancelled', 'error', 'limited']),
    })
    .strict(),
  z
    .object({
      type: z.literal('text'),
      sessionId: z.string(),
      text: z.string(),
    })
    .strict(),
  z
    .object({
      type: z.literal('tool'),
      sessionId: z.string(),
      callId: z.string(),
      name: z.string(),
      status: z.enum(['pending', 'running']),
    })
    .strict(),
  z
    .object({
      type: z.literal('approval'),
      sessionId: z.string(),
      approval: approvalSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal('result'),
      sessionId: z.string(),
      callId: z.string(),
      name: z.string(),
      ok: z.boolean(),
      output: z.unknown(),
    })
    .strict(),
  z
    .object({
      type: z.literal('status'),
      sessionId: z.string(),
      status: z.enum([
        'running',
        'completed',
        'cancelled',
        'error',
        'limited',
        'resumable',
      ]),
      step: z.number().int(),
      message: z.string().max(8192),
    })
    .strict(),
]);
export type AgentMode = z.infer<typeof agentModeSchema>;
export type PermissionPolicy = z.infer<typeof permissionPolicySchema>;
export type AgentRequest = z.infer<typeof agentRequestSchema>;
export type Approval = z.infer<typeof approvalSchema>;
export type ApprovalDecision = z.infer<typeof approvalDecisionSchema>;
export type AgentEvent = z.infer<typeof agentEventSchema>;

const toolPath = z.string().min(1).max(4096);
const toolHash = z.string().regex(/^[a-f0-9]{64}$/);
const toolText = z.string().max(262144);
export const findingSchema = z
  .object({
    severity: z.enum(['critical', 'high', 'medium', 'low', 'info']),
    file: toolPath,
    line: z.number().int().min(1).max(1000000),
    evidence: z.string().min(1).max(2000),
  })
  .strict();
export type Finding = z.infer<typeof findingSchema>;
export const agentToolSchemas = {
  read_file: z.object({ path: toolPath }).strict(),
  list_directory: z.object({ path: z.string().max(4096).default('') }).strict(),
  search: z.object({ query: z.string().min(1).max(256) }).strict(),
  git_status: z.object({}).strict(),
  git_diff: z.object({ staged: z.boolean().default(false) }).strict(),
  write_file: z
    .object({
      path: toolPath,
      text: toolText,
      expectedHash: toolHash.nullable(),
    })
    .strict(),
  edit_file: z
    .object({
      path: toolPath,
      oldText: toolText.min(1),
      newText: toolText,
      expectedHash: toolHash,
    })
    .strict(),
  delete_file: z.object({ path: toolPath, expectedHash: toolHash }).strict(),
  execute_command: z
    .object({
      command: z.string().min(1).max(4096),
      timeoutMs: z.number().int().min(100).max(60000).default(30000),
    })
    .strict(),
  apply_patch: z
    .object({
      path: toolPath,
      expectedHash: toolHash.nullable(),
      patch: z.string().min(1).max(262144),
    })
    .strict(),
  run_tests: z
    .object({
      command: z.string().min(1).max(4096),
      timeoutMs: z.number().int().min(100).max(60000).default(30000),
    })
    .strict(),
  project_metadata: z
    .object({ path: z.string().max(4096).default('') })
    .strict(),
  report_findings: z
    .object({
      findings: z.array(findingSchema).max(40),
    })
    .strict(),
  delegate_tasks: z
    .object({
      tasks: z
        .array(z.object({ prompt: z.string().min(1).max(16384) }).strict())
        .min(1)
        .max(3),
    })
    .strict(),
};
export const readToolResultSchema = z.object({
  path: z.string(),
  text: z.string(),
});
