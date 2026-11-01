import { z } from 'zod';
import {
  agentRequestSchema,
  agentEventSchema,
  approvalDecisionSchema,
  agentModeSchema,
  permissionPolicySchema,
} from './agent';
import {
  httpEndpointSchema,
  normalizeEndpoint,
  toolConnectionKinds,
} from './connection';
const localBase = new Set(['openrouter', 'ollama', 'lmstudio', 'custom']);
const openrouterEndpoint = 'https://openrouter.ai/api/v1';
const id = z.string().uuid();
export const agentOperationSchema = z
  .discriminatedUnion('action', [
    z
      .object({ action: z.literal('reserve'), request: agentRequestSchema })
      .strict(),
    z
      .object({
        action: z.literal('start'),
        id,
        connectionId: z.enum(toolConnectionKinds),
        modelId: z.string().min(1).max(256),
        credential: z.string().max(16384),
        baseURL: httpEndpointSchema.optional(),
      })
      .strict(),
    z
      .object({
        action: z.literal('resume'),
        id,
        connectionId: z.enum(toolConnectionKinds),
        modelId: z.string().min(1).max(256),
        credential: z.string().max(16384),
        baseURL: httpEndpointSchema.optional(),
      })
      .strict(),
    z
      .object({
        action: z.literal('poll'),
        id,
        after: z.number().int().nonnegative().default(0),
      })
      .strict(),
    z.object({ action: z.literal('list') }).strict(),
    z.object({ action: z.literal('cancel'), id }).strict(),
    z
      .object({
        action: z.literal('approve'),
        decision: approvalDecisionSchema,
      })
      .strict(),
    z.object({ action: z.literal('patch.list'), workspaceId: id }).strict(),
    z
      .object({
        action: z.literal('patch.read'),
        workspaceId: id,
        path: z.string().min(1).max(4096),
      })
      .strict(),
    z
      .object({
        action: z.literal('patch.accept'),
        workspaceId: id,
        path: z.string().min(1).max(4096),
      })
      .strict(),
    z
      .object({
        action: z.literal('patch.rollback'),
        workspaceId: id,
        path: z.string().min(1).max(4096),
        confirmed: z.literal(true),
      })
      .strict(),
  ])
  .superRefine((value, context) => {
    if (value.action !== 'start' && value.action !== 'resume') return;
    if (value.baseURL && !localBase.has(value.connectionId))
      context.addIssue({
        code: 'custom',
        path: ['baseURL'],
        message: 'This connection does not accept a base URL.',
      });
    if (value.connectionId === 'custom' && !value.baseURL)
      context.addIssue({
        code: 'custom',
        path: ['baseURL'],
        message: 'Enter an HTTP or HTTPS endpoint without credentials.',
      });
    if (
      value.connectionId === 'openrouter' &&
      value.baseURL &&
      normalizeEndpoint(value.baseURL) !== openrouterEndpoint
    )
      context.addIssue({
        code: 'custom',
        path: ['baseURL'],
        message: 'OpenRouter uses its official endpoint.',
      });
  });
export const agentStatusSchema = z.enum([
  'reserved',
  'running',
  'completed',
  'cancelled',
  'error',
  'limited',
  'resumable',
]);
const patchHash = z.string().regex(/^[a-f0-9]{64}$/);
export const agentPatchListSchema = z.array(
  z
    .object({
      path: z.string(),
      beforeHash: patchHash.nullable(),
      afterHash: patchHash,
    })
    .strict(),
);
export const agentPatchSchema = z
  .object({
    path: z.string(),
    before: z.string(),
    after: z.string(),
    beforeHash: patchHash.nullable(),
    afterHash: patchHash,
    currentHash: patchHash.nullable(),
  })
  .strict()
  .nullable();
export const agentSummarySchema = z
  .object({
    id,
    workspaceId: id,
    mode: agentModeSchema,
    policy: permissionPolicySchema,
    promptPreview: z.string().max(200),
    status: agentStatusSchema,
    createdAt: z.number().int().nonnegative(),
    updatedAt: z.number().int().nonnegative(),
  })
  .strict();
export const agentPollSchema = z
  .object({
    id,
    status: agentStatusSchema,
    events: z
      .array(
        z
          .object({
            sequence: z.number().int().positive(),
            event: agentEventSchema,
          })
          .strict(),
      )
      .max(20),
    nextCursor: z.number().int().nonnegative(),
  })
  .strict();
export type AgentOperation = z.infer<typeof agentOperationSchema>;
export type AgentSummary = z.infer<typeof agentSummarySchema>;
export type AgentPoll = z.infer<typeof agentPollSchema>;
export type AgentStatus = z.infer<typeof agentStatusSchema>;
