import { Channel, invoke } from '@tauri-apps/api/core';
import { inject, hasInjectionContext, type InjectionKey } from 'vue';
import { z } from 'zod';
import {
  connectionSchema,
  modelSchema,
  streamEventSchema,
  responseSchema,
  type ConnectionSummary,
  type ChatModel,
  type ConnectionKind,
  type GenerationInput,
  type ChatEvent,
  type StorageOperation,
  storageOperationSchema,
} from '@harness/contracts';
export interface Discovery {
  connectionId: ConnectionKind;
  models: ChatModel[];
}
export interface Backend {
  storage(this: void, operation: StorageOperation): Promise<unknown>;
  health(
    this: void,
  ): Promise<{ status: 'ready'; protocol: 2; storage: 'ready' }>;
  list(this: void): Promise<ConnectionSummary[]>;
  refresh(this: void, connectionId: ConnectionKind): Promise<Discovery>;
  connectApi(
    this: void,
    connectionId: ConnectionKind,
    apiKey: string,
    sessionOnly: boolean,
  ): Promise<Discovery>;
  connectChatgpt(this: void, sessionOnly: boolean): Promise<Discovery>;
  connectClaude(this: void, executable: string): Promise<Discovery>;
  cancelSignIn(this: void): Promise<void>;
  disconnect(this: void, connectionId: ConnectionKind): Promise<void>;
  start(
    this: void,
    input: GenerationInput,
    onEvent: (event: ChatEvent) => void,
  ): Promise<() => void>;
  cancel(this: void, generationId: string): Promise<void>;
  open(this: void, url: string): Promise<void>;
  copy(this: void, text: string): Promise<void>;
}
const discoverySchema = z
  .object({
    connectionId: connectionSchema.shape.id,
    models: z.array(modelSchema),
  })
  .strict();
const discover = async (command: string, args: Record<string, unknown>) =>
  discoverySchema.parse(await invoke(command, args));
export const nativeBackend: Backend = {
  storage: (operation) =>
    invoke('storage_operation', {
      operation: storageOperationSchema.parse(operation),
    }),
  async health() {
    const response = responseSchema.parse(await invoke('runtime_health'));
    if (!response.ok) throw new Error(response.error.message);
    return response.result;
  },
  async list() {
    return z.array(connectionSchema).parse(await invoke('list_connections'));
  },
  refresh: (connectionId) => discover('refresh_connection', { connectionId }),
  connectApi: (connectionId, apiKey, sessionOnly) =>
    discover('connect_api', { connectionId, apiKey, sessionOnly }),
  connectChatgpt: (sessionOnly) => discover('connect_chatgpt', { sessionOnly }),
  connectClaude: (executable) => discover('connect_claude', { executable }),
  cancelSignIn: () => invoke('cancel_sign_in'),
  disconnect: (connectionId) =>
    invoke('disconnect_connection', { connectionId }),
  async start(input, onEvent) {
    const channel = new Channel<unknown>();
    channel.onmessage = (raw) => {
      const event = streamEventSchema.safeParse(raw);
      if (event.success) onEvent(event.data);
    };
    try {
      await invoke('start_chat', { input, channel });
    } catch (error) {
      channel.onmessage = () => undefined;
      throw error;
    }
    return () => {
      channel.onmessage = () => undefined;
    };
  },
  cancel: (generationId) => invoke('cancel_chat', { generationId }),
  open: (url) => invoke('open_external', { url }),
  copy: (text) => invoke('copy_text', { text }),
};
export const backendKey: InjectionKey<Backend> = Symbol('backend');
export function useBackend(): Backend {
  return hasInjectionContext()
    ? inject(backendKey, nativeBackend)
    : nativeBackend;
}
