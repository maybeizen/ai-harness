// @vitest-environment jsdom
import { it, expect, vi } from 'vitest';
import { ref, computed, effectScope, nextTick } from 'vue';
import { conversationDrafts } from './drafts';
import type { StorageOperation, AppError } from '@harness/contracts';
it('flushes the latest draft before delayed autosave and preserves failure for retry', async () => {
  vi.useFakeTimers();
  const scope = effectScope();
  const saved = new Map<string, string>();
  let failing = false;
  const backend = {
    storage: vi.fn((operation: StorageOperation) => {
      if (failing)
        return Promise.reject(
          Object.assign(new Error('Disk full.'), {
            code: 'STORAGE_ERROR',
            message: 'Disk full.',
          }),
        );
      if (operation.action === 'draft.set') {
        saved.set(operation.id, operation.text);
        return Promise.resolve(null);
      }
      return Promise.resolve(
        operation.action === 'draft.get'
          ? (saved.get(operation.id) ?? '')
          : null,
      );
    }),
  };
  const id = ref('first');
  const draft = ref('');
  const active = ref(false);
  const error = ref<AppError | null>(null);
  const state = scope.run(() =>
    conversationDrafts(
      backend,
      id,
      draft,
      error,
      computed(() => active.value),
    ),
  )!;
  try {
    draft.value = 'Rapid edit';
    await nextTick();
    await state.flush();
    expect(saved.get('first')).toBe('Rapid edit');
    expect(backend.storage).toHaveBeenCalledTimes(1);
    failing = true;
    draft.value = 'Unsaved';
    await expect(state.flush()).rejects.toMatchObject({
      code: 'STORAGE_ERROR',
    });
    expect(draft.value).toBe('Unsaved');
    expect(error.value?.code).toBe('STORAGE_ERROR');
    failing = false;
    await state.flush();
    expect(await state.load('first')).toBe('Unsaved');
    active.value = true;
    draft.value = '';
    await nextTick();
    await vi.advanceTimersByTimeAsync(500);
    expect(saved.get('first')).toBe('Unsaved');
  } finally {
    scope.stop();
    vi.useRealTimers();
  }
});
