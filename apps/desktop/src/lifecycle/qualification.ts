import { qualifyLiveProviders } from './live-providers';
import type { useConnectionsStore } from '../stores/connections';
import { invoke } from '@tauri-apps/api/core';
import type { useSettingsStore } from '../stores/settings';
import type { useChatStore } from '../stores/chat';
// Native harness activation is restricted by environment variables in Rust.
export async function qualifyNativeRestart(
  preferences: ReturnType<typeof useSettingsStore>,
  chat: ReturnType<typeof useChatStore>,
  connections: ReturnType<typeof useConnectionsStore>,
) {
  const stage = await invoke<string | null>('qualification_stage');
  if (!stage) return;
  if (stage === 'live') {
    await qualifyLiveProviders(connections);
    return;
  }
  if (stage === 'save' || stage === 'crash') {
    void preferences.patch({ theme: 'light' });
    void preferences.patch({
      accent: stage === 'crash' ? 'violet' : 'blue',
      density: 'spacious',
    });
    void preferences.patch({ sidebarOpen: false, sidebarWidth: 310 });
    chat.draft = 'Native restart draft — Unicode 🌈';
    if (stage === 'crash') {
      await chat.flushDraft();
      await preferences.flush();
      await invoke('qualification_result', { passed: true });
      return;
    }
    await invoke('request_close');
  } else {
    const passed =
      preferences.settings.theme === 'light' &&
      preferences.settings.accent ===
        (stage === 'verify-crash' ? 'violet' : 'blue') &&
      preferences.settings.density === 'spacious' &&
      preferences.settings.sidebarWidth === 310 &&
      !preferences.settings.sidebarOpen &&
      chat.draft === 'Native restart draft — Unicode 🌈';
    await invoke('qualification_result', { passed });
    if (passed) await invoke('request_close');
  }
}
