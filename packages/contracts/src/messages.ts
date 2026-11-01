import { z } from 'zod';
import { connectionKindSchema } from './connection';
export const ATTACHMENT_MAX_BYTES = 10_485_760;
export const attachmentMediaTypes = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'text/plain',
  'text/markdown',
  'application/pdf',
] as const;
export const attachmentIdSchema = z.string().regex(/^[a-f0-9]{64}$/);
export const attachmentReferenceSchema = z
  .object({
    id: attachmentIdSchema,
    name: z
      .string()
      .min(1)
      .max(255)
      .refine(
        (value) =>
          !value.includes('/') &&
          !value.includes('\\') &&
          !value.includes('\u0000'),
        'Use a file name without a path.',
      ),
    mediaType: z.enum(attachmentMediaTypes),
    size: z.number().int().positive().max(ATTACHMENT_MAX_BYTES),
  })
  .strict();
export type AttachmentReference = z.infer<typeof attachmentReferenceSchema>;
export const messageStatuses = [
  'completed',
  'streaming',
  'stopped',
  'error',
] as const;
export const messageStatusSchema = z.enum(messageStatuses);
export const messageModelSchema = z
  .object({
    connectionId: connectionKindSchema,
    modelId: z.string().min(1).max(256),
    name: z.string().max(256).optional(),
  })
  .strict();
export type MessageModel = z.infer<typeof messageModelSchema>;
export const storedToolUseSchema = z
  .object({
    callId: z.string().min(1).max(256),
    name: z.string().min(1).max(64),
    status: z.enum(['pending', 'running', 'completed', 'error']),
    input: z.string().max(32768).optional(),
    ok: z.boolean().optional(),
    output: z.string().max(65536).optional(),
  })
  .strict();
export type StoredToolUse = z.infer<typeof storedToolUseSchema>;
export const chatMessageSchema = z
  .object({
    id: z.string().min(1).max(128),
    role: z.enum(['user', 'assistant']),
    text: z.string(),
    createdAt: z
      .number()
      .int()
      .nonnegative()
      .max(Number.MAX_SAFE_INTEGER)
      .optional(),
    reasoning: z.string().max(65536).optional(),
    status: messageStatusSchema.optional(),
    model: messageModelSchema.optional(),
    modelName: z.string().max(256).optional(),
    connectionId: connectionKindSchema.optional(),
    parentId: z.string().min(1).max(128).optional(),
    attachmentIds: z.array(attachmentIdSchema).max(8).optional(),
    tools: z.array(storedToolUseSchema).max(16).optional(),
  })
  .strict();
export type ChatMessage = z.infer<typeof chatMessageSchema>;
