import { ref, type Ref, type ComputedRef } from 'vue';
import {
  toAppError,
  type AgentMode,
  type AppError,
  type ConnectionKind,
  type SavedMessage,
} from '@harness/contracts';
import type { Backend } from '../transport/backend';
import type { useSettingsStore } from './settings';
import { conversationDrafts } from './drafts';
import { loadConversation } from './conversation';
interface NavigationOptions {
  backend: Backend;
  settings: ReturnType<typeof useSettingsStore>;
  messages: Ref<SavedMessage[]>;
  draft: Ref<string>;
  id: Ref<string>;
  active: ComputedRef<boolean>;
  stop: () => Promise<void>;
  error: Ref<AppError | null>;
  refresh: () => Promise<void>;
  remember?: (
    value: {
      projectId: string | null;
      directoryId: string | null;
      provider: ConnectionKind | null;
      model: string | null;
      mode: AgentMode | null;
    } | null,
  ) => void;
}
export function conversationNavigation(options: NavigationOptions) {
  const { backend, settings, messages, draft, id, active, stop, error } =
    options;
  const revision = ref(0);
  const loading = ref(false);
  const drafts = conversationDrafts(
    backend,
    id,
    draft,
    error,
    active,
    async (savedId) => {
      if (id.value === savedId)
        await settings.patch({ activeConversation: savedId });
    },
  );
  async function flushDraft() {
    await drafts.flush();
    await settings.patch({ activeConversation: id.value });
  }
  async function newChat() {
    const request = ++revision.value;
    loading.value = true;
    try {
      if (active.value) await stop();
      if (request !== revision.value || active.value) return;
      await drafts.flush();
      if (request !== revision.value) return;
      messages.value = [];
      draft.value = '';
      error.value = null;
      id.value = crypto.randomUUID();
      options.remember?.(null);
      await settings.patch({ activeConversation: id.value });
    } catch (cause) {
      if (request === revision.value) error.value = toAppError(cause);
    } finally {
      if (request === revision.value) loading.value = false;
    }
  }
  async function selectConversation(target: string) {
    const request = ++revision.value;
    loading.value = true;
    try {
      if (active.value) await stop();
      if (request !== revision.value || active.value) return;
      await drafts.flush();
      if (request !== revision.value) return;
      const [saved, savedDraft] = await Promise.all([
        loadConversation(backend, target),
        drafts.load(target),
      ]);
      if (request !== revision.value) return;
      if (!saved && !savedDraft) {
        await options.refresh();
        await settings.patch({ activeConversation: null });
        return;
      }
      messages.value = saved?.messages ?? [];
      id.value = saved?.id ?? target;
      draft.value = savedDraft;
      error.value = null;
      options.remember?.(
        saved
          ? {
              projectId: saved.projectId ?? null,
              directoryId: saved.directoryId ?? null,
              provider: saved.provider ?? null,
              model: saved.model ?? null,
              mode: saved.mode ?? null,
            }
          : null,
      );
      await settings.patch({ activeConversation: id.value });
    } catch (cause) {
      if (request === revision.value) error.value = toAppError(cause);
    } finally {
      if (request === revision.value) loading.value = false;
    }
  }
  async function newProjectChat(
    projectId: string | null,
    directoryId: string | null,
  ) {
    const previous = id.value;
    await newChat();
    if (id.value === previous || active.value) return false;
    const request = revision.value;
    const target = id.value;
    loading.value = true;
    try {
      await backend.storage({
        action: 'conversation.create',
        id: target,
        title: 'New conversation',
        projectId,
        directoryId,
      });
      if (request !== revision.value) return false;
      options.remember?.({
        projectId,
        directoryId,
        provider: null,
        model: null,
        mode: null,
      });
      await options.refresh();
      return true;
    } catch (cause) {
      if (request === revision.value) error.value = toAppError(cause);
      return false;
    } finally {
      if (request === revision.value) loading.value = false;
    }
  }
  return {
    revision,
    loading,
    flushDraft,
    newChat,
    newProjectChat,
    selectConversation,
    drafts,
  };
}
