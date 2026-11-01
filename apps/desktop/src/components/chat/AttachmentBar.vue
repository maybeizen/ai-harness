<script setup lang="ts">
import { Paperclip, X } from '@lucide/vue';
import {
  attachmentMediaTypes,
  type AttachmentReference,
} from '@harness/contracts';
import { Button } from '../ui/button';
defineProps<{
  disabled: boolean;
  files: AttachmentReference[];
  notice: string;
}>();
const emit = defineEmits<{ attach: [file: File]; remove: [id: string] }>();
function change(event: Event) {
  const input = event.target;
  if (!(input instanceof HTMLInputElement)) return;
  for (const file of input.files ?? []) emit('attach', file);
  input.value = '';
}
</script>
<template>
  <div class="flex min-w-0 flex-col gap-2">
    <div class="flex flex-wrap items-center gap-1.5">
      <label
        class="inline-flex size-8 cursor-pointer items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground has-[:disabled]:pointer-events-none has-[:disabled]:opacity-50"
      >
        <span class="sr-only">Attach a file</span>
        <input
          class="sr-only"
          type="file"
          multiple
          :accept="attachmentMediaTypes.join(',')"
          :disabled="disabled"
          @change="change"
        /><Paperclip class="size-3.5" aria-hidden="true" />
      </label>
      <span
        v-for="file in files"
        :key="file.id"
        class="inline-flex max-w-full items-center gap-1 rounded-md border bg-background px-2 py-1 text-xs"
      >
        <span class="truncate">{{ file.name }}</span>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          class="size-5"
          :aria-label="`Remove ${file.name}`"
          :disabled="disabled"
          @click="emit('remove', file.id)"
          ><X class="size-3"
        /></Button>
      </span>
    </div>
    <p v-if="notice" class="px-1 text-[10px] leading-4 text-muted-foreground">
      {{ notice }}
    </p>
  </div>
</template>
