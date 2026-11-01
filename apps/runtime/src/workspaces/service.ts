import type Database from 'better-sqlite3';
import { realpath, stat } from 'node:fs/promises';
import { basename, isAbsolute } from 'node:path';
import { randomUUID } from 'node:crypto';
import {
  MAX_MESSAGE_BYTES,
  workspaceOperationSchema,
  type Directory,
  type WorkspaceOperation,
} from '@harness/contracts';
import { ProviderFailure } from '@harness/providers';
import { workspaceFailure } from './paths';
import { listFiles, readText, searchFiles } from './files';
import { gitDiff, gitSides, gitStatus } from './git';
import { gitStage, gitCommit } from './git-mutations';
interface SavedDirectory {
  id: string;
  name: string;
  path: string;
}
export class Workspaces {
  private operations = new Set<AbortController>();
  private closing = false;
  private pending = new Set<Promise<void>>();
  constructor(private db: Database.Database) {}
  private rows() {
    return this.db
      .prepare(
        'SELECT id,name,path FROM workspace_directories ORDER BY name,path',
      )
      .all() as SavedDirectory[];
  }
  private async availability(row: SavedDirectory): Promise<Directory> {
    let available = false;
    try {
      available =
        (await realpath(row.path)) === row.path &&
        (await stat(row.path)).isDirectory();
    } catch {
      /* Preserve missing registrations for reassociation rather than deleting data. */
    }
    return { ...row, available };
  }
  async get(id: string): Promise<Directory> {
    const row = this.db
      .prepare('SELECT id,name,path FROM workspace_directories WHERE id=?')
      .get(id) as SavedDirectory | undefined;
    if (!row)
      workspaceFailure(
        'WORKSPACE_NOT_FOUND',
        'This directory is not registered. Open it with the folder picker.',
      );
    const directory = await this.availability(row);
    if (!directory.available)
      workspaceFailure(
        'WORKSPACE_UNAVAILABLE',
        'This directory moved or is inaccessible. Open its current location.',
      );
    return directory;
  }
  private bounded<T>(value: T): T {
    if (Buffer.byteLength(JSON.stringify(value)) > MAX_MESSAGE_BYTES - 16384)
      workspaceFailure(
        'OUTPUT_LIMIT',
        'This workspace result exceeds the display limit. Choose a smaller folder or query.',
      );
    return value;
  }
  private async register(path: string) {
    if (!isAbsolute(path) || path.includes('\0'))
      workspaceFailure('INVALID_REQUEST', 'Choose an absolute directory path.');
    let canonical: string;
    try {
      canonical = await realpath(path);
      if (!(await stat(canonical)).isDirectory())
        throw new Error('Not directory');
    } catch {
      workspaceFailure(
        'WORKSPACE_UNAVAILABLE',
        'This directory does not exist or is inaccessible.',
      );
    }
    if (Buffer.byteLength(canonical) > 4096)
      workspaceFailure('INVALID_REQUEST', 'This directory path is too long.');
    const existing = this.db
      .prepare('SELECT id,name,path FROM workspace_directories WHERE path=?')
      .get(canonical) as SavedDirectory | undefined;
    if (existing) return this.availability(existing);
    const row = {
      id: randomUUID(),
      name: basename(canonical) || canonical,
      path: canonical,
    };
    this.bounded([...this.rows(), { ...row, available: true }]);
    this.db
      .prepare(
        'INSERT INTO workspace_directories(id,name,path) VALUES(?,?,?) ON CONFLICT(path) DO NOTHING',
      )
      .run(row.id, row.name, row.path);
    const saved = this.db
      .prepare('SELECT id,name,path FROM workspace_directories WHERE path=?')
      .get(canonical) as SavedDirectory;
    return this.availability(saved);
  }
  async dispatch(
    candidate: WorkspaceOperation,
    externalSignal?: AbortSignal,
  ): Promise<unknown> {
    if (this.closing)
      workspaceFailure('UNAVAILABLE', 'The workstation is shutting down.');
    const parsed = workspaceOperationSchema.safeParse(candidate);
    if (!parsed.success)
      workspaceFailure('INVALID_REQUEST', 'Invalid workspace operation.');
    if (this.operations.size >= 8)
      workspaceFailure('BUSY', 'Too many workspace operations are running.');
    const controller = new AbortController();
    const signal = externalSignal
      ? AbortSignal.any([controller.signal, externalSignal])
      : controller.signal;
    const result = (value: unknown) => {
      signal.throwIfAborted();
      return this.bounded(value);
    };
    this.operations.add(controller);
    let release!: () => void;
    const settled = new Promise<void>((resolve) => {
      release = resolve;
    });
    this.pending.add(settled);
    try {
      signal.throwIfAborted();
      const operation = parsed.data;
      if (operation.action === 'register')
        return result(await this.register(operation.path));
      if (operation.action === 'list') {
        const directories: Directory[] = [];
        for (const row of this.rows()) {
          signal.throwIfAborted();
          directories.push(await this.availability(row));
        }
        return result(directories);
      }
      const root = (await this.get(operation.id)).path;
      signal.throwIfAborted();
      if (operation.action === 'files')
        return result(await listFiles(root, operation.path));
      if (operation.action === 'read')
        return result(await readText(root, operation.path));
      if (operation.action === 'search')
        return result(await searchFiles(root, operation.query, signal));
      if (
        operation.action === 'git.stage' ||
        operation.action === 'git.unstage'
      )
        return result(
          await gitStage(
            root,
            operation.paths,
            operation.action === 'git.unstage',
            signal,
          ),
        );
      if (operation.action === 'git.commit')
        return result(await gitCommit(root, operation.message, signal));
      if (operation.action === 'git.status')
        return result(await gitStatus(root, signal));
      if (operation.action === 'git.sides')
        return result(
          await gitSides(root, operation.path, operation.staged, signal),
        );
      return result(await gitDiff(root, operation.staged, signal));
    } catch (error) {
      if (signal.aborted)
        workspaceFailure('CANCELLED', 'The workspace operation was cancelled.');
      if (error instanceof ProviderFailure) throw error;
      workspaceFailure(
        'WORKSPACE_ERROR',
        'The workspace operation failed. Check directory access and local storage.',
      );
    } finally {
      this.operations.delete(controller);
      this.pending.delete(settled);
      release();
    }
  }
  async close() {
    this.closing = true;
    for (const controller of this.operations) controller.abort();
    await Promise.allSettled([...this.pending]);
  }
}
