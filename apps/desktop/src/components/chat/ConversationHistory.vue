<script setup lang="ts">
import { ref } from 'vue';
import { ChevronRight, MoreHorizontal, Pin, Trash2, Upload } from '@lucide/vue';
import type { ConversationSummary } from '@harness/contracts';
import { useSettingsStore } from '../../stores/settings';
import { useChatStore } from '../../stores/chat';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import ConversationDialogs from './ConversationDialogs.vue';
const emit = defineEmits<{ selected: [] }>();
const chat = useChatStore();
const preferences = useSettingsStore();
const editing = ref<ConversationSummary | null>(null);
const deleting = ref<ConversationSummary | null>(null);
const retaining = ref(false);
const menu = ref<string | null>(null);
function toggleConversations() {
  void preferences.patch({
    sidebarGroups: {
      ...preferences.settings.sidebarGroups,
      conversations: !preferences.settings.sidebarGroups.conversations,
    },
  });
}
function search(value: string | number) {
  if (!preferences.settings.sidebarGroups.conversations)
    void preferences.patch({
      sidebarGroups: {
        ...preferences.settings.sidebarGroups,
        conversations: true,
      },
    });
  void chat.searchHistory(String(value)).catch(() => undefined);
}
function more() {
  void chat.loadMoreHistory().catch(() => undefined);
}
async function select(id: string) {
  await chat.selectConversation(id);
  if (chat.conversationId === id)
    await preferences.patch({ selectedMode: 'ask' });
  emit('selected');
}
function rename(item: ConversationSummary) {
  editing.value = item;
}
async function exportFile(id: string) {
  menu.value = null;
  await chat.exportConversation(id);
}
function chooseImport(event: Event) {
  const input = event.target;
  if (!(input instanceof HTMLInputElement)) return;
  const file = input.files?.[0];
  input.value = '';
  if (file) void chat.importConversation(file);
}
</script>
<template>
  <section aria-label="Conversation history" class="min-w-0 px-2">
    <div class="mb-3 px-1">
      <div class="mb-2 flex items-center gap-1">
        <button
          type="button"
          class="flex min-w-0 flex-1 items-center gap-1 text-xs font-medium text-muted-foreground"
          :aria-expanded="preferences.settings.sidebarGroups.conversations"
          @click="toggleConversations"
        >
          <ChevronRight
            class="size-3.5 transition-transform"
            :class="
              preferences.settings.sidebarGroups.conversations
                ? 'rotate-90'
                : ''
            "
          />Conversations
        </button>
        <label
          class="inline-flex size-7 cursor-pointer items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <span class="sr-only">Import conversation</span>
          <input
            class="sr-only"
            type="file"
            accept="application/json,.json"
            @change="chooseImport"
          /><Upload class="size-3.5" aria-hidden="true" />
        </label>
      </div>
      <Input
        id="conversation-search"
        aria-label="Search conversations"
        :model-value="chat.historyQuery"
        maxlength="200"
        type="search"
        placeholder="Search conversations…"
        class="h-8 bg-background/40 text-xs"
        @update:model-value="search"
      />
    </div>
    <p
      v-if="
        chat.historyLoading ||
        (chat.historyPaging && !chat.conversations.length)
      "
      role="status"
      class="px-2 py-3 text-xs text-muted-foreground"
    >
      Loading conversations…
    </p>
    <p
      v-else-if="!chat.conversations.length"
      class="px-2 py-3 text-xs leading-5 text-muted-foreground"
    >
      {{
        chat.historyQuery
          ? 'No matching conversations.'
          : 'Your conversations will appear here.'
      }}
    </p>
    <ul
      v-if="preferences.settings.sidebarGroups.conversations"
      class="space-y-1"
    >
      <li
        v-for="item in chat.conversations"
        :key="item.id"
        class="group relative rounded-md"
        :class="
          item.id === chat.conversationId
            ? 'bg-sidebar-accent'
            : 'hover:bg-sidebar-accent/60'
        "
        @contextmenu.prevent="menu = item.id"
      >
        <button
          class="flex w-full min-w-0 items-center gap-2 rounded-md px-2 py-2 text-left text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
          :aria-label="item.title"
          :aria-current="item.id === chat.conversationId ? 'page' : undefined"
          @click="select(item.id)"
        >
          <Pin
            v-if="item.pinned"
            class="size-3 shrink-0 text-primary"
            aria-label="Pinned"
          />
          <span class="truncate">{{ item.title }}</span>
        </button>
        <div class="flex justify-end px-1 pb-1">
          <Button
            variant="ghost"
            size="icon"
            class="size-6 text-muted-foreground"
            :aria-label="`Actions for ${item.title}`"
            aria-haspopup="menu"
            :aria-expanded="menu === item.id"
            @click.stop="menu = menu === item.id ? null : item.id"
            ><MoreHorizontal class="size-3.5"
          /></Button>
          <div
            v-if="menu === item.id"
            role="menu"
            class="absolute top-8 right-1 z-30 grid w-36 gap-0.5 rounded-md border bg-popover p-1 text-xs shadow-md"
            @keydown.esc="menu = null"
          >
            <button
              type="button"
              role="menuitem"
              class="rounded px-2 py-1.5 text-left hover:bg-accent"
              @click="
                menu = null;
                chat.updateConversation(item.id, item.title, !item.pinned);
              "
            >
              {{ item.pinned ? 'Unpin' : 'Pin' }}
            </button>
            <button
              type="button"
              role="menuitem"
              class="rounded px-2 py-1.5 text-left hover:bg-accent"
              @click="
                menu = null;
                rename(item);
              "
            >
              Rename
            </button>
            <button
              type="button"
              role="menuitem"
              class="rounded px-2 py-1.5 text-left hover:bg-accent"
              @click="exportFile(item.id)"
            >
              Export
            </button>
            <button
              type="button"
              role="menuitem"
              class="rounded px-2 py-1.5 text-left text-destructive hover:bg-accent"
              @click="
                menu = null;
                deleting = item;
              "
            >
              Delete
            </button>
          </div>
        </div>
      </li>
    </ul>
    <p
      v-if="chat.historyError"
      role="alert"
      class="px-2 py-2 text-xs text-destructive"
    >
      {{ chat.historyError.message }}
    </p>
    <Button
      v-if="
        preferences.settings.sidebarGroups.conversations && chat.historyHasMore
      "
      variant="ghost"
      class="mt-2 w-full text-xs"
      :disabled="chat.historyPaging"
      @click="more"
      >{{ chat.historyPaging ? 'Loading…' : 'Load more conversations' }}</Button
    >
    <Button
      variant="ghost"
      class="mt-2 w-full justify-start text-xs"
      @click="retaining = true"
      ><Trash2 class="size-3.5" />Apply retention</Button
    >
    <ConversationDialogs
      v-model:editing="editing"
      v-model:deleting="deleting"
      v-model:retaining="retaining"
    />
  </section>
</template>
