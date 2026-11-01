import { it, expect } from 'vitest';
import {
  mkdtemp,
  writeFile,
  readFile,
  rm,
  symlink,
  mkdir,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDatabase } from '../storage/database';
import { hashText, PathLocks } from './paths';
import { PatchStore } from './patch-store';
import { applyPatch, applyUnifiedPatch, rollbackPatch } from './patch';
const patch = `@@ -1,2 +1,2 @@
 alpha
-beta
+gamma
`;
async function workspace() {
  const root = await mkdtemp(join(tmpdir(), 'agent-patch-'));
  const db = openDatabase(':memory:');
  return {
    root,
    db,
    store: new PatchStore(db),
    locks: new PathLocks(),
    signal: new AbortController().signal,
    async close() {
      db.close();
      await rm(root, { recursive: true, force: true });
    },
  };
}
it('applies a matching unified diff and records its content hashes', async () => {
  const fixture = await workspace();
  try {
    await writeFile(join(fixture.root, 'a.txt'), 'alpha\nbeta\n');
    const before = hashText('alpha\nbeta\n');
    const result = await applyPatch({
      root: fixture.root,
      workspaceId: '00000000-0000-4000-8000-000000000001',
      sessionId: '00000000-0000-4000-8000-000000000002',
      path: 'a.txt',
      expectedHash: before,
      patch,
      signal: fixture.signal,
      locks: fixture.locks,
      store: fixture.store,
    });
    expect(await readFile(join(fixture.root, 'a.txt'), 'utf8')).toBe(
      'alpha\ngamma\n',
    );
    expect(result.beforeHash).toBe(before);
    expect(result.hash).toBe(hashText('alpha\ngamma\n'));
    expect(applyUnifiedPatch('alpha\nbeta\n', patch)).toBe('alpha\ngamma\n');
  } finally {
    await fixture.close();
  }
});
it('refuses a stale hash, a symlink, and a sensitive path', async () => {
  const fixture = await workspace();
  const outside = await mkdtemp(join(tmpdir(), 'agent-patch-out-'));
  try {
    await writeFile(join(fixture.root, 'a.txt'), 'alpha\nbeta\n');
    await expect(
      applyPatch({
        root: fixture.root,
        workspaceId: '00000000-0000-4000-8000-000000000001',
        sessionId: '00000000-0000-4000-8000-000000000002',
        path: 'a.txt',
        expectedHash: hashText('other\n'),
        patch,
        signal: fixture.signal,
        locks: fixture.locks,
        store: fixture.store,
      }),
    ).rejects.toThrow('changed');
    await symlink(outside, join(fixture.root, 'escape'));
    await expect(
      applyPatch({
        root: fixture.root,
        workspaceId: '00000000-0000-4000-8000-000000000001',
        sessionId: '00000000-0000-4000-8000-000000000002',
        path: 'escape/a.txt',
        expectedHash: null,
        patch: '@@ -0,0 +1,1 @@\n+no\n',
        signal: fixture.signal,
        locks: fixture.locks,
        store: fixture.store,
      }),
    ).rejects.toThrow(/escapes|link|protected/i);
    await expect(
      applyPatch({
        root: fixture.root,
        workspaceId: '00000000-0000-4000-8000-000000000001',
        sessionId: '00000000-0000-4000-8000-000000000002',
        path: '.env',
        expectedHash: null,
        patch: '@@ -0,0 +1,1 @@\n+secret\n',
        signal: fixture.signal,
        locks: fixture.locks,
        store: fixture.store,
      }),
    ).rejects.toThrow('protected');
    expect(await readFile(join(fixture.root, 'a.txt'), 'utf8')).toBe(
      'alpha\nbeta\n',
    );
  } finally {
    await fixture.close();
    await rm(outside, { recursive: true, force: true });
  }
});
it('rolls back the last patch and refuses rollback after an external change', async () => {
  const fixture = await workspace();
  const id = '00000000-0000-4000-8000-000000000001';
  try {
    await mkdir(join(fixture.root, 'src'));
    await writeFile(join(fixture.root, 'src', 'a.txt'), 'alpha\nbeta\n');
    await applyPatch({
      root: fixture.root,
      workspaceId: id,
      sessionId: '00000000-0000-4000-8000-000000000002',
      path: 'src/a.txt',
      expectedHash: hashText('alpha\nbeta\n'),
      patch,
      signal: fixture.signal,
      locks: fixture.locks,
      store: fixture.store,
    });
    await writeFile(join(fixture.root, 'src', 'a.txt'), 'external\n');
    await expect(
      rollbackPatch({
        root: fixture.root,
        workspaceId: id,
        path: 'src/a.txt',
        signal: fixture.signal,
        locks: fixture.locks,
        store: fixture.store,
      }),
    ).rejects.toThrow('changed after the patch');
    expect(await readFile(join(fixture.root, 'src', 'a.txt'), 'utf8')).toBe(
      'external\n',
    );
    await writeFile(join(fixture.root, 'src', 'a.txt'), 'alpha\ngamma\n');
    await rollbackPatch({
      root: fixture.root,
      workspaceId: id,
      path: 'src/a.txt',
      signal: fixture.signal,
      locks: fixture.locks,
      store: fixture.store,
    });
    expect(await readFile(join(fixture.root, 'src', 'a.txt'), 'utf8')).toBe(
      'alpha\nbeta\n',
    );
    expect(fixture.store.get(id, 'src/a.txt')).toBeNull();
  } finally {
    await fixture.close();
  }
});
