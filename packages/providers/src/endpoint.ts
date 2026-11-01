import { normalizeEndpoint, type ConnectionKind } from '@harness/contracts';
import { compatibleEndpoints } from './compatible';
import { ProviderFailure } from './errors';
const native = new Set<ConnectionKind>([
  'chatgpt',
  'openai',
  'claude-client',
  'anthropic',
  'google',
  'xai',
]);
function invalid(message: string): never {
  throw new ProviderFailure({ code: 'INVALID_REQUEST', message });
}
export function connectionBase(
  kind: ConnectionKind,
  baseURL?: string,
): string | undefined {
  if (native.has(kind)) {
    if (baseURL) invalid('This connection does not accept a base URL.');
    return undefined;
  }
  if (kind === 'openrouter') {
    if (
      baseURL &&
      normalizeEndpoint(baseURL) !== compatibleEndpoints.openrouter
    )
      invalid('OpenRouter uses its official endpoint.');
    return compatibleEndpoints.openrouter;
  }
  if (!baseURL) {
    if (kind === 'ollama') return compatibleEndpoints.ollama;
    if (kind === 'lmstudio') return compatibleEndpoints.lmstudio;
    invalid('Enter an HTTP or HTTPS endpoint without credentials.');
  }
  const normalized = normalizeEndpoint(baseURL);
  if (!normalized)
    invalid('Enter an HTTP or HTTPS endpoint without credentials.');
  return normalized;
}
