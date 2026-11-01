<script setup lang="ts">
import { computed, ref } from 'vue';
import MarkdownIt from 'markdown-it';
import DOMPurify from 'dompurify';
import CodeBlock from './CodeBlock.vue';
import { useBackend } from '../../transport/backend';
const props = defineProps<{ text: string }>();
const backend = useBackend();
const linkError = ref(false);
const markdown = new MarkdownIt({ html: false, linkify: false, breaks: false });
markdown.validateLink = (url) => /^https?:\/\//i.test(url);
markdown.renderer.rules.image = (tokens, index) =>
  markdown.utils.escapeHtml(tokens[index]?.content ?? '');
type Chunk =
  | { type: 'html'; html: string }
  | { type: 'code'; code: string; language: string };
const chunks = computed(() => {
  const result: Chunk[] = [];
  let group: ReturnType<typeof markdown.parse> = [];
  function flush() {
    if (group.length) {
      result.push({
        type: 'html',
        html: DOMPurify.sanitize(
          markdown.renderer.render(group, markdown.options, {}),
          { FORBID_TAGS: ['img', 'svg', 'iframe', 'style', 'form'] },
        ),
      });
      group = [];
    }
  }
  for (const token of markdown.parse(props.text, {})) {
    if (token.type === 'fence' || token.type === 'code_block') {
      flush();
      result.push({
        type: 'code',
        code: token.content,
        language: token.info.trim().split(/\s+/)[0] ?? '',
      });
    } else group.push(token);
  }
  flush();
  return result;
});
function open(event: MouseEvent) {
  if (!(event.target instanceof Element)) return;
  const anchor = event.target.closest('a');
  if (!anchor) return;
  event.preventDefault();
  const href = anchor.getAttribute('href');
  if (href)
    void backend.open(href).catch(() => {
      linkError.value = true;
    });
}
</script>
<template>
  <div class="markdown" @click="open">
    <template v-for="(chunk, index) in chunks" :key="index">
      <CodeBlock
        v-if="chunk.type === 'code'"
        :code="chunk.code"
        :language="chunk.language"
      />
      <!-- Raw HTML and remote images are disabled; rendered HTML is sanitized. -->
      <!-- eslint-disable-next-line vue/no-v-html -->
      <div v-else v-html="chunk.html" />
    </template>
    <p v-if="linkError" role="status" class="text-xs text-destructive">
      The link could not be opened in your browser.
    </p>
  </div>
</template>
