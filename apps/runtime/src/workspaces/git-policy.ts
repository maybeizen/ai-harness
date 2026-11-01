import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { lstat, realpath, opendir } from 'node:fs/promises';
import { dirname, join, isAbsolute } from 'node:path';
import { git } from './git';
import { inside, isSensitive, workspaceFailure } from './paths';
import { flags } from './git-isolation';
const exec = promisify(execFile);
export async function metadata(root: string, cwd: string, signal: AbortSignal) {
  const directory = join(cwd, '.git');
  const stat = await lstat(directory);
  if (
    !stat.isDirectory() ||
    stat.isSymbolicLink() ||
    (await realpath(directory)) !== join(root, '.git')
  )
    workspaceFailure(
      'PERMISSION_DENIED',
      'Git mutations require repository metadata inside this workspace; external worktree metadata is read-only.',
    );
  const queue = [directory];
  let count = 0;
  while (queue.length) {
    signal.throwIfAborted();
    const current = queue.pop()!;
    if (!inside(join(root, '.git'), await realpath(current)))
      workspaceFailure(
        'PERMISSION_DENIED',
        'Git metadata escapes this workspace.',
      );
    for await (const entry of await opendir(current)) {
      if (++count > 10000)
        workspaceFailure(
          'GIT_LIMIT',
          'This repository metadata exceeds the verified mutation limit.',
        );
      if (entry.isSymbolicLink())
        workspaceFailure(
          'PERMISSION_DENIED',
          'Git metadata contains symbolic links; mutations are disabled.',
        );
      if (entry.isDirectory()) queue.push(join(current, entry.name));
      else if (!entry.isFile())
        workspaceFailure(
          'PERMISSION_DENIED',
          'Git metadata contains a special file; mutations are disabled.',
        );
    }
  }
  const common = (
    await git(cwd, ['rev-parse', '--git-common-dir'], signal)
  ).trim();
  if (
    !inside(
      join(root, '.git'),
      await realpath(isAbsolute(common) ? common : join(cwd, common)),
    )
  )
    workspaceFailure(
      'PERMISSION_DENIED',
      'Git common metadata is outside the approved workspace.',
    );
}
export async function paths(root: string, items: string[]) {
  for (const path of items) {
    if (
      isAbsolute(path) ||
      path.includes('\\') ||
      path.includes('\0') ||
      path.split('/').includes('..') ||
      isSensitive(path)
    )
      workspaceFailure(
        'PERMISSION_DENIED',
        'Select ordinary relative files; sensitive and escaping paths cannot be staged.',
      );
    const target = join(root, path);
    let parent = dirname(target);
    while (true) {
      try {
        parent = await realpath(parent);
        break;
      } catch {
        const next = dirname(parent);
        if (next === parent)
          workspaceFailure(
            'PERMISSION_DENIED',
            'The file parent is unavailable.',
          );
        parent = next;
      }
    }
    if (!inside(root, parent))
      workspaceFailure(
        'PERMISSION_DENIED',
        'The file resolves outside this workspace.',
      );
    try {
      const stat = await lstat(target);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink > 1)
        workspaceFailure(
          'PERMISSION_DENIED',
          'Select individual regular files; directories, hard links and symbolic links cannot be staged.',
        );
      if (!inside(root, await realpath(target)))
        workspaceFailure(
          'PERMISSION_DENIED',
          'The file resolves outside this workspace.',
        );
    } catch (error) {
      if (!(
        error instanceof Error &&
        'code' in error &&
        error.code === 'ENOENT'
      ))
        throw error;
    }
  }
}
export async function configuredFilters(cwd: string, signal: AbortSignal) {
  try {
    const result = await exec(
      'git',
      [
        ...flags,
        'config',
        '--includes',
        '--name-only',
        '--get-regexp',
        '^filter\\.',
      ],
      {
        cwd,
        signal,
        timeout: 5000,
        maxBuffer: 65536,
        env: {
          PATH: process.env['PATH'],
          HOME: process.env['HOME'],
          LANG: 'C.UTF-8',
          GIT_CONFIG_NOSYSTEM: '1',
        },
      },
    );
    return !!result.stdout.trim();
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 1)
      return false;
    workspaceFailure(
      'GIT_UNAVAILABLE',
      'Git filter configuration could not be verified.',
    );
  }
}
