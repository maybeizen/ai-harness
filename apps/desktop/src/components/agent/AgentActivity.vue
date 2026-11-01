<script setup lang="ts">
import { ref, computed, onMounted, nextTick, watch } from 'vue';
import { useAgentsStore } from '../../stores/agents';
import { Button } from '../ui/button';
import NativeSelect from '../ui/NativeSelect.vue';
import MarkdownContent from '../chat/MarkdownContent.vue';
import {
  activityCards,
  completionSummary,
  taskStatusLabel,
} from './activity-model';
const agents = useAgentsStore();
const root = ref<HTMLElement>();
const follow = ref(true);
const text = computed(() =>
  agents.events
    .filter((event) => event.type === 'text')
    .map((event) => event.text)
    .join(''),
);
const cards = computed(() => activityCards(agents.events));
const summary = computed(() => completionSummary(agents.events));
const statusLabel = computed(
  () => taskStatusLabel[agents.state] ?? agents.state,
);
onMounted(() => {
  void agents.refresh();
});
watch(
  () => agents.events.length,
  () => {
    if (follow.value)
      void nextTick(() => {
        if (root.value) root.value.scrollTop = root.value.scrollHeight;
      });
  },
);
function scroll() {
  if (root.value)
    follow.value =
      root.value.scrollHeight - root.value.scrollTop - root.value.clientHeight <
      80;
}
</script>
<template>
  <section
    ref="root"
    class="relative min-h-0 flex-1 overflow-auto"
    aria-label="Agent activity"
    @scroll="scroll"
  >
    <div
      class="mx-auto grid w-full max-w-[var(--chat-width,48rem)] gap-5 px-4 py-5 sm:px-8"
    >
      <div class="grid gap-2">
        <label
          for="agent-history"
          class="text-xs font-medium text-muted-foreground"
          >Agent tasks</label
        ><NativeSelect
          id="agent-history"
          :model-value="agents.selectedId ?? ''"
          @update:model-value="agents.select($event)"
          ><option value="" disabled>Choose a previous task</option>
          <option
            v-for="session in agents.sessions"
            :key="session.id"
            :value="session.id"
          >
            {{ session.mode }} · {{ session.promptPreview }} ·
            {{ taskStatusLabel[session.status] ?? session.status }}
          </option></NativeSelect
        >
      </div>
      <div v-if="!agents.selectedId" class="py-8">
        <h1 class="text-xl font-semibold">Work with your project</h1>
        <p class="mt-3 text-sm leading-6 text-muted-foreground">
          Choose a workspace and a connected API model. Plan, debug, review
          changes or carry out an approved task. Each operation passes through
          workspace and permission checks.
        </p>
      </div>
      <div
        v-if="agents.selectedId"
        class="flex items-center justify-between gap-3"
      >
        <p role="status" class="text-xs text-muted-foreground">
          {{ statusLabel }}{{ agents.starting ? ' · Starting…' : '' }}
        </p>
        <Button
          v-if="agents.state === 'resumable'"
          size="sm"
          @click="agents.continueTask()"
          >Continue</Button
        >
      </div>
      <MarkdownContent v-if="text" :text="text" />
      <div
        v-for="approval in agents.approvals"
        :key="approval.id"
        class="grid gap-3 rounded-lg border border-primary/40 bg-card p-4"
      >
        <h2 class="text-sm font-semibold">
          Approval required · {{ approval.tool }}
        </h2>
        <pre
          class="max-h-60 overflow-auto text-xs break-words whitespace-pre-wrap"
          >{{ approval.summary }}</pre>
        <p class="text-xs text-muted-foreground">
          This approval applies once to this exact operation in this task.
        </p>
        <div class="flex gap-2">
          <Button size="sm" @click="agents.decide(approval, true)"
            >Allow once</Button
          ><Button
            variant="outline"
            size="sm"
            @click="agents.decide(approval, false)"
            >Deny</Button
          >
        </div>
      </div>
      <article
        v-for="card in cards"
        :key="card.key"
        class="grid gap-2 rounded-md border bg-card p-3 text-xs"
        :data-tone="card.tone"
      >
        <h2 class="font-medium">{{ card.title }}</h2>
        <pre
          v-if="card.body"
          class="max-h-60 overflow-auto break-words whitespace-pre-wrap text-muted-foreground"
          >{{ card.body }}</pre>
      </article>
      <details
        v-if="
          summary && agents.state !== 'running' && agents.state !== 'reserved'
        "
        class="rounded-md border bg-card p-3 text-xs"
      >
        <summary class="cursor-pointer font-medium">Completion summary</summary>
        <pre
          class="mt-3 max-h-80 overflow-auto break-words whitespace-pre-wrap"
          >{{ summary }}</pre>
      </details>
    </div>
  </section>
</template>
