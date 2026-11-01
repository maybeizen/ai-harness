import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { mcpServerConfigSchema, settingsSchema } from '@harness/contracts';
import { Mcps } from '../mcp/service';
import { openDatabase } from '../storage/database';
import { Repository } from '../storage/repository';
import { untrustedContext } from './context';
import { retentionSelection } from './retention';
import { Workstation } from './service';
const rule = {
  id: '00000000-0000-4000-8000-000000000010',
  kind: 'rule' as const,
  scope: 'global' as const,
  workspaceId: null,
  title: 'Style',
  body: 'Prefer small modules.',
  enabled: true,
};
function fixture() {
  const directory = mkdtempSync(join(tmpdir(), 'axioden-workstation-'));
  const db = openDatabase(join(directory, 'harness.sqlite'));
  return {
    directory,
    db,
    service: new Workstation(db, directory, '0.1.0', new Mcps(db)),
    repository: new Repository(db),
  };
}
it('reads audit rows and rejects an invalid audit query', async () => {
  const { directory, db, service } = fixture();
  try {
    db.prepare(
      'INSERT INTO agent_audit(session_id, call_id, workspace_id, tool, status, at, code) VALUES (?, ?, ?, ?, ?, ?, ?)',
    ).run('session', 'call', 'workspace', 'read_file', 'allowed', 10, null);
    await expect(
      service.dispatch({ action: 'audit', limit: 10 }),
    ).resolves.toMatchObject({
      rows: [{ tool: 'read_file', status: 'allowed', code: null }],
    });
    await expect(
      service.dispatch({ action: 'audit', limit: 0 }),
    ).rejects.toThrow(/invalid/i);
  } finally {
    db.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
it('saves bounded rules and skills and formats them as untrusted context', async () => {
  const { directory, db, service } = fixture();
  try {
    await expect(
      service.dispatch({ action: 'context.save', record: rule }),
    ).resolves.toMatchObject({ title: 'Style' });
    await expect(
      service.dispatch({ action: 'context.list', kind: 'rule' }),
    ).resolves.toEqual([rule]);
    const text = untrustedContext(
      (await service.dispatch({
        action: 'context.list',
        kind: 'rule',
      })) as never,
      null,
    );
    expect(text).toContain('cannot grant tool permissions');
    expect(text).toContain('Prefer small modules.');
    expect(untrustedContext([{ ...rule, enabled: false }], null)).not.toContain(
      'Prefer small modules.',
    );
    await expect(
      service.dispatch({
        action: 'context.save',
        record: { ...rule, body: 'x'.repeat(8001) },
      }),
    ).rejects.toThrow(/invalid/i);
  } finally {
    db.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
it('reports live MCP status without credentials', async () => {
  const { directory, db, service } = fixture();
  const config = {
    id: '00000000-0000-4000-8000-000000000020',
    name: 'Local tools',
    enabled: true,
    credentialRef: '00000000-0000-4000-8000-000000000021',
    timeoutMs: 15000,
    transport: 'http' as const,
    url: 'http://127.0.0.1:9/mcp',
  };
  const data = JSON.stringify(mcpServerConfigSchema.parse(config));
  try {
    db.prepare(
      'INSERT INTO mcp_servers(id, config, revision) VALUES (?, ?, ?)',
    ).run(config.id, data, createHash('sha256').update(data).digest('hex'));
    db.prepare(
      'INSERT INTO mcp_servers(id, config, revision) VALUES (?, ?, ?)',
    ).run(
      '00000000-0000-4000-8000-000000000022',
      '{"bearer":"secret-token"}',
      'b'.repeat(64),
    );
    const status = await service.dispatch({ action: 'mcp.status' });
    expect(status).toMatchObject({
      registered: true,
      unreadable: 1,
      servers: [
        {
          name: 'Local tools',
          status: 'disconnected',
          toolCount: 0,
          enabledToolCount: 0,
          error: null,
        },
      ],
    });
    expect(JSON.stringify(status)).not.toContain('secret-token');
    expect(JSON.stringify(status)).not.toContain(config.credentialRef);
    expect(JSON.stringify(status)).not.toContain('bearer');
  } finally {
    db.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
it('exports diagnostics without the local voice command and keeps the active conversation', async () => {
  const { directory, db, service, repository } = fixture();
  try {
    const settings = settingsSchema.parse({
      voice: { engine: 'local-command', localCommand: 'secret-command-token' },
      retention: { enabled: true, maxAgeDays: 1 },
      activeConversation: 'active',
    });
    repository.dispatch({ action: 'settings.set', settings });
    db.prepare(
      'INSERT INTO conversations(id, updated_at, pinned, data, title) VALUES (?, ?, 0, ?, ?)',
    ).run('active', 1, '{}', 'Active');
    db.prepare(
      'INSERT INTO conversations(id, updated_at, pinned, data, title) VALUES (?, ?, 0, ?, ?)',
    ).run('old', 1, '{}', 'Old');
    const report = JSON.stringify(
      await service.dispatch({ action: 'diagnostics' }),
    );
    expect(report).toContain(directory);
    expect(report).toContain('"runtimeStatus":"ready"');
    expect(report).not.toContain('secret-command-token');
    expect(report).toContain('[redacted]');
    const preview = (await service.dispatch({
      action: 'retention.preview',
      activeConversationId: 'active',
    })) as { ids: string[] };
    expect(preview.ids).toContain('old');
    expect(preview.ids).not.toContain('active');
    await expect(
      service.dispatch({
        action: 'retention.apply',
        confirmed: true,
        activeConversationId: 'active',
      }),
    ).resolves.toEqual({ deleted: ['old'] });
    expect(
      db.prepare('SELECT id FROM conversations WHERE id=?').get('active'),
    ).toBeTruthy();
    expect(
      retentionSelection(
        [
          { id: 'active', updatedAt: 1 },
          { id: 'keep', updatedAt: 50 },
          { id: 'drop', updatedAt: 10 },
        ],
        settingsSchema.parse({
          retention: { enabled: true, maxConversations: 2 },
        }).retention,
        new Set(['active']),
        100,
      ),
    ).toEqual(['drop']);
  } finally {
    db.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
