import { defineStore } from 'pinia';
import { ref, computed, onScopeDispose } from 'vue';
import {
  toAppError,
  MAX_MESSAGE_BYTES,
  type AppError,
  type ChatEvent,
  type SavedMessage,
  conversationSummarySchema,
  type ConversationSummary,
} from '@harness/contracts';
import { useConnectionsStore } from './connections';
import { useBackend } from '../transport/backend';
import { useSettingsStore } from './settings';
import { z } from 'zod';
import {
  loadConversation,
  copyConversationExport,
  chatContext,
} from './conversation';
export type ChatMessage = SavedMessage;
export const useChatStore = defineStore('chat', () => {
  const backend = useBackend();
  const connections = useConnectionsStore();
  const settings = useSettingsStore();
  const conversations = ref<ConversationSummary[]>([]);
  const historyLoading = ref(false);
  let navigation = 0;
  const messages = ref<ChatMessage[]>([]);
  const draft = ref('');
  const conversationId = ref<string>(crypto.randomUUID());
  const activeGeneration = ref<string | null>(null);
  const stopping = ref(false);
  const reconciling = ref(false);
  const error = ref<AppError | null>(null);
  let dispose: (() => void) | undefined;
  let sequence = 0;
  let cancellation: Promise<void> | null = null;
  const active = computed(() => activeGeneration.value !== null);
  const canSend = computed(
    () =>
      !active.value &&
      !stopping.value &&
      !reconciling.value &&
      !historyLoading.value &&
      connections.ready &&
      draft.value.trim().length > 0,
  );
  function finish(status: ChatMessage['status']) {
    const message = messages.value.find(
      (message) => message.id === activeGeneration.value,
    );
    if (message) message.status = status;
    dispose?.();
    dispose = undefined;
    activeGeneration.value = null;
    if (!cancellation) stopping.value = false;
    void refreshHistory().catch((cause: unknown) => {
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
      (message) => message.id === event.generationId,
    );
    if (!message) return;
    if (event.type === 'text') message.text += event.text;
    else if (event.type === 'done') {
      if (event.status === 'completed' && connections.model)
        connections.model.verified = true;
      finish(event.status === 'completed' ? 'completed' : 'stopped');
    } else {
      error.value = event.error;
      connections.failModel(event.error.code);
      finish('error');
    }
  }
  async function send() {
    if (!canSend.value) return;
    const request = navigation;
    const generationId = crypto.randomUUID();
    const user: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      text: draft.value.trim(),
      status: 'completed',
    };
    const context = chatContext(messages.value, user);
    const input = {
      generationId,
      conversationId: conversationId.value,
      connectionId: connections.selected,
      modelId: connections.modelId,
      messages: context,
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
    messages.value.push(user, {
      id: generationId,
      role: 'assistant',
      text: '',
      status: 'streaming',
      modelName: connections.model?.name ?? input.modelId,
      connectionId: input.connectionId,
    });
    const submittedDraft = draft.value;
    draft.value = '';
    error.value = null;
    activeGeneration.value = generationId;
    sequence = 0;
    try {
      const cleanup = await backend.start(input, receive);
      if (conversationId.value === input.conversationId)
        await settings.patch({ activeConversation: input.conversationId });
      void refreshHistory().catch((cause: unknown) => {
        error.value = toAppError(cause);
      });
      if (activeGeneration.value === generationId) dispose = cleanup;
      else cleanup();
    } catch (cause) {
      if (activeGeneration.value === generationId) {
        error.value = toAppError(cause);
        connections.failModel(error.value.code);
        reconciling.value = true;
        finish('error');
        // Reconcile a lost acknowledgement against the authoritative runtime.
        try {
          await backend.cancel(generationId);
          const saved = await loadConversation(backend, input.conversationId);
          if (
            conversationId.value !== input.conversationId ||
            request !== navigation
          )
            return;
          messages.value =
            saved?.messages ??
            messages.value.filter(
              (item) => item.id !== user.id && item.id !== generationId,
            );
          if (
            !saved?.messages.some((item) => item.id === user.id) &&
            !draft.value
          )
            draft.value = submittedDraft;
        } catch {
          /* Keep the visible prompt when storage cannot confirm acceptance. */
        } finally {
          reconciling.value = false;
        }
      }
    }
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
  async function newChat() {
    const request = ++navigation;
    if (active.value) await stop();
    if (request !== navigation) return;
    historyLoading.value = false;
    if (active.value) return;
    messages.value = [];
    draft.value = '';
    error.value = null;
    conversationId.value = crypto.randomUUID();
    await settings.patch({ activeConversation: null });
  }
  async function refreshHistory() {
    conversations.value = z
      .array(conversationSummarySchema)
      .parse(await backend.storage({ action: 'list' }));
  }
  async function initialize() {
    const request = navigation;
    historyLoading.value = true;
    try {
      await refreshHistory();
      const saved = settings.settings.activeConversation;
      if (saved) await selectConversation(saved);
    } catch (cause) {
      error.value = toAppError(cause);
    } finally {
      if (request === navigation) historyLoading.value = false;
    }
  }
  async function selectConversation(id: string) {
    const request = ++navigation;
    historyLoading.value = true;
    try {
      if (active.value) await stop();
      if (active.value) return;
      const saved = await loadConversation(backend, id);
      if (request !== navigation) return;
      if (!saved) {
        await refreshHistory();
        await settings.patch({ activeConversation: null });
        return;
      }
      messages.value = saved.messages;
      conversationId.value = saved.id;
      draft.value = '';
      error.value = null;
      await settings.patch({ activeConversation: saved.id });
    } catch (cause) {
      if (request === navigation) error.value = toAppError(cause);
    } finally {
      if (request === navigation) historyLoading.value = false;
    }
  }
  async function attempt(operation: () => Promise<void>) {
    try {
      await operation();
      return true;
    } catch (cause) {
      error.value = toAppError(cause);
      return false;
    }
  }
  function updateConversation(id: string, title: string, pinned: boolean) {
    return attempt(async () => {
      await backend.storage({
        action: 'update',
        id,
        title: title.trim(),
        pinned,
      });
      await refreshHistory();
    });
  }
  async function deleteConversation(id: string) {
    if (id === conversationId.value && active.value) await stop();
    if (id === conversationId.value && active.value) return false;
    return attempt(async () => {
      await backend.storage({ action: 'delete', id });
      if (id === conversationId.value) await newChat();
      await refreshHistory();
    });
  }
  function exportConversation(id: string) {
    return attempt(() => copyConversationExport(backend, id));
  }
  function dismissError() {
    error.value = null;
  }
  onScopeDispose(() => {
    if (activeGeneration.value)
      void backend.cancel(activeGeneration.value).catch(() => undefined);
    dispose?.();
  });
  // Group the public state and actions for the application shell.
  // prettier-ignore
  return {
    conversations, historyLoading, messages, draft, conversationId,
    activeGeneration, active, stopping, error, canSend,
    initialize, refreshHistory, selectConversation, updateConversation,
    deleteConversation, exportConversation, send, stop, newChat, dismissError,
  };
});
