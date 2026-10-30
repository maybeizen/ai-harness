import Database from 'better-sqlite3';
import { chmodSync } from 'node:fs';
export interface Migration {
  version: number;
  sql: string;
}
export function migrate(
  db: Database.Database,
  migrations: readonly Migration[],
) {
  db.exec(
    'CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY)',
  );
  const apply = db.transaction(() => {
    for (const migration of migrations) {
      if (
        db
          .prepare('SELECT version FROM schema_migrations WHERE version = ?')
          .get(migration.version)
      )
        continue;
      db.exec(migration.sql);
      db.prepare('INSERT INTO schema_migrations(version) VALUES (?)').run(
        migration.version,
      );
    }
  });
  apply();
}
export function openDatabase(path: string) {
  const db = new Database(path);
  try {
    if (path !== ':memory:') chmodSync(path, 0o600);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    db.pragma('synchronous = FULL');
    migrate(db, [
      {
        version: 1,
        sql: `
      CREATE TABLE conversations(id TEXT PRIMARY KEY, updated_at INTEGER NOT NULL, pinned INTEGER NOT NULL, data TEXT NOT NULL);
      CREATE INDEX conversation_recency ON conversations(pinned DESC, updated_at DESC);
      CREATE TABLE settings(id INTEGER PRIMARY KEY CHECK(id=1), data TEXT NOT NULL);
    `,
      },
    ]);
    return db;
  } catch (error) {
    db.close();
    throw error;
  }
}
