import { it, expect } from 'vitest';
import type { GenerationInput } from '@harness/contracts';
import { RuntimeServer } from './server';
import { Repository } from '../storage/repository';
import { openDatabase } from '../storage/database';
const input: GenerationInput = {
  generationId: 'pending-auth',
  conversationId: 'c',
  connectionId: 'openai',
  modelId: 'fixture',
  messages: [{ id: 'u', role: 'user', text: 'Hello' }],
};
it('remembers cancellation before a delayed generate, never persisting or invoking its provider', async () => {
  const db = openDatabase(':memory:');
  const repository = new Repository(db);
  let providerStarts = 0;
  const output: Array<{ id: string; ok: boolean; error?: { code: string } }> =
    [];
  const server = new RuntimeServer(
    {
      models: () =>
        Promise.resolve([
          { id: 'fixture', name: 'Fixture', available: true, verified: false },
        ]),
      stream: async function* () {
        providerStarts++;
        await Promise.resolve();
        yield 'unexpected';
      },
    },
    (frame) => {
      output.push(frame as (typeof output)[number]);
      return Promise.resolve();
    },
    repository,
  );
  const request = (id: string, method: string, params: unknown) =>
    server.handle(JSON.stringify({ version: 2, id, method, params }));
  let releaseAuth!: () => void;
  const authentication = new Promise<void>((resolve) => {
    releaseAuth = resolve;
  });
  const delayedStart = authentication.then(() =>
    request('start', 'generate', { input }),
  );
  try {
    await request('models', 'models', { connectionId: 'openai' });
    await request('cancel', 'cancel', { generationId: input.generationId });
    expect(output.find((frame) => frame.id === 'cancel')?.ok).toBe(true);
    releaseAuth();
    await delayedStart;
    expect(output.find((frame) => frame.id === 'start')).toMatchObject({
      ok: false,
      error: { code: 'CANCELLED' },
    });
    expect(providerStarts).toBe(0);
    expect(repository.get('c')).toBeNull();
    // Replays do not consume the cancellation tombstone.
    await request('replay', 'generate', { input });
    expect(output.find((frame) => frame.id === 'replay')?.error?.code).toBe(
      'CANCELLED',
    );
  } finally {
    await server.close();
    db.close();
  }
});
it('never evicts an acknowledged cancellation when the bounded registry fills', async () => {
  const output: Array<{ id: string; ok: boolean; error?: { code: string } }> =
    [];
  const server = new RuntimeServer(
    {
      models: () => Promise.resolve([]),
      stream: async function* () {
        await Promise.resolve();
        yield '';
      },
    },
    (frame) => {
      output.push(frame as (typeof output)[number]);
      return Promise.resolve();
    },
  );
  const request = (id: string, method: string, params: unknown) =>
    server.handle(JSON.stringify({ version: 2, id, method, params }));
  try {
    for (let index = 0; index < 1024; index++)
      await request(`cancel${index}`, 'cancel', { generationId: `g${index}` });
    await request('overflow', 'cancel', { generationId: 'overflow' });
    expect(output.find((frame) => frame.id === 'overflow')).toMatchObject({
      ok: false,
      error: { code: 'BUSY' },
    });
    await request('late', 'generate', {
      input: { ...input, generationId: 'g0' },
    });
    expect(output.find((frame) => frame.id === 'late')?.error?.code).toBe(
      'CANCELLED',
    );
    await request('oversized', 'cancel', { generationId: 'x'.repeat(129) });
    expect(output.find((frame) => frame.id === 'oversized')?.error?.code).toBe(
      'INVALID_REQUEST',
    );
  } finally {
    await server.close();
  }
});
