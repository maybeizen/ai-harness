import { computed, ref } from 'vue';
import {
  historyPageSchema,
  toAppError,
  type AppError,
  type ConversationSummary,
  type HistoryCursor,
  type HistoryFilter,
} from '@harness/contracts';
import type { Backend } from '../transport/backend';
export function conversationHistory(backend: Pick<Backend, 'storage'>) {
  const items = ref<ConversationSummary[]>([]);
  const query = ref('');
  const filter = ref<HistoryFilter>({ kind: 'all' });
  const loading = ref(false);
  const error = ref<AppError | null>(null);
  const cursor = ref<HistoryCursor | null>(null);
  let revision = 0;
  async function fetchPage(append: boolean) {
    if (append && (loading.value || !cursor.value)) return;
    const request = append ? revision : ++revision;
    const next = append ? cursor.value : null;
    loading.value = true;
    error.value = null;
    try {
      const page = historyPageSchema.parse(
        await backend.storage({
          action: 'history.page',
          filter: filter.value,
          query: query.value,
          limit: 50,
          cursor: next,
        }),
      );
      if (request !== revision) return;
      if (append) {
        const existing = new Set(items.value.map((item) => item.id));
        items.value.push(
          ...page.items.filter((item) => !existing.has(item.id)),
        );
      } else items.value = page.items;
      cursor.value = page.nextCursor;
    } catch (cause) {
      if (request === revision) error.value = toAppError(cause);
      throw cause;
    } finally {
      if (request === revision) loading.value = false;
    }
  }
  const refresh = () => fetchPage(false);
  function search(value: string) {
    query.value = value.slice(0, 200);
    cursor.value = null;
    items.value = [];
    return refresh();
  }
  return {
    items,
    query,
    filter,
    setFilter: (value: HistoryFilter) => {
      filter.value = value;
      items.value = [];
      cursor.value = null;
      return refresh();
    },
    loading,
    error,
    hasMore: computed(() => cursor.value !== null),
    refresh,
    search,
    loadMore: () => fetchPage(true),
  };
}
