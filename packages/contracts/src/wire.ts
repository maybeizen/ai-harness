import { z } from 'zod';
import { storageOperationSchema } from './storage';
import { connectionKindSchema, generationSchema, appErrorSchema } from './chat';
const base = { version: z.literal(2), id: z.string().min(1).max(128) };
export const runtimeOperationSchema = z.discriminatedUnion('method', [
  z
    .object({
      ...base,
      method: z.literal('storage'),
      params: storageOperationSchema,
    })
    .strict(),
  z
    .object({ ...base, method: z.enum(['hello', 'health', 'shutdown']) })
    .strict(),
  z
    .object({
      ...base,
      method: z.literal('models'),
      params: z
        .object({
          connectionId: connectionKindSchema,
          credential: z.string().optional(),
          executable: z.string().optional(),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      ...base,
      method: z.literal('generate'),
      params: z
        .object({
          input: generationSchema,
          credential: z.string().optional(),
          executable: z.string().optional(),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      ...base,
      method: z.literal('cancel'),
      params: z.object({ generationId: z.string() }).strict(),
    })
    .strict(),
]);
export type RuntimeOperation = z.infer<typeof runtimeOperationSchema>;
export const wireResponseSchema = z
  .object({
    ...base,
    ok: z.boolean(),
    result: z.unknown().optional(),
    error: appErrorSchema.optional(),
  })
  .strict();
