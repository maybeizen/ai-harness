import { it, expect } from 'vitest';
import { mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { settingsSchema, type GenerationInput } from '@harness/contracts';
import { openDatabase } from './database';
import { Repository } from './repository';
const input: GenerationInput = {
  generationId: 'g',
  conversationId: 'c',
  connectionId: 'openai',
  modelId: 'fixture',
  messages: [{ id: 'u', role: 'user', text: 'Unicode 🌈 hello' }],
};
it('durably restores messages, metadata, settings, and interrupted streams across reopen', () => {
  const directory = mkdtempSync(join(tmpdir(), 'harness-storage-'));
  const path = join(directory, 'data.sqlite');
  let db = openDatabase(path);
  try {
    expect(db.pragma('synchronous', { simple: true })).toBe(2);
    expect(statSync(path).mode & 0o777).toBe(0o600);
    const first = new Repository(db);
    first.begin(input);
    first.progress(input, 'A partial answer', 'streaming');
    first.dispatch({
      action: 'update',
      id: 'c',
      title: 'Renamed',
      pinned: true,
    });
    const settings = settingsSchema.parse({
      theme: 'light',
      selectedProvider: 'openai',
      selectedModel: 'fixture',
      activeConversation: 'c',
    });
    first.dispatch({ action: 'settings.set', settings });
    db.close();
    db = openDatabase(path);
    const restored = new Repository(db);
    expect(restored.get('c')).toMatchObject({
      title: 'Renamed',
      pinned: true,
      messages: [
        { ...input.messages[0], status: 'completed' },
        {
          id: 'g',
          text: 'A partial answer',
          status: 'stopped',
          connectionId: 'openai',
          modelName: 'fixture',
        },
      ],
    });
    expect(restored.dispatch({ action: 'settings.get' })).toEqual(settings);
    restored.begin({
      ...input,
      generationId: 'g2',
      messages: [
        ...input.messages,
        { id: 'u2', role: 'user', text: 'Continue' },
      ],
    });
    restored.progress({ ...input, generationId: 'g2' }, 'Done', 'completed');
    expect(restored.get('c')?.messages).toHaveLength(4);
    expect(restored.get('c')?.messages[1]?.status).toBe('stopped');
    restored.dispatch({ action: 'delete', id: 'c' });
    expect(restored.get('c')).toBeNull();
    expect(restored.dispatch({ action: 'settings.get' })).toMatchObject({
      activeConversation: null,
    });
  } finally {
    db.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
it('rolls back oversized generation and duplicate ids without changing saved history', () => {
  const db = openDatabase(':memory:');
  try {
    const repository = new Repository(db);
    repository.begin(input);
    const before = repository.get('c');
    expect(() => repository.begin(input)).toThrow('already exists');
    expect(repository.get('c')).toEqual(before);
    expect(() =>
      repository.begin({
        ...input,
        generationId: 'g2',
        messages: [{ id: 'u', role: 'user', text: 'changed' }],
      }),
    ).toThrow('conflicts');
    expect(repository.get('c')).toEqual(before);

    expect(() =>
      repository.begin({
        ...input,
        generationId: 'huge',
        messages: [
          { id: 'huge-user', role: 'user', text: 'x'.repeat(1048576) },
        ],
      }),
    ).toThrow('storage limit');
    expect(repository.get('c')).toEqual(before);
    repository.progress(input, 'preserved', 'stopped');
    expect(() =>
      repository.progress(input, 'x'.repeat(1048576), 'streaming'),
    ).toThrow();
    expect(repository.get('c')?.messages[1]).toMatchObject({
      text: 'preserved',
      status: 'stopped',
    });
  } finally {
    db.close();
  }
});
it('returns bounded pinned/recent summaries and meaningful storage failures', () => {
  const db = openDatabase(':memory:');
  const repository = new Repository(db);
  try {
    for (let index = 0; index < 205; index++)
      repository.begin({ ...input, conversationId: `c${index}` });
    repository.dispatch({
      action: 'update',
      id: 'c0',
      title: 'Pinned',
      pinned: true,
    });
    const summaries = repository.dispatch({ action: 'list' }) as unknown[];
    expect(summaries).toHaveLength(200);
    expect(summaries[0]).toMatchObject({
      id: 'c0',
      title: 'Pinned',
      pinned: true,
    });
    expect(summaries[0]).not.toHaveProperty('messages');
    expect(repository.dispatch({ action: 'settings.get' })).toEqual(
      settingsSchema.parse({}),
    );
    db.prepare('INSERT INTO settings(id,data) VALUES(1,?)').run('{broken');
    expect(() => repository.dispatch({ action: 'settings.get' })).toThrow(
      'Local data',
    );
    db.pragma('query_only = ON');
    expect(() =>
      repository.begin({ ...input, conversationId: 'fail' }),
    ).toThrow('Local data');
    expect(repository.get('fail')).toBeNull();
  } finally {
    db.close();
  }
  expect(() => repository.get('c0')).toThrow('Local data');
});

it('preserves corrupt rows without preventing startup or healthy conversation loading', () => {
  const db = openDatabase(':memory:');
  try {
    const first = new Repository(db);
    first.begin(input);
    db.prepare(
      'INSERT INTO conversations(id, updated_at, pinned, data) VALUES(?,?,?,?)',
    ).run('broken', Date.now(), 1, '{broken "streaming"');
    const restored = new Repository(db);
    expect(restored.get('c')?.messages[1]?.status).toBe('stopped');
    expect(() => restored.get('broken')).toThrow('Local data');
    expect(restored.dispatch({ action: 'list' })).toContainEqual(
      expect.objectContaining({
        id: 'broken',
        title: 'Unreadable conversation',
      }),
    );
    expect(
      db.prepare('SELECT data FROM conversations WHERE id=?').get('broken'),
    ).toEqual({ data: '{broken "streaming"' });
  } finally {
    db.close();
  }
});
it('deletes conversations independently of malformed settings while preserving those settings', () => {
  const db = openDatabase(':memory:');
  try {
    const repository = new Repository(db);
    repository.begin(input);
    db.prepare('INSERT INTO settings(id,data) VALUES(1,?)').run('{broken');
    repository.dispatch({ action: 'delete', id: 'c' });
    expect(repository.get('c')).toBeNull();
    expect(db.prepare('SELECT data FROM settings WHERE id=1').get()).toEqual({
      data: '{broken',
    });
  } finally {
    db.close();
  }
});
