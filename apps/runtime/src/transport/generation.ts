import {
  PROTOCOL_VERSION,
  type GenerationInput,
  type ChatModel,
} from '@harness/contracts';
import { providerError } from '@harness/providers';
import type { ChatService, RuntimeAuth } from '../chat/service';
import { visionOutbound } from '../chat/vision';
import type { Repository } from '../storage/repository';
interface Dependencies {
  service: ChatService;
  send: (value: unknown) => Promise<void>;
  repository: Repository | undefined;
  catalogs: Map<string, ChatModel[]>;
}
export async function streamGeneration(
  input: GenerationInput,
  auth: RuntimeAuth,
  controller: AbortController,
  dependencies: Dependencies,
) {
  let sequence = 0;
  let internalFailure = false;
  let internalCause: unknown;
  const identity = {
    generationId: input.generationId,
    conversationId: input.conversationId,
  };
  try {
    const model = dependencies.catalogs
      .get(input.connectionId)
      ?.find((item) => item.id === input.modelId);
    const prepared = visionOutbound(
      dependencies.repository,
      input,
      model?.capabilities,
    );
    if (!controller.signal.aborted)
      for await (const text of dependencies.service.stream(
        prepared.outbound,
        auth,
        controller,
        dependencies.repository?.projectInstructions(input.conversationId) ??
          '',
        prepared.images,
        prepared.vision,
      )) {
        if (controller.signal.aborted) break;
        try {
          for (let i = 0; i < text.length; i += 8192) {
            dependencies.repository?.progress(
              input,
              text.slice(i, i + 8192),
              'streaming',
            );
            await dependencies.send({
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
    dependencies.repository?.progress(
      input,
      '',
      controller.signal.aborted ? 'stopped' : 'completed',
    );
    await dependencies.send({
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
      dependencies.repository?.progress(
        input,
        '',
        cancelled ? 'stopped' : 'error',
      );
    } catch (failure) {
      detail = providerError(failure);
      cancelled = false;
    }
    if (cancelled) {
      await dependencies.send({
        version: PROTOCOL_VERSION,
        event: { ...identity, sequence, type: 'done', status: 'cancelled' },
      });
    } else {
      if (detail.code === 'MODEL_UNAVAILABLE') {
        const model = dependencies.catalogs
          .get(input.connectionId)
          ?.find((model) => model.id === input.modelId);
        if (model) model.available = false;
      }
      await dependencies.send({
        version: PROTOCOL_VERSION,
        event: { ...identity, sequence, type: 'error', error: detail },
      });
    }
  }
}
