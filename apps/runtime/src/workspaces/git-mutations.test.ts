import { it, expect } from 'vitest';
import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  rm,
  symlink,
} from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { directorySchema, workspaceGitCommitSchema } from '@harness/contracts';
import { openDatabase } from '../storage/database';
import { Workspaces } from './service';
const exec = promisify(execFile);
async function fixture() {
  const base = await mkdtemp(join(tmpdir(), 'axiom-git-mutate-'));
  const root = join(base, 'repo');
  await mkdir(root);
  const git = (args: string[]) => exec('git', ['-C', root, ...args]);
  await git(['init', '--initial-branch=fixture']);
  await git(['config', 'user.name', 'Fixture']);
  await git(['config', 'user.email', 'fixture@example.invalid']);
  await writeFile(join(root, 'safe.txt'), 'before\n');
  await git(['add', 'safe.txt']);
  await git(['commit', '-m', 'baseline']);
  const db = openDatabase(':memory:');
  const service = new Workspaces(db);
  const directory = directorySchema.parse(
    await service.dispatch({ action: 'register', path: root }),
  );
  return {
    base,
    root,
    git,
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
it('stages, unstages and commits real files with hooks/signing disabled in a workspace-only namespace', async () => {
  const f = await fixture();
  try {
    await writeFile(join(f.root, 'safe.txt'), 'after\n');
    await expect(
      f.service.dispatch({
        action: 'git.stage',
        id: f.directory.id,
        paths: ['safe.txt'],
      }),
    ).resolves.toEqual({ paths: ['safe.txt'], staged: true });
    expect(
      (await f.git(['diff', '--cached', '--name-only'])).stdout.trim(),
    ).toBe('safe.txt');
    await f.service.dispatch({
      action: 'git.unstage',
      id: f.directory.id,
      paths: ['safe.txt'],
    });
    expect(
      (await f.git(['diff', '--cached', '--name-only'])).stdout.trim(),
    ).toBe('');
    await f.service.dispatch({
      action: 'git.stage',
      id: f.directory.id,
      paths: ['safe.txt'],
    });
    const marker = join(f.base, 'hook-ran');
    await writeFile(
      join(f.root, '.git', 'hooks', 'pre-commit'),
      `#!/bin/sh\ntouch '${marker}'\nexit 1\n`,
      { mode: 0o700 },
    );
    await f.git(['config', 'commit.gpgsign', 'true']);
    await f.git(['config', 'gpg.program', '/not/a/valid/program']);
    const result = workspaceGitCommitSchema.parse(
      await f.service.dispatch({
        action: 'git.commit',
        id: f.directory.id,
        message: 'Verified isolated commit',
      }),
    );
    expect(result.summary).toContain('Verified isolated commit');
    expect(result.signed).toBe(false);
    expect(result.hooksRun).toBe(false);
    await expect(readFile(marker)).rejects.toMatchObject({ code: 'ENOENT' });
    expect((await f.git(['log', '-1', '--format=%s'])).stdout.trim()).toBe(
      'Verified isolated commit',
    );
  } finally {
    await f.close();
  }
});
it('rejects secrets, pathspec injection, symlinks and recursive directory staging', async () => {
  const f = await fixture();
  try {
    await writeFile(join(f.root, '.env'), 'secret');
    await writeFile(join(f.base, 'outside'), 'outside');
    await symlink(join(f.base, 'outside'), join(f.root, 'link'));
    await mkdir(join(f.root, 'folder'));
    for (const path of ['.env', '../outside', 'link', 'folder', '.git/config'])
      await expect(
        f.service.dispatch({
          action: 'git.stage',
          id: f.directory.id,
          paths: [path],
        }),
      ).rejects.toMatchObject({ detail: { code: 'PERMISSION_DENIED' } });
    await writeFile(join(f.root, ':(glob)*'), 'literal');
    await writeFile(join(f.root, 'other.txt'), 'other');
    await f.service.dispatch({
      action: 'git.stage',
      id: f.directory.id,
      paths: [':(glob)*'],
    });
    expect(
      (await f.git(['diff', '--cached', '--name-only'])).stdout.trim(),
    ).toBe(':(glob)*');
  } finally {
    await f.close();
  }
});
it('rejects configured clean/process filters and filter attributes before any filter can execute', async () => {
  const f = await fixture();
  try {
    const marker = join(f.base, 'filter-ran');
    await f.git(['config', 'filter.fixture.clean', `touch '${marker}'`]);
    await writeFile(join(f.root, 'safe.txt'), 'after');
    await expect(
      f.service.dispatch({
        action: 'git.stage',
        id: f.directory.id,
        paths: ['safe.txt'],
      }),
    ).rejects.toMatchObject({ detail: { code: 'GIT_FILTER_UNSUPPORTED' } });
    await f.git(['config', '--remove-section', 'filter.fixture']);
    await writeFile(join(f.root, '.gitattributes'), 'safe.txt filter=lfs\n');
    await expect(
      f.service.dispatch({
        action: 'git.stage',
        id: f.directory.id,
        paths: ['safe.txt'],
      }),
    ).rejects.toMatchObject({ detail: { code: 'GIT_FILTER_UNSUPPORTED' } });
    await expect(readFile(marker)).rejects.toMatchObject({ code: 'ENOENT' });
  } finally {
    await f.close();
  }
});
it('rejects external/symlink Git metadata and refuses commits with pre-staged secrets', async () => {
  const f = await fixture();
  try {
    await writeFile(join(f.root, '.env'), 'secret');
    await f.git(['add', '.env']);
    await expect(
      f.service.dispatch({
        action: 'git.commit',
        id: f.directory.id,
        message: 'must reject',
      }),
    ).rejects.toMatchObject({ detail: { code: 'PERMISSION_DENIED' } });
    const outside = join(f.base, 'objects');
    await mkdir(outside);
    await symlink(outside, join(f.root, '.git', 'objects', 'external'));
    await expect(
      f.service.dispatch({
        action: 'git.stage',
        id: f.directory.id,
        paths: ['safe.txt'],
      }),
    ).rejects.toMatchObject({ detail: { code: 'PERMISSION_DENIED' } });
  } finally {
    await f.close();
  }
});
it('unstages initial commits without deleting newly created working files', async () => {
  const base = await mkdtemp(join(tmpdir(), 'axiom-git-unborn-'));
  const db = openDatabase(':memory:');
  const service = new Workspaces(db);
  try {
    await exec('git', ['-C', base, 'init']);
    await writeFile(join(base, 'new.txt'), 'keep this');
    const workspace = directorySchema.parse(
      await service.dispatch({ action: 'register', path: base }),
    );
    await service.dispatch({
      action: 'git.stage',
      id: workspace.id,
      paths: ['new.txt'],
    });
    await service.dispatch({
      action: 'git.unstage',
      id: workspace.id,
      paths: ['new.txt'],
    });
    expect((await exec('git', ['-C', base, 'ls-files'])).stdout.trim()).toBe(
      '',
    );
    expect(await readFile(join(base, 'new.txt'), 'utf8')).toBe('keep this');
  } finally {
    await service.close();
    db.close();
    await rm(base, { recursive: true, force: true });
  }
});
