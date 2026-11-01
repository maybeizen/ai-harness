import { z } from 'zod';
import { connectionKindSchema } from './connection';
import {
  generationSettingsSchema,
  modelCapabilitiesSchema,
} from './generation';
import { chatMessageSchema, type ChatMessage } from './messages';
export * from './connection';
export const appErrorSchema = z
  .object({ code: z.string(), message: z.string() })
  .strict();
export type AppError = z.infer<typeof appErrorSchema>;
export const modelSchema = z
  .object({
    id: z.string().min(1),
    name: z.string(),
    verified: z.boolean(),
    available: z.boolean(),
    capabilities: modelCapabilitiesSchema.optional(),
  })
  .strict();
export type ChatModel = z.infer<typeof modelSchema>;
export const textMessageSchema = chatMessageSchema;
export type TextMessage = ChatMessage;
export const generationSchema = z
  .object({
    generationId: z.string().min(1).max(128),
    conversationId: z.string().min(1).max(128),
    connectionId: connectionKindSchema,
    modelId: z.string().min(1).max(256),
    messages: z.array(textMessageSchema).min(1).max(1000),
    settings: generationSettingsSchema.optional(),
  })
  .strict();
export type GenerationInput = z.infer<typeof generationSchema>;
const identity = {
  generationId: z.string(),
  conversationId: z.string(),
  sequence: z.number().int().nonnegative(),
};
export const streamEventSchema = z.discriminatedUnion('type', [
  z.object({ ...identity, type: z.literal('text'), text: z.string() }).strict(),
  z
    .object({
      ...identity,
      type: z.literal('done'),
      status: z.enum(['completed', 'cancelled']),
    })
    .strict(),
  z
    .object({ ...identity, type: z.literal('error'), error: appErrorSchema })
    .strict(),
]);
export type ChatEvent = z.infer<typeof streamEventSchema>;
export function toAppError(value: unknown): AppError {
  const parsed = appErrorSchema.safeParse(value);
  return parsed.success
    ? parsed.data
    : {
        code: 'UNAVAILABLE',
        message:
          'The application could not complete this request. Check the runtime connection and try again.',
      };
}
