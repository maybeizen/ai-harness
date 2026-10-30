import { defineStore } from 'pinia';
import { computed, ref, reactive } from 'vue';
import {
  toAppError,
  type AppError,
  type ConnectionKind,
  type ConnectionSummary,
  type ChatModel,
} from '@harness/contracts';
import { useBackend, type Discovery } from '../transport/backend';
export const useConnectionsStore = defineStore('connections', () => {
  const backend = useBackend();
  const records = ref<ConnectionSummary[]>([]);
  const models = reactive<Partial<Record<ConnectionKind, ChatModel[]>>>({});
  const selected = ref<ConnectionKind>('chatgpt');
  const modelId = ref('');
  const busy = ref<ConnectionKind | null>(null);
  const error = ref<AppError | null>(null);
  const loading = ref(true);
  const connection = computed(() =>
    records.value.find((record) => record.id === selected.value),
  );
  const model = computed(() =>
    models[selected.value]?.find(
      (model) => model.id === modelId.value && model.available,
    ),
  );
  const ready = computed(
    () => connection.value?.status === 'connected' && !!model.value,
  );
  async function reload() {
    const previous = new Map(
      records.value.map((record) => [record.id, record]),
    );
    records.value = (await backend.list()).map((record) => ({
      ...record,
      status: record.configured
        ? (previous.get(record.id)?.status ?? 'checking')
        : 'disconnected',
    }));
  }
  async function initialize() {
    try {
      await reload();
      for (const record of records.value.filter(
        (record) => record.configured,
      )) {
        try {
          await refresh(record.id);
        } catch {
          /* Each row shows its discovery failure. */
        }
      }
    } catch (cause) {
      error.value = toAppError(cause);
    } finally {
      loading.value = false;
    }
  }
  function accept(result: Discovery) {
    models[result.connectionId] = result.models;
    const record = records.value.find(
      (record) => record.id === result.connectionId,
    );
    if (record) record.status = 'connected';
  }
  async function refresh(id: ConnectionKind) {
    const record = records.value.find((record) => record.id === id);
    if (record) record.status = 'checking';
    try {
      accept(await backend.refresh(id));
    } catch (cause) {
      models[id] = [];
      if (record) record.status = 'unavailable';
      error.value = toAppError(cause);
      throw cause;
    }
  }
  async function connect(
    id: ConnectionKind,
    options: { apiKey?: string; sessionOnly: boolean; executable?: string },
  ) {
    if (busy.value) return false;
    busy.value = id;
    error.value = null;
    try {
      const result =
        id === 'chatgpt'
          ? await backend.connectChatgpt(options.sessionOnly)
          : id === 'claude-client'
            ? await backend.connectClaude(options.executable ?? '')
            : await backend.connectApi(
                id,
                options.apiKey ?? '',
                options.sessionOnly,
              );
      await reload();
      accept(result);
      selected.value = id;
      modelId.value = '';
      return true;
    } catch (cause) {
      error.value = toAppError(cause);
      return false;
    } finally {
      busy.value = null;
    }
  }
  async function disconnect(id: ConnectionKind) {
    if (busy.value) return;
    busy.value = id;
    error.value = null;
    try {
      await backend.disconnect(id);
      delete models[id];
      if (selected.value === id) modelId.value = '';
      await reload();
    } catch (cause) {
      error.value = toAppError(cause);
    } finally {
      busy.value = null;
    }
  }
  function select(id: ConnectionKind) {
    selected.value = id;
    modelId.value = '';
  }
  function failModel(code: string) {
    if (code === 'MODEL_UNAVAILABLE' && model.value)
      model.value.available = false;
    if (code === 'AUTH_REQUIRED' && connection.value)
      connection.value.status = 'unavailable';
  }
  return {
    records,
    models,
    selected,
    modelId,
    busy,
    error,
    loading,
    connection,
    model,
    ready,
    initialize,
    refresh,
    connect,
    disconnect,
    select,
    failModel,
    cancelSignIn: () => backend.cancelSignIn(),
  };
});
