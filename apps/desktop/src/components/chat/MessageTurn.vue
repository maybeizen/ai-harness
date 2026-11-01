<script setup lang="ts">
import { ref } from 'vue';
import BrandMark from '../BrandMark.vue';
import {
  Check,
  Copy,
  LoaderCircle,
  Pencil,
  RefreshCw,
  RotateCcw,
} from '@lucide/vue';
import { Button } from '../ui/button';
import { Textarea } from '../ui/textarea';
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip';
import type { AttachmentReference } from '@harness/contracts';
import type { ChatMessage } from '../../stores/chat';
import { useCopy } from '../../composables/useCopy';
import MarkdownContent from './MarkdownContent.vue';
import MessageDetails from './MessageDetails.vue';
const props = defineProps<{
  message: ChatMessage;
  earlier?: ChatMessage | undefined;
  attachments: AttachmentReference[];
  canEdit: boolean;
  canRegenerate: boolean;
  canRetry: boolean;
}>();
const emit = defineEmits<{
  edit: [text: string];
  regenerate: [];
  retry: [];
}>();
const { copy, copied, failed } = useCopy();
const editing = ref(false);
const draft = ref('');
function beginEdit() {
  draft.value = props.message.text;
  editing.value = true;
}
function save() {
  const text = draft.value.trim();
  if (!text) return;
  editing.value = false;
  emit('edit', text);
}
</script>
<template>
  <article
    :aria-label="message.role === 'user' ? 'Your message' : 'Assistant reply'"
    class="group fade-in mb-8"
    :data-message-status="message.status"
  >
    <div
      v-if="message.role === 'user'"
      class="ml-auto max-w-[90%] sm:max-w-[85%]"
    >
      <form
        v-if="editing"
        class="grid gap-2 rounded-2xl border bg-card p-3"
        @submit.prevent="save"
      >
        <Textarea v-model="draft" aria-label="Edit message" class="min-h-20" />
        <div class="flex justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            @click="editing = false"
            >Cancel</Button
          ><Button type="submit" size="sm" :disabled="!draft.trim()"
            >Save</Button
          >
        </div>
      </form>
      <div
        v-else
        class="rounded-2xl rounded-tr-md border border-border/60 bg-secondary/70 px-5 py-3.5 text-sm leading-7 whitespace-pre-wrap"
      >
        {{ message.text }}
      </div>
      <MessageDetails :message="message" />
      <ul
        v-if="attachments.length"
        class="mt-2 flex flex-wrap justify-end gap-1.5"
      >
        <li
          v-for="file in attachments"
          :key="file.id"
          class="max-w-full truncate rounded-md border bg-card px-2 py-1 text-[11px]"
        >
          {{ file.name }}
        </li>
      </ul>
    </div>
    <template v-else>
      <div class="mb-3 flex flex-wrap items-center gap-2.5 text-xs">
        <span
          class="flex size-6 items-center justify-center rounded-lg border border-primary/20 bg-primary/8 text-primary"
          ><BrandMark class="size-3.5" /></span
        ><span class="font-medium text-foreground">{{ message.modelName }}</span
        ><span v-if="message.status === 'stopped'" class="text-muted-foreground"
          >Stopped</span
        ><span
          v-else-if="message.status === 'error'"
          class="text-muted-foreground"
          >Interrupted</span
        >
      </div>
      <details v-if="earlier" class="mb-3 rounded-lg border px-3 py-2">
        <summary class="cursor-pointer text-xs text-muted-foreground">
          Previous reply
        </summary>
        <p class="mt-2 text-sm leading-6 whitespace-pre-wrap">
          {{ earlier.text }}
        </p>
      </details>
      <MarkdownContent v-if="message.text" :text="message.text" />
      <div
        v-else-if="message.status === 'streaming'"
        class="flex items-center gap-2 py-2 text-sm text-muted-foreground"
      >
        <LoaderCircle class="size-3.5 animate-spin" />Preparing a reply
      </div>
      <p
        v-else-if="message.status === 'stopped'"
        class="text-sm text-muted-foreground"
      >
        Response stopped before text was received.
      </p>
      <MessageDetails :message="message" />
    </template>
    <div
      class="mt-1 flex flex-wrap items-center gap-1"
      :class="message.role === 'user' ? 'justify-end' : ''"
    >
      <Tooltip
        ><TooltipTrigger as-child
          ><Button
            v-if="message.text"
            variant="ghost"
            size="icon"
            class="size-7 text-muted-foreground hover:text-foreground"
            :aria-label="copied ? 'Message copied' : 'Copy message'"
            @click="copy(message.text)"
            ><Check v-if="copied" class="size-3.5" /><Copy
              v-else
              class="size-3.5" /></Button></TooltipTrigger
        ><TooltipContent>{{
          copied ? 'Copied' : 'Copy message'
        }}</TooltipContent></Tooltip
      >
      <Button
        v-if="canEdit"
        variant="ghost"
        size="sm"
        class="h-7 gap-1 px-2 text-xs text-muted-foreground"
        @click="beginEdit"
        ><Pencil class="size-3.5" />Edit</Button
      >
      <Button
        v-if="canRetry"
        variant="ghost"
        size="sm"
        class="h-7 gap-1 px-2 text-xs text-muted-foreground"
        @click="emit('retry')"
        ><RotateCcw class="size-3.5" />Retry</Button
      >
      <Button
        v-if="canRegenerate"
        variant="ghost"
        size="sm"
        class="h-7 gap-1 px-2 text-xs text-muted-foreground"
        @click="emit('regenerate')"
        ><RefreshCw class="size-3.5" />Regenerate</Button
      >
      <span v-if="failed" role="status" class="text-xs text-destructive"
        >Clipboard unavailable.</span
      >
    </div>
  </article>
</template>
