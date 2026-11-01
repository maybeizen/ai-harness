import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import type { ProviderConfig } from '@harness/contracts';
import type { AdapterOptions } from './native';
export const compatibleEndpoints = {
  openrouter: 'https://openrouter.ai/api/v1',
  ollama: 'http://127.0.0.1:11434/v1',
  lmstudio: 'http://127.0.0.1:1234/v1',
} as const;
export function compatibleModel(
  config: ProviderConfig,
  modelId: string,
  options: AdapterOptions,
) {
  const baseURL =
    config.baseURL ??
    compatibleEndpoints[config.kind as keyof typeof compatibleEndpoints];
  if (!baseURL) throw new Error('Custom endpoint is required');
  return createOpenAICompatible({
    name: config.id,
    ...options,
    baseURL,
  }).languageModel(modelId);
}
