import { createOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogle } from '@ai-sdk/google';
import { createXai } from '@ai-sdk/xai';
import type { ProviderKind } from '@harness/contracts';
export interface AdapterOptions {
  apiKey?: string;
  baseURL?: string;
  fetch?: typeof fetch;
}
export function nativeModel(
  kind: ProviderKind,
  modelId: string,
  options: AdapterOptions,
) {
  switch (kind) {
    case 'openai':
      return createOpenAI(options).languageModel(modelId);
    case 'anthropic':
      return createAnthropic(options).languageModel(modelId);
    case 'google':
      return createGoogle(options).languageModel(modelId);
    case 'xai':
      return createXai(options).languageModel(modelId);
    default:
      throw new Error('Unsupported native provider');
  }
}
