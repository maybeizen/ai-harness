import { it, expect, vi } from 'vitest';
import { z } from 'zod';
import {
  streamToolTurn,
  type ProviderTurnInput,
  type ProviderTurnEvent,
} from './tools';
const input = (): ProviderTurnInput => ({
  kind: 'openai',
  modelId: 'fixture',
  credential: 'fixture-key',
  messages: [{ role: 'user', content: 'Read the file' }],
  tools: [
    {
      name: 'read_file',
      description: 'Read a workspace file',
      inputSchema: z.object({ path: z.string() }).strict(),
    },
  ],
  signal: new AbortController().signal,
});
const requestURL = (value: RequestInfo | URL | undefined) =>
  typeof value === 'string'
    ? value
    : value instanceof URL
      ? value.href
      : (value?.url ?? '');
const sse = (events: unknown[]) =>
  new Response(
    events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join(''),
    { headers: { 'content-type': 'text/event-stream' } },
  );
const call = (name = 'read_file', args = '{"path":"a.ts"}') => ({
  type: 'function_call',
  id: 'item-1',
  call_id: 'call-1',
  name,
  arguments: args,
});
function openaiEvents(name?: string, args?: string) {
  const item = call(name, args);
  return [
    {
      type: 'response.created',
      response: { id: 'response-1', created_at: 1, model: 'fixture' },
    },
    {
      type: 'response.output_item.added',
      output_index: 0,
      item: { ...item, arguments: '' },
    },
    {
      type: 'response.function_call_arguments.delta',
      item_id: 'item-1',
      output_index: 0,
      delta: item.arguments,
    },
    {
      type: 'response.function_call_arguments.done',
      item_id: 'item-1',
      output_index: 0,
      arguments: item.arguments,
    },
    {
      type: 'response.output_item.done',
      output_index: 0,
      item: { ...item, status: 'completed' },
    },
    {
      type: 'response.completed',
      response: {
        usage: { input_tokens: 5, output_tokens: 3, total_tokens: 8 },
      },
    },
  ];
}
async function collect(value: ProviderTurnInput, fetcher: typeof fetch) {
  const events: ProviderTurnEvent[] = [];
  for await (const event of streamToolTurn(value, fetcher)) events.push(event);
  return events;
}
it('normalizes OpenAI Responses tool calls without executing or continuing them', async () => {
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(sse(openaiEvents()));
  const events = await collect(input(), fetcher);
  expect(events.find((event) => event.type === 'call')).toEqual({
    type: 'call',
    id: 'call-1',
    name: 'read_file',
    input: { path: 'a.ts' },
  });
  const finish = events.find((event) => event.type === 'finish');
  expect(finish).toMatchObject({
    reason: 'tool-calls',
    messages: [
      {
        role: 'assistant',
        content: [
          {
            type: 'tool-call',
            toolCallId: 'call-1',
            toolName: 'read_file',
            input: { path: 'a.ts' },
          },
        ],
      },
    ],
  });
  expect(fetcher).toHaveBeenCalledTimes(1);
  const body: unknown = JSON.parse(fetcher.mock.calls[0]?.[1]?.body as string);
  expect(body).toMatchObject({
    store: false,
    stream: true,
    tools: [{ type: 'function', name: 'read_file' }],
  });
});
it.each([
  ['unknown', '{"path":"a.ts"}'],
  ['read_file', '{"path":42}'],
  ['read_file', '{"path":"a.ts","command":"unsafe"}'],
  ['read_file', '{broken'],
])('rejects unknown/malformed tool calls: %s %s', async (name, args) => {
  const fetcher = vi
    .fn<typeof fetch>()
    .mockResolvedValue(sse(openaiEvents(name, args)));
  await expect(collect(input(), fetcher)).rejects.toMatchObject({
    detail: { code: 'INVALID_TOOL_CALL' },
  });
});
it('normalizes Anthropic tool-use events using the native Messages endpoint', async () => {
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
    sse([
      {
        type: 'message_start',
        message: {
          id: 'msg-1',
          type: 'message',
          role: 'assistant',
          model: 'fixture',
          content: [],
          stop_reason: null,
          stop_sequence: null,
          usage: { input_tokens: 5, output_tokens: 0 },
        },
      },
      {
        type: 'content_block_start',
        index: 0,
        content_block: {
          type: 'tool_use',
          id: 'call-1',
          name: 'read_file',
          input: {},
        },
      },
      {
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'input_json_delta', partial_json: '{"path":"a.ts"}' },
      },
      { type: 'content_block_stop', index: 0 },
      {
        type: 'message_delta',
        delta: { stop_reason: 'tool_use', stop_sequence: null },
        usage: { output_tokens: 3 },
      },
      { type: 'message_stop' },
    ]),
  );
  const events = await collect({ ...input(), kind: 'anthropic' }, fetcher);
  expect(events.find((event) => event.type === 'call')).toMatchObject({
    name: 'read_file',
    input: { path: 'a.ts' },
  });
  expect(events.at(-1)).toMatchObject({ type: 'finish', reason: 'tool-calls' });
  expect(requestURL(fetcher.mock.calls[0]?.[0])).toContain('/messages');
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it('normalizes Google function calls and preserves signature metadata in continuation history', async () => {
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
    sse([
      {
        candidates: [
          {
            index: 0,
            content: {
              role: 'model',
              parts: [
                {
                  functionCall: { name: 'read_file', args: { path: 'a.ts' } },
                  thoughtSignature: 'signature-fixture',
                },
              ],
            },
            finishReason: 'STOP',
          },
        ],
        usageMetadata: {
          promptTokenCount: 5,
          candidatesTokenCount: 3,
          totalTokenCount: 8,
        },
      },
    ]),
  );
  const events = await collect({ ...input(), kind: 'google' }, fetcher);
  expect(events.find((event) => event.type === 'call')).toMatchObject({
    name: 'read_file',
    input: { path: 'a.ts' },
  });
  const finish = events.find((event) => event.type === 'finish');
  expect(JSON.stringify(finish)).toContain('signature-fixture');
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it('normalizes xAI Responses tool calls through its native endpoint', async () => {
  const eventsFixture = openaiEvents().map((event) =>
    'response' in event
      ? {
          ...event,
          response: {
            ...event.response,
            object: 'response',
            output: [],
            status: 'completed',
          },
        }
      : event,
  );
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(sse(eventsFixture));
  const events = await collect({ ...input(), kind: 'xai' }, fetcher);
  expect(events.find((event) => event.type === 'call')).toEqual({
    type: 'call',
    id: 'call-1',
    name: 'read_file',
    input: { path: 'a.ts' },
  });
  expect(events.at(-1)).toMatchObject({ type: 'finish', reason: 'tool-calls' });
  expect(requestURL(fetcher.mock.calls[0]?.[0])).toBe(
    'https://api.x.ai/v1/responses',
  );
});
it('rejects invalid definitions without networking and propagates sanitized provider failures', async () => {
  const fetcher = vi.fn<typeof fetch>();
  const value = input();
  value.tools.push(value.tools[0]!);
  await expect(collect(value, fetcher)).rejects.toMatchObject({
    detail: { code: 'INVALID_REQUEST' },
  });
  expect(fetcher).not.toHaveBeenCalled();
  fetcher.mockResolvedValue(
    new Response('{"error":{"message":"private bearer secret"}}', {
      status: 401,
    }),
  );
  await expect(collect(input(), fetcher)).rejects.toMatchObject({
    detail: { code: 'AUTH_REQUIRED' },
  });
  try {
    await collect(input(), fetcher);
  } catch (error) {
    expect(String(error)).not.toContain('secret');
  }
});
it('forwards cancellation before the first token and performs no retry', async () => {
  let started!: (signal: AbortSignal) => void;
  const ready = new Promise<AbortSignal>((resolve) => {
    started = resolve;
  });
  const fetcher = vi.fn<typeof fetch>().mockImplementation(
    (_url, options) =>
      new Promise((_resolve, reject) => {
        const signal = options?.signal;
        if (!signal) throw new Error('Missing signal');
        started(signal);
        signal.addEventListener(
          'abort',
          () => reject(new DOMException('Cancelled', 'AbortError')),
          {
            once: true,
          },
        );
      }),
  );
  const controller = new AbortController();
  const pending = collect({ ...input(), signal: controller.signal }, fetcher);
  const forwarded = await ready;
  controller.abort();
  await expect(pending).rejects.toBeDefined();
  expect(forwarded.aborted).toBe(true);
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it('preserves caller-owned tool history for the next explicit turn', async () => {
  const first = await collect(
    input(),
    vi.fn<typeof fetch>().mockResolvedValue(sse(openaiEvents())),
  );
  const finish = first.find((event) => event.type === 'finish');
  if (!finish) throw new Error('Missing fixture finish');
  const next = input();
  next.messages.push(...finish.messages, {
    role: 'tool',
    content: [
      {
        type: 'tool-result',
        toolCallId: 'call-1',
        toolName: 'read_file',
        output: { type: 'text', value: 'file content' },
      },
    ],
  });
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
    sse([
      {
        type: 'response.created',
        response: { id: 'response-2', created_at: 1, model: 'fixture' },
      },
      {
        type: 'response.output_item.added',
        output_index: 0,
        item: { type: 'message', id: 'message-1' },
      },
      {
        type: 'response.output_text.delta',
        item_id: 'message-1',
        output_index: 0,
        content_index: 0,
        delta: 'Done',
      },
      {
        type: 'response.output_item.done',
        output_index: 0,
        item: { type: 'message', id: 'message-1' },
      },
      { type: 'response.completed', response: {} },
    ]),
  );
  const events = await collect(next, fetcher);
  expect(events.find((event) => event.type === 'text')).toEqual({
    type: 'text',
    text: 'Done',
  });
  const body = JSON.parse(fetcher.mock.calls[0]?.[1]?.body as string) as {
    input: unknown[];
  };
  expect(body.input).toContainEqual({
    type: 'function_call_output',
    call_id: 'call-1',
    output: 'file content',
  });
});
it('aborts upstream when the caller stops after a tool call', async () => {
  let forwarded: AbortSignal | undefined;
  const fetcher = vi.fn<typeof fetch>().mockImplementation((_url, options) => {
    forwarded = options?.signal ?? undefined;
    return Promise.resolve(
      new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(
              new TextEncoder().encode(
                openaiEvents()
                  .slice(0, -1)
                  .map((event) => `data: ${JSON.stringify(event)}\n\n`)
                  .join(''),
              ),
            );
            forwarded?.addEventListener(
              'abort',
              () => controller.error(forwarded?.reason),
              { once: true },
            );
          },
        }),
        { headers: { 'content-type': 'text/event-stream' } },
      ),
    );
  });
  const iterator = streamToolTurn(input(), fetcher);
  expect((await iterator.next()).value).toMatchObject({ type: 'call' });
  await iterator.return(undefined);
  expect(forwarded?.aborted).toBe(true);
});
it('refuses tool turns when the model does not support tools', async () => {
  const fetcher = vi.fn<typeof fetch>();
  await expect(
    collect(
      {
        ...input(),
        capabilities: {
          tools: 'unsupported',
          images: 'unknown',
          structuredOutput: 'unknown',
          reasoningEffort: 'unknown',
          temperature: 'unknown',
          maxOutputTokens: 'unknown',
          vision: 'unknown',
        },
      },
      fetcher,
    ),
  ).rejects.toMatchObject({ detail: { code: 'UNSUPPORTED_MODEL' } });
  await expect(
    collect({ ...input(), modelId: 'o1-mini' }, fetcher),
  ).rejects.toMatchObject({ detail: { code: 'UNSUPPORTED_MODEL' } });
  await expect(
    collect(
      { ...input(), kind: 'custom', credential: '', modelId: 'local' },
      fetcher,
    ),
  ).rejects.toMatchObject({ detail: { code: 'INVALID_REQUEST' } });
  expect(fetcher).not.toHaveBeenCalled();
});
