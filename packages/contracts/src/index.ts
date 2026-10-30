import { z } from 'zod';
export const PROTOCOL_VERSION = 2;
export const MAX_MESSAGE_BYTES = 1048576;
export const modes = ['ask', 'plan', 'edit', 'agent'] as const;
export type Mode = (typeof modes)[number];
export const requestSchema = z
  .object({
    version: z.literal(PROTOCOL_VERSION),
    id: z.string().min(1).max(128),
    method: z.enum(['hello', 'health', 'shutdown']),
  })
  .strict();
export const healthSchema = z
  .object({
    status: z.literal('ready'),
    protocol: z.literal(PROTOCOL_VERSION),
    storage: z.literal('ready'),
  })
  .strict();
export const responseSchema = z.discriminatedUnion('ok', [
  z
    .object({
      version: z.literal(PROTOCOL_VERSION),
      id: z.string(),
      ok: z.literal(true),
      result: healthSchema,
    })
    .strict(),
  z
    .object({
      version: z.literal(PROTOCOL_VERSION),
      id: z.string(),
      ok: z.literal(false),
      error: z
        .object({
          code: z.enum([
            'INVALID_REQUEST',
            'VERSION_MISMATCH',
            'INTERNAL_ERROR',
          ]),
          message: z.string(),
        })
        .strict(),
    })
    .strict(),
]);
export type RuntimeRequest = z.infer<typeof requestSchema>;
export type RuntimeResponse = z.infer<typeof responseSchema>;
export type Health = z.infer<typeof healthSchema>;
export type ProviderKind =
  | 'openai'
  | 'anthropic'
  | 'google'
  | 'xai'
  | 'openrouter'
  | 'ollama'
  | 'lmstudio'
  | 'custom';
export type Support = 'supported' | 'unsupported' | 'unknown';
export interface ModelCapabilities {
  tools: Support;
  images: Support;
  structuredOutput: Support;
}
export interface ProviderConfig {
  id: string;
  kind: ProviderKind;
  baseURL?: string;
  credentialRef?: string;
}
export interface ModelReference {
  providerId: string;
  modelId: string;
  capabilities: ModelCapabilities;
}

export * from './chat';
export * from './wire';

export * from './storage';
