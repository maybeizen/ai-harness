<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted } from 'vue';
import type { mountDiffViewer } from '../../integrations/diff-viewer';
import { useSettingsStore } from '../../stores/settings';
import { useDiffReviewStore } from '../../stores/diff-review';
import { Button } from '../ui/button';
const review = useDiffReviewStore();
const preferences = useSettingsStore();
const root = ref<HTMLElement>();
const sideBySide = ref(true);
const confirmed = ref(false);
const rejecting = ref(false);
let alive = true;
let viewer: ReturnType<typeof mountDiffViewer> | undefined;
function language() {
  return review.path.endsWith('.ts')
    ? 'typescript'
    : review.path.endsWith('.json')
      ? 'json'
      : review.path.endsWith('.js')
        ? 'javascript'
        : review.path.endsWith('.md')
          ? 'markdown'
          : 'plaintext';
}
function mount() {
  if (!alive || !root.value || !review.path) return;
  void import('../../integrations/diff-viewer').then((module) => {
    if (!alive || !root.value) return;
    viewer?.dispose();
    viewer = module.mountDiffViewer(
      root.value,
      review.original,
      review.modified,
      language(),
      sideBySide.value,
      preferences.settings.editor,
    );
  });
}
onMounted(mount);
watch(
  () => [review.original, review.modified, review.path],
  () => {
    if (viewer) viewer.update(review.original, review.modified, language());
    else mount();
  },
);
watch(sideBySide, (value) => viewer?.layout(value));
watch(
  () => preferences.settings.editor,
  (editor) => viewer?.apply(editor),
  { deep: true },
);
watch(
  () => review.path,
  () => {
    confirmed.value = false;
    rejecting.value = false;
  },
);
onUnmounted(() => {
  alive = false;
  viewer?.dispose();
});
async function restore() {
  if (!confirmed.value) return;
  if (await review.rollback()) {
    confirmed.value = false;
    rejecting.value = false;
  }
}
</script>
<template>
  <section
    v-if="review.path"
    class="grid gap-2 border-t p-3"
    aria-label="Diff review"
  >
    <div class="flex flex-wrap items-center gap-2">
      <h3 class="min-w-0 flex-1 truncate font-mono text-xs">
        {{ review.path }}
      </h3>
      <Button
        variant="outline"
        size="sm"
        :aria-pressed="!sideBySide"
        @click="sideBySide = false"
        >Unified</Button
      ><Button
        variant="outline"
        size="sm"
        :aria-pressed="sideBySide"
        @click="sideBySide = true"
        >Split</Button
      >
    </div>
    <p v-if="review.conflict" role="alert" class="text-xs text-destructive">
      The file changed after this patch. Rollback was not applied.
    </p>
    <div ref="root" class="h-80 min-h-60 w-full" />
    <div v-if="review.patch" class="flex flex-wrap items-center gap-2">
      <Button size="sm" :disabled="review.busy" @click="review.accept()"
        >Accept</Button
      ><Button
        variant="outline"
        size="sm"
        :disabled="review.busy || review.conflict"
        @click="rejecting = true"
        >Reject</Button
      ><label class="flex items-center gap-2 text-xs">
        <input v-model="confirmed" type="checkbox" />
        Confirm rollback
      </label>
      <Button
        variant="outline"
        size="sm"
        :disabled="review.busy || review.conflict || !confirmed"
        @click="restore"
        >Roll back</Button
      >
      <Button
        v-if="rejecting"
        variant="outline"
        size="sm"
        :disabled="review.busy || review.conflict || !confirmed"
        @click="restore"
        >Confirm reject</Button
      >
    </div>
  </section>
  <p v-else class="p-3 text-xs text-muted-foreground">
    Select a changed file to review it in the diff editor.
  </p>
</template>
