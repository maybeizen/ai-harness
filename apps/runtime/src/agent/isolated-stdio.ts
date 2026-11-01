import { spawn } from 'node:child_process';
import { constants } from 'node:fs';
import { open, realpath } from 'node:fs/promises';
import { isAbsolute } from 'node:path';
import { AgentFailure } from './permissions';
import { baseArguments } from './isolation-profile';
import type { IsolatedStdio } from './toolbox';
const environment = { PATH: '/usr/bin:/bin', LANG: 'C.UTF-8' };
export async function startIsolatedStdio(
  binary: string,
  input: { command: string; args: string[]; timeoutMs: number; root: string },
  signal: AbortSignal,
): Promise<IsolatedStdio> {
  signal.throwIfAborted();
  if (
    !input.command ||
    input.command.length > 4096 ||
    input.command.includes('\0') ||
    input.args.length > 32 ||
    input.args.some((arg) => arg.length > 4096 || arg.includes('\0')) ||
    !Number.isInteger(input.timeoutMs) ||
    input.timeoutMs < 1000 ||
    input.timeoutMs > 60000 ||
    !isAbsolute(input.root)
  )
    throw new AgentFailure(
      'INVALID_REQUEST',
      'Invalid isolated MCP process request.',
    );
  const canonical = await realpath(input.root);
  if (canonical !== input.root)
    throw new AgentFailure(
      'WORKSPACE_UNAVAILABLE',
      'The workspace directory identity changed.',
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
    signal.throwIfAborted();
    const child = spawn(
      binary,
      [
        ...baseArguments(),
        '--bind-fd',
        '3',
        '/workspace',
        '--chdir',
        '/workspace',
        '--',
        input.command,
        ...input.args,
      ],
      {
        env: environment,
        stdio: ['pipe', 'pipe', 'ignore', handle.fd],
      },
    );
    await new Promise<void>((resolve, reject) => {
      child.once('error', () =>
        reject(
          new AgentFailure(
            'ISOLATION_UNAVAILABLE',
            'The isolated MCP process could not start. No host process was started.',
          ),
        ),
      );
      child.once('spawn', () => resolve());
    });
    if (!child.stdin || !child.stdout)
      throw new AgentFailure(
        'ISOLATION_UNAVAILABLE',
        'The isolated MCP process could not start. No host process was started.',
      );
    const abort = () => child.kill('SIGKILL');
    signal.addEventListener('abort', abort, { once: true });
    let released = false;
    const release = async () => {
      if (released) return;
      released = true;
      signal.removeEventListener('abort', abort);
      child.kill('SIGKILL');
      await handle.close();
    };
    child.once('close', () => {
      void release();
    });
    return { stdin: child.stdin, stdout: child.stdout, close: release };
  } catch (error) {
    await handle.close();
    throw error;
  }
}
