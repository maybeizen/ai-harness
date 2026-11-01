import { it, expect } from 'vitest';
import type { ChatEvent, GenerationInput } from '@harness/contracts';
import { RuntimeServer } from './server';
import { openDatabase } from '../storage/database';
import { Repository } from '../storage/repository';
const input: GenerationInput = {
  generationId: 'g',
  conversationId: 'c',
  connectionId: 'openai',
  modelId: 'fixture',
  messages: [{ id: 'u', role: 'user', text: 'Hello' }],
};
const models = () =>
  Promise.resolve([
    { id: 'fixture', name: 'Fixture', available: true, verified: false },
  ]);
it('commits before acknowledgments and stream events, rejects mutation during execution', async () => {
  const db = openDatabase(':memory:');
  const repository = new Repository(db);
  const output: Array<{
    id?: string;
    ok?: boolean;
    event?: ChatEvent;
    error?: { code: string };
  }> = [];
  const server = new RuntimeServer(
    {
      models,
      stream: async function* (_input, _auth, controller) {
        yield 'partial';
        await new Promise<void>((resolve) => {
          if (controller.signal.aborted) resolve();
          else
            controller.signal.addEventListener('abort', () => resolve(), {
              once: true,
            });
        });
      },
    },
    async (value) => {
      const frame = value as (typeof output)[number];
      output.push(frame);
      const saved = repository.get('c');
      if (frame.id === 'generate')
        expect(saved?.messages[1]?.status).toBe('streaming');
      if (frame.event?.type === 'text')
        expect(saved?.messages[1]?.text).toBe(frame.event.text);
      if (frame.event?.type === 'done')
        expect(saved?.messages[1]?.status).toBe('stopped');
      await Promise.resolve();
    },
    repository,
  );
  const request = (id: string, method: string, params: unknown) =>
    server.handle(JSON.stringify({ version: 2, id, method, params }));
  try {
    await request('models', 'models', { connectionId: 'openai' });
    await request('generate', 'generate', { input });
    await request('delete', 'storage', { action: 'delete', id: 'c' });
    await request('update', 'storage', {
      action: 'update',
      id: 'c',
      title: 'Changed',
      pinned: false,
    });
    expect(output.find((frame) => frame.id === 'delete')?.error?.code).toBe(
      'BUSY',
    );
    expect(output.find((frame) => frame.id === 'update')?.error?.code).toBe(
      'BUSY',
    );
    await request('cancel', 'cancel', { generationId: 'g' });
    expect(output.find((frame) => frame.id === 'cancel')?.ok).toBe(true);
    expect(repository.get('c')?.messages[1]).toMatchObject({
      status: 'stopped',
      text: 'partial',
    });
  } finally {
    await server.close();
    db.close();
  }
});
it('surfaces disk write failures before emitting unsaved text', async () => {
  const db = openDatabase(':memory:');
  const repository = new Repository(db);
  const output: Array<{
    id?: string;
    event?: ChatEvent;
    error?: { code: string };
  }> = [];
  const server = new RuntimeServer(
    {
      models,
      stream: async function* () {
        await Promise.resolve();
        db.pragma('query_only = ON');
        yield 'must not reach the user';
      },
    },
    (value) => {
      output.push(value as (typeof output)[number]);
      return Promise.resolve();
    },
    repository,
  );
  const request = (id: string, method: string, params: unknown) =>
    server.handle(JSON.stringify({ version: 2, id, method, params }));
  try {
    await request('models', 'models', { connectionId: 'openai' });
    await request('generate', 'generate', { input });
    await server.close();
    expect(output.filter((frame) => frame.event?.type === 'text')).toEqual([]);
    expect(
      output.find((frame) => frame.event?.type === 'error')?.event,
    ).toMatchObject({ error: { code: 'STORAGE_ERROR' } });
    expect(repository.get('c')?.messages[1]?.text).toBe('');
    await request('blocked', 'storage', {
      action: 'settings.set',
      settings: {},
    });
    // Runtime has closed: no additional mutation can be accepted.
    expect(output.find((frame) => frame.id === 'blocked')?.error).toBeDefined();
  } finally {
    db.close();
  }
});
