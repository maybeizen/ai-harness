import { watch, onScopeDispose, type Ref, type ComputedRef } from 'vue';
import { z } from 'zod';
import { toAppError, type AppError } from '@harness/contracts';
import type { Backend } from '../transport/backend';
export function conversationDrafts(
  backend: Pick<Backend, 'storage'>,
  id: Ref<string>,
  draft: Ref<string>,
  error: Ref<AppError | null>,
  paused: ComputedRef<boolean>,
  onSaved: (id: string) => Promise<void> = () => Promise.resolve(),
) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let queue = Promise.resolve();
  async function save(conversationId: string, text: string) {
    const operation = queue
      .catch(() => undefined)
      .then(async () => {
        await backend.storage({
          action: 'draft.set',
          id: conversationId,
          text,
        });
        await onSaved(conversationId);
      });
    queue = operation;
    try {
      await operation;
    } catch (cause) {
      error.value = toAppError(cause);
      throw cause;
    }
  }
  function flush() {
    clearTimeout(timer);
    timer = undefined;
    return save(id.value, draft.value);
  }
  watch([id, draft, paused], () => {
    clearTimeout(timer);
    if (paused.value) return;
    const conversationId = id.value;
    const text = draft.value;
    timer = setTimeout(() => {
      timer = undefined;
      void save(conversationId, text).catch(() => undefined);
    }, 250);
  });
  onScopeDispose(() => clearTimeout(timer));
  return {
    flush,
    save,
    load: async (conversationId: string) =>
      z
        .string()
        .max(65536)
        .parse(
          await backend.storage({ action: 'draft.get', id: conversationId }),
        ),
  };
}
