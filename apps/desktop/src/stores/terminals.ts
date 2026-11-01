import { defineStore } from 'pinia';
import { ref } from 'vue';
import { z } from 'zod';
import {
  terminalSummarySchema,
  terminalPollSchema,
  toAppError,
  type TerminalSummary,
  type AppError,
} from '@harness/contracts';
import { useTerminalBackend } from '../transport/terminal';
import { useSettingsStore } from './settings';
export const useTerminalsStore = defineStore('terminals', () => {
  const backend = useTerminalBackend();
  const preferences = useSettingsStore();
  const tabs = ref<TerminalSummary[]>([]);
  const selectedId = ref<string | null>(null);
  const error = ref<AppError | null>(null);
  const busy = ref(false);
  async function refresh() {
    try {
      tabs.value = z
        .array(terminalSummarySchema)
        .parse(await backend.operation({ action: 'list' }));
      if (!tabs.value.some((tab) => tab.id === selectedId.value))
        selectedId.value = tabs.value[0]?.id ?? null;
    } catch (cause) {
      error.value = toAppError(cause);
    }
  }
  async function create(workspaceId: string) {
    if (busy.value) return;
    busy.value = true;
    try {
      const tab = terminalSummarySchema.parse(
        await backend.create(workspaceId, preferences.settings.terminal.shell),
      );
      await refresh();
      selectedId.value = tab.id;
      error.value = null;
    } catch (cause) {
      error.value = toAppError(cause);
    } finally {
      busy.value = false;
    }
  }
  async function close(id: string) {
    try {
      await backend.operation({ action: 'kill', id });
      await refresh();
    } catch (cause) {
      error.value = toAppError(cause);
    }
  }
  async function closeAll() {
    await refresh();
    for (const tab of tabs.value)
      await backend.operation({ action: 'kill', id: tab.id });
    tabs.value = [];
    selectedId.value = null;
  }
  async function poll(id: string, cursor: number) {
    return terminalPollSchema.parse(
      await backend.operation({ action: 'poll', id, cursor, limit: 32768 }),
    );
  }
  async function write(id: string, data: string) {
    try {
      await backend.operation({ action: 'write', id, data });
    } catch (cause) {
      error.value = toAppError(cause);
    }
  }
  async function resize(id: string, cols: number, rows: number) {
    if (cols < 20 || rows < 5) return;
    try {
      await backend.operation({
        action: 'resize',
        id,
        cols: Math.min(cols, 400),
        rows: Math.min(rows, 200),
      });
    } catch (cause) {
      error.value = toAppError(cause);
    }
  }
  return {
    tabs,
    selectedId,
    error,
    busy,
    refresh,
    create,
    close,
    closeAll,
    poll,
    write,
    resize,
  };
});
