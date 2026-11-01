<script setup lang="ts">
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
} from 'vue';
import { ArrowDown } from '@lucide/vue';
import { ScrollArea } from '../ui/scroll-area';
import { Button } from '../ui/button';
import { useChatStore } from '../../stores/chat';
import { visibleMessages } from '../../stores/conversation';
import MessageTurn from './MessageTurn.vue';
import { messageWindow, tailWindow } from './message-window';
const chat = useChatStore();
const root = ref<HTMLElement | null>(null);
const following = ref(true);
const scrollTop = ref(0);
const viewportHeight = ref(640);
const heights = ref<number[]>([]);
let frame = 0;
let disposed = false;
const rows = computed(() => visibleMessages(chat.messages));
const frameWindow = computed(() =>
  following.value
    ? tailWindow(rows.value.length, viewportHeight.value, heights.value)
    : messageWindow(
        rows.value.length,
        scrollTop.value,
        viewportHeight.value,
        heights.value,
      ),
);
const shown = computed(() =>
  rows.value.slice(frameWindow.value.start, frameWindow.value.end),
);
const latest = computed(() => rows.value.at(-1)?.text);
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
  if (!element) return;
  element.scrollTop = element.scrollHeight;
  scrollTop.value = element.scrollTop;
  viewportHeight.value = element.clientHeight || viewportHeight.value;
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
function measure() {
  const nodes = root.value?.querySelectorAll<HTMLElement>(
    '[data-message-index]',
  );
  if (!nodes?.length) return;
  const next = heights.value.slice();
  let changed = false;
  for (const node of nodes) {
    const index = Number(node.dataset.messageIndex);
    const height = Math.ceil(node.getBoundingClientRect().height);
    if (height > 0 && next[index] !== height) {
      next[index] = height;
      changed = true;
    }
  }
  if (changed) heights.value = next;
}
function onScroll(event: Event) {
  if (event.target instanceof HTMLElement && event.target === viewport()) {
    const target = event.target;
    scrollTop.value = target.scrollTop;
    viewportHeight.value = target.clientHeight || viewportHeight.value;
    following.value =
      target.scrollHeight - target.scrollTop - target.clientHeight < 96;
  }
}
function attachments(ids: string[] | undefined) {
  return chat.knownAttachments.filter((item) => ids?.includes(item.id));
}
function earlier(id: string | undefined) {
  if (!id) return undefined;
  return chat.messages.find((message) => message.id === id);
}
function canEdit(id: string) {
  if (chat.active) return false;
  return (
    [...rows.value].reverse().find((message) => message.role === 'user')?.id ===
    id
  );
}
function canRegenerate(id: string, status: string | undefined) {
  if (chat.active || status === 'streaming') return false;
  return (
    [...rows.value].reverse().find((message) => message.role === 'assistant')
      ?.id === id && status === 'completed'
  );
}
function canRetry(id: string, status: string | undefined) {
  if (chat.active) return false;
  return (
    [...rows.value].reverse().find((message) => message.role === 'assistant')
      ?.id === id &&
    (status === 'error' || status === 'stopped')
  );
}
watch(latest, schedule);
watch(
  () => rows.value.length,
  () => {
    following.value = true;
    schedule();
  },
);
watch(shown, () => {
  void nextTick(measure);
});
watch(
  () =>
    chat.messages
      .map((message) => message.attachmentIds?.join(':') ?? '')
      .join('|'),
  () => {
    void chat.loadAttachments();
  },
  { immediate: true },
);
onMounted(() => {
  const element = viewport();
  if (element?.clientHeight) viewportHeight.value = element.clientHeight;
  schedule();
});
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
        class="mx-auto w-full max-w-[var(--chat-width,48rem)] px-5 pt-8 pb-2 sm:px-8"
      >
        <div :style="{ height: `${frameWindow.top}px` }" />
        <div
          v-for="(message, offset) in shown"
          :key="message.id"
          :data-message-index="frameWindow.start + offset"
        >
          <MessageTurn
            :message="message"
            :earlier="
              earlier(message.parentId)?.role === message.role
                ? earlier(message.parentId)
                : undefined
            "
            :attachments="attachments(message.attachmentIds)"
            :can-edit="canEdit(message.id)"
            :can-regenerate="canRegenerate(message.id, message.status)"
            :can-retry="canRetry(message.id, message.status)"
            @edit="chat.editMessage(message.id, $event)"
            @regenerate="chat.regenerate(message.id)"
            @retry="chat.retry(message.id)"
          />
        </div>
        <div :style="{ height: `${frameWindow.bottom}px` }" />
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
