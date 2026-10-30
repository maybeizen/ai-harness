import { it, expect } from 'vitest';
import {
  MAX_MESSAGE_BYTES,
  type ChatEvent,
  type GenerationInput,
} from '@harness/contracts';
import { RuntimeServer } from './server';
import { openDatabase } from '../storage/database';
import { Repository } from '../storage/repository';
const baseInput: GenerationInput = {
  generationId: 'g',
  conversationId: 'c',
  connectionId: 'openai',
  modelId: 'fixture',
  messages: [{ id: 'u', role: 'user', text: 'hello' }],
};
for (const failure of ['storage', 'publication', 'size'] as const) {
  it(`aborts upstream before awaited iterator cleanup after ${failure} failure`, async () => {
    const db = openDatabase(':memory:');
    const repository = new Repository(db);
    let upstreamController: AbortController | undefined;
    let cleanedUp = false;
    let additionalWork = false;
    let firstPublication = true;
    const events: ChatEvent[] = [];
    let terminal!: () => void;
    const terminalEvent = new Promise<void>((resolve) => {
      terminal = resolve;
    });
    const input =
      failure === 'size'
        ? {
            ...baseInput,
            messages: [
              {
                id: 'u',
                role: 'user' as const,
                text: 'x'.repeat(MAX_MESSAGE_BYTES - 32768 - 1000),
              },
            ],
          }
        : baseInput;
    const server = new RuntimeServer(
      {
        models: () =>
          Promise.resolve([
            {
              id: 'fixture',
              name: 'Fixture',
              available: true,
              verified: false,
            },
          ]),
        stream: async function* (_input, _auth, controller) {
          upstreamController = controller;
          try {
            if (failure === 'storage') db.pragma('query_only = ON');
            yield failure === 'size' ? 'x'.repeat(8192) : 'unpublished';
            additionalWork = true;
            yield 'must never be reached';
          } finally {
            await new Promise<void>((resolve) => {
              if (controller.signal.aborted) resolve();
              else
                controller.signal.addEventListener('abort', () => resolve(), {
                  once: true,
                });
            });
            cleanedUp = true;
          }
        },
      },
      (value) => {
        const frame = value as { event?: ChatEvent };
        if (frame.event) {
          if (
            failure === 'publication' &&
            frame.event.type === 'text' &&
            firstPublication
          ) {
            firstPublication = false;
            return Promise.reject(
              new Error('fixture transport rejected publication'),
            );
          }
          events.push(frame.event);
          if (frame.event.type !== 'text') terminal();
        }
        return Promise.resolve();
      },
      repository,
    );
    const request = (id: string, method: string, params: unknown) =>
      server.handle(JSON.stringify({ version: 2, id, method, params }));
    try {
      await request('models', 'models', { connectionId: 'openai' });
      await request('start', 'generate', { input });
      await terminalEvent;
      await server.close();
      expect(upstreamController?.signal.aborted).toBe(true);
      expect(cleanedUp).toBe(true);
      expect(additionalWork).toBe(false);
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        type: 'error',
        error: {
          code:
            failure === 'storage'
              ? 'STORAGE_ERROR'
              : failure === 'size'
                ? 'CONTEXT_LIMIT'
                : 'NETWORK',
        },
      });
      if (failure !== 'storage')
        expect(repository.get('c')?.messages[1]?.status).toBe('error');
    } finally {
      upstreamController?.abort();
      await server.close();
      db.close();
    }
  }, 2000);
}
