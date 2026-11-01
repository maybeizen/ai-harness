import { setTimeout as delay } from 'node:timers/promises';
import type { AgentRequest } from '@harness/contracts';
import {
  streamToolTurn,
  providerError,
  type ProviderMessage,
  type ProviderTurnEvent,
} from '@harness/providers';
import { AgentFailure, type ToolCall } from './permissions';
import { reportedTokens } from './budget';
import { abortable } from './signals';
import type { AgentOptions } from './types';
import { providerTools } from './delegation';
export async function providerTurn(
  request: AgentRequest,
  options: AgentOptions,
  signal: AbortSignal,
  seen: Set<string>,
  messages: ProviderMessage[],
  step: number,
) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const upstream = new AbortController();
    const upstreamSignal = AbortSignal.any([signal, upstream.signal]);
    const calls: ToolCall[] = [];
    let finish: Extract<ProviderTurnEvent, { type: 'finish' }> | undefined;
    let published = false;
    try {
      const iterator = (options.turn ?? streamToolTurn)({
        kind: options.kind,
        modelId: options.modelId,
        credential: options.credential,
        ...(options.baseURL ? { baseURL: options.baseURL } : {}),
        messages,
        tools: providerTools(request, options),
        signal: upstreamSignal,
      })[Symbol.asyncIterator]();
      try {
        while (true) {
          const item = await abortable(iterator.next(), signal);
          if (item.done) break;
          const event = item.value;
          if (event.type === 'text') {
            published = true;
            await options.emit({
              type: 'text',
              sessionId: request.id,
              text: event.text,
            });
          }
          if (event.type === 'call') {
            published = true;
            if (calls.length >= 16 || seen.has(event.id))
              throw new AgentFailure(
                'LOOP_LIMIT',
                'The provider repeated a call or exceeded the per-step tool limit.',
              );
            seen.add(event.id);
            calls.push(event);
            await options.emit({
              type: 'tool',
              sessionId: request.id,
              callId: event.id,
              name: event.name,
              status: 'pending',
            });
          }
          if (event.type === 'finish') finish = event;
        }
      } finally {
        upstream.abort();
        await iterator.return?.();
      }
      if (!finish)
        throw new AgentFailure(
          'NETWORK',
          'The model turn ended without a completion event.',
        );
      return {
        calls,
        messages: finish.messages,
        reason: finish.reason,
        tokens: reportedTokens(finish.usage),
      };
    } catch (error) {
      const detail = providerError(error);
      if (
        attempt === 0 &&
        !published &&
        !signal.aborted &&
        ['NETWORK', 'RATE_LIMIT'].includes(detail.code)
      ) {
        await options.emit({
          sessionId: request.id,
          type: 'status',
          status: 'running',
          step,
          message: 'The provider was interrupted before output. Retrying once.',
        });
        await delay(200, undefined, { signal });
        continue;
      }
      throw error;
    }
  }
  throw new AgentFailure('NETWORK', 'The provider did not return a turn.');
}
