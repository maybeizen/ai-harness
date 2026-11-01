import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { realpath, lstat } from 'node:fs/promises';
import { readText } from './files';
import { isAbsolute, join } from 'node:path';
import { openScoped, isSensitive, workspaceFailure } from './paths';
const exec = promisify(execFile);
const flags = [
  '--no-pager',
  '--literal-pathspecs',
  '-c',
  'core.fsmonitor=false',
  '-c',
  'core.untrackedCache=false',
  '-c',
  'core.hooksPath=/dev/null',
];
export async function git(cwd: string, args: string[], signal: AbortSignal) {
  try {
    const { stdout } = await exec('git', [...flags, ...args], {
      cwd,
      signal,
      timeout: 10000,
      maxBuffer: 524288,
      env: {
        PATH: process.env['PATH'],
        LANG: 'C.UTF-8',
        GIT_CONFIG_NOSYSTEM: '1',
        GIT_CONFIG_GLOBAL: '/dev/null',
        GIT_OPTIONAL_LOCKS: '0',
        GIT_TERMINAL_PROMPT: '0',
      },
    });
    return stdout;
  } catch {
    workspaceFailure(
      'GIT_UNAVAILABLE',
      'Git failed or exceeded its time/output limit. Verify this folder is a repository.',
    );
  }
}
export async function withRepository<T>(
  root: string,
  signal: AbortSignal,
  run: (cwd: string) => Promise<T>,
) {
  const handle = await openScoped(root, '', true);
  try {
    const cwd = `/proc/${process.pid}/fd/${handle.fd}`;
    const detected = (
      await git(cwd, ['rev-parse', '--show-toplevel'], signal)
    ).trim();
    if ((await realpath(detected)) !== root)
      workspaceFailure(
        'PERMISSION_DENIED',
        'Open the repository root before inspecting Git changes.',
      );
    return await run(cwd);
  } finally {
    await handle.close();
  }
}
export async function gitStatus(root: string, signal: AbortSignal) {
  return withRepository(root, signal, async (cwd) => {
    const results = await Promise.allSettled([
      git(
        cwd,
        ['status', '--porcelain=v1', '-z', '--untracked-files=all'],
        signal,
      ),
      git(cwd, ['symbolic-ref', '--short', 'HEAD'], signal).catch(() =>
        git(cwd, ['rev-parse', '--short', 'HEAD'], signal),
      ),
    ]);
    const status = results[0];
    const branch = results[1];
    if (status.status === 'rejected') throw status.reason;
    if (branch.status === 'rejected') throw branch.reason;
    const entries: Array<{ path: string; index: string; worktree: string }> =
      [];
    const fields = status.value.split('\0');
    for (let index = 0; index < fields.length; index++) {
      const row = fields[index];
      if (!row) continue;
      const path = row.slice(3);
      entries.push({ path, index: row[0]!, worktree: row[1]! });
      if (/[RC]/.test(row.slice(0, 2))) index++;
    }
    return { root, branch: branch.value.trim(), entries };
  });
}
export async function gitDiff(
  root: string,
  staged: boolean,
  signal: AbortSignal,
) {
  return withRepository(root, signal, async (cwd) => {
    const stage = staged ? ['--cached'] : [];
    const paths = (
      await git(
        cwd,
        [
          'diff',
          ...stage,
          '--name-only',
          '-z',
          '--no-ext-diff',
          '--no-textconv',
          '--submodule=short',
        ],
        signal,
      )
    )
      .split('\0')
      .filter((path) => path && !isSensitive(path));
    if (paths.length > 250)
      workspaceFailure(
        'GIT_LIMIT',
        'Too many changed files for one diff. Inspect a smaller change set.',
      );
    if (!staged)
      for (const path of paths) {
        try {
          if ((await lstat(join(root, path))).nlink > 1)
            workspaceFailure(
              'PERMISSION_DENIED',
              'A changed file has hard links; inspect it outside the model context.',
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
    const text = paths.length
      ? await git(
          cwd,
          [
            'diff',
            ...stage,
            '--no-ext-diff',
            '--no-textconv',
            '--submodule=short',
            '--',
            ...paths,
          ],
          signal,
        )
      : '';
    return { text, staged };
  });
}
async function gitText(cwd: string, args: string[], signal: AbortSignal) {
  let text: string;
  try {
    text = (
      await exec('git', [...flags, ...args], {
        cwd,
        signal,
        timeout: 10000,
        maxBuffer: 524288,
        env: {
          PATH: process.env['PATH'],
          LANG: 'C.UTF-8',
          GIT_CONFIG_NOSYSTEM: '1',
          GIT_CONFIG_GLOBAL: '/dev/null',
          GIT_OPTIONAL_LOCKS: '0',
          GIT_TERMINAL_PROMPT: '0',
        },
      })
    ).stdout;
  } catch {
    return '';
  }
  if (Buffer.byteLength(text) > 262144)
    workspaceFailure(
      'GIT_LIMIT',
      'This diff side exceeds the 256 KiB review limit.',
    );
  return text;
}
export async function gitSides(
  root: string,
  path: string,
  staged: boolean,
  signal: AbortSignal,
) {
  if (
    !path ||
    isAbsolute(path) ||
    path.includes('\0') ||
    path.includes(':') ||
    path.split(/[\\/]/).includes('..') ||
    isSensitive(path)
  )
    workspaceFailure(
      'PERMISSION_DENIED',
      'Sensitive paths are excluded from diff review.',
    );
  return withRepository(root, signal, async (cwd) => {
    const original = await gitText(cwd, ['show', `HEAD:${path}`], signal);
    const modified = staged
      ? await gitText(cwd, ['show', `:${path}`], signal)
      : await readText(root, path)
          .then((file) => file.text)
          .catch(() => '');
    return { path, original, modified, staged };
  });
}
