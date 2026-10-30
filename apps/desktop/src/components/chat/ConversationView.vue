<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { ArrowDown } from '@lucide/vue';
import { ScrollArea } from '../ui/scroll-area';
import { Button } from '../ui/button';
import { useChatStore } from '../../stores/chat';
import MessageTurn from './MessageTurn.vue';
const chat = useChatStore();
const root = ref<HTMLElement | null>(null);
const following = ref(true);
let frame = 0;
let disposed = false;
const latest = computed(() => chat.messages.at(-1)?.text);
function viewport() {
  return (
    root.value?.querySelector<HTMLElement>(
      '[data-reka-scroll-area-viewport]',
    ) ??
    root.value?.querySelector<HTMLElement>('[data-radix-scroll-area-viewport]')
  );
}
function scroll() {
  following.value = true;
  const element = viewport();
  if (element) element.scrollTop = element.scrollHeight;
}
function schedule() {
  if (!following.value) return;
  cancelAnimationFrame(frame);
  void nextTick(() => {
    if (!disposed)
      frame = requestAnimationFrame(() => {
        if (following.value && !disposed) scroll();
      });
  });
}
function onScroll(event: Event) {
  if (event.target instanceof HTMLElement && event.target === viewport()) {
    const target = event.target;
    following.value =
      target.scrollHeight - target.scrollTop - target.clientHeight < 96;
  }
}
watch(latest, schedule);
watch(
  () => chat.messages.length,
  () => {
    following.value = true;
    schedule();
  },
);
onBeforeUnmount(() => {
  disposed = true;
  cancelAnimationFrame(frame);
});
</script>
<template>
  <div ref="root" class="relative min-h-0 flex-1">
    <ScrollArea class="h-full" @scroll-capture="onScroll">
      <div
        role="log"
        aria-label="Conversation"
        aria-live="off"
        class="mx-auto w-full max-w-3xl px-5 pt-8 pb-2 sm:px-8"
      >
        <MessageTurn
          v-for="message in chat.messages"
          :key="message.id"
          :message="message"
        />
      </div>
    </ScrollArea>
    <Button
      v-if="!following"
      variant="outline"
      size="sm"
      class="absolute bottom-4 left-1/2 -translate-x-1/2 gap-2 rounded-full bg-popover shadow-lg"
      @click="scroll"
      ><ArrowDown class="size-3.5" />Jump to latest</Button
    >
    <p class="sr-only" role="status">
      {{ chat.active ? 'Assistant is responding.' : 'Response complete.' }}
    </p>
  </div>
</template>
