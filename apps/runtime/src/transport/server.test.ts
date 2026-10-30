import { it, expect } from 'vitest';
import type { ChatEvent } from '@harness/contracts';
import { RuntimeServer } from './server';
const input = {
  generationId: 'g',
  conversationId: 'c',
  connectionId: 'openai' as const,
  modelId: 'fixture',
  messages: [{ id: 'u', role: 'user' as const, text: 'Hello' }],
};
it('keeps health and cancellation available while generation is streaming', async () => {
  const output: Array<{ id?: string; ok?: boolean; event?: ChatEvent }> = [];
  const server = new RuntimeServer(
    {
      models: () =>
        Promise.resolve([
          { id: 'fixture', name: 'Fixture', available: true, verified: false },
        ]),
      stream: async function* (_input, _auth, controller) {
        yield 'first';
        await new Promise<void>((resolve) =>
          controller.signal.addEventListener('abort', () => resolve(), {
            once: true,
          }),
        );
      },
    },
    (value) => {
      output.push(value as (typeof output)[number]);
      return Promise.resolve();
    },
  );
  const request = (id: string, method: string, params?: unknown) =>
    server.handle(
      JSON.stringify({ version: 2, id, method, ...(params ? { params } : {}) }),
    );
  await request('models', 'models', {
    connectionId: 'openai',
    credential: 'fixture',
  });
  await request('start', 'generate', { input, credential: 'fixture' });
  await request('health', 'health');
  expect(output.find((message) => message.id === 'health')).toMatchObject({
    ok: true,
  });
  await request('duplicate', 'generate', {
    input: { ...input, generationId: 'duplicate' },
    credential: 'fixture',
  });
  expect(output.find((message) => message.id === 'duplicate')).toMatchObject({
    ok: false,
  });
  await request('stop', 'cancel', { generationId: 'g' });
  const events = output.flatMap((message) =>
    message.event ? [message.event] : [],
  );
  expect(events).toEqual([
    {
      generationId: 'g',
      conversationId: 'c',
      sequence: 0,
      type: 'text',
      text: 'first',
    },
    {
      generationId: 'g',
      conversationId: 'c',
      sequence: 1,
      type: 'done',
      status: 'cancelled',
    },
  ]);
  await server.close();
});
