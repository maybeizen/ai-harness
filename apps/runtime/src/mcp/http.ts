import type { FetchLike } from '@modelcontextprotocol/sdk/shared/transport.js';
import { ProviderFailure } from '@harness/providers';
export function mcpFailure(code: string, message: string): never {
  throw new ProviderFailure({ code, message });
}
export function sanitize<T>(value: T, secret?: string): T {
  if (!secret) return value;
  const encoded = JSON.stringify(secret).slice(1, -1);
  return JSON.parse(
    JSON.stringify(value).split(encoded).join('[redacted]'),
  ) as T;
}
export function secureFetch(
  endpoint: URL,
  signal: AbortSignal,
  timeoutMs: number,
  callSignal: () => AbortSignal | undefined,
): FetchLike {
  return async (url, init) => {
    const target = new URL(url);
    if (target.href !== endpoint.href)
      mcpFailure(
        'MCP_ENDPOINT',
        'MCP requests cannot leave the configured endpoint.',
      );
    const method = init?.method ?? 'GET';
    const cancellation =
      typeof init?.body === 'string' &&
      init.body.includes('"method":"notifications/cancelled"');
    const call = cancellation ? undefined : callSignal();
    const signals = [
      signal,
      ...(init?.signal ? [init.signal] : []),
      ...(call ? [call] : []),
    ];
    if (method !== 'GET')
      signals.push(AbortSignal.timeout(method === 'DELETE' ? 1000 : timeoutMs));
    const headersController = new AbortController();
    signals.push(headersController.signal);
    const headersTimer = setTimeout(() => headersController.abort(), timeoutMs);
    const combined = AbortSignal.any(signals);
    let response: Response;
    try {
      response = await fetch(target, {
        ...init,
        signal: combined,
        redirect: 'error',
        credentials: 'omit',
      });
    } finally {
      clearTimeout(headersTimer);
    }
    if (!response.body) return response;
    let bytes = 0;
    const bounded = response.body.pipeThrough(
      new TransformStream<Uint8Array, Uint8Array>({
        transform(chunk, controller) {
          bytes += chunk.byteLength;
          if (bytes > 524288) throw new Error('MCP response limit exceeded.');
          controller.enqueue(chunk);
        },
      }),
    );
    return new Response(bounded, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });
  };
}
