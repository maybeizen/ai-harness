import type { ModelReference, ProviderConfig } from '@harness/contracts';
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
  if (config.baseURL) {
    const url = new URL(config.baseURL);
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      url.username ||
      url.password
    )
      throw new Error('Invalid provider endpoint');
  }
  const apiKey = config.credentialRef
    ? await dependencies.credentials.resolve(config.credentialRef)
    : undefined;
  if ((config.credentialRef || authenticatedKinds.has(config.kind)) && !apiKey)
    throw new Error('Provider credential unavailable');
  const options: AdapterOptions = {
    ...(apiKey ? { apiKey } : {}),
    ...(config.baseURL ? { baseURL: config.baseURL } : {}),
    ...(dependencies.fetch ? { fetch: dependencies.fetch } : {}),
  };
  return nativeKinds.has(config.kind)
    ? nativeModel(config.kind, model.modelId, options)
    : compatibleModel(config, model.modelId, options);
}

export * from './discovery';
export * from './inference';
export * from './errors';
