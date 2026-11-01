<script setup lang="ts">
import { ref, watch } from 'vue';
import DOMPurify from 'dompurify';
import { Check, Copy } from '@lucide/vue';
import { Button } from '../ui/button';
import { useCopy } from '../../composables/useCopy';
const props = defineProps<{ code: string; language: string }>();
const html = ref('');
const { copy, copied, failed } = useCopy();
let revision = 0;
const escape = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
watch(
  () => [props.code, props.language],
  async () => {
    const current = ++revision;
    html.value = `<pre class="shiki"><code>${escape(props.code)}</code></pre>`;
    try {
      const { codeToHtml, bundledLanguages } = await import('shiki/bundle/web');
      const language = Object.hasOwn(bundledLanguages, props.language)
        ? (props.language as keyof typeof bundledLanguages)
        : 'text';
      const result = await codeToHtml(props.code, {
        lang: language,
        themes: { light: 'github-light', dark: 'github-dark' },
      });
      if (current === revision) html.value = DOMPurify.sanitize(result);
    } catch {
      /* Plain text remains readable while highlighting is unavailable. */
    }
  },
  { immediate: true },
);
</script>
<template>
  <div class="my-4 overflow-hidden rounded-xl border border-border bg-card">
    <div
      class="flex items-center justify-between border-b border-border px-4 py-2 text-xs text-muted-foreground"
    >
      <span class="font-mono">{{ language || 'text' }}</span>
      <Button
        variant="ghost"
        size="sm"
        class="h-6 gap-1.5 px-2 text-xs"
        :aria-label="copied ? 'Code copied' : 'Copy code'"
        @click="copy(code)"
        ><Check v-if="copied" class="size-3.5" /><Copy
          v-else
          class="size-3.5"
        />{{ copied ? 'Copied' : 'Copy' }}</Button
      >
    </div>
    <!-- Shiki output is escaped and sanitized before insertion. -->
    <!-- eslint-disable-next-line vue/no-v-html -->
    <div v-html="html" />
    <p v-if="failed" role="status" class="px-4 pb-2 text-xs text-destructive">
      Clipboard unavailable.
    </p>
  </div>
</template>
