import { type ComputedRef, type Ref } from 'vue';
import {
  toAppError,
  MAX_MESSAGE_BYTES,
  type AppError,
  type AttachmentReference,
  type ChatEvent,
  type ResolvedSelection,
  type SavedMessage,
} from '@harness/contracts';
import type { Backend } from '../transport/backend';
import { chatContext, generationStub, loadConversation } from './conversation';
export type ChatMessage = SavedMessage;
interface SessionOptions {
  backend: Backend;
  messages: Ref<ChatMessage[]>;
  draft: Ref<string>;
  pending: Ref<AttachmentReference[]>;
  conversationId: Ref<string>;
  activeGeneration: Ref<string | null>;
  stopping: Ref<boolean>;
  preparing: Ref<boolean>;
  reconciling: Ref<boolean>;
  error: Ref<AppError | null>;
  historyLoading: Ref<boolean>;
  revision: Ref<number>;
  active: ComputedRef<boolean>;
  canSend: ComputedRef<boolean>;
  refreshHistory: () => Promise<void>;
  selection: () => ResolvedSelection | Promise<ResolvedSelection>;
  modelName: (modelId: string) => string;
  failModel: (code: string) => void;
  markVerified: () => void;
  rememberActive: (id: string) => Promise<void>;
}
export function createChatSession(options: SessionOptions) {
  const {
    backend,
    messages,
    draft,
    pending,
    conversationId,
    activeGeneration,
    stopping,
    reconciling,
    error,
  } = options;
  let dispose: (() => void) | undefined;
  let sequence = 0;
  let cancellation: Promise<void> | null = null;
  function finish(status: ChatMessage['status']) {
    const message = messages.value.find(
      (item) => item.id === activeGeneration.value,
    );
    if (message) message.status = status;
    dispose?.();
    dispose = undefined;
    activeGeneration.value = null;
    if (!cancellation) stopping.value = false;
    void options.refreshHistory().catch((cause: unknown) => {
      error.value = toAppError(cause);
    });
  }
  function receive(event: ChatEvent) {
    if (
      event.generationId !== activeGeneration.value ||
      event.conversationId !== conversationId.value ||
      event.sequence < sequence
    )
      return;
    if (event.sequence !== sequence) {
      error.value = {
        code: 'UNAVAILABLE',
        message:
          'The response stream lost its order. Stop and resend your message.',
      };
      void backend.cancel(event.generationId).catch(() => undefined);
      finish('error');
      return;
    }
    sequence++;
    const message = messages.value.find(
      (item) => item.id === event.generationId,
    );
    if (!message) return;
    if (event.type === 'text') message.text += event.text;
    else if (event.type === 'done') {
      if (event.status === 'completed') options.markVerified();
      finish(event.status === 'completed' ? 'completed' : 'stopped');
    } else {
      error.value = event.error;
      options.failModel(event.error.code);
      finish('error');
    }
  }
  async function deliver(plan: Parameters<typeof deliverPrepared>[0]) {
    options.preparing.value = true;
    try {
      await deliverPrepared(plan);
    } finally {
      options.preparing.value = false;
    }
  }
  async function deliverPrepared(plan: {
    user: ChatMessage | null;
    parentId?: string;
    clearDraft: boolean;
    submittedDraft: string;
    submittedPending: AttachmentReference[];
  }) {
    const request = options.revision.value;
    let selection: ResolvedSelection;
    try {
      const chosen = options.selection();
      selection = chosen instanceof Promise ? await chosen : chosen;
    } catch (cause) {
      error.value = toAppError(cause);
      return;
    }
    const assistant: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'assistant',
      text: '',
      status: 'streaming',
      createdAt: Date.now(),
      ...(plan.parentId ? { parentId: plan.parentId } : {}),
      modelName: options.modelName(selection.model),
      connectionId: selection.provider,
      model: {
        connectionId: selection.provider,
        modelId: selection.model,
        name: options.modelName(selection.model),
      },
    };
    const next = [
      ...messages.value,
      ...(plan.user ? [plan.user] : []),
      assistant,
    ];
    const input = {
      generationId: assistant.id,
      conversationId: conversationId.value,
      connectionId: selection.provider,
      modelId: selection.model,
      messages: plan.parentId
        ? [...chatContext(next), generationStub(assistant)]
        : chatContext(next),
    };
    if (
      new TextEncoder().encode(JSON.stringify(input)).byteLength >
      MAX_MESSAGE_BYTES - 16384
    ) {
      error.value = {
        code: 'INVALID_REQUEST',
        message: 'This conversation is too large. Start a new chat.',
      };
      return;
    }
    if (plan.user) messages.value.push(plan.user);
    messages.value.push(assistant);
    if (plan.clearDraft) {
      draft.value = '';
      pending.value = [];
    }
    error.value = null;
    activeGeneration.value = assistant.id;
    sequence = 0;
    try {
      const cleanup = await backend.start(input, receive);
      if (conversationId.value === input.conversationId)
        await options.rememberActive(input.conversationId);
      void options.refreshHistory().catch((cause: unknown) => {
        error.value = toAppError(cause);
      });
      if (activeGeneration.value === assistant.id) dispose = cleanup;
      else cleanup();
    } catch (cause) {
      if (activeGeneration.value !== assistant.id) return;
      error.value = toAppError(cause);
      options.failModel(error.value.code);
      reconciling.value = true;
      finish('error');
      try {
        await backend.cancel(assistant.id);
        const saved = await loadConversation(backend, input.conversationId);
        if (
          conversationId.value !== input.conversationId ||
          request !== options.revision.value
        )
          return;
        const restored = saved?.messages;
        messages.value =
          restored ??
          messages.value.filter(
            (item) => item.id !== plan.user?.id && item.id !== assistant.id,
          );
        if (
          plan.clearDraft &&
          !restored?.some((item) => item.id === plan.user?.id) &&
          !draft.value
        ) {
          draft.value = plan.submittedDraft;
          pending.value = plan.submittedPending;
        }
      } catch {
        /* Keep the visible prompt when storage cannot confirm acceptance. */
      } finally {
        reconciling.value = false;
      }
    }
  }
  function send() {
    if (!options.canSend.value) return Promise.resolve();
    const text =
      draft.value.trim() || pending.value.map((item) => item.name).join(', ');
    const user: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      text,
      status: 'completed',
      createdAt: Date.now(),
      ...(pending.value.length
        ? { attachmentIds: pending.value.map((item) => item.id) }
        : {}),
    };
    return deliver({
      user,
      clearDraft: true,
      submittedDraft: draft.value,
      submittedPending: [...pending.value],
    });
  }
  function stop(): Promise<void> {
    if (cancellation) return cancellation;
    const generation = activeGeneration.value;
    if (!generation) return Promise.resolve();
    stopping.value = true;
    cancellation = (async () => {
      try {
        await backend.cancel(generation);
        if (activeGeneration.value === generation) finish('stopped');
      } catch (cause) {
        if (activeGeneration.value === generation) {
          error.value = toAppError(cause);
          stopping.value = false;
        }
      } finally {
        stopping.value = false;
        cancellation = null;
      }
    })();
    return cancellation;
  }
  function disposeSession() {
    if (activeGeneration.value)
      void backend.cancel(activeGeneration.value).catch(() => undefined);
    dispose?.();
  }
  return { send, stop, deliver, dispose: disposeSession };
}
