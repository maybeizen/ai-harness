import { streamText } from 'ai';
import { z } from 'zod';
import type { ConnectionKind, TextMessage } from '@harness/contracts';
import { createModel } from './index';
import { readSse } from './sse';
import { httpFailure, ProviderFailure } from './errors';
const eventSchema = z
  .object({
    type: z.string(),
    delta: z.string().optional(),
    response: z
      .object({
        error: z
          .object({ code: z.string().nullable().optional() })
          .nullable()
          .optional(),
      })
      .optional(),
  })
  .passthrough();
async function* chatgpt(
  modelId: string,
  messages: TextMessage[],
  credential: string,
  signal: AbortSignal,
  fetcher: typeof fetch,
) {
  const response = await fetcher('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${credential}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: modelId,
      input: messages.map((m) => ({ role: m.role, content: m.text })),
      stream: true,
      store: false,
    }),
    signal,
  });
  if (!response.ok) throw httpFailure(response.status);
  if (!response.body) throw new Error('Missing stream');
  let completed = false;
  for await (const raw of readSse(response.body, signal)) {
    const event = eventSchema.parse(raw);
    if (event.type === 'response.output_text.delta' && event.delta)
      yield event.delta;
    if (event.type === 'response.completed') {
      completed = true;
      break;
    }
    if (
      ['response.failed', 'response.incomplete', 'error'].includes(event.type)
    )
      throw new ProviderFailure({
        code: event.response?.error?.code?.startsWith('subscription_sharing')
          ? 'QUOTA'
          : 'NETWORK',
        message:
          'ChatGPT could not complete this reply. Check your plan usage or reconnect your account.',
      });
  }
  if (!completed) throw new Error('Stream ended without completion');
}
export async function* streamChat(
  kind: Exclude<ConnectionKind, 'claude-client'>,
  modelId: string,
  messages: TextMessage[],
  credential: string,
  signal: AbortSignal,
  fetcher: typeof fetch = fetch,
): AsyncGenerator<string> {
  if (kind === 'chatgpt') {
    yield* chatgpt(modelId, messages, credential, signal, fetcher);
    return;
  }
  const model = await createModel(
    { id: kind, kind, credentialRef: 'native' },
    {
      providerId: kind,
      modelId,
      capabilities: {
        tools: 'unsupported',
        images: 'unsupported',
        structuredOutput: 'unknown',
      },
    },
    {
      credentials: { resolve: () => Promise.resolve(credential) },
      fetch: fetcher,
    },
  );
  const result = streamText({
    model,
    messages: messages.map((m) => ({ role: m.role, content: m.text })),
    abortSignal: signal,
    maxRetries: 0,
    ...(kind === 'openai'
      ? { providerOptions: { openai: { store: false } } }
      : {}),
  });
  let finished = false;
  for await (const event of result.fullStream) {
    if (event.type === 'text-delta') yield event.text;
    if (event.type === 'error') throw event.error;
    if (event.type === 'finish') {
      if (event.finishReason === 'error') throw new Error('Provider failed');
      finished = true;
    }
  }
  if (!finished && !signal.aborted) throw new Error('Stream interrupted');
}
