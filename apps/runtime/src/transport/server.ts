import type { Workstation } from '../workstation/service';
import type { TerminalService } from '../terminal/service';
import {
  runtimeOperationSchema,
  PROTOCOL_VERSION,
  type ChatModel,
  type AppError,
} from '@harness/contracts';
import { providerError, ProviderFailure } from '@harness/providers';
import type { ChatService } from '../chat/service';
import { storageFailure, type Repository } from '../storage/repository';
import type { Workspaces } from '../workspaces/service';
import type { AgentService } from '../agent/service';
import { AgentFailure } from '../agent/permissions';
import { streamGeneration } from './generation';
interface Task {
  controller: AbortController;
  conversationId: string;
  settled: Promise<void>;
}
export class RuntimeServer {
  private tasks = new Map<string, Task>();
  private cancelledStarts = new Set<string>();
  private catalogs = new Map<string, ChatModel[]>();
  private closing = false;
  constructor(
    private service: ChatService,
    private send: (value: unknown) => Promise<void>,
    private repository?: Repository,
    private workspaces?: Workspaces,
    private agents?: AgentService,
    private terminals?: TerminalService,
    private workstation?: Workstation,
  ) {}
  async handle(line: string): Promise<boolean> {
    let raw: unknown;
    try {
      raw = JSON.parse(line);
    } catch {
      raw = null;
    }
    const parsed = runtimeOperationSchema.safeParse(raw);
    if (!parsed.success) {
      const candidate =
        raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
      const id =
        typeof candidate['id'] === 'string'
          ? candidate['id'].slice(0, 128)
          : '';
      await this.reply(id, false, undefined, {
        code:
          candidate['version'] !== undefined &&
          candidate['version'] !== PROTOCOL_VERSION
            ? 'VERSION_MISMATCH'
            : 'INVALID_REQUEST',
        message: 'Request rejected',
      });
      return false;
    }
    const request = parsed.data;
    try {
      if (request.method === 'shutdown') {
        this.closing = true;
        await this.close();
        await this.reply(request.id, true, {
          status: 'ready',
          protocol: PROTOCOL_VERSION,
          storage: 'ready',
        });
        return true;
      }
      if (request.method === 'hello' || request.method === 'health') {
        await this.reply(request.id, true, {
          status: 'ready',
          protocol: PROTOCOL_VERSION,
          storage: 'ready',
        });
        return false;
      }
      if (this.closing) throw new Error('Closing');
      if (request.method === 'terminal') {
        if (!this.terminals)
          throw new ProviderFailure({
            code: 'UNAVAILABLE',
            message: 'The terminal service is unavailable.',
          });
        await this.reply(
          request.id,
          true,
          await this.terminals.dispatch(request.params),
        );
      } else if (request.method === 'agent') {
        if (!this.agents)
          throw new AgentFailure(
            'UNAVAILABLE',
            'Agent services are unavailable.',
          );
        await this.reply(
          request.id,
          true,
          await this.agents.dispatch(request.params),
        );
      } else if (request.method === 'workspace') {
        if (!this.workspaces)
          throw new ProviderFailure({
            code: 'UNAVAILABLE',
            message: 'Workspace services are unavailable.',
          });
        await this.reply(
          request.id,
          true,
          await this.workspaces.dispatch(request.params),
        );
      } else if (request.method === 'workstation') {
        if (!this.workstation)
          throw new ProviderFailure({
            code: 'UNAVAILABLE',
            message: 'Workstation services are unavailable.',
          });
        const busy = [...this.tasks.values()].map(
          (task) => task.conversationId,
        );
        await this.reply(
          request.id,
          true,
          await this.workstation.dispatch(request.params, busy),
        );
      } else if (request.method === 'storage') {
        if (!this.repository) throw storageFailure();
        const operation = request.params;
        if (
          (operation.action === 'delete' || operation.action === 'update') &&
          [...this.tasks.values()].some(
            (task) => task.conversationId === operation.id,
          )
        )
          throw new ProviderFailure({
            code: 'BUSY',
            message: 'Stop the response before changing this conversation.',
          });
        await this.reply(request.id, true, this.repository.dispatch(operation));
      } else if (request.method === 'models') {
        const models = await this.service.models(
          request.params.connectionId,
          request.params,
        );
        this.catalogs.set(request.params.connectionId, models);
        await this.reply(request.id, true, models);
      } else if (request.method === 'cancel') {
        const id = request.params.generationId;
        if (!id || id.length > 128)
          throw new ProviderFailure({
            code: 'INVALID_REQUEST',
            message: 'Invalid generation identifier.',
          });
        const task = this.tasks.get(id);
        if (!task && !this.cancelledStarts.has(id)) {
          if (this.cancelledStarts.size >= 1024)
            throw new ProviderFailure({
              code: 'BUSY',
              message:
                'Cancellation tracking is full. Restart the application before starting more responses.',
            });
          // Never expire or evict: native authentication can delay generate arbitrarily.
          this.cancelledStarts.add(id);
        }
        task?.controller.abort();
        if (task) await task.settled;
        await this.reply(request.id, true, null);
      } else if (request.method === 'generate') {
        const { input, ...auth } = request.params;
        if (this.cancelledStarts.has(input.generationId))
          throw new ProviderFailure({
            code: 'CANCELLED',
            message: 'This response was stopped before it started.',
          });
        if (this.tasks.size)
          throw new ProviderFailure({
            code: 'BUSY',
            message:
              'Stop the current response before sending another message.',
          });
        if (
          !this.catalogs
            .get(input.connectionId)
            ?.some((model) => model.id === input.modelId && model.available)
        )
          throw new ProviderFailure({
            code: 'MODEL_UNAVAILABLE',
            message: 'Refresh the model list and select an available model.',
          });
        this.repository?.begin(input);
        const controller = new AbortController();
        let release!: () => void;
        const acknowledged = new Promise<void>((resolve) => {
          release = resolve;
        });
        const task: Task = {
          controller,
          conversationId: input.conversationId,
          settled: acknowledged
            .then(() =>
              streamGeneration(input, auth, controller, {
                service: this.service,
                send: this.send,
                repository: this.repository,
                catalogs: this.catalogs,
              }),
            )
            .finally(() => this.tasks.delete(input.generationId)),
        };
        this.tasks.set(input.generationId, task);
        try {
          await this.reply(request.id, true, null);
        } catch (error) {
          controller.abort();
          throw error;
        } finally {
          release();
        }
      }
    } catch (error) {
      await this.reply(
        request.id,
        false,
        undefined,
        error instanceof AgentFailure
          ? { code: error.code, message: error.message }
          : providerError(error),
      );
    }
    return false;
  }

  private reply(id: string, ok: boolean, result?: unknown, error?: AppError) {
    return this.send({
      version: PROTOCOL_VERSION,
      id,
      ok,
      ...(ok ? { result } : { error }),
    });
  }
  async close() {
    this.closing = true;
    for (const task of this.tasks.values()) task.controller.abort();
    await this.terminals?.close();
    await this.agents?.close();
    await this.workspaces?.close();
    await Promise.allSettled(
      [...this.tasks.values()].map((task) => task.settled),
    );
  }
}
