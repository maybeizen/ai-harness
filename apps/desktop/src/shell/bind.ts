import { invoke, isTauri } from '@tauri-apps/api/core';
import { watch } from 'vue';
import { useAgentsStore } from '../stores/agents';
import { useChatStore } from '../stores/chat';
import { useInfrastructureStore } from '../stores/infrastructure';
import { useSettingsStore } from '../stores/settings';
import {
  deliverNotice,
  noticesForChange,
  type NoticeSnapshot,
} from './notices';
import { readWindowGeometry, restoreSavedWindow } from './window-state';
async function playNoticeSound() {
  const context = new AudioContext();
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.frequency.value = 880;
  gain.gain.value = 0.04;
  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start();
  oscillator.stop(context.currentTime + 0.12);
  await new Promise((resolve) => setTimeout(resolve, 140));
  await context.close();
}
export async function captureWindowForClose() {
  const preferences = useSettingsStore();
  try {
    const geometry = await readWindowGeometry();
    if (geometry) await preferences.patch({ window: geometry });
  } catch {
    return;
  }
}
export function bindShell() {
  const preferences = useSettingsStore();
  const agents = useAgentsStore();
  const chat = useChatStore();
  const infrastructure = useInfrastructureStore();
  let snapshot: NoticeSnapshot | null = null;
  let restoring = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const unlistens: Array<() => void> = [];
  const stopReady = watch(
    () => preferences.ready,
    (ready) => {
      if (!ready) return;
      restoring = true;
      void restoreSavedWindow(preferences.settings.window)
        .then((geometry) => {
          if (
            geometry &&
            JSON.stringify(geometry) !==
              JSON.stringify(preferences.settings.window)
          )
            return preferences.patch({ window: geometry });
        })
        .finally(() => {
          restoring = false;
        });
    },
    { immediate: true },
  );
  async function remember() {
    if (restoring || !preferences.ready) return;
    const geometry = await readWindowGeometry();
    if (geometry) await preferences.patch({ window: geometry });
  }
  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(() => {
      void remember().catch(() => undefined);
    }, 300);
  }
  if (isTauri()) {
    void import('@tauri-apps/api/window').then(async ({ getCurrentWindow }) => {
      const current = getCurrentWindow();
      unlistens.push(
        await current.onResized(schedule),
        await current.onMoved(schedule),
      );
    });
  }
  const stopNotices = watch(
    () => ({
      agentStatus: agents.state,
      approvalIds: agents.approvals.map((item) => item.id),
      chatError: chat.error?.message ?? null,
      runtimeError: infrastructure.error,
    }),
    (next) => {
      const notices = noticesForChange(snapshot, next);
      snapshot = {
        agentStatus: next.agentStatus,
        approvalIds: [...next.approvalIds],
        chatError: next.chatError,
        runtimeError: next.runtimeError,
      };
      for (const notice of notices)
        void deliverNotice(
          { ...notice, preferences: preferences.settings.notifications },
          {
            send: () =>
              invoke('show_notification', {
                notice: {
                  ...notice,
                  doNotDisturb: preferences.settings.notifications.doNotDisturb,
                  enabled: preferences.settings.notifications[notice.kind],
                },
              }),
            playSound: playNoticeSound,
          },
        );
    },
    { immediate: true },
  );
  return () => {
    stopReady();
    stopNotices();
    clearTimeout(timer);
    for (const unlisten of unlistens) unlisten();
  };
}
