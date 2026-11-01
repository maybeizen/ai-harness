import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { it, expect } from 'vitest';
import Database from 'better-sqlite3';
import { migrate, migrations } from './database';
it('rolls back failed migrations and closes the connection', () => {
  const db = new Database(':memory:');
  try {
    expect(() =>
      migrate(db, [
        { version: 1, sql: 'CREATE TABLE example(id INTEGER)' },
        { version: 2, sql: 'invalid sql' },
      ]),
    ).toThrow();
    expect(db.prepare('SELECT * FROM schema_migrations').all()).toEqual([]);
    expect(
      db.prepare("SELECT name FROM sqlite_master WHERE name='example'").get(),
    ).toBeUndefined();
    migrate(db, [{ version: 1, sql: 'CREATE TABLE example(id INTEGER)' }]);
    migrate(db, [{ version: 1, sql: 'CREATE TABLE example(id INTEGER)' }]);
    expect(
      db.prepare('SELECT count(*) AS count FROM schema_migrations').get(),
    ).toEqual({ count: 1 });
  } finally {
    db.close();
  }
  expect(db.open).toBe(false);
});
it('migrates an existing database file and rolls back a failed migration', () => {
  const directory = mkdtempSync(join(tmpdir(), 'harness-migrate-'));
  const path = join(directory, 'data.sqlite');
  const db = new Database(path);
  const legacy = {
    id: 'old',
    title: 'Legacy',
    pinned: false,
    updatedAt: 10,
    messages: [
      { id: 'm', role: 'user', text: 'hello body', status: 'completed' },
    ],
  };
  try {
    migrate(
      db,
      migrations.filter((migration) => migration.version < 9),
    );
    db.prepare(
      'INSERT INTO conversations(id, updated_at, pinned, title, data) VALUES(?,?,?,?,?)',
    ).run('old', 10, 0, 'Legacy', JSON.stringify(legacy));
    expect(() =>
      migrate(db, [
        ...migrations.filter((migration) => migration.version < 9),
        {
          version: 9,
          sql: 'CREATE TABLE migration_probe(id INTEGER); NOT VALID',
        },
      ]),
    ).toThrow();
    expect(
      db
        .prepare('SELECT version FROM schema_migrations ORDER BY version')
        .all(),
    ).toEqual([1, 2, 3, 4, 5, 6, 7, 8].map((version) => ({ version })));
    expect(
      db
        .prepare("SELECT name FROM sqlite_master WHERE name='migration_probe'")
        .get(),
    ).toBeUndefined();
    expect(
      db
        .prepare("SELECT name FROM sqlite_master WHERE name='attachments'")
        .get(),
    ).toBeUndefined();
    expect(
      db.prepare('SELECT data FROM conversations WHERE id=?').get('old'),
    ).toEqual({
      data: JSON.stringify(legacy),
    });
    migrate(db, migrations);
    const columns = db.prepare('PRAGMA table_info(conversations)').all() as {
      name: string;
    }[];
    expect(columns.map((column) => column.name)).toEqual(
      expect.arrayContaining(['provider', 'model', 'mode']),
    );
    expect(
      db
        .prepare(
          "SELECT body FROM message_bodies WHERE message_bodies MATCH 'hello'",
        )
        .all(),
    ).toEqual([{ body: 'hello body' }]);
    const hash = 'a'.repeat(64);
    db.prepare(
      'INSERT INTO attachments(id, name, media_type, size, created_at) VALUES(?,?,?,?,?)',
    ).run(hash, 'notes.md', 'text/markdown', 12, 10);
    expect(() =>
      db
        .prepare(
          'INSERT INTO attachments(id, name, media_type, size, created_at) VALUES(?,?,?,?,?)',
        )
        .run('ab', 'notes.md', 'text/markdown', 12, 10),
    ).toThrow();
    expect(() =>
      db
        .prepare(
          'INSERT INTO attachments(id, name, media_type, size, created_at) VALUES(?,?,?,?,?)',
        )
        .run(hash, '../notes.md', 'text/markdown', 12, 10),
    ).toThrow();
    expect(
      db.prepare('SELECT data FROM conversations WHERE id=?').get('old'),
    ).toEqual({
      data: JSON.stringify(legacy),
    });
  } finally {
    db.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
