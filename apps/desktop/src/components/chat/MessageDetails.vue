<script setup lang="ts">
import { computed } from 'vue';
import type { ChatMessage } from '../../stores/chat';
import { fileReference } from './file-reference';
const props = defineProps<{ message: ChatMessage }>();
const stamp = computed(() =>
  props.message.createdAt
    ? new Intl.DateTimeFormat(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(props.message.createdAt)
    : '',
);
</script>
<template>
  <div class="mt-2 grid gap-2">
    <time
      v-if="stamp"
      class="text-[10px] text-muted-foreground"
      :datetime="new Date(message.createdAt ?? 0).toISOString()"
      >{{ stamp }}</time
    >
    <details
      v-if="message.reasoning"
      class="rounded-lg border bg-card px-3 py-2"
    >
      <summary class="cursor-pointer text-xs font-medium">Reasoning</summary>
      <p
        class="mt-2 text-xs leading-5 whitespace-pre-wrap text-muted-foreground"
      >
        {{ message.reasoning }}
      </p>
    </details>
    <ul v-if="message.tools?.length" class="grid gap-2">
      <li
        v-for="tool in message.tools"
        :key="tool.callId"
        class="rounded-lg border bg-card px-3 py-2 text-xs"
      >
        <div class="flex items-center justify-between gap-2">
          <span class="font-medium">{{ tool.name }}</span>
          <span class="text-muted-foreground">{{ tool.status }}</span>
        </div>
        <p
          v-if="fileReference(tool)"
          class="mt-1 truncate font-mono text-[11px]"
        >
          {{ fileReference(tool) }}
        </p>
        <p
          v-if="tool.output"
          class="mt-1 max-h-24 overflow-auto whitespace-pre-wrap text-muted-foreground"
        >
          {{ tool.output }}
        </p>
      </li>
    </ul>
  </div>
</template>
