import type Database from 'better-sqlite3';
import {
  agentOperationSchema,
  type AgentOperation,
  type AgentEvent,
} from '@harness/contracts';
import type { Workspaces } from '../workspaces/service';
import type { AgentRequest } from '@harness/contracts';
import { AgentPersistence } from './persistence';
import { AgentSessions } from './sessions';
import type { Mcps } from '../mcp/service';
import { Toolbox, type IsolatedExecutor } from './toolbox';
import { ApprovalQueue } from './approval-queue';
import { AgentFailure } from './permissions';
import { PathLocks } from './paths';
import { CheckpointStore } from './checkpoint';
import { PatchStore } from './patch-store';
import { readPatch, rollbackPatch } from './patch';
import type { AgentOptions } from './types';
export class AgentService {
  private persistence: AgentPersistence;
  private sessions = new AgentSessions(3);
  private toolbox: Toolbox;
  private approvals = new ApprovalQueue();
  private checkpoints: CheckpointStore;
  private patches: PatchStore;
  private locks = new PathLocks();
  private tasks = new Map<string, Promise<void>>();
  private failures = new Map<string, AgentFailure>();
  private closing = false;
  constructor(
    db: Database.Database,
    private workspaces: Workspaces,
    private turn?: AgentOptions['turn'],
    executor?: IsolatedExecutor,
    mcps?: Mcps,
  ) {
    this.persistence = new AgentPersistence(db);
    this.checkpoints = new CheckpointStore(db);
    this.patches = new PatchStore(db);
    this.toolbox = new Toolbox(
      workspaces,
      executor,
      this.locks,
      this.patches,
      mcps,
    );
  }
  private emit(parentId: string, event: AgentEvent) {
    if (event.type === 'text') {
      for (let offset = 0; offset < event.text.length; offset += 8192)
        this.persistence.append(parentId, {
          ...event,
          text: event.text.slice(offset, offset + 8192),
        });
    } else this.persistence.append(parentId, event);
    return Promise.resolve();
  }
  async dispatch(candidate: AgentOperation): Promise<unknown> {
    const operation = agentOperationSchema.parse(candidate);
    if (this.closing)
      throw new AgentFailure('UNAVAILABLE', 'The agent runtime is closing.');
    if (operation.action === 'reserve') {
      await this.workspaces.get(operation.request.workspaceId);
      this.persistence.reserve(operation.request);
      return null;
    }
    if (operation.action === 'start') return this.start(operation);
    if (operation.action === 'resume') return this.resume(operation);
    if (operation.action === 'patch.list')
      return this.patches.list(operation.workspaceId);
    if (operation.action === 'patch.read') {
      const directory = await this.workspaces.get(operation.workspaceId);
      return readPatch(
        directory.path,
        operation.workspaceId,
        operation.path,
        this.patches,
      );
    }
    if (operation.action === 'patch.accept') {
      this.patches.remove(operation.workspaceId, operation.path);
      return null;
    }
    if (operation.action === 'patch.rollback') {
      const directory = await this.workspaces.get(operation.workspaceId);
      return rollbackPatch({
        root: directory.path,
        workspaceId: operation.workspaceId,
        path: operation.path,
        signal: new AbortController().signal,
        locks: this.locks,
        store: this.patches,
      });
    }
    if (operation.action === 'poll') {
      const failure = this.failures.get(operation.id);
      if (failure) throw failure;
      return this.persistence.poll(operation.id, operation.after);
    }
    if (operation.action === 'list') return this.persistence.list();
    if (operation.action === 'approve') {
      this.approvals.decide(operation.decision);
      return null;
    }
    const saved = this.persistence.get(operation.id);
    if (saved?.status === 'running') {
      this.sessions.cancel(operation.id);
      await this.tasks.get(operation.id);
      const failure = this.failures.get(operation.id);
      if (failure) throw failure;
    } else if (saved?.status === 'resumable')
      this.persistence.append(operation.id, {
        type: 'status',
        sessionId: operation.id,
        status: 'cancelled',
        step: this.checkpoints.load(operation.id)?.step ?? 0,
        message: 'The interrupted task was cancelled.',
      });
    else if (!saved || saved.status === 'reserved')
      this.persistence.cancelBeforeStart(operation.id);
    return null;
  }
  private endpoint(connectionId: string, baseURL?: string) {
    if (connectionId === 'custom' && !baseURL)
      throw new AgentFailure(
        'INVALID_REQUEST',
        'Enter an HTTP or HTTPS endpoint without credentials.',
      );
  }
  private start(operation: Extract<AgentOperation, { action: 'start' }>) {
    const saved = this.persistence.get(operation.id);
    if (!saved?.request || saved.status !== 'reserved')
      throw new AgentFailure(
        saved?.status === 'cancelled' ? 'CANCELLED' : 'INVALID_REQUEST',
        'The task was cancelled or is not reserved.',
      );
    this.endpoint(operation.connectionId, operation.baseURL);
    return this.launch(saved.request, operation, null);
  }
  private resume(operation: Extract<AgentOperation, { action: 'resume' }>) {
    const saved = this.persistence.get(operation.id);
    if (!saved?.request || saved.status !== 'resumable')
      throw new AgentFailure(
        'INVALID_REQUEST',
        'This task cannot be continued.',
      );
    this.endpoint(operation.connectionId, operation.baseURL);
    return this.launch(
      saved.request,
      operation,
      this.checkpoints.load(operation.id),
    );
  }
  private launch(
    request: AgentRequest,
    operation: {
      connectionId: AgentOptions['kind'];
      modelId: string;
      credential: string;
      baseURL?: string | undefined;
    },
    checkpoint: ReturnType<CheckpointStore['load']>,
  ) {
    const context = this.persistence.projectInstructions(
      request.conversationId,
      request.workspaceId,
    );
    this.persistence.markRunning(request.id);
    let execution: ReturnType<AgentSessions['start']>;
    try {
      execution = this.sessions.start(request, {
        kind: operation.connectionId,
        modelId: operation.modelId,
        credential: operation.credential,
        ...(operation.baseURL ? { baseURL: operation.baseURL } : {}),
        toolbox: this.toolbox,
        ...(checkpoint ? { checkpoint } : {}),
        onCheckpoint: (value) => {
          this.checkpoints.save(request.id, value);
          return Promise.resolve();
        },
        context,
        emit: (event) => this.emit(request.id, event),
        approve: (approval, signal) => this.approvals.wait(approval, signal),
        audit: (record) => {
          this.persistence.audit(record);
          return Promise.resolve();
        },
        ...(this.turn ? { turn: this.turn } : {}),
      });
    } catch (error) {
      this.persistence.append(request.id, {
        type: 'status',
        sessionId: request.id,
        status: 'error',
        step: 0,
        message:
          'The agent could not start. Check task capacity and try again.',
      });
      throw error;
    }
    const settled = execution
      .then(() => undefined)
      .catch(() => {
        this.sessions.cancel(request.id);
        const failure = new AgentFailure(
          'STORAGE_ERROR',
          'Agent execution or its history write failed. Review the task before retrying.',
        );
        this.failures.set(request.id, failure);
        if (this.failures.size > 100)
          this.failures.delete(this.failures.keys().next().value!);
        try {
          this.persistence.append(request.id, {
            type: 'status',
            sessionId: request.id,
            status: 'error',
            step: 0,
            message: failure.message,
          });
        } catch {
          /* Poll returns the explicit storage failure. */
        }
      })
      .finally(() => this.tasks.delete(request.id));
    this.tasks.set(request.id, settled);
    return null;
  }
  async close() {
    this.closing = true;
    this.approvals.close();
    await this.sessions.close();
    await Promise.allSettled([...this.tasks.values()]);
    for (const saved of this.persistence.list())
      if (saved.status === 'reserved')
        this.persistence.cancelBeforeStart(saved.id);
  }
}
