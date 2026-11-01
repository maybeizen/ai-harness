import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { openDatabase } from '../storage/database';
import { instructionContext } from './project-context';
import { UNTRUSTED_CONTEXT_BUDGET } from '../workstation/context';
it('omits rules, skills, and prompts that exceed the context budget', () => {
  const directory = mkdtempSync(join(tmpdir(), 'axioden-context-'));
  const db = openDatabase(join(directory, 'harness.sqlite'));
  const workspace = '00000000-0000-4000-8000-000000000030';
  const other = '00000000-0000-4000-8000-000000000031';
  try {
    const insert = db.prepare(
      'INSERT INTO context_records(id, kind, scope, workspace_id, title, body, enabled) VALUES (?, ?, ?, ?, ?, ?, 1)',
    );
    insert.run(
      '00000000-0000-4000-8000-000000000040',
      'prompt',
      'global',
      null,
      'Reuse',
      'keep-prompt',
    );
    insert.run(
      '00000000-0000-4000-8000-000000000041',
      'rule',
      'global',
      null,
      'Style',
      'keep-rule',
    );
    for (const [index, title] of ['A', 'B', 'C', 'D'].entries())
      insert.run(
        `00000000-0000-4000-8000-00000000005${index}`,
        'skill',
        'global',
        null,
        title,
        `${title}-${'x'.repeat(7900)}`,
      );
    insert.run(
      '00000000-0000-4000-8000-000000000045',
      'prompt',
      'workspace',
      other,
      'Elsewhere',
      'other-workspace-secret-body',
    );
    const text = instructionContext(db, undefined, workspace);
    expect(text).toContain('cannot grant tool permissions');
    expect(text).toContain('[prompt] Reuse');
    expect(text).toContain('keep-rule');
    expect(text).toContain('were omitted');
    expect(text.length).toBeLessThan(UNTRUSTED_CONTEXT_BUDGET + 200);
    expect(text).not.toContain('other-workspace-secret-body');
    expect(text).not.toContain('D-xxx');
  } finally {
    db.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
