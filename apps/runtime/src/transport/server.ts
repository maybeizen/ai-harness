import {
  runtimeOperationSchema,
  PROTOCOL_VERSION,
  type GenerationInput,
  type ChatModel,
  type AppError,
} from '@harness/contracts';
import { providerError, ProviderFailure } from '@harness/providers';
import type { ChatService, RuntimeAuth } from '../chat/service';
import { storageFailure, type Repository } from '../storage/repository';
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
      if (request.method === 'storage') {
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
            .then(() => this.generate(input, auth, controller))
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
      await this.reply(request.id, false, undefined, providerError(error));
    }
    return false;
  }
  private async generate(
    input: GenerationInput,
    auth: RuntimeAuth,
    controller: AbortController,
  ) {
    let sequence = 0;
    let internalFailure = false;
    let internalCause: unknown;
    const identity = {
      generationId: input.generationId,
      conversationId: input.conversationId,
    };
    try {
      if (!controller.signal.aborted)
        for await (const text of this.service.stream(input, auth, controller)) {
          if (controller.signal.aborted) break;
          try {
            for (let i = 0; i < text.length; i += 8192) {
              this.repository?.progress(
                input,
                text.slice(i, i + 8192),
                'streaming',
              );
              await this.send({
                version: PROTOCOL_VERSION,
                event: {
                  ...identity,
                  sequence: sequence++,
                  type: 'text',
                  text: text.slice(i, i + 8192),
                },
              });
            }
          } catch (error) {
            // Abort before for-await invokes return(): upstream cleanup may await abort.
            internalFailure = true;
            internalCause = error;
            controller.abort();
            throw error;
          }
        }
      this.repository?.progress(
        input,
        '',
        controller.signal.aborted ? 'stopped' : 'completed',
      );
      await this.send({
        version: PROTOCOL_VERSION,
        event: {
          ...identity,
          sequence: sequence++,
          type: 'done',
          status: controller.signal.aborted ? 'cancelled' : 'completed',
        },
      });
    } catch (error) {
      let detail = providerError(internalFailure ? internalCause : error);
      let cancelled = controller.signal.aborted && !internalFailure;
      try {
        this.repository?.progress(input, '', cancelled ? 'stopped' : 'error');
      } catch (failure) {
        detail = providerError(failure);
        cancelled = false;
      }
      if (cancelled) {
        await this.send({
          version: PROTOCOL_VERSION,
          event: { ...identity, sequence, type: 'done', status: 'cancelled' },
        });
      } else {
        if (detail.code === 'MODEL_UNAVAILABLE') {
          const model = this.catalogs
            .get(input.connectionId)
            ?.find((model) => model.id === input.modelId);
          if (model) model.available = false;
        }
        await this.send({
          version: PROTOCOL_VERSION,
          event: { ...identity, sequence, type: 'error', error: detail },
        });
      }
    }
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
    await Promise.allSettled(
      [...this.tasks.values()].map((task) => task.settled),
    );
  }
}
