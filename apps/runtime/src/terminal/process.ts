import { execFile } from 'node:child_process';
import { homedir, userInfo } from 'node:os';
import { ProviderFailure } from '@harness/providers';
export function terminalFailure(code: string, message: string): never {
  throw new ProviderFailure({ code, message });
}
export const namespaceArguments = [
  '--unshare-pid',
  '--die-with-parent',
  '--bind',
  '/',
  '/',
  '--proc',
  '/proc',
  '--dev',
  '/dev',
];
export function shellProgram(shell: string) {
  if (shell === '') return '/bin/bash';
  if (
    !shell.startsWith('/') ||
    shell.includes('..') ||
    !/^\/[A-Za-z0-9_./-]{1,255}$/.test(shell)
  )
    terminalFailure(
      'INVALID_REQUEST',
      'Choose a shell by its absolute path, or leave the field empty for /bin/bash.',
    );
  return shell;
}
export function terminalEnvironment(): Record<string, string> {
  const user = userInfo().username;
  return {
    PATH: '/usr/local/bin:/usr/bin:/bin',
    HOME: homedir(),
    USER: user,
    LOGNAME: user,
    LANG: 'C.UTF-8',
    TERM: 'xterm-256color',
    COLORTERM: 'truecolor',
    SHELL: '/bin/bash',
    PS1: '\\u@\\h:\\w\\$ ',
    PROMPT_COMMAND: '',
    HISTFILE: '/dev/null',
    HISTSIZE: '1000',
    HISTFILESIZE: '0',
  };
}
export async function verifyTerminalSupport(bwrap: string) {
  if (process.platform !== 'linux')
    terminalFailure(
      'UNAVAILABLE',
      'Integrated terminals currently require Linux.',
    );
  await new Promise<void>((resolve, reject) => {
    execFile(
      bwrap,
      [...namespaceArguments, '--', '/usr/bin/true'],
      {
        timeout: 3000,
        killSignal: 'SIGKILL',
        maxBuffer: 4096,
        env: terminalEnvironment(),
      },
      (error) => {
        if (error)
          reject(
            new ProviderFailure({
              code: 'UNAVAILABLE',
              message:
                'The required Linux process namespace could not start. Install bubblewrap and enable user namespaces; no terminal was opened.',
            }),
          );
        else resolve();
      },
    );
  });
}
