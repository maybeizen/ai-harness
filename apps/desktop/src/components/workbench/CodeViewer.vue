<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue';
import type { mountViewer } from '../../integrations/viewer';
import { useSettingsStore } from '../../stores/settings';
const props = defineProps<{ text: string; path: string }>();
const preferences = useSettingsStore();
const root = ref<HTMLElement>();
let alive = true;
let viewer: ReturnType<typeof mountViewer> | undefined;
function language() {
  return props.path.endsWith('.diff')
    ? 'diff'
    : props.path.endsWith('.ts')
      ? 'typescript'
      : props.path.endsWith('.json')
        ? 'json'
        : props.path.endsWith('.js')
          ? 'javascript'
          : props.path.endsWith('.md')
            ? 'markdown'
            : 'plaintext';
}
onMounted(() => {
  void import('../../integrations/viewer').then((module) => {
    if (alive && root.value)
      viewer = module.mountViewer(
        root.value,
        props.text,
        language(),
        preferences.settings.editor,
      );
  });
});
watch(
  () => [props.text, props.path],
  () => viewer?.update(props.text, language()),
);
watch(
  () => preferences.settings.editor,
  (editor) => viewer?.apply(editor),
  { deep: true },
);
onUnmounted(() => {
  alive = false;
  viewer?.dispose();
});
</script>
<template>
  <div
    ref="root"
    class="h-full min-h-60 w-full"
    :aria-label="`Code viewer: ${path}`"
  />
</template>
