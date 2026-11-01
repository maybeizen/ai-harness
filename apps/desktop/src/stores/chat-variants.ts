import type { Ref } from 'vue';
import type { AttachmentReference, SavedMessage } from '@harness/contracts';
import { visibleMessages } from './conversation';
import type { createChatSession } from './chat-session';
type Session = ReturnType<typeof createChatSession>;
export function messageVariants(input: {
  messages: Ref<SavedMessage[]>;
  pending: Ref<AttachmentReference[]>;
  draft: Ref<string>;
  active: Ref<boolean> | { value: boolean };
  ready: () => boolean;
  unavailable: () => void;
  deliver: Session['deliver'];
}) {
  function editMessage(id: string, text: string) {
    if (input.active.value || !text.trim()) return Promise.resolve();
    if (!input.ready()) {
      input.unavailable();
      return Promise.resolve();
    }
    const original = input.messages.value.find(
      (message) => message.id === id && message.role === 'user',
    );
    if (!original) return Promise.resolve();
    const previous = [...visibleMessages(input.messages.value)]
      .reverse()
      .find((message) => message.role === 'assistant');
    const user: SavedMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      text: text.trim(),
      status: 'completed',
      createdAt: Date.now(),
      parentId: original.id,
      ...(input.pending.value.length
        ? { attachmentIds: input.pending.value.map((item) => item.id) }
        : original.attachmentIds
          ? { attachmentIds: original.attachmentIds }
          : {}),
    };
    return input.deliver({
      user,
      ...(previous ? { parentId: previous.id } : {}),
      clearDraft: false,
      submittedDraft: input.draft.value,
      submittedPending: [...input.pending.value],
    });
  }
  function regenerate(id: string) {
    if (input.active.value) return Promise.resolve();
    if (!input.ready()) {
      input.unavailable();
      return Promise.resolve();
    }
    const target = input.messages.value.find(
      (message) => message.id === id && message.role === 'assistant',
    );
    if (!target) return Promise.resolve();
    return input.deliver({
      user: null,
      parentId: target.id,
      clearDraft: false,
      submittedDraft: input.draft.value,
      submittedPending: [...input.pending.value],
    });
  }
  return { editMessage, regenerate, retry: regenerate };
}
