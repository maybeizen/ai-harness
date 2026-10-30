import { it, expect } from 'vitest';
import Database from 'better-sqlite3';
import { migrate } from './database';
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
