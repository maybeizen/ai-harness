<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { Aperture, X, ArrowUpRight } from '@lucide/vue';
import { SidebarProvider, SidebarTrigger } from './components/ui/sidebar';
import { TooltipProvider } from './components/ui/tooltip';
import { Button } from './components/ui/button';
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
const connections = useConnectionsStore();
const infrastructure = useInfrastructureStore();
const chat = useChatStore();
const backend = useBackend();
const settingsOpen = ref(false);
const appearanceOpen = ref(false);
const preferences = useSettingsStore();
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
  infrastructure.start();
  void (async () => {
    await preferences.initialize();
    connections.selected = preferences.settings.selectedProvider;
    connections.modelId = preferences.settings.selectedModel;
    await chat.initialize();
    await connections.initialize();
  })();
  window.addEventListener('keydown', shortcuts);
});
onUnmounted(() => {
  window.removeEventListener('keydown', shortcuts);
  infrastructure.stop();
  if (chat.active) void chat.stop();
});
watch(
  () => [connections.selected, connections.modelId] as const,
  ([selectedProvider, selectedModel]) => {
    if (preferences.ready)
      void preferences.patch({ selectedProvider, selectedModel });
  },
);
function shortcuts(event: KeyboardEvent) {
  if (event.isComposing) return;
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'n') {
    event.preventDefault();
    void chat.newChat().then(() => nextTick(() => composer.value?.focus()));
  } else if ((event.ctrlKey || event.metaKey) && event.key === ',') {
    event.preventDefault();
    appearanceOpen.value = true;
  } else if (
    event.key === 'Escape' &&
    chat.active &&
    !settingsOpen.value &&
    !appearanceOpen.value
  ) {
    void chat.stop();
  }
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
      class="h-svh min-h-0 overflow-hidden [--sidebar-width:15.5rem]"
      @update:open="preferences.patch({ sidebarOpen: $event })"
    >
      <AppSidebar @connections="settingsOpen = true" />
      <main class="relative flex min-w-0 flex-1 flex-col bg-background">
        <header
          class="flex h-16 shrink-0 items-center justify-between gap-3 border-b border-border/45 px-4 sm:px-6"
        >
          <div class="flex min-w-0 items-center gap-3">
            <SidebarTrigger class="text-muted-foreground" /><Button
              variant="ghost"
              size="sm"
              class="text-xs text-muted-foreground"
              @click="appearanceOpen = true"
              >Appearance</Button
            ><span class="h-4 w-px bg-border" />
            <h2 class="truncate text-xs font-medium text-muted-foreground">
              {{ title }}
            </h2>
          </div>
          <div
            class="flex shrink-0 items-center gap-2 text-[10px] text-muted-foreground"
          >
            <span
              class="size-1.5 rounded-full"
              :class="
                infrastructure.status === 'ready'
                  ? 'bg-primary'
                  : 'bg-muted-foreground'
              "
            /><span role="status">{{
              infrastructure.status === 'ready'
                ? 'Local workstation'
                : infrastructure.status === 'starting'
                  ? 'Starting runtime…'
                  : 'Runtime unavailable'
            }}</span
            ><Aperture
              class="ml-2 hidden size-3.5 text-muted-foreground/50 sm:block"
            />
          </div>
        </header>
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
          v-if="!chat.messages.length"
          @connect="settingsOpen = true"
          @prompt="prompt"
        /><ConversationView v-else />
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
        <MessageComposer ref="composer" />
      </main>
      <AppearanceDialog v-model="appearanceOpen" /><ConnectionsDialog
        v-model="settingsOpen"
      /> </SidebarProvider
  ></TooltipProvider>
</template>
