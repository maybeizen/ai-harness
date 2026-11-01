<script setup lang="ts">
import { nextTick, ref, watch } from 'vue';
import { ArrowUp, Square, LoaderCircle } from '@lucide/vue';
import { Textarea } from '../ui/textarea';
import { Button } from '../ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip';
import { useChatStore } from '../../stores/chat';
import { useConnectionsStore } from '../../stores/connections';
import ModelPicker from './ModelPicker.vue';
import AttachmentBar from './AttachmentBar.vue';
import { useComposerField } from './composer-field';
const chat = useChatStore();
const connections = useConnectionsStore();
const root = ref<HTMLElement | null>(null);
const { resize, focus } = useComposerField(root);
function stop(event: MouseEvent) {
  if (event.detail < 2) void chat.stop();
}
function keydown(event: KeyboardEvent) {
  if (
    event.key === 'Enter' &&
    !event.shiftKey &&
    !event.isComposing &&
    event.keyCode !== 229
  ) {
    event.preventDefault();
    void chat.send();
  }
}
watch(
  () => chat.draft,
  () => {
    void nextTick(resize);
  },
);
watch(
  () => [chat.conversationId, chat.active] as const,
  (current, previous) => {
    if (!previous || current[0] !== previous[0] || (previous[1] && !current[1]))
      void nextTick(focus);
  },
);
defineExpose({ focus });
</script>
<template>
  <div
    class="mx-auto w-full max-w-[var(--chat-width,48rem)] px-4 pt-3 pb-4 sm:px-8"
  >
    <div
      ref="root"
      class="rounded-2xl border border-border bg-card shadow-lg shadow-background/30 transition-colors focus-within:border-primary/45"
    >
      <div class="px-2.5 pt-2.5">
        <AttachmentBar
          :disabled="chat.active"
          :files="chat.pending"
          :notice="
            chat.imagesHeld
              ? 'Images stay on this device. This model does not list vision, so they are not sent.'
              : ''
          "
          @attach="chat.attach"
          @remove="chat.removeAttachment"
        />
      </div>
      <Textarea
        v-model="chat.draft"
        aria-label="Message"
        :placeholder="
          connections.ready
            ? 'Write a message…'
            : connections.connection?.status === 'connected'
              ? 'Select a model to begin…'
              : 'Connect a provider to begin…'
        "
        class="min-h-24 resize-none rounded-2xl border-0 bg-transparent px-4 pt-4 pb-2 text-sm leading-6 shadow-none placeholder:text-muted-foreground/70 focus-visible:ring-0"
        :disabled="chat.active"
        @input="resize"
        @keydown="keydown"
      />
      <div class="flex items-center justify-between gap-2 px-2.5 pb-2.5">
        <ModelPicker />
        <Tooltip
          ><TooltipTrigger as-child>
            <Button
              v-if="chat.active"
              aria-label="Stop generation"
              size="icon"
              variant="secondary"
              class="size-8 shrink-0 rounded-lg"
              :disabled="chat.stopping"
              @click="stop"
              ><LoaderCircle
                v-if="chat.stopping"
                class="size-3.5 animate-spin" /><Square
                v-else
                class="size-3.5 fill-current"
            /></Button>
            <Button
              v-else
              aria-label="Send message"
              size="icon"
              class="size-8 shrink-0 rounded-lg"
              :disabled="!chat.canSend"
              @click="chat.send"
              ><ArrowUp class="size-4"
            /></Button> </TooltipTrigger
          ><TooltipContent>{{
            chat.active ? 'Stop response' : 'Send message · Enter'
          }}</TooltipContent></Tooltip
        >
      </div>
    </div>
    <div
      class="mt-2.5 flex items-center justify-between gap-2 px-1 text-[10px] text-muted-foreground/75"
    >
      <span>{{
        connections.connection?.method === 'api-key'
          ? 'Uses provider API quota · separate from chat subscriptions'
          : connections.connection?.method === 'official-client'
            ? 'Uses your official Claude client'
            : connections.connection?.method === 'subscription'
              ? 'Uses your ChatGPT plan when connected'
              : 'Choose a connection and model'
      }}</span
      ><span class="hidden shrink-0 sm:block"
        >Shift + Enter for a new line</span
      >
    </div>
  </div>
</template>
