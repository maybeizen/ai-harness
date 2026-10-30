import { z } from 'zod';
export const connectionKinds = [
  'chatgpt',
  'openai',
  'claude-client',
  'anthropic',
  'google',
  'xai',
] as const;
export const connectionKindSchema = z.enum(connectionKinds);
export type ConnectionKind = z.infer<typeof connectionKindSchema>;
export const appErrorSchema = z
  .object({ code: z.string(), message: z.string() })
  .strict();
export type AppError = z.infer<typeof appErrorSchema>;
export const connectionSchema = z
  .object({
    id: connectionKindSchema,
    label: z.string(),
    provider: z.enum(['openai', 'anthropic', 'google', 'xai']),
    method: z.enum(['subscription', 'api-key', 'official-client']),
    configured: z.boolean(),
    status: z.enum(['disconnected', 'checking', 'connected', 'unavailable']),
    storage: z.enum(['secure', 'session', 'client', 'none']),
    account: z.string().nullable(),
    executable: z.string().nullable(),
  })
  .strict();
export type ConnectionSummary = z.infer<typeof connectionSchema>;
export const modelSchema = z
  .object({
    id: z.string().min(1),
    name: z.string(),
    verified: z.boolean(),
    available: z.boolean(),
  })
  .strict();
export type ChatModel = z.infer<typeof modelSchema>;
export const textMessageSchema = z
  .object({
    id: z.string().min(1).max(128),
    role: z.enum(['user', 'assistant']),
    text: z.string(),
  })
  .strict();
export type TextMessage = z.infer<typeof textMessageSchema>;
export const generationSchema = z
  .object({
    generationId: z.string().min(1).max(128),
    conversationId: z.string().min(1).max(128),
    connectionId: connectionKindSchema,
    modelId: z.string().min(1).max(256),
    messages: z.array(textMessageSchema).min(1).max(1000),
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
export const connectionLabels: Record<ConnectionKind, string> = {
  chatgpt: 'ChatGPT plan',
  openai: 'OpenAI API',
  'claude-client': 'Claude plan',
  anthropic: 'Anthropic API',
  google: 'Google Gemini',
  xai: 'xAI Grok',
};
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
