import Database from 'better-sqlite3';
import { chmodSync } from 'node:fs';
export interface Migration {
  version: number;
  sql: string;
}
export function migrate(db: Database.Database, pending: readonly Migration[]) {
  db.exec(
    'CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY)',
  );
  const apply = db.transaction(() => {
    for (const migration of pending) {
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
export const migrations: readonly Migration[] = [
  {
    version: 1,
    sql: `
      CREATE TABLE conversations(id TEXT PRIMARY KEY, updated_at INTEGER NOT NULL, pinned INTEGER NOT NULL, data TEXT NOT NULL);
      CREATE INDEX conversation_recency ON conversations(pinned DESC, updated_at DESC);
      CREATE TABLE settings(id INTEGER PRIMARY KEY CHECK(id=1), data TEXT NOT NULL);
    `,
  },
  {
    version: 2,
    sql: `
      ALTER TABLE conversations ADD COLUMN title TEXT NOT NULL DEFAULT 'Unreadable conversation';
      UPDATE conversations SET title = CASE WHEN json_valid(data) THEN
        CASE WHEN json_type(data, '$.title') = 'text' AND length(json_extract(data, '$.title')) BETWEEN 1 AND 200
        THEN json_extract(data, '$.title') ELSE 'Unreadable conversation' END
        ELSE 'Unreadable conversation' END;
      CREATE INDEX conversation_history_page ON conversations(pinned DESC, updated_at DESC, id ASC);
    `,
  },
  {
    version: 3,
    sql: 'CREATE TABLE conversation_drafts(id TEXT PRIMARY KEY, text TEXT NOT NULL)',
  },
  {
    version: 4,
    sql: 'CREATE TABLE workspace_directories(id TEXT PRIMARY KEY,name TEXT NOT NULL,path TEXT NOT NULL UNIQUE)',
  },
  {
    version: 5,
    sql: 'CREATE TABLE projects(id TEXT PRIMARY KEY,name TEXT NOT NULL,directory_id TEXT REFERENCES workspace_directories(id) ON DELETE SET NULL,pinned INTEGER NOT NULL,archived INTEGER NOT NULL,updated_at INTEGER NOT NULL,data TEXT NOT NULL)',
  },
  {
    version: 6,
    sql: `ALTER TABLE conversations ADD COLUMN project_id TEXT REFERENCES projects(id) ON DELETE SET NULL;
        ALTER TABLE conversations ADD COLUMN directory_id TEXT REFERENCES workspace_directories(id) ON DELETE SET NULL;
        ALTER TABLE conversations ADD COLUMN archived INTEGER NOT NULL DEFAULT 0;
        CREATE INDEX conversation_project_page ON conversations(project_id,archived,pinned DESC,updated_at DESC,id ASC);
        CREATE INDEX conversation_directory_page ON conversations(directory_id,archived,pinned DESC,updated_at DESC,id ASC);`,
  },
  {
    version: 7,
    sql: `CREATE TABLE agent_sessions(id TEXT PRIMARY KEY,request TEXT NOT NULL,status TEXT NOT NULL,created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL,event_count INTEGER NOT NULL DEFAULT 0,event_bytes INTEGER NOT NULL DEFAULT 0);
          CREATE TABLE agent_events(session_id TEXT NOT NULL REFERENCES agent_sessions(id) ON DELETE CASCADE,sequence INTEGER NOT NULL,data TEXT NOT NULL,PRIMARY KEY(session_id,sequence));
          CREATE TABLE agent_audit(id INTEGER PRIMARY KEY AUTOINCREMENT,session_id TEXT NOT NULL,call_id TEXT NOT NULL,workspace_id TEXT NOT NULL,tool TEXT NOT NULL,status TEXT NOT NULL,at INTEGER NOT NULL,code TEXT);
          CREATE INDEX agent_sessions_recency ON agent_sessions(updated_at DESC,id);`,
  },
  {
    version: 8,
    sql: 'CREATE TABLE mcp_servers(id TEXT PRIMARY KEY, config TEXT NOT NULL, revision TEXT NOT NULL)',
  },
  {
    version: 9,
    sql: `
      ALTER TABLE conversations ADD COLUMN provider TEXT CHECK(provider IS NULL OR (length(provider) BETWEEN 1 AND 64));
      ALTER TABLE conversations ADD COLUMN model TEXT CHECK(model IS NULL OR length(model) <= 256);
      ALTER TABLE conversations ADD COLUMN mode TEXT CHECK(mode IS NULL OR (length(mode) BETWEEN 1 AND 32));
      CREATE TABLE attachments (
        id TEXT PRIMARY KEY CHECK(length(id) = 64 AND id NOT GLOB '*[^0-9a-f]*'),
        name TEXT NOT NULL CHECK(length(name) BETWEEN 1 AND 255 AND instr(name, '/') = 0 AND instr(name, char(92)) = 0),
        media_type TEXT NOT NULL CHECK(media_type IN ('image/png','image/jpeg','image/webp','image/gif','text/plain','text/markdown','application/pdf')),
        size INTEGER NOT NULL CHECK(size > 0 AND size <= 10485760),
        created_at INTEGER NOT NULL
      );
      CREATE TABLE message_records (
        id INTEGER PRIMARY KEY,
        conversation_id TEXT NOT NULL,
        message_id TEXT NOT NULL,
        body TEXT NOT NULL
      );
      CREATE INDEX message_records_conversation ON message_records(conversation_id);
      CREATE VIRTUAL TABLE message_bodies USING fts5(body, content='message_records', content_rowid='id', tokenize='unicode61');
      CREATE TRIGGER message_records_ai AFTER INSERT ON message_records BEGIN
        INSERT INTO message_bodies(rowid, body) VALUES (new.id, new.body);
      END;
      CREATE TRIGGER message_records_ad AFTER DELETE ON message_records BEGIN
        INSERT INTO message_bodies(message_bodies, rowid, body) VALUES('delete', old.id, old.body);
      END;
      CREATE TRIGGER message_records_au AFTER UPDATE ON message_records BEGIN
        INSERT INTO message_bodies(message_bodies, rowid, body) VALUES('delete', old.id, old.body);
        INSERT INTO message_bodies(rowid, body) VALUES (new.id, new.body);
      END;
      INSERT INTO message_records(conversation_id, message_id, body)
      SELECT conversations.id, json_extract(message.value, '$.id'), json_extract(message.value, '$.text')
      FROM conversations, json_each(json_extract(conversations.data, '$.messages')) AS message
      WHERE json_valid(conversations.data)
        AND json_type(conversations.data, '$.messages') = 'array'
        AND json_type(message.value, '$.text') = 'text'
        AND json_type(message.value, '$.id') = 'text';
    `,
  },
  {
    version: 10,
    sql: `CREATE TABLE context_records(
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL CHECK(kind IN ('rule','skill')),
      scope TEXT NOT NULL CHECK(scope IN ('global','workspace')),
      workspace_id TEXT,
      title TEXT NOT NULL CHECK(length(title) BETWEEN 1 AND 80),
      body TEXT NOT NULL CHECK(length(body) <= 8000),
      enabled INTEGER NOT NULL CHECK(enabled IN (0,1)),
      CHECK((scope='global' AND workspace_id IS NULL) OR (scope='workspace' AND workspace_id IS NOT NULL))
    );`,
  },
  {
    version: 11,
    sql: `ALTER TABLE agent_sessions ADD COLUMN checkpoint TEXT;
      CREATE TABLE agent_patches(
        workspace_id TEXT NOT NULL,
        path TEXT NOT NULL,
        before_text TEXT NOT NULL,
        after_text TEXT NOT NULL,
        before_hash TEXT,
        after_hash TEXT NOT NULL,
        session_id TEXT NOT NULL,
        updated_at INTEGER NOT NULL,
        PRIMARY KEY(workspace_id, path)
      );`,
  },
  {
    version: 12,
    sql: `CREATE TABLE context_records_next(
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL CHECK(kind IN ('rule','skill','prompt')),
      scope TEXT NOT NULL CHECK(scope IN ('global','workspace')),
      workspace_id TEXT,
      title TEXT NOT NULL CHECK(length(title) BETWEEN 1 AND 80),
      body TEXT NOT NULL CHECK(length(body) <= 8000),
      enabled INTEGER NOT NULL CHECK(enabled IN (0,1)),
      CHECK((scope='global' AND workspace_id IS NULL) OR (scope='workspace' AND workspace_id IS NOT NULL))
    );
    INSERT INTO context_records_next(id, kind, scope, workspace_id, title, body, enabled)
      SELECT id, kind, scope, workspace_id, title, body, enabled FROM context_records;
    DROP TABLE context_records;
    ALTER TABLE context_records_next RENAME TO context_records;`,
  },
];
export function openDatabase(path: string) {
  const db = new Database(path);
  try {
    if (path !== ':memory:') chmodSync(path, 0o600);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    db.pragma('synchronous = FULL');
    migrate(db, migrations);
    return db;
  } catch (error) {
    db.close();
    throw error;
  }
}
