import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync } from 'node:fs';
import { workspaceFailure } from './paths';
const exec = promisify(execFile);
export const flags = [
  '--no-pager',
  '--literal-pathspecs',
  '-c',
  'core.fsmonitor=false',
  '-c',
  'core.untrackedCache=false',
  '-c',
  'core.hooksPath=/dev/null',
  '-c',
  'commit.gpgsign=false',
  '-c',
  'tag.gpgsign=false',
];
async function isolated(
  args: string[],
  fd: number,
  signal: AbortSignal,
): Promise<string> {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const child = spawn('bwrap', args, {
      stdio: ['ignore', 'pipe', 'pipe', fd],
      detached: true,
      env: { PATH: process.env['PATH'] },
    });
    const chunks: Buffer[] = [];
    let bytes = 0;
    let stopped = false;
    const kill = () => {
      stopped = true;
      if (child.pid)
        try {
          process.kill(-child.pid, 'SIGKILL');
        } catch {
          /* Already exited. */
        }
    };
    const timer = setTimeout(kill, 15000);
    signal.addEventListener('abort', kill, { once: true });
    if (signal.aborted) kill();
    child.stdout!.on('data', (data: Buffer) => {
      bytes += data.length;
      if (bytes > 524288) kill();
      else chunks.push(Buffer.from(data));
    });
    child.stderr!.on('data', (data: Buffer) => {
      bytes += data.length;
      if (bytes > 524288) kill();
    });
    child.on('error', reject);
    child.on('close', (code) => {
      clearTimeout(timer);
      signal.removeEventListener('abort', kill);
      if (code === 0 && !stopped)
        resolve(Buffer.concat(chunks).toString('utf8'));
      else reject(new Error('Isolated Git failed.'));
    });
  });
}
export async function sandbox(
  cwd: string,
  args: string[],
  signal: AbortSignal,
  identity: string[] = [],
) {
  const mounts = ['/usr', '/bin', '/lib', '/lib64']
    .filter((path) => existsSync(path))
    .flatMap((path) => ['--ro-bind', path, path]);
  const fd = Number(cwd.split('/').at(-1));
  if (!Number.isInteger(fd) || fd < 0)
    workspaceFailure(
      'GIT_MUTATION_UNAVAILABLE',
      'The approved directory descriptor is unavailable.',
    );
  try {
    return await isolated(
      [
        '--unshare-all',
        '--die-with-parent',
        '--new-session',
        '--clearenv',
        '--setenv',
        'PATH',
        '/usr/bin:/bin',
        '--setenv',
        'HOME',
        '/tmp',
        '--setenv',
        'LANG',
        'C.UTF-8',
        '--setenv',
        'GIT_CONFIG_NOSYSTEM',
        '1',
        '--setenv',
        'GIT_CONFIG_GLOBAL',
        '/dev/null',
        '--setenv',
        'GIT_TERMINAL_PROMPT',
        '0',
        ...mounts,
        '--tmpfs',
        '/tmp',
        '--proc',
        '/proc',
        '--dev',
        '/dev',
        '--bind-fd',
        '3',
        '/workspace',
        '--chdir',
        '/workspace',
        '--',
        '/usr/bin/git',
        ...flags,
        ...identity,
        ...args,
      ],
      fd,
      signal,
    );
  } catch {
    workspaceFailure(
      'GIT_MUTATION_UNAVAILABLE',
      'The isolated Git operation failed. Bubblewrap with user namespaces is required; no unsafe host fallback was attempted.',
    );
  }
}
export async function identity(cwd: string, signal: AbortSignal) {
  const result: string[] = [];
  for (const field of ['name', 'email']) {
    try {
      const { stdout } = await exec(
        'git',
        ['config', '--includes', '--get', `user.${field}`],
        {
          cwd,
          signal,
          timeout: 5000,
          maxBuffer: 4096,
          env: {
            PATH: process.env['PATH'],
            HOME: process.env['HOME'],
            GIT_CONFIG_NOSYSTEM: '1',
          },
        },
      );
      const value = stdout.trim();
      if (!value || value.length > 256 || /[\r\n\0]/.test(value))
        throw new Error('Invalid identity');
      result.push('-c', `user.${field}=${value}`);
    } catch {
      workspaceFailure(
        'GIT_IDENTITY_REQUIRED',
        'Configure Git user.name and user.email before committing.',
      );
    }
  }
  return result;
}
