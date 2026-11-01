import {
  normalizeEndpoint,
  type ModelReference,
  type ProviderConfig,
} from '@harness/contracts';
import { nativeModel, type AdapterOptions } from './native';
import { compatibleModel } from './compatible';
export interface CredentialResolver {
  resolve(reference: string): Promise<string | undefined>;
}
export interface ProviderDependencies {
  credentials: CredentialResolver;
  fetch?: typeof fetch;
}
const nativeKinds = new Set(['openai', 'anthropic', 'google', 'xai']);
const authenticatedKinds = new Set([...nativeKinds, 'openrouter']);
export async function createModel(
  config: ProviderConfig,
  model: ModelReference,
  dependencies: ProviderDependencies,
) {
  if (!config.id || model.providerId !== config.id || !model.modelId.trim())
    throw new Error('Invalid model reference');
  const baseURL = config.baseURL
    ? normalizeEndpoint(config.baseURL)
    : undefined;
  if (config.baseURL && !baseURL) throw new Error('Invalid provider endpoint');
  const apiKey = config.credentialRef
    ? await dependencies.credentials.resolve(config.credentialRef)
    : undefined;
  if ((config.credentialRef || authenticatedKinds.has(config.kind)) && !apiKey)
    throw new Error('Provider credential unavailable');
  const options: AdapterOptions = {
    ...(apiKey ? { apiKey } : {}),
    ...(baseURL ? { baseURL } : {}),
    ...(dependencies.fetch ? { fetch: dependencies.fetch } : {}),
  };
  return nativeKinds.has(config.kind)
    ? nativeModel(config.kind, model.modelId, options)
    : compatibleModel(
        { ...config, ...(baseURL ? { baseURL } : {}) },
        model.modelId,
        options,
      );
}

export * from './discovery';
export * from './inference';
export * from './errors';
export type { PromptImage } from './prompt-content';

export * from './tools';
