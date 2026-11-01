<script setup lang="ts">
import { ref, watch } from 'vue';
import type { ConversationSummary } from '@harness/contracts';
import { useChatStore } from '../../stores/chat';
import { useSettingsStore } from '../../stores/settings';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
const editing = defineModel<ConversationSummary | null>('editing', {
  required: true,
});
const deleting = defineModel<ConversationSummary | null>('deleting', {
  required: true,
});
const retaining = defineModel<boolean>('retaining', { required: true });
const chat = useChatStore();
const preferences = useSettingsStore();
const title = ref('');
const busy = ref(false);
watch(editing, (value) => {
  if (value) title.value = value.title;
});
function openRename(value: boolean) {
  if (value && editing.value) title.value = editing.value.title;
  if (!value && !busy.value) editing.value = null;
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
async function applyRetention() {
  if (busy.value) return;
  busy.value = true;
  if (await chat.applyRetention()) retaining.value = false;
  busy.value = false;
}
</script>
<template>
  <Dialog :open="!!editing" @update:open="openRename">
    <DialogContent class="sm:max-w-md">
      <DialogHeader
        ><DialogTitle>Rename conversation</DialogTitle
        ><DialogDescription
          >Choose a title to find this conversation later.</DialogDescription
        ></DialogHeader
      >
      <form @submit.prevent="save">
        <label for="conversation-title" class="mb-2 block text-sm">Title</label
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
    :open="retaining"
    @update:open="
      (open) => {
        if (!open && !busy) retaining = false;
      }
    "
  >
    <DialogContent class="sm:max-w-md">
      <DialogHeader
        ><DialogTitle>Apply retention?</DialogTitle
        ><DialogDescription>
          {{
            preferences.settings.retention.enabled
              ? 'Older conversations that exceed the saved age or count limits will be deleted. The open conversation is kept. This cannot be undone.'
              : 'Retention is off, so nothing will be deleted.'
          }}
        </DialogDescription></DialogHeader
      >
      <DialogFooter
        ><Button variant="outline" :disabled="busy" @click="retaining = false"
          >Cancel</Button
        ><Button
          variant="destructive"
          :disabled="busy || !preferences.settings.retention.enabled"
          @click="applyRetention"
          >Delete matching conversations</Button
        ></DialogFooter
      >
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
          >“{{ deleting?.title }}” and its messages will be permanently deleted
          from this device. This cannot be undone.</DialogDescription
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
</template>
