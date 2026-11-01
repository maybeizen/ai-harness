<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { toAppError } from '@harness/contracts';
import { closeBarrier } from './lifecycle/close';
import { qualifyNativeRestart } from './lifecycle/qualification';
import { X, ArrowUpRight } from '@lucide/vue';
import { SidebarProvider } from './components/ui/sidebar';
import { TooltipProvider } from './components/ui/tooltip';
import { Button } from './components/ui/button';
import WorkspaceBackground from './components/WorkspaceBackground.vue';
import { useBackgroundStore } from './stores/background';
import AgentActivity from './components/agent/AgentActivity.vue';
import AgentComposer from './components/agent/AgentComposer.vue';
import ModeSelector from './components/agent/ModeSelector.vue';
import { useTerminalsStore } from './stores/terminals';
import { useAgentsStore } from './stores/agents';
import AppHeader from './components/AppHeader.vue';
import WorkbenchPanel from './components/workbench/WorkbenchPanel.vue';
import SettingsDialog from './components/settings/SettingsDialog.vue';
import KeyboardBindings from './components/settings/KeyboardBindings.vue';
import type { ShortcutAction } from '@harness/contracts';
import AppearanceDialog from './components/AppearanceDialog.vue';
import { useSettingsStore } from './stores/settings';
import AppSidebar from './components/AppSidebar.vue';
import ConnectionsDialog from './components/connections/ConnectionsDialog.vue';
import ConversationView from './components/chat/ConversationView.vue';
import MessageComposer from './components/chat/MessageComposer.vue';
import WelcomeState from './components/chat/WelcomeState.vue';
import { useConnectionsStore } from './stores/connections';
import { useInfrastructureStore } from './stores/infrastructure';
import { useChatStore } from './stores/chat';
import { useBackend } from './transport/backend';
import { bindShell, captureWindowForClose } from './shell/bind';
const connections = useConnectionsStore();
const infrastructure = useInfrastructureStore();
const chat = useChatStore();
const backend = useBackend();
const settingsOpen = ref(false);
const appearanceOpen = ref(false);
const applicationSettingsOpen = ref(false);
const preferences = useSettingsStore();
const backgrounds = useBackgroundStore();
const agents = useAgentsStore();
const terminals = useTerminalsStore();
const closing = ref(false);
let unlistenClose: UnlistenFn | undefined;
let releaseShell = () => {};
const close = closeBarrier({
  stop: async () => {
    await chat.stop();
    await agents.stopAll();
    await terminals.closeAll();
  },
  isActive: () => chat.active || agents.active,
  flush: async () => {
    await captureWindowForClose();
    await backgrounds.flush();
    await chat.flushDraft();
    await preferences.flush();
  },
  freeze: (value) => {
    closing.value = value;
    document.body.inert = value;
    if (value) {
      appearanceOpen.value = false;
      settingsOpen.value = false;
      applicationSettingsOpen.value = false;
    }
  },
  destroy: () => invoke('complete_close'),
  report: (cause) => {
    preferences.error = toAppError(cause);
  },
});
const composer = ref<{ focus: () => void } | null>(null);
const title = computed(
  () =>
    chat.conversations.find((item) => item.id === chat.conversationId)?.title ??
    chat.messages
      .find((message) => message.role === 'user')
      ?.text.slice(0, 60) ??
    'New conversation',
);
onMounted(() => {
  releaseShell = bindShell();
  const closeRegistration = isTauri()
    ? listen('app-close-requested', () => {
        void close();
      }).then((cleanup) => {
        unlistenClose = cleanup;
      })
    : Promise.resolve();
  infrastructure.start();
  void (async () => {
    await preferences.initialize();
    await backgrounds.load();
    connections.selected = preferences.settings.selectedProvider;
    connections.modelId = preferences.settings.selectedModel;
    await chat.initialize();
    await connections.initialize();
    await closeRegistration;
    if (isTauri()) await qualifyNativeRestart(preferences, chat, connections);
  })();
});
onUnmounted(() => {
  releaseShell();
  unlistenClose?.();
  infrastructure.stop();
  if (chat.active)
    void (preferences.settings.selectedMode === 'ask'
      ? chat.stop()
      : agents.stop());
});
watch(
  () => [connections.selected, connections.modelId] as const,
  ([selectedProvider, selectedModel]) => {
    if (preferences.ready)
      void preferences.patch({ selectedProvider, selectedModel });
  },
);
function shortcut(action: ShortcutAction) {
  if (closing.value) return;
  if (action === 'newChat')
    void chat.newChat().then(() => nextTick(() => composer.value?.focus()));
  else if (action === 'settings') applicationSettingsOpen.value = true;
  else if (action === 'focusComposer') composer.value?.focus();
  else if (action === 'openWorkspace')
    void preferences.patch({ rightPanelOpen: true });
  else if (
    action === 'cancel' &&
    !settingsOpen.value &&
    !appearanceOpen.value &&
    !applicationSettingsOpen.value
  )
    void (preferences.settings.selectedMode === 'ask'
      ? chat.stop()
      : agents.stop());
}
function prompt(text: string) {
  chat.draft = text;
  void nextTick(() => composer.value?.focus());
}
function manageUsage() {
  void backend
    .open('https://chatgpt.com/#settings/Usage')
    .catch(() => undefined);
}
</script>
<template>
  <TooltipProvider :delay-duration="250"
    ><SidebarProvider
      :open="preferences.settings.sidebarOpen"
      :inert="closing"
      :aria-busy="closing"
      :style="{ '--sidebar-width': preferences.settings.sidebarWidth + 'px' }"
      class="relative h-svh min-h-0 overflow-hidden"
      @update:open="preferences.patch({ sidebarOpen: $event })"
    >
      <WorkspaceBackground
        v-if="preferences.settings.background.scope === 'global'"
      />
      <KeyboardBindings :disabled="closing" @action="shortcut" />
      <AppSidebar @connections="settingsOpen = true" />
      <main
        class="relative flex min-w-0 flex-1 flex-col bg-background"
        :class="{
          'has-workspace-background': !!backgrounds.dataUrl,
          'bg-transparent!':
            !!backgrounds.dataUrl &&
            preferences.settings.background.scope === 'global',
        }"
      >
        <WorkspaceBackground
          v-if="preferences.settings.background.scope === 'conversation'"
        />
        <AppHeader
          :title="title"
          :status="infrastructure.status"
          @appearance="appearanceOpen = true"
          @settings="applicationSettingsOpen = true"
          @workspace="
            preferences.patch({
              rightPanelOpen: !preferences.settings.rightPanelOpen,
            })
          "
        />
        <div
          v-if="preferences.error"
          role="alert"
          class="border-b border-destructive/30 px-5 py-2 text-xs text-destructive"
        >
          {{ preferences.error.message }} Preferences may not be saved.
          <Button
            v-if="!preferences.ready"
            variant="link"
            size="sm"
            @click="preferences.initialize()"
            >Retry loading preferences</Button
          >
        </div>
        <WelcomeState
          v-if="
            preferences.settings.selectedMode === 'ask' && !chat.messages.length
          "
          @connect="settingsOpen = true"
          @prompt="prompt"
        /><ConversationView
          v-else-if="preferences.settings.selectedMode === 'ask'"
        /><AgentActivity v-else />
        <div
          v-if="chat.error"
          role="alert"
          class="mx-auto flex w-full max-w-3xl items-start gap-3 px-5 pt-3 text-xs leading-5 text-destructive sm:px-8"
        >
          <div class="flex-1">
            <p>{{ chat.error.message }}</p>
            <Button
              v-if="
                chat.error.code === 'AUTH_REQUIRED' ||
                chat.error.code === 'MODEL_UNAVAILABLE'
              "
              variant="link"
              size="sm"
              class="h-auto px-0 py-1 text-xs"
              @click="settingsOpen = true"
              >Manage connection<ArrowUpRight class="ml-1 size-3" /></Button
            ><Button
              v-if="
                chat.error.code === 'QUOTA' &&
                connections.selected === 'chatgpt'
              "
              variant="link"
              size="sm"
              class="h-auto px-0 py-1 text-xs"
              @click="manageUsage"
              >Manage ChatGPT usage<ArrowUpRight class="ml-1 size-3"
            /></Button>
          </div>
          <Button
            variant="ghost"
            size="icon"
            class="size-6 shrink-0"
            aria-label="Dismiss error"
            @click="chat.dismissError"
            ><X class="size-3.5"
          /></Button>
        </div>
        <ModeSelector /><MessageComposer
          v-if="preferences.settings.selectedMode === 'ask'"
          ref="composer"
        /><AgentComposer v-else ref="composer" />
      </main>
      <WorkbenchPanel
        v-if="preferences.settings.rightPanelOpen"
        @close="preferences.patch({ rightPanelOpen: false })"
      />
      <SettingsDialog
        v-model="applicationSettingsOpen"
        :disabled="closing"
        @connections="settingsOpen = true"
      />
      <AppearanceDialog v-model="appearanceOpen" /><ConnectionsDialog
        v-model="settingsOpen"
      /> </SidebarProvider
  ></TooltipProvider>
</template>
