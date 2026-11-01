<script setup lang="ts">
import BrandMark from '../BrandMark.vue';
import { ArrowUpRight, Lightbulb, NotebookPen, Waypoints } from '@lucide/vue';
import { Button } from '../ui/button';
import { useConnectionsStore } from '../../stores/connections';
const connections = useConnectionsStore();
const emit = defineEmits<{ connect: []; prompt: [text: string] }>();
const suggestions = [
  {
    icon: Lightbulb,
    title: 'Understand something',
    text: 'Explain a complicated idea with a simple example.',
  },
  {
    icon: Waypoints,
    title: 'Think it through',
    text: 'Help me think through a decision. Ask me what I am considering.',
  },
  {
    icon: NotebookPen,
    title: 'Find the right words',
    text: 'Help me turn rough notes into a clear, concise message.',
  },
];
</script>
<template>
  <div
    class="flex min-h-0 flex-1 items-center justify-center overflow-y-auto px-6 py-8"
  >
    <div class="fade-in w-full max-w-xl">
      <div
        class="mb-7 inline-flex size-12 items-center justify-center rounded-2xl border border-primary/20 bg-primary/6 text-primary"
      >
        <BrandMark class="size-6" />
      </div>
      <p
        class="mb-3 text-[10px] font-medium tracking-[0.2em] text-muted-foreground uppercase"
      >
        A space for your next idea
      </p>
      <h1 class="text-3xl leading-tight font-medium tracking-tight sm:text-4xl">
        What’s on your mind?
      </h1>
      <p class="mt-4 max-w-md text-sm leading-7 text-muted-foreground">
        A question, a rough draft, a different point of view.<br
          class="hidden sm:block"
        />Choose a model and start thinking out loud.
      </p>
      <Button
        v-if="
          !connections.records.some((record) => record.status === 'connected')
        "
        variant="outline"
        size="sm"
        class="mt-6 gap-2 text-xs"
        @click="emit('connect')"
        >Connect a provider<ArrowUpRight class="size-3.5"
      /></Button>
      <div class="mt-9 grid gap-2 sm:grid-cols-3">
        <button
          v-for="suggestion in suggestions"
          :key="suggestion.title"
          class="group rounded-xl border border-border/65 bg-card/30 p-4 text-left transition-colors hover:border-primary/35 hover:bg-card focus-visible:outline-2 focus-visible:outline-ring"
          @click="emit('prompt', suggestion.text)"
        >
          <component
            :is="suggestion.icon"
            class="mb-3 size-4 text-muted-foreground transition-colors group-hover:text-primary"
          /><span class="block text-xs font-medium">{{ suggestion.title }}</span
          ><span
            class="mt-1 block text-[11px] leading-5 text-muted-foreground"
            >{{ suggestion.text }}</span
          >
        </button>
      </div>
    </div>
  </div>
</template>
