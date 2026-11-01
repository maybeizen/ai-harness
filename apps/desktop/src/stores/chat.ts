import { defineStore } from 'pinia';
import { ref, computed, onScopeDispose } from 'vue';
import { z } from 'zod';
import {
  attachmentReferenceSchema,
  generationControlFlags,
  resolveSelection,
  toAppError,
  type AppError,
  type AttachmentReference,
  type SavedMessage,
} from '@harness/contracts';
import { useConnectionsStore } from './connections';
import { useBackend } from '../transport/backend';
import { useSettingsStore } from './settings';
import { conversationHistory } from './history';
import { conversationNavigation } from './chat-navigation';
import { visibleMessages } from './conversation';
import {
  type ConversationMeta,
  resolveActiveSelection,
} from './chat-selection';
import { createChatSession } from './chat-session';
import { messageVariants } from './chat-variants';
import {
  applyRetentionPolicy,
  exportConversationFile,
  importConversationFile,
  storeAttachment,
} from './chat-transfer';
export type ChatMessage = SavedMessage;
export const useChatStore = defineStore('chat', () => {
  const backend = useBackend();
  const connections = useConnectionsStore();
  const settings = useSettingsStore();
  const history = conversationHistory(backend);
  const conversations = history.items;
  const messages = ref<ChatMessage[]>([]);
  const draft = ref('');
  const pending = ref<AttachmentReference[]>([]);
  const knownAttachments = ref<AttachmentReference[]>([]);
  const meta = ref<ConversationMeta | null>(null);
  const conversationId = ref<string>(crypto.randomUUID());
  const activeGeneration = ref<string | null>(null);
  const stopping = ref(false);
  const preparing = ref(false);
  const reconciling = ref(false);
  const error = ref<AppError | null>(null);
  const active = computed(() => activeGeneration.value !== null);
  const controls: { stop: () => Promise<void> } = {
    stop: () => Promise.resolve(),
  };
  const navigationState = conversationNavigation({
    backend,
    settings,
    messages,
    draft,
    id: conversationId,
    active,
    stop: () => controls.stop(),
    error,
    refresh: history.refresh,
    remember: (value) => {
      meta.value = value;
    },
  });
  const {
    loading: historyLoading,
    revision: navigation,
    newChat,
    newProjectChat,
    selectConversation,
    flushDraft,
  } = navigationState;
  const canSend = computed(
    () =>
      !active.value &&
      !stopping.value &&
      !preparing.value &&
      !reconciling.value &&
      !historyLoading.value &&
      connections.ready &&
      (draft.value.trim().length > 0 || pending.value.length > 0),
  );
  function selection() {
    const global = {
      provider: connections.selected,
      model: connections.modelId || settings.settings.selectedModel,
      mode: settings.settings.selectedMode,
    };
    if (!meta.value?.projectId)
      return resolveSelection({
        conversation: {
          provider: meta.value?.provider ?? null,
          model: meta.value?.model ?? null,
          mode: meta.value?.mode ?? null,
        },
        project: {},
        global,
      });
    return resolveActiveSelection({ backend, meta: meta.value, global });
  }
  const session = createChatSession({
    backend,
    messages,
    draft,
    pending,
    conversationId,
    activeGeneration,
    stopping,
    preparing,
    reconciling,
    error,
    historyLoading,
    revision: navigation,
    active,
    canSend,
    refreshHistory: history.refresh,
    selection,
    modelName: (modelId) =>
      connections.model?.id === modelId
        ? (connections.model.name ?? modelId)
        : modelId,
    failModel: (code) => connections.failModel(code),
    markVerified: () => {
      if (connections.model) connections.model.verified = true;
    },
    rememberActive: (id) => settings.patch({ activeConversation: id }),
  });
  controls.stop = () => session.stop();
  const imagesHeld = computed(
    () =>
      pending.value.some((item) => item.mediaType.startsWith('image/')) &&
      !generationControlFlags(connections.model?.capabilities).vision,
  );
  function visible() {
    return visibleMessages(messages.value);
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
  async function attach(file: File) {
    if (pending.value.length >= 8) {
      error.value = {
        code: 'INVALID_REQUEST',
        message: 'A message can include up to 8 attachments.',
      };
      return false;
    }
    try {
      const stored = await storeAttachment(backend, file);
      if (!pending.value.some((item) => item.id === stored.id))
        pending.value.push(stored);
      if (!knownAttachments.value.some((item) => item.id === stored.id))
        knownAttachments.value.push(stored);
      error.value = null;
      return true;
    } catch (cause) {
      error.value = toAppError(cause);
      return false;
    }
  }
  const variants = messageVariants({
    messages,
    pending,
    draft,
    active,
    ready: () => connections.ready,
    unavailable: () => {
      error.value = {
        code: 'MODEL_UNAVAILABLE',
        message: 'Select a model before trying that again.',
      };
    },
    deliver: (plan) => session.deliver(plan),
  });
  async function loadAttachments() {
    const ids = [
      ...new Set(
        messages.value.flatMap((message) => message.attachmentIds ?? []),
      ),
    ].filter((id) => !knownAttachments.value.some((item) => item.id === id));
    if (!ids.length) return;
    const found = z.array(attachmentReferenceSchema).parse(
      await backend.storage({
        action: 'attachment.meta',
        ids: ids.slice(0, 64),
      }),
    );
    knownAttachments.value.push(...found);
  }
  async function importFile(file: File) {
    const id = await importConversationFile(backend, file);
    await history.refresh();
    await selectConversation(id);
  }
  async function initialize() {
    const request = navigation.value;
    historyLoading.value = true;
    try {
      await history.refresh();
      const saved = settings.settings.activeConversation;
      if (saved) await selectConversation(saved);
    } catch (cause) {
      error.value = toAppError(cause);
    } finally {
      if (request === navigation.value) historyLoading.value = false;
    }
  }
  onScopeDispose(() => session.dispose());
  return {
    conversations,
    historyQuery: history.query,
    historyFilter: history.filter,
    filterHistory: history.setFilter,
    historyPaging: history.loading,
    historyError: history.error,
    historyHasMore: history.hasMore,
    searchHistory: history.search,
    loadMoreHistory: history.loadMore,
    historyLoading,
    messages,
    visible,
    draft,
    pending,
    knownAttachments,
    imagesHeld,
    conversationId,
    activeGeneration,
    active,
    stopping,
    error,
    canSend,
    meta,
    selection,
    initialize,
    flushDraft,
    refreshHistory: history.refresh,
    selectConversation,
    newProjectChat,
    updateConversation: (id: string, title: string, pinned: boolean) =>
      attempt(async () => {
        await backend.storage({
          action: 'update',
          id,
          title: title.trim(),
          pinned,
        });
        await history.refresh();
      }),
    deleteConversation: async (id: string) => {
      if (id === conversationId.value && active.value) await session.stop();
      if (id === conversationId.value && active.value) return false;
      return attempt(async () => {
        await backend.storage({ action: 'delete', id });
        if (id === conversationId.value) {
          draft.value = '';
          pending.value = [];
          await newChat();
        }
        await history.refresh();
      });
    },
    exportConversation: (id: string) =>
      attempt(() => exportConversationFile(backend, id)),
    importConversation: (file: File) =>
      attempt(async () => {
        await importFile(file);
      }),
    applyRetention: () =>
      attempt(async () => {
        await applyRetentionPolicy(backend, conversationId.value);
        await history.refresh();
      }),
    attach,
    removeAttachment: (id: string) => {
      pending.value = pending.value.filter((item) => item.id !== id);
    },
    loadAttachments,
    editMessage: variants.editMessage,
    regenerate: variants.regenerate,
    retry: variants.retry,
    send: () => session.send(),
    stop: () => session.stop(),
    newChat,
    dismissError: () => {
      error.value = null;
    },
  };
});
