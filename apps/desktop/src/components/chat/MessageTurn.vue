<script setup lang="ts">
import { Aperture, Check, Copy, LoaderCircle } from '@lucide/vue';
import { Button } from '../ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip';
import type { ChatMessage } from '../../stores/chat';
import { useCopy } from '../../composables/useCopy';
import MarkdownContent from './MarkdownContent.vue';
defineProps<{ message: ChatMessage }>();
const { copy, copied, failed } = useCopy();
</script>
<template>
  <article
    :aria-label="message.role === 'user' ? 'Your message' : 'Assistant reply'"
    class="group fade-in mb-8"
    :data-message-status="message.status"
  >
    <div
      v-if="message.role === 'user'"
      class="ml-auto max-w-[90%] rounded-2xl rounded-tr-md border border-border/60 bg-secondary/70 px-5 py-3.5 text-sm leading-7 whitespace-pre-wrap sm:max-w-[85%]"
    >
      {{ message.text }}
    </div>
    <template v-else>
      <div class="mb-3 flex items-center gap-2.5 text-xs">
        <span
          class="flex size-6 items-center justify-center rounded-lg border border-primary/20 bg-primary/8 text-primary"
          ><Aperture class="size-3.5" /></span
        ><span class="font-medium text-foreground">{{ message.modelName }}</span
        ><span v-if="message.status === 'stopped'" class="text-muted-foreground"
          >Stopped</span
        ><span
          v-else-if="message.status === 'error'"
          class="text-muted-foreground"
          >Interrupted</span
        >
      </div>
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
    </template>
    <div
      class="mt-1 flex"
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
      <span v-if="failed" role="status" class="text-xs text-destructive"
        >Clipboard unavailable.</span
      >
    </div>
  </article>
</template>
