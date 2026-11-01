// @vitest-environment jsdom
import { it, expect, vi } from 'vitest';
import type { HistoryPage } from '@harness/contracts';
import { conversationHistory } from './history';
function deferred() {
  let resolve!: (page: HistoryPage) => void;
  const promise = new Promise<HistoryPage>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function page(id: string, more = false): HistoryPage {
  const item = { id, title: id, pinned: false, updatedAt: 1 };
  return {
    items: [item],
    nextCursor: more ? { id, pinned: false, updatedAt: 1 } : null,
  };
}
it('ignores stale queries and late pages when a newer search replaces them', async () => {
  const first = deferred();
  const second = deferred();
  const storage = vi
    .fn()
    .mockReturnValueOnce(first.promise)
    .mockReturnValueOnce(second.promise);
  const history = conversationHistory({ storage });
  const old = history.search('old');
  const newer = history.search('new');
  second.resolve(page('new'));
  await newer;
  first.resolve(page('old', true));
  await old;
  expect(history.items.value.map((item) => item.id)).toEqual(['new']);
  expect(history.hasMore.value).toBe(false);
  expect(history.loading.value).toBe(false);
});
it('deduplicates overlapping rows, prevents duplicate page loads and keeps loaded pages on failure', async () => {
  const pending = deferred();
  const storage = vi
    .fn()
    .mockResolvedValueOnce(page('first', true))
    .mockReturnValueOnce(pending.promise);
  const history = conversationHistory({ storage });
  await history.refresh();
  const loading = history.loadMore();
  await history.loadMore();
  expect(storage).toHaveBeenCalledTimes(2);
  pending.resolve({
    items: [...page('first').items, ...page('second').items],
    nextCursor: { id: 'second', pinned: false, updatedAt: 1 },
  });
  await loading;
  expect(history.items.value.map((item) => item.id)).toEqual([
    'first',
    'second',
  ]);
  storage.mockRejectedValueOnce(new Error('offline'));
  await expect(history.loadMore()).rejects.toThrow('offline');
  expect(history.items.value).toHaveLength(2);
  expect(history.error.value).not.toBeNull();
});
