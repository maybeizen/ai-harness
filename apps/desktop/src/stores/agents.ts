import { defineStore } from 'pinia';
import { ref, computed, onScopeDispose } from 'vue';
import {
  agentRequestSchema,
  connectionAllowsTools,
  toAppError,
  type AgentEvent,
  type AgentSummary,
  type AgentStatus,
  type Approval,
  type AppError,
} from '@harness/contracts';
import {
  useAgentBackend,
  agentListSchema,
  agentPollSchema,
} from '../transport/agent';
import { useSettingsStore } from './settings';
import { useConnectionsStore } from './connections';
import { useChatStore } from './chat';
export const useAgentsStore = defineStore('agents', () => {
  const backend = useAgentBackend();
  const preferences = useSettingsStore();
  const connections = useConnectionsStore();
  const chat = useChatStore();
  const sessions = ref<AgentSummary[]>([]);
  const selectedId = ref<string | null>(null);
  const events = ref<AgentEvent[]>([]);
  const state = ref<AgentStatus>('completed');
  const error = ref<AppError | null>(null);
  const starting = ref(false);
  const stopping = ref(false);
  const live = ref<string[]>([]);
  const active = computed(
    () =>
      state.value === 'running' || state.value === 'reserved' || starting.value,
  );
  const supported = computed(() => connectionAllowsTools(connections.selected));
  const approvals = computed(() => {
    const pending = new Map<string, Approval>();
    for (const event of events.value) {
      if (event.type === 'approval') {
        for (const [id, item] of pending)
          if (item.callId === event.approval.callId) pending.delete(id);
        pending.set(event.approval.id, event.approval);
      }
      if (
        event.type === 'result' ||
        (event.type === 'tool' && event.status === 'running')
      )
        for (const [id, item] of pending)
          if (item.callId === event.callId) pending.delete(id);
    }
    return [...pending.values()];
  });
  let revision = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let cursor = 0;
  async function refresh() {
    try {
      sessions.value = agentListSchema.parse(
        await backend.operation({ action: 'list' }),
      );
    } catch (cause) {
      error.value = toAppError(cause);
    }
  }
  async function poll(id: string, current: number) {
    try {
      const result = agentPollSchema.parse(
        await backend.operation({ action: 'poll', id, after: cursor }),
      );
      if (current !== revision) return;
      for (const record of result.events) {
        if (record.sequence !== cursor + 1)
          throw Object.assign(
            new Error('Agent activity lost its ordering. Reload this task.'),
            { code: 'UNAVAILABLE' },
          );
        events.value.push(record.event);
        cursor = record.sequence;
      }
      cursor = result.nextCursor;
      state.value = result.status;
      const running =
        result.status === 'running' || result.status === 'reserved';
      if (running && !live.value.includes(id)) live.value.push(id);
      if (running || result.events.length > 0)
        timer = setTimeout(() => {
          void poll(id, current);
        }, 150);
      else {
        live.value = live.value.filter((value) => value !== id);
        void refresh();
      }
    } catch (cause) {
      if (current === revision) error.value = toAppError(cause);
    }
  }
  async function select(id: string) {
    clearTimeout(timer);
    selectedId.value = id;
    events.value = [];
    cursor = 0;
    const current = ++revision;
    await poll(id, current);
  }
  function releaseStart(requestId: string, current: number, problem: AppError) {
    live.value = live.value.filter((value) => value !== requestId);
    if (revision === current && selectedId.value === requestId) {
      selectedId.value = null;
      state.value = 'completed';
      error.value = problem;
    }
    starting.value = false;
  }
  async function send() {
    if (
      starting.value ||
      active.value ||
      !chat.draft.trim() ||
      !supported.value ||
      !connections.ready
    )
      return;
    const workspaceId = preferences.settings.activeDirectory;
    if (!workspaceId) {
      error.value = {
        code: 'WORKSPACE_REQUIRED',
        message: 'Open and select a workspace directory first.',
      };
      return;
    }
    starting.value = true;
    error.value = null;
    const prompt = chat.draft;
    const conversation = chat.conversationId;
    const globalMode = preferences.settings.selectedMode;
    const requestId = crypto.randomUUID();
    clearTimeout(timer);
    const current = ++revision;
    cursor = 0;
    events.value = [];
    selectedId.value = requestId;
    live.value.push(requestId);
    state.value = 'reserved';
    let chosen: Awaited<ReturnType<typeof chat.selection>>;
    try {
      chosen = await chat.selection();
    } catch (cause) {
      releaseStart(requestId, current, toAppError(cause));
      return;
    }
    const parsed = agentRequestSchema.safeParse({
      id: requestId,
      workspaceId,
      mode: chosen.mode,
      policy: preferences.settings.permissionPolicy,
      prompt,
    });
    if (!parsed.success) {
      releaseStart(requestId, current, {
        code: 'INVALID_REQUEST',
        message:
          'Keep the task prompt under 64 KiB and choose a valid workspace.',
      });
      return;
    }
    const request = parsed.data;
    try {
      await backend.start(request, chosen.provider, chosen.model);
      if (
        chat.conversationId === conversation &&
        preferences.settings.selectedMode === globalMode &&
        chat.draft === prompt
      ) {
        chat.draft = '';
        await chat.flushDraft();
      }
      await refresh();
      if (selectedId.value === request.id && revision === current)
        await poll(request.id, current);
    } catch (cause) {
      live.value = live.value.filter((id) => id !== request.id);
      if (selectedId.value === request.id && revision === current) {
        error.value = toAppError(cause);
        state.value = error.value.code === 'CANCELLED' ? 'cancelled' : 'error';
      }
    } finally {
      starting.value = false;
    }
  }
  async function stop() {
    const id = selectedId.value;
    if (!id || stopping.value) return;
    stopping.value = true;
    try {
      await backend.operation({ action: 'cancel', id });
      await select(id);
    } catch (cause) {
      error.value = toAppError(cause);
    } finally {
      stopping.value = false;
    }
  }
  async function stopAll() {
    const ids = new Set([
      ...live.value,
      ...sessions.value
        .filter((session) =>
          ['running', 'reserved', 'resumable'].includes(session.status),
        )
        .map((session) => session.id),
    ]);
    if (active.value && selectedId.value) ids.add(selectedId.value);
    for (const id of ids) await backend.operation({ action: 'cancel', id });
    live.value = [];
    state.value = 'cancelled';
  }
  async function continueTask() {
    const id = selectedId.value;
    if (!id || state.value !== 'resumable' || starting.value) return;
    starting.value = true;
    error.value = null;
    try {
      const chosen = await chat.selection();
      await backend.resume(id, chosen.provider, chosen.model);
      if (!live.value.includes(id)) live.value.push(id);
      state.value = 'running';
      await poll(id, revision);
    } catch (cause) {
      error.value = toAppError(cause);
    } finally {
      starting.value = false;
    }
  }
  async function decide(approval: Approval, allow: boolean) {
    try {
      await backend.operation({
        action: 'approve',
        decision: {
          id: approval.id,
          requestHash: approval.requestHash,
          decision: allow ? 'allow' : 'deny',
        },
      });
    } catch (cause) {
      error.value = toAppError(cause);
    }
  }
  onScopeDispose(() => {
    clearTimeout(timer);
    ++revision;
  });
  return {
    sessions,
    selectedId,
    events,
    state,
    error,
    starting,
    stopping,
    active,
    supported,
    approvals,
    refresh,
    select,
    send,
    stop,
    stopAll,
    continueTask,
    decide,
  };
});
