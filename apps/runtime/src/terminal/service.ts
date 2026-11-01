import { randomUUID } from 'node:crypto';
import { spawn, type IPty } from 'node-pty';
import {
  terminalOperationSchema,
  type TerminalOperation,
  type TerminalPoll,
  type TerminalSummary,
} from '@harness/contracts';
import type { Workspaces } from '../workspaces/service';
import { TerminalOutput } from './output';
import {
  namespaceArguments,
  shellProgram,
  terminalEnvironment,
  terminalFailure,
  verifyTerminalSupport,
} from './process';
interface Session {
  summary: TerminalSummary;
  pty: IPty;
  output: TerminalOutput;
  settled: Promise<void>;
  dispose: () => void;
  stopping?: Promise<void>;
}
export class TerminalService {
  private sessions = new Map<string, Session>();
  private opening = 0;
  private closing = false;
  private readiness: Promise<void> | undefined;
  private pending = new Set<Promise<unknown>>();
  constructor(
    private workspaces: Pick<Workspaces, 'get'>,
    private bwrap = '/usr/bin/bwrap',
  ) {}
  async dispatch(candidate: TerminalOperation): Promise<unknown> {
    const parsed = terminalOperationSchema.safeParse(candidate);
    if (!parsed.success)
      terminalFailure('INVALID_REQUEST', 'The terminal operation is invalid.');
    if (this.closing)
      terminalFailure('UNAVAILABLE', 'The terminal service is shutting down.');
    const operation = this.run(parsed.data);
    this.pending.add(operation);
    try {
      return await operation;
    } finally {
      this.pending.delete(operation);
    }
  }
  private async run(operation: TerminalOperation): Promise<unknown> {
    if (operation.action === 'create') return this.create(operation);
    if (operation.action === 'list')
      return [...this.sessions.values()].map((session) => ({
        ...session.summary,
      }));
    const session = this.sessions.get(operation.id);
    if (!session)
      terminalFailure(
        'NOT_FOUND',
        'This terminal has closed. Open a new terminal.',
      );
    if (operation.action === 'poll') {
      try {
        return {
          ...session.output.poll(operation.cursor, operation.limit),
          id: session.summary.id,
          status: session.summary.status,
          exitCode: session.summary.exitCode,
          signal: session.summary.signal,
        } satisfies TerminalPoll;
      } catch {
        terminalFailure(
          'INVALID_REQUEST',
          'The terminal output cursor is invalid. Reload the terminal.',
        );
      }
    }
    if (operation.action === 'kill') {
      await this.stop(session);
      session.dispose();
      this.sessions.delete(operation.id);
      return null;
    }
    if (session.summary.status !== 'running')
      terminalFailure(
        'TERMINAL_EXITED',
        'This terminal process has exited. Open a new terminal.',
      );
    try {
      if (operation.action === 'write') session.pty.write(operation.data);
      else session.pty.resize(operation.cols, operation.rows);
      return null;
    } catch {
      terminalFailure(
        'TERMINAL_ERROR',
        'The terminal could not receive this operation.',
      );
    }
  }
  private async create(
    operation: Extract<TerminalOperation, { action: 'create' }>,
  ) {
    if (this.sessions.size + this.opening >= 6)
      terminalFailure(
        'BUSY',
        'Close a terminal tab before opening another. Six terminal tabs are allowed.',
      );
    this.opening++;
    try {
      const directory = await this.workspaces.get(operation.workspaceId);
      this.readiness ??= verifyTerminalSupport(this.bwrap).catch((error) => {
        this.readiness = undefined;
        throw error;
      });
      await this.readiness;
      if (this.closing)
        terminalFailure(
          'UNAVAILABLE',
          'The terminal service is shutting down.',
        );
      const program = shellProgram(operation.shell);
      let pty: IPty;
      try {
        pty = spawn(
          this.bwrap,
          [
            ...namespaceArguments,
            '--chdir',
            directory.path,
            '--',
            program,
            ...(program.endsWith('bash')
              ? ['--noprofile', '--norc', '-i']
              : ['-i']),
          ],
          {
            name: 'xterm-256color',
            cols: operation.cols,
            rows: operation.rows,
            cwd: directory.path,
            env: { ...terminalEnvironment(), SHELL: program },
            encoding: 'utf8',
          },
        );
      } catch {
        terminalFailure(
          'TERMINAL_ERROR',
          'The interactive shell could not start.',
        );
      }
      const summary: TerminalSummary = {
        id: randomUUID(),
        workspaceId: directory.id,
        label: directory.name.slice(0, 256),
        pid: pty.pid,
        status: 'running',
        exitCode: null,
        signal: null,
        createdAt: Date.now(),
      };
      let settle!: () => void;
      const settled = new Promise<void>((resolve) => {
        settle = resolve;
      });
      const output = new TerminalOutput();
      const data = pty.onData((value) => output.append(value));
      const exit = pty.onExit((event) => {
        summary.status = 'exited';
        summary.exitCode = event.exitCode;
        summary.signal = event.signal ?? null;
        settle();
      });
      const session: Session = {
        summary,
        pty,
        output,
        settled,
        dispose: () => {
          data.dispose();
          exit.dispose();
        },
      };
      this.sessions.set(summary.id, session);
      return { ...summary };
    } finally {
      this.opening--;
    }
  }
  private stop(session: Session): Promise<void> {
    if (session.stopping) return session.stopping;
    session.stopping = (async () => {
      if (session.summary.status === 'exited') return;
      const wait = async (milliseconds: number) => {
        let timeout: ReturnType<typeof setTimeout> | undefined;
        const done = await Promise.race([
          session.settled.then(() => true),
          new Promise<boolean>((resolve) => {
            timeout = setTimeout(() => resolve(false), milliseconds);
          }),
        ]);
        clearTimeout(timeout);
        return done;
      };
      try {
        session.pty.kill('SIGHUP');
      } catch {
        /* It may already have exited. */
      }
      if (await wait(1000)) return;
      try {
        session.pty.kill('SIGKILL');
      } catch {
        /* Exit notification can arrive shortly after kill. */
      }
      if (!(await wait(1000)))
        terminalFailure(
          'TERMINAL_ERROR',
          'The terminal could not be stopped. Retry before closing.',
        );
    })().finally(() => {
      delete session.stopping;
    });
    return session.stopping;
  }
  async close() {
    this.closing = true;
    await Promise.allSettled([...this.pending]);
    await Promise.all(
      [...this.sessions.values()].map((session) => this.stop(session)),
    );
    for (const session of this.sessions.values()) session.dispose();
    this.sessions.clear();
  }
}
