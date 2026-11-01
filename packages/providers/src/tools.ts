import {
  streamText,
  tool,
  isStepCount,
  type ModelMessage,
  type ToolSet,
  type FinishReason,
  type LanguageModelUsage,
} from 'ai';
import { z } from 'zod';
import {
  toolConnectionKinds,
  type ModelCapabilities,
  type ToolConnectionKind,
} from '@harness/contracts';
import { createModel } from './index';
import { modelCapabilities } from './capabilities';
import { connectionBase } from './endpoint';
import { providerError, ProviderFailure } from './errors';
export type ProviderMessage = ModelMessage;
export interface ProviderTool {
  name: string;
  description: string;
  inputSchema: z.ZodType;
}
export interface ProviderTurnInput {
  kind: ToolConnectionKind;
  modelId: string;
  credential: string;
  messages: ProviderMessage[];
  tools: ProviderTool[];
  signal: AbortSignal;
  maxOutputTokens?: number;
  baseURL?: string;
  capabilities?: ModelCapabilities;
}
export type ProviderTurnEvent =
  | { type: 'text'; text: string }
  | { type: 'call'; id: string; name: string; input: unknown }
  | {
      type: 'finish';
      reason: FinishReason;
      usage: LanguageModelUsage;
      messages: ProviderMessage[];
    };
const optionsSchema = z.object({
  kind: z.enum(toolConnectionKinds),
  modelId: z.string().min(1).max(256),
  credential: z.string().max(16384),
  maxOutputTokens: z.number().int().min(1).max(65536).optional(),
});
const descriptorSchema = z.object({
  name: z.string().regex(/^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/),
  description: z.string().min(1).max(4000),
});
function definitions(input: ProviderTool[]) {
  if (input.length > 64)
    throw new ProviderFailure({
      code: 'INVALID_REQUEST',
      message: 'Too many tools for one provider turn.',
    });
  const tools: ToolSet = Object.create(null) as ToolSet;
  const schemas = new Map<string, z.ZodType>();
  for (const definition of input) {
    const parsed = descriptorSchema.safeParse(definition);
    if (
      !parsed.success ||
      schemas.has(definition.name) ||
      !(definition.inputSchema instanceof z.ZodType)
    )
      throw new ProviderFailure({
        code: 'INVALID_REQUEST',
        message: 'Invalid or duplicate tool definition.',
      });
    schemas.set(definition.name, definition.inputSchema);
    // No execute callback: only the runtime can authorize and perform effects.
    tools[definition.name] = tool({
      description: definition.description,
      inputSchema: definition.inputSchema,
    });
  }
  return { tools, schemas };
}
/** One model turn. The caller owns approvals, effects, history and the outer loop. */
export async function* streamToolTurn(
  input: ProviderTurnInput,
  fetcher: typeof fetch = fetch,
): AsyncGenerator<ProviderTurnEvent> {
  if (
    !optionsSchema.safeParse(input).success ||
    input.messages.length < 1 ||
    input.messages.length > 1000
  )
    throw new ProviderFailure({
      code: 'INVALID_REQUEST',
      message: 'Invalid provider turn.',
    });
  if (
    !input.credential &&
    input.kind !== 'ollama' &&
    input.kind !== 'lmstudio' &&
    input.kind !== 'custom'
  )
    throw new ProviderFailure({
      code: 'INVALID_REQUEST',
      message: 'Invalid provider turn.',
    });
  const toolSupport =
    input.capabilities?.tools ??
    modelCapabilities(input.kind, input.modelId, {}).tools;
  if (toolSupport === 'unsupported')
    throw new ProviderFailure({
      code: 'UNSUPPORTED_MODEL',
      message: 'This model does not support tool calls.',
    });
  input.signal.throwIfAborted();
  const baseURL = connectionBase(input.kind, input.baseURL);
  const { tools, schemas } = definitions(input.tools);
  const controller = new AbortController();
  const signal = AbortSignal.any([input.signal, controller.signal]);
  let closeStream: (() => Promise<unknown>) | undefined;
  try {
    const model = await createModel(
      {
        id: input.kind,
        kind: input.kind,
        ...(input.credential ? { credentialRef: 'native' } : {}),
        ...(baseURL ? { baseURL } : {}),
      },
      {
        providerId: input.kind,
        modelId: input.modelId,
        capabilities: {
          tools: 'unknown',
          images: 'unknown',
          structuredOutput: 'unknown',
        },
      },
      {
        credentials: { resolve: () => Promise.resolve(input.credential) },
        fetch: fetcher,
      },
    );
    const result = streamText({
      model,
      messages: input.messages,
      tools,
      stopWhen: isStepCount(1),
      maxRetries: 0,
      onError: () => undefined,
      abortSignal: signal,
      maxOutputTokens: input.maxOutputTokens ?? 8192,
      ...(input.kind === 'openai'
        ? { providerOptions: { openai: { store: false } } }
        : {}),
    });
    const ids = new Set<string>();
    let finish: Extract<ProviderTurnEvent, { type: 'finish' }> | undefined;
    const iterator = result.fullStream[Symbol.asyncIterator]();
    closeStream = async () => iterator.return?.();
    while (true) {
      const next = await iterator.next();
      if (next.done) break;
      const event = next.value;
      if (event.type === 'text-delta') yield { type: 'text', text: event.text };
      if (event.type === 'tool-call') {
        const schema = schemas.get(event.toolName);
        const parsed = schema?.safeParse(event.input);
        if (
          event.invalid ||
          event.providerExecuted ||
          !parsed?.success ||
          !event.toolCallId ||
          event.toolCallId.length > 256 ||
          ids.has(event.toolCallId)
        ) {
          controller.abort();
          throw new ProviderFailure({
            code: 'INVALID_TOOL_CALL',
            message:
              'The provider returned an invalid, unknown or duplicate tool call.',
          });
        }
        ids.add(event.toolCallId);
        yield {
          type: 'call',
          id: event.toolCallId,
          name: event.toolName,
          input: parsed.data,
        };
      }
      if (event.type === 'error') {
        controller.abort();
        throw event.error;
      }
      if (event.type === 'finish') {
        if (
          event.finishReason === 'error' ||
          event.finishReason === 'interrupted' ||
          event.finishReason === 'other'
        )
          throw new ProviderFailure({
            code: 'NETWORK',
            message: 'The provider did not complete this tool turn.',
          });
        finish = {
          type: 'finish',
          reason: event.finishReason,
          usage: event.totalUsage,
          messages: [],
        };
      }
    }
    input.signal.throwIfAborted();
    if (!finish)
      throw new ProviderFailure({
        code: 'NETWORK',
        message: 'The provider stream ended without completing the turn.',
      });
    // Preserve provider metadata (for example reasoning signatures) for continuation.
    finish.messages = await result.responseMessages;
    yield finish;
  } catch (error) {
    if (input.signal.aborted) throw error;
    throw new ProviderFailure(providerError(error));
  } finally {
    controller.abort();
    await closeStream?.();
  }
}
