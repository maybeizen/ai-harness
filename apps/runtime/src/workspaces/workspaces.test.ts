import { it, expect } from 'vitest';
import {
  mkdtemp,
  mkdir,
  writeFile,
  symlink,
  rename,
  rm,
  readFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
  directorySchema,
  directoryListSchema,
  workspaceFilesSchema,
  workspaceReadSchema,
  workspaceSearchSchema,
  workspaceGitStatusSchema,
  workspaceGitDiffSchema,
  workspaceGitSidesSchema,
} from '@harness/contracts';
import { openDatabase } from '../storage/database';
import { Workspaces } from './service';
const exec = promisify(execFile);
async function fixture() {
  const base = await mkdtemp(join(tmpdir(), 'axiom-workspace-'));
  const root = join(base, 'repo');
  await mkdir(root);
  const db = openDatabase(':memory:');
  const service = new Workspaces(db);
  const directory = directorySchema.parse(
    await service.dispatch({ action: 'register', path: root }),
  );
  return {
    base,
    root,
    db,
    service,
    directory,
    async close() {
      await service.close();
      db.close();
      await rm(base, { recursive: true, force: true });
    },
  };
}
it('canonicalizes registrations and keeps same-name directories distinct', async () => {
  const f = await fixture();
  try {
    const alias = join(f.base, 'alias');
    await symlink(f.root, alias);
    expect(
      directorySchema.parse(
        await f.service.dispatch({ action: 'register', path: alias }),
      ).id,
    ).toBe(f.directory.id);
    const another = join(f.base, 'other', 'repo');
    await mkdir(another, { recursive: true });
    const other = directorySchema.parse(
      await f.service.dispatch({ action: 'register', path: another }),
    );
    expect(other.name).toBe(f.directory.name);
    expect(other.id).not.toBe(f.directory.id);
    expect(
      directoryListSchema.parse(await f.service.dispatch({ action: 'list' })),
    ).toHaveLength(2);
    expect((await f.service.get(f.directory.id)).path).toBe(f.root);
  } finally {
    await f.close();
  }
});
it('retains registrations across database reopen and reports missing roots', async () => {
  const base = await mkdtemp(join(tmpdir(), 'axiom-workspace-restart-'));
  const path = join(base, 'data.sqlite');
  const root = join(base, 'project');
  await mkdir(root);
  let db = openDatabase(path);
  try {
    const first = new Workspaces(db);
    const saved = directorySchema.parse(
      await first.dispatch({ action: 'register', path: root }),
    );
    await first.close();
    db.close();
    db = openDatabase(path);
    const restored = new Workspaces(db);
    expect((await restored.get(saved.id)).path).toBe(root);
    await rename(root, root + '-moved');
    expect(
      directoryListSchema.parse(await restored.dispatch({ action: 'list' }))[0]
        ?.available,
    ).toBe(false);
    await expect(restored.get(saved.id)).rejects.toMatchObject({
      detail: { code: 'WORKSPACE_UNAVAILABLE' },
    });
    await restored.close();
  } finally {
    db.close();
    await rm(base, { recursive: true, force: true });
  }
});
it('denies traversal, absolute paths, sensitive files and symlink escapes', async () => {
  const f = await fixture();
  try {
    await writeFile(join(f.base, 'private.txt'), 'private');
    await writeFile(join(f.root, '.env'), 'SECRET=fixture');
    await writeFile(join(f.root, 'safe.ts'), 'export const ok = true;');
    await symlink(join(f.base, 'private.txt'), join(f.root, 'escape'));
    await symlink(join(f.root, '.env'), join(f.root, 'secret-alias'));
    await symlink(join(f.root, 'safe.ts'), join(f.root, 'safe-alias'));
    for (const path of [
      '../private.txt',
      join(f.base, 'private.txt'),
      '.env',
      'escape',
      'secret-alias',
    ])
      await expect(
        f.service.dispatch({ action: 'read', id: f.directory.id, path }),
      ).rejects.toMatchObject({ detail: { code: 'PERMISSION_DENIED' } });
    expect(
      workspaceReadSchema.parse(
        await f.service.dispatch({
          action: 'read',
          id: f.directory.id,
          path: 'safe-alias',
        }),
      ).text,
    ).toContain('ok');
    const files = workspaceFilesSchema.parse(
      await f.service.dispatch({
        action: 'files',
        id: f.directory.id,
        path: '',
      }),
    );
    expect(files.entries.some((row) => row.name === '.env')).toBe(false);
  } finally {
    await f.close();
  }
});
it('rejects binary, malformed UTF-8, huge and special files without reading unbounded input', async () => {
  const f = await fixture();
  try {
    await writeFile(join(f.root, 'binary.bin'), Buffer.from([0, 1]));
    await writeFile(join(f.root, 'invalid.txt'), Buffer.from([255, 254]));
    await writeFile(join(f.root, 'large.txt'), 'x'.repeat(131073));
    await exec('mkfifo', [join(f.root, 'pipe')]);
    for (const path of ['binary.bin', 'invalid.txt'])
      await expect(
        f.service.dispatch({ action: 'read', id: f.directory.id, path }),
      ).rejects.toMatchObject({ detail: { code: 'BINARY_FILE' } });
    await expect(
      f.service.dispatch({
        action: 'read',
        id: f.directory.id,
        path: 'large.txt',
      }),
    ).rejects.toMatchObject({ detail: { code: 'FILE_TOO_LARGE' } });
    await expect(
      f.service.dispatch({ action: 'read', id: f.directory.id, path: 'pipe' }),
    ).rejects.toMatchObject({ detail: { code: 'INVALID_FILE' } });
  } finally {
    await f.close();
  }
});
it('searches text and filenames with explicit bounds while excluding secrets and external symlinks', async () => {
  const f = await fixture();
  try {
    await writeFile(join(f.root, 'hello.ts'), 'Unicode 🌈\nfind me here\n');
    await writeFile(join(f.root, '.env'), 'find me SECRET');
    await mkdir(join(f.root, 'node_modules'));
    await writeFile(join(f.root, 'node_modules', 'ignored.txt'), 'find me');
    await writeFile(join(f.base, 'outside.txt'), 'find me');
    await symlink(join(f.base, 'outside.txt'), join(f.root, 'link'));
    const found = workspaceSearchSchema.parse(
      await f.service.dispatch({
        action: 'search',
        id: f.directory.id,
        query: 'find me',
      }),
    );
    expect(found.matches).toEqual([
      { path: 'hello.ts', line: 2, preview: 'find me here' },
    ]);
    await writeFile(
      join(f.root, 'many.txt'),
      Array.from({ length: 110 }, () => 'needle').join('\n'),
    );
    const bounded = workspaceSearchSchema.parse(
      await f.service.dispatch({
        action: 'search',
        id: f.directory.id,
        query: 'needle',
      }),
    );
    expect(bounded.matches).toHaveLength(100);
    expect(bounded.truncated).toBe(true);
  } finally {
    await f.close();
  }
});
it('does not follow a registered root replaced by an external symlink', async () => {
  const f = await fixture();
  try {
    await rename(f.root, f.root + '-moved');
    await symlink(f.base, f.root);
    await expect(
      f.service.dispatch({ action: 'files', id: f.directory.id, path: '' }),
    ).rejects.toMatchObject({ detail: { code: 'WORKSPACE_UNAVAILABLE' } });
  } finally {
    await f.close();
  }
});
it('inspects real Git status/diffs without executing config helpers or leaking sensitive diffs', async () => {
  const f = await fixture();
  const git = (args: string[]) => exec('git', ['-C', f.root, ...args]);
  try {
    await git(['init', '--initial-branch=fixture']);
    await writeFile(join(f.root, 'safe.txt'), 'before\n');
    await writeFile(join(f.root, '.env'), 'before-secret\n');
    await git(['add', '--', 'safe.txt', '.env']);
    await git([
      '-c',
      'user.name=Fixture',
      '-c',
      'user.email=fixture@example.invalid',
      'commit',
      '-m',
      'fixture',
    ]);
    await writeFile(join(f.root, 'safe.txt'), 'after\n');
    await writeFile(join(f.root, '.env'), 'private-credential-never-return\n');
    const marker = join(f.base, 'helper-ran');
    const helper = join(f.base, 'helper.sh');
    await writeFile(helper, `#!/bin/sh\ntouch '${marker}'\n`, { mode: 0o700 });
    await git(['config', 'core.fsmonitor', helper]);
    await git(['config', 'diff.external', helper]);
    const status = workspaceGitStatusSchema.parse(
      await f.service.dispatch({ action: 'git.status', id: f.directory.id }),
    );
    expect(status.branch).toBe('fixture');
    expect(
      status.entries.find((row) => row.path === 'safe.txt')?.worktree,
    ).toBe('M');
    const diff = workspaceGitDiffSchema.parse(
      await f.service.dispatch({
        action: 'git.diff',
        id: f.directory.id,
        staged: false,
      }),
    );
    expect(diff.text).toContain('+after');
    expect(diff.text).not.toContain('private-credential');
    const sides = workspaceGitSidesSchema.parse(
      await f.service.dispatch({
        action: 'git.sides',
        id: f.directory.id,
        path: 'safe.txt',
        staged: false,
      }),
    );
    expect(sides.original).toContain('before');
    expect(sides.modified).toContain('after');
    expect(sides.modified).not.toContain('private-credential');
    await expect(
      f.service.dispatch({
        action: 'git.sides',
        id: f.directory.id,
        path: '.env',
        staged: false,
      }),
    ).rejects.toMatchObject({ detail: { code: 'PERMISSION_DENIED' } });
    await expect(readFile(marker)).rejects.toMatchObject({ code: 'ENOENT' });
    await git(['add', '--', 'safe.txt']);
    expect(
      workspaceGitDiffSchema.parse(
        await f.service.dispatch({
          action: 'git.diff',
          id: f.directory.id,
          staged: true,
        }),
      ).text,
    ).toContain('+after');
  } finally {
    await f.close();
  }
});
it('rejects parent repositories from a granted subdirectory and rejects new work after close', async () => {
  const f = await fixture();
  try {
    await exec('git', ['-C', f.base, 'init']);
    await expect(
      f.service.dispatch({ action: 'git.status', id: f.directory.id }),
    ).rejects.toMatchObject({ detail: { code: 'PERMISSION_DENIED' } });
    await f.service.close();
    await expect(f.service.dispatch({ action: 'list' })).rejects.toMatchObject({
      detail: { code: 'UNAVAILABLE' },
    });
  } finally {
    await f.close();
  }
});
it('cancels and drains an accepted operation before closing the workspace service', async () => {
  const f = await fixture();
  try {
    const pending = f.service.dispatch({
      action: 'search',
      id: f.directory.id,
      query: 'anything',
    });
    const rejected = expect(pending).rejects.toMatchObject({
      detail: { code: 'CANCELLED' },
    });
    await f.service.close();
    await rejected;
    await expect(f.service.dispatch({ action: 'list' })).rejects.toMatchObject({
      detail: { code: 'UNAVAILABLE' },
    });
  } finally {
    await f.close();
  }
});
it('honors a caller cancellation before dispatch and during an accepted operation', async () => {
  const f = await fixture();
  try {
    const early = new AbortController();
    early.abort();
    await expect(
      f.service.dispatch(
        { action: 'search', id: f.directory.id, query: 'needle' },
        early.signal,
      ),
    ).rejects.toMatchObject({ detail: { code: 'CANCELLED' } });
    const controller = new AbortController();
    const pending = f.service.dispatch(
      { action: 'search', id: f.directory.id, query: 'needle' },
      controller.signal,
    );
    const rejected = expect(pending).rejects.toMatchObject({
      detail: { code: 'CANCELLED' },
    });
    controller.abort();
    await rejected;
    expect(
      directoryListSchema.parse(await f.service.dispatch({ action: 'list' })),
    ).toHaveLength(1);
  } finally {
    await f.close();
  }
});
