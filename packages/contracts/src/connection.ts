import { z } from 'zod';
export const connectionKinds = [
  'chatgpt',
  'openai',
  'claude-client',
  'anthropic',
  'google',
  'xai',
  'openrouter',
  'ollama',
  'lmstudio',
  'custom',
] as const;
export const connectionKindSchema = z.enum(connectionKinds);
export type ConnectionKind = z.infer<typeof connectionKindSchema>;
export const connectionProviders = [
  'openai',
  'anthropic',
  'google',
  'xai',
  'openrouter',
  'ollama',
  'lmstudio',
  'custom',
] as const;
export const connectionMethods = [
  'subscription',
  'api-key',
  'official-client',
  'endpoint',
] as const;
export const toolConnectionKinds = [
  'openai',
  'anthropic',
  'google',
  'xai',
  'openrouter',
  'ollama',
  'lmstudio',
  'custom',
] as const;
export type ToolConnectionKind = (typeof toolConnectionKinds)[number];
const secretQuery = new Set([
  'key',
  'api_key',
  'apikey',
  'token',
  'access_token',
  'bearer',
  'secret',
  'credential',
  'password',
]);
export function endpointIssue(value: string): string | null {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    return 'Enter an HTTP or HTTPS endpoint.';
  }
  if ((url.protocol !== 'http:' && url.protocol !== 'https:') || !url.host)
    return 'Enter an HTTP or HTTPS endpoint.';
  if (url.username || url.password || url.hash)
    return 'Remove credentials from the endpoint URL.';
  for (const name of url.searchParams.keys())
    if (secretQuery.has(name.toLowerCase()))
      return 'Remove credentials from the endpoint URL.';
  return null;
}
export function normalizeEndpoint(value: string): string | null {
  if (endpointIssue(value)) return null;
  const url = new URL(value.trim());
  url.hash = '';
  return url.toString().replace(/\/$/, '');
}
export const httpEndpointSchema = z
  .string()
  .min(1)
  .max(2048)
  .refine((value) => endpointIssue(value) === null, {
    message: 'Enter an HTTP or HTTPS endpoint without credentials.',
  });
export const connectionProfiles: Record<
  ConnectionKind,
  {
    label: string;
    provider: (typeof connectionProviders)[number];
    method: (typeof connectionMethods)[number];
    company: string;
  }
> = {
  chatgpt: {
    label: 'ChatGPT plan',
    provider: 'openai',
    method: 'subscription',
    company: 'OpenAI',
  },
  openai: {
    label: 'OpenAI API',
    provider: 'openai',
    method: 'api-key',
    company: 'OpenAI',
  },
  'claude-client': {
    label: 'Claude plan',
    provider: 'anthropic',
    method: 'official-client',
    company: 'Anthropic',
  },
  anthropic: {
    label: 'Anthropic API',
    provider: 'anthropic',
    method: 'api-key',
    company: 'Anthropic',
  },
  google: {
    label: 'Google Gemini',
    provider: 'google',
    method: 'api-key',
    company: 'Google',
  },
  xai: {
    label: 'xAI Grok',
    provider: 'xai',
    method: 'api-key',
    company: 'xAI',
  },
  openrouter: {
    label: 'OpenRouter',
    provider: 'openrouter',
    method: 'api-key',
    company: 'OpenRouter',
  },
  ollama: {
    label: 'Ollama',
    provider: 'ollama',
    method: 'endpoint',
    company: 'Ollama',
  },
  lmstudio: {
    label: 'LM Studio',
    provider: 'lmstudio',
    method: 'endpoint',
    company: 'LM Studio',
  },
  custom: {
    label: 'Custom endpoint',
    provider: 'custom',
    method: 'endpoint',
    company: 'Custom',
  },
};
export const connectionSchema = z
  .object({
    id: connectionKindSchema,
    label: z.string(),
    provider: z.enum(connectionProviders),
    method: z.enum(connectionMethods),
    configured: z.boolean(),
    status: z.enum(['disconnected', 'checking', 'connected', 'unavailable']),
    storage: z.enum(['secure', 'session', 'client', 'none']),
    account: z.string().nullable(),
    executable: z.string().nullable(),
    baseURL: httpEndpointSchema.optional(),
  })
  .strict();
export type ConnectionSummary = z.infer<typeof connectionSchema>;
export const connectionLabels: Record<ConnectionKind, string> = {
  chatgpt: connectionProfiles.chatgpt.label,
  openai: connectionProfiles.openai.label,
  'claude-client': connectionProfiles['claude-client'].label,
  anthropic: connectionProfiles.anthropic.label,
  google: connectionProfiles.google.label,
  xai: connectionProfiles.xai.label,
  openrouter: connectionProfiles.openrouter.label,
  ollama: connectionProfiles.ollama.label,
  lmstudio: connectionProfiles.lmstudio.label,
  custom: connectionProfiles.custom.label,
};
export function connectionAllowsTools(
  kind: ConnectionKind,
): kind is ToolConnectionKind {
  switch (kind) {
    case 'openai':
    case 'anthropic':
    case 'google':
    case 'xai':
    case 'openrouter':
    case 'ollama':
    case 'lmstudio':
    case 'custom':
      return true;
    case 'chatgpt':
    case 'claude-client':
      return false;
  }
}
