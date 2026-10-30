<script setup lang="ts">
import { computed, ref } from 'vue';
import { Check, Copy, Pencil, Pin, Trash2 } from '@lucide/vue';
import type { ConversationSummary } from '@harness/contracts';
import { useChatStore } from '../../stores/chat';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '../ui/dialog';
const emit = defineEmits<{ selected: [] }>();
const chat = useChatStore();
const query = ref('');
const editing = ref<ConversationSummary | null>(null);
const deleting = ref<ConversationSummary | null>(null);
const title = ref('');
const busy = ref(false);
const copied = ref<string | null>(null);
const filtered = computed(() =>
  [...chat.conversations]
    .filter((item) =>
      item.title.toLocaleLowerCase().includes(query.value.toLocaleLowerCase()),
    )
    .sort(
      (a, b) =>
        Number(b.pinned) - Number(a.pinned) || b.updatedAt - a.updatedAt,
    ),
);
async function select(id: string) {
  await chat.selectConversation(id);
  emit('selected');
}
function rename(item: ConversationSummary) {
  title.value = item.title;
  editing.value = item;
}
async function save() {
  if (!editing.value || !title.value.trim() || busy.value) return;
  busy.value = true;
  if (
    await chat.updateConversation(
      editing.value.id,
      title.value,
      editing.value.pinned,
    )
  )
    editing.value = null;
  busy.value = false;
}
async function remove() {
  if (!deleting.value || busy.value) return;
  busy.value = true;
  if (await chat.deleteConversation(deleting.value.id)) deleting.value = null;
  busy.value = false;
}
async function copyExport(id: string) {
  if (await chat.exportConversation(id)) copied.value = id;
}
</script>
<template>
  <section aria-label="Conversation history" class="min-w-0 px-2">
    <div class="mb-3 px-1">
      <label
        for="conversation-search"
        class="mb-2 block text-xs font-medium text-muted-foreground"
        >Conversations</label
      >
      <Input
        id="conversation-search"
        v-model="query"
        type="search"
        placeholder="Search conversations…"
        class="h-8 bg-background/40 text-xs"
      />
    </div>
    <p
      v-if="chat.historyLoading"
      role="status"
      class="px-2 py-3 text-xs text-muted-foreground"
    >
      Loading conversations…
    </p>
    <p
      v-else-if="!filtered.length"
      class="px-2 py-3 text-xs leading-5 text-muted-foreground"
    >
      {{
        query
          ? 'No matching conversations.'
          : 'Your conversations will appear here.'
      }}
    </p>
    <ul class="space-y-1">
      <li
        v-for="item in filtered"
        :key="item.id"
        class="group rounded-md"
        :class="
          item.id === chat.conversationId
            ? 'bg-sidebar-accent'
            : 'hover:bg-sidebar-accent/60'
        "
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
        <div class="flex justify-end gap-0.5 px-1 pb-1">
          <Button
            variant="ghost"
            size="icon"
            class="size-6 text-muted-foreground"
            :aria-label="`${item.pinned ? 'Unpin' : 'Pin'} ${item.title}`"
            @click="chat.updateConversation(item.id, item.title, !item.pinned)"
            ><Pin class="size-3"
          /></Button>
          <Button
            variant="ghost"
            size="icon"
            class="size-6 text-muted-foreground"
            :aria-label="`Rename ${item.title}`"
            @click="rename(item)"
            ><Pencil class="size-3"
          /></Button>
          <Button
            variant="ghost"
            size="icon"
            class="size-6 text-muted-foreground"
            :aria-label="`Copy export of ${item.title}`"
            @click="copyExport(item.id)"
            ><Check v-if="copied === item.id" class="size-3" /><Copy
              v-else
              class="size-3"
          /></Button>
          <Button
            variant="ghost"
            size="icon"
            class="size-6 text-muted-foreground hover:text-destructive"
            :aria-label="`Delete ${item.title}`"
            @click="deleting = item"
            ><Trash2 class="size-3"
          /></Button>
        </div>
      </li>
    </ul>
    <p v-if="copied" role="status" class="sr-only">
      Conversation export copied.
    </p>
    <Dialog
      :open="!!editing"
      @update:open="
        (open) => {
          if (!open && !busy) editing = null;
        }
      "
    >
      <DialogContent class="sm:max-w-md">
        <DialogHeader
          ><DialogTitle>Rename conversation</DialogTitle
          ><DialogDescription
            >Choose a title to find this conversation later.</DialogDescription
          ></DialogHeader
        >
        <form @submit.prevent="save">
          <label for="conversation-title" class="mb-2 block text-sm"
            >Title</label
          ><Input
            id="conversation-title"
            v-model="title"
            maxlength="200"
            autofocus
            :disabled="busy"
          /><DialogFooter class="mt-5"
            ><Button
              type="button"
              variant="outline"
              :disabled="busy"
              @click="editing = null"
              >Cancel</Button
            ><Button type="submit" :disabled="busy || !title.trim()"
              >Save title</Button
            ></DialogFooter
          >
        </form>
      </DialogContent>
    </Dialog>
    <Dialog
      :open="!!deleting"
      @update:open="
        (open) => {
          if (!open && !busy) deleting = null;
        }
      "
    >
      <DialogContent class="sm:max-w-md">
        <DialogHeader
          ><DialogTitle>Delete conversation?</DialogTitle
          ><DialogDescription
            >“{{ deleting?.title }}” and its messages will be permanently
            deleted from this device. This cannot be undone.</DialogDescription
          ></DialogHeader
        >
        <DialogFooter
          ><Button variant="outline" :disabled="busy" @click="deleting = null"
            >Cancel</Button
          ><Button variant="destructive" :disabled="busy" @click="remove"
            >Delete conversation</Button
          ></DialogFooter
        >
      </DialogContent>
    </Dialog>
  </section>
</template>
