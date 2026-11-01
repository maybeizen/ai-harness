import { it, expect } from 'vitest';
import Database from 'better-sqlite3';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { historyPageRequestSchema, type HistoryPage } from '@harness/contracts';
import { openDatabase } from './database';
import { Repository } from './repository';
it('pages more than a thousand summaries without omitting tied timestamps or pinned records', () => {
  const db = openDatabase(':memory:');
  try {
    const insert = db.prepare(
      'INSERT INTO conversations(id,updated_at,pinned,title,data) VALUES(?,?,?,?,?)',
    );
    db.transaction(() => {
      for (let i = 0; i < 1207; i++)
        insert.run(
          `id-${String(i).padStart(4, '0')}`,
          Math.floor(i / 4),
          Number(i % 7 === 0),
          `Conversation ${i}`,
          '{not loaded',
        );
    })();
    const repository = new Repository(db);
    const seen: string[] = [];
    let cursor: HistoryPage['nextCursor'] = null;
    do {
      const page = repository.dispatch(
        historyPageRequestSchema.parse({
          action: 'history.page',
          limit: 37,
          cursor,
        }),
      ) as HistoryPage;
      seen.push(...page.items.map((item) => item.id));
      cursor = page.nextCursor;
    } while (cursor);
    expect(seen).toHaveLength(1207);
    expect(new Set(seen).size).toBe(1207);
    const expected = (
      db
        .prepare(
          'SELECT id FROM conversations ORDER BY pinned DESC, updated_at DESC, id ASC',
        )
        .all() as { id: string }[]
    ).map((row) => row.id);
    expect(seen).toEqual(expected);
    const found = repository.dispatch(
      historyPageRequestSchema.parse({
        action: 'history.page',
        query: 'Conversation 0',
      }),
    ) as HistoryPage;
    expect(found.items.map((item) => item.id)).toEqual(['id-0000']);
    expect(() => repository.get('id-0000')).toThrow('Local data');
  } finally {
    db.close();
  }
});
it('finds a conversation by message body and still matches the title', () => {
  const db = openDatabase(':memory:');
  try {
    const repository = new Repository(db);
    repository.begin({
      generationId: 'g',
      conversationId: 'body-hit',
      connectionId: 'openai',
      modelId: 'm',
      messages: [{ id: 'u', role: 'user', text: 'unique needle phrase' }],
    });
    repository.dispatch({
      action: 'update',
      id: 'body-hit',
      title: 'Unrelated title',
      pinned: false,
    });
    const page = repository.dispatch(
      historyPageRequestSchema.parse({
        action: 'history.page',
        query: 'needle',
      }),
    ) as HistoryPage;
    expect(page.items.map((item) => item.id)).toEqual(['body-hit']);
  } finally {
    db.close();
  }
});
it('escapes SQL wildcard characters in literal title search', () => {
  const db = openDatabase(':memory:');
  try {
    const insert = db.prepare(
      'INSERT INTO conversations(id,updated_at,pinned,title,data) VALUES(?,?,?,?,?)',
    );
    insert.run('literal', 1, 0, '100%_safe\\file', '{}');
    insert.run('other', 1, 0, '100XXsafe/file', '{}');
    const repository = new Repository(db);
    const page = repository.dispatch(
      historyPageRequestSchema.parse({
        action: 'history.page',
        query: '%_safe\\',
      }),
    ) as HistoryPage;
    expect(page.items.map((item) => item.id)).toEqual(['literal']);
  } finally {
    db.close();
  }
});
it('migrates title metadata from a prior database while preserving corrupt bodies', () => {
  const directory = mkdtempSync(join(tmpdir(), 'axiom-history-'));
  const path = join(directory, 'database.sqlite');
  const old = new Database(path);
  old.exec(
    'CREATE TABLE schema_migrations(version INTEGER PRIMARY KEY); INSERT INTO schema_migrations VALUES(1); CREATE TABLE conversations(id TEXT PRIMARY KEY,updated_at INTEGER NOT NULL,pinned INTEGER NOT NULL,data TEXT NOT NULL); CREATE TABLE settings(id INTEGER PRIMARY KEY,data TEXT NOT NULL)',
  );
  const insert = old.prepare('INSERT INTO conversations VALUES(?,?,?,?)');
  insert.run('old', 3, 0, JSON.stringify({ title: 'Migrated title' }));
  insert.run('broken', 2, 0, '{broken');
  old.close();
  const migrated = openDatabase(path);
  try {
    const repository = new Repository(migrated);
    const page = repository.dispatch(
      historyPageRequestSchema.parse({ action: 'history.page' }),
    ) as HistoryPage;
    expect(page.items.map((item) => item.title)).toEqual([
      'Migrated title',
      'Unreadable conversation',
    ]);
    expect(
      migrated
        .prepare('SELECT data FROM conversations WHERE id=?')
        .get('broken'),
    ).toEqual({ data: '{broken' });
  } finally {
    migrated.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
it('keeps unsent drafts across database reopen and deletes them with their conversation', () => {
  const directory = mkdtempSync(join(tmpdir(), 'axiom-draft-'));
  const path = join(directory, 'database.sqlite');
  let db = openDatabase(path);
  try {
    new Repository(db).dispatch({
      action: 'draft.set',
      id: 'unsent',
      text: 'A draft 👋',
    });
    db.close();
    db = openDatabase(path);
    const repository = new Repository(db);
    expect(repository.dispatch({ action: 'draft.get', id: 'unsent' })).toBe(
      'A draft 👋',
    );
    repository.dispatch({ action: 'delete', id: 'unsent' });
    expect(repository.dispatch({ action: 'draft.get', id: 'unsent' })).toBe('');
  } finally {
    db.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
