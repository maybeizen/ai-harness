import { APICallError } from 'ai';
import type { AppError } from '@harness/contracts';
export class ProviderFailure extends Error {
  constructor(readonly detail: AppError) {
    super(detail.message);
  }
}
export function providerError(error: unknown): AppError {
  if (error instanceof ProviderFailure) return error.detail;
  const status = APICallError.isInstance(error) ? error.statusCode : undefined;
  if (status === 401)
    return {
      code: 'AUTH_REQUIRED',
      message: 'Sign in again or replace this API key.',
    };
  if (status === 403 || status === 404)
    return {
      code: 'MODEL_UNAVAILABLE',
      message:
        'This model is not available to this connection. Refresh the model list or choose another model.',
    };
  if (status === 429)
    return {
      code: 'RATE_LIMIT',
      message:
        'The provider has reached a rate or usage limit. Check your provider quota and try again later.',
    };
  if (status === 400 || status === 413)
    return {
      code: 'CONTEXT_LIMIT',
      message:
        'The provider rejected this conversation. Start a new chat or select another model.',
    };
  return {
    code: 'NETWORK',
    message:
      'The response was interrupted or the provider could not be reached. Your partial reply has been preserved.',
  };
}
export function httpFailure(status: number): ProviderFailure {
  return new ProviderFailure(
    status === 401
      ? {
          code: 'AUTH_REQUIRED',
          message:
            'The provider rejected this credential. Sign in again or check your API key.',
        }
      : status === 429
        ? {
            code: 'RATE_LIMIT',
            message: 'Provider usage is limited. Check your plan or API quota.',
          }
        : status === 403 || status === 404
          ? {
              code: 'MODEL_UNAVAILABLE',
              message: 'This connection cannot access the requested model.',
            }
          : {
              code: 'NETWORK',
              message:
                'The provider request failed. Check your connection and retry.',
            },
  );
}
