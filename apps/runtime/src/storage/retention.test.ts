import { expect, it } from 'vitest';
import { settingsSchema } from '@harness/contracts';
import { openDatabase } from './database';
import { Repository } from './repository';
it('keeps the active conversation when retention deletes older ones', () => {
  const db = openDatabase(':memory:');
  try {
    const repository = new Repository(db);
    const insert = db.prepare(
      'INSERT INTO conversations(id, updated_at, pinned, title, data, archived) VALUES(?,?,?,?,?,0)',
    );
    insert.run('active', 1, 0, 'Open', '{}');
    insert.run('old', 2, 0, 'Old', '{}');
    insert.run('fresh', 3_000_000_000_000, 0, 'Fresh', '{}');
    repository.dispatch({
      action: 'settings.set',
      settings: settingsSchema.parse({
        activeConversation: 'active',
        retention: { enabled: true, maxAgeDays: 30, maxConversations: null },
      }),
    });
    expect(
      repository.dispatch({ action: 'retention.apply', activeId: 'active' }),
    ).toEqual({ removed: ['old'] });
    const titles = (
      db.prepare('SELECT id FROM conversations ORDER BY id').all() as {
        id: string;
      }[]
    ).map((row) => row.id);
    expect(titles).toEqual(['active', 'fresh']);
    repository.dispatch({
      action: 'settings.set',
      settings: settingsSchema.parse({
        retention: { enabled: false, maxAgeDays: 1 },
      }),
    });
    expect(
      repository.dispatch({ action: 'retention.apply', activeId: 'active' }),
    ).toEqual({ removed: [] });
    expect(titles).toEqual(
      (
        db.prepare('SELECT id FROM conversations ORDER BY id').all() as {
          id: string;
        }[]
      ).map((row) => row.id),
    );
  } finally {
    db.close();
  }
});
