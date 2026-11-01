import { spawn } from 'node:child_process';
import { constants } from 'node:fs';
import { open, realpath, opendir, lstat } from 'node:fs/promises';
import type { FileHandle } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';
import { AgentFailure } from './permissions';
import { sensitive } from './paths';
import { baseArguments } from './isolation-profile';
import { startIsolatedStdio } from './isolated-stdio';
import type { IsolatedExecutor, IsolatedStdio } from './toolbox';
interface ProcessOutput {
  stdout: string;
  stderr: string;
  exitCode: number;
  durationMs: number;
}
interface Mask {
  path: string;
  directory: boolean;
}
const environment = { PATH: '/usr/bin:/bin', LANG: 'C.UTF-8' };
const OUTPUT_LIMIT = 131072;
async function masks(root: FileHandle, signal: AbortSignal): Promise<Mask[]> {
  const queue = [''];
  const results: Mask[] = [];
  let visited = 0;
  const deadline = Date.now() + 5000;
  while (queue.length) {
    signal.throwIfAborted();
    if (Date.now() > deadline)
      throw new AgentFailure(
        'WORKSPACE_LIMIT',
        'Sensitive-file scanning exceeded five seconds. Narrow the workspace before running commands.',
      );
    const relative = queue.shift()!;
    const directory = await opendir(join(`/proc/self/fd/${root.fd}`, relative));
    for await (const item of directory) {
      signal.throwIfAborted();
      if (++visited > 50000 || Date.now() > deadline)
        throw new AgentFailure(
          'WORKSPACE_LIMIT',
          'The workspace exceeds the sensitive-file scan limit. Choose a smaller directory.',
        );
      const path = relative ? `${relative}/${item.name}` : item.name;
      if (
        sensitive(path) ||
        (!item.isDirectory() && !item.isFile() && !item.isSymbolicLink())
      ) {
        const stat = await lstat(join(`/proc/self/fd/${root.fd}`, path));
        if (stat.isSymbolicLink())
          throw new AgentFailure(
            'PERMISSION_DENIED',
            'A protected file is a symbolic link. Commands are disabled for this workspace.',
          );
        results.push({ path, directory: stat.isDirectory() });
      } else if (item.isDirectory()) queue.push(path);
      // Symlink directories are never followed; outside roots are not mounted.
    }
  }
  return results;
}
export class LinuxExecutor implements IsolatedExecutor {
  readonly isolated = true as const;
  private verified: Promise<void> | undefined;
  constructor(private binary = '/usr/bin/bwrap') {}
  async probe() {
    if (process.platform !== 'linux')
      throw new AgentFailure(
        'ISOLATION_UNAVAILABLE',
        'Isolated commands currently require Linux and bubblewrap.',
      );
    this.verified ??= this.launch(
      [
        ...baseArguments(),
        '--',
        '/bin/sh',
        '-c',
        'test -d /proc/1 && test -d "$HOME"',
      ],
      2000,
      new AbortController().signal,
    )
      .then((result) => {
        if (result.exitCode !== 0)
          throw new AgentFailure(
            'ISOLATION_UNAVAILABLE',
            'Bubblewrap cannot create the required namespaces on this host. No command was run outside isolation.',
          );
      })
      .catch(() => {
        this.verified = undefined;
        throw new AgentFailure(
          'ISOLATION_UNAVAILABLE',
          'Bubblewrap or required Linux namespaces are unavailable. No host-shell fallback is allowed.',
        );
      });
    await this.verified;
  }
  async openStdio(
    input: { command: string; args: string[]; timeoutMs: number; root: string },
    signal: AbortSignal,
  ): Promise<IsolatedStdio> {
    signal.throwIfAborted();
    await this.probe();
    signal.throwIfAborted();
    return startIsolatedStdio(this.binary, input, signal);
  }
  async execute(
    input: { command: string; timeoutMs: number; root: string },
    signal: AbortSignal,
  ): Promise<ProcessOutput> {
    signal.throwIfAborted();
    if (
      !input.command ||
      input.command.length > 4096 ||
      !Number.isInteger(input.timeoutMs) ||
      input.timeoutMs < 100 ||
      input.timeoutMs > 60000 ||
      !isAbsolute(input.root)
    )
      throw new AgentFailure(
        'INVALID_REQUEST',
        'Invalid isolated command request.',
      );
    await this.probe();
    signal.throwIfAborted();
    const canonical = await realpath(input.root);
    if (canonical !== input.root)
      throw new AgentFailure(
        'WORKSPACE_UNAVAILABLE',
        'The workspace directory identity changed. Reopen it before running commands.',
      );
    const handle = await open(
      canonical,
      constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW,
    );
    try {
      if ((await realpath(`/proc/self/fd/${handle.fd}`)) !== canonical)
        throw new AgentFailure(
          'WORKSPACE_UNAVAILABLE',
          'The approved workspace moved.',
        );
      const protectedPaths = await masks(handle, signal);
      if ((await realpath(`/proc/self/fd/${handle.fd}`)) !== canonical)
        throw new AgentFailure(
          'WORKSPACE_UNAVAILABLE',
          'The workspace moved during permission scanning.',
        );
      const args = [...baseArguments(), '--bind-fd', '3', '/workspace'];
      for (const mask of protectedPaths) {
        const destination = `/workspace/${mask.path}`;
        if (mask.directory)
          args.push('--tmpfs', destination, '--remount-ro', destination);
        else args.push('--ro-bind', '/dev/null', destination);
      }
      args.push('--chdir', '/workspace', '--', '/bin/sh', '-c', input.command);
      const result = await this.launch(
        args,
        input.timeoutMs,
        signal,
        handle.fd,
      );
      if (result.exitCode !== 0)
        throw new AgentFailure(
          'COMMAND_FAILED',
          `Command exited with status ${result.exitCode}.\n${result.stdout.slice(-1800)}\n${result.stderr.slice(-1800)}`,
        );
      return result;
    } finally {
      await handle.close();
    }
  }
  private launch(
    args: string[],
    timeoutMs: number,
    signal: AbortSignal,
    workspaceFd?: number,
  ): Promise<ProcessOutput> {
    signal.throwIfAborted();
    return new Promise((resolve, reject) => {
      const started = Date.now();
      let stdout = Buffer.alloc(0);
      let stderr = Buffer.alloc(0);
      let failure: AgentFailure | undefined;
      const child = spawn(this.binary, args, {
        env: environment,
        stdio: [
          'ignore',
          'pipe',
          'pipe',
          ...(workspaceFd === undefined ? [] : [workspaceFd]),
        ],
      });
      const terminate = (error: AgentFailure) => {
        failure ??= error;
        child.kill('SIGKILL');
      };
      const abort = () =>
        terminate(
          new AgentFailure('CANCELLED', 'The isolated command was cancelled.'),
        );
      const timeout = setTimeout(
        () =>
          terminate(
            new AgentFailure(
              'TIMEOUT',
              'The isolated command exceeded its time limit.',
            ),
          ),
        timeoutMs,
      );
      timeout.unref();
      signal.addEventListener('abort', abort, { once: true });
      if (signal.aborted) abort();
      const capture = (data: Buffer, kind: 'stdout' | 'stderr') => {
        if (stdout.length + stderr.length + data.length > OUTPUT_LIMIT) {
          terminate(
            new AgentFailure(
              'OUTPUT_LIMIT',
              'The isolated command exceeded 128 KiB of output.',
            ),
          );
          return;
        }
        if (kind === 'stdout') stdout = Buffer.concat([stdout, data]);
        else stderr = Buffer.concat([stderr, data]);
      };
      child.stdout?.on('data', (data: Buffer) => capture(data, 'stdout'));
      child.stderr?.on('data', (data: Buffer) => capture(data, 'stderr'));
      child.once('error', () => {
        failure ??= new AgentFailure(
          'ISOLATION_UNAVAILABLE',
          'The isolated command process could not start.',
        );
      });
      child.once('close', (code) => {
        clearTimeout(timeout);
        signal.removeEventListener('abort', abort);
        if (failure) reject(failure);
        else
          resolve({
            stdout: stdout.toString('utf8'),
            stderr: stderr.toString('utf8'),
            exitCode: code ?? -1,
            durationMs: Date.now() - started,
          });
      });
    });
  }
}
