<script setup lang="ts">
import { ref } from 'vue';
import { RefreshCw } from '@lucide/vue';
import { useWorkbenchStore } from '../../stores/workbench';
import { useDiffReviewStore } from '../../stores/diff-review';
import { Button } from '../ui/button';
import { Textarea } from '../ui/textarea';
const work = useWorkbenchStore();
const review = useDiffReviewStore();
const message = ref('');
async function commit() {
  if (await work.commit(message.value)) message.value = '';
}
</script>
<template>
  <section class="grid gap-3 border-b p-3 text-xs" aria-label="Git changes">
    <div class="flex items-center justify-between">
      <span class="font-medium">{{ work.branch || 'Repository' }}</span
      ><Button
        variant="ghost"
        size="icon"
        aria-label="Refresh Git changes"
        :disabled="work.mutationBusy"
        @click="work.git(work.stagedView)"
        ><RefreshCw class="size-3.5"
      /></Button>
    </div>
    <div class="flex gap-2">
      <Button
        variant="outline"
        size="sm"
        :aria-pressed="!work.stagedView"
        @click="work.git(false)"
        >Unstaged diff</Button
      ><Button
        variant="outline"
        size="sm"
        :aria-pressed="work.stagedView"
        @click="work.git(true)"
        >Staged diff</Button
      >
    </div>
    <div
      v-for="change in work.changes"
      :key="change.path"
      class="flex min-w-0 items-center gap-1"
    >
      <span class="shrink-0 font-mono text-muted-foreground"
        >{{ change.index }}{{ change.worktree }}</span
      ><button
        class="min-w-0 flex-1 truncate text-left font-mono"
        :title="change.path"
        @click="review.open(work.directoryId, change.path, work.stagedView)"
      >
        {{ change.path }}</button
      ><Button
        v-if="change.worktree !== ' '"
        variant="ghost"
        size="sm"
        :disabled="work.mutationBusy"
        :aria-label="`Stage ${change.path}`"
        @click="work.stage(change.path, true)"
        >Stage</Button
      ><Button
        v-if="change.index !== ' ' && change.index !== '?'"
        variant="ghost"
        size="sm"
        :disabled="work.mutationBusy"
        :aria-label="`Unstage ${change.path}`"
        @click="work.stage(change.path, false)"
        >Unstage</Button
      >
    </div>
    <p v-if="!work.changes.length && !work.busy" class="text-muted-foreground">
      No working-tree changes.
    </p>
    <form class="grid gap-2 border-t pt-3" @submit.prevent="commit">
      <label for="commit-message" class="font-medium">Commit message</label
      ><Textarea
        id="commit-message"
        v-model="message"
        maxlength="4000"
        class="min-h-20"
        :disabled="work.mutationBusy"
        placeholder="Describe the staged changes"
      />
      <p class="text-[10px] leading-4 text-muted-foreground">
        Creates an unsigned local commit without Git hooks. Native confirmation
        is required. No push is performed.
      </p>
      <Button
        variant="outline"
        size="sm"
        :disabled="
          work.mutationBusy ||
          !message.trim() ||
          !work.changes.some(
            (change) => change.index !== ' ' && change.index !== '?',
          )
        "
        type="submit"
        >Commit staged changes…</Button
      >
    </form>
    <p v-if="work.commitResult" role="status" class="text-muted-foreground">
      {{ work.commitResult }}
    </p>
  </section>
</template>
