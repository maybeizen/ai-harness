<script setup lang="ts">
import { nextTick, onMounted, ref, watch } from 'vue';
import { ArrowUp, Square, FolderOpen } from '@lucide/vue';
import { useAgentsStore } from '../../stores/agents';
import { useChatStore } from '../../stores/chat';
import { useWorkbenchStore } from '../../stores/workbench';
import { useSettingsStore } from '../../stores/settings';
import { useConnectionsStore } from '../../stores/connections';
import { Textarea } from '../ui/textarea';
import { Button } from '../ui/button';
import NativeSelect from '../ui/NativeSelect.vue';
import ModelPicker from '../chat/ModelPicker.vue';
import AttachmentBar from '../chat/AttachmentBar.vue';
import { useComposerField } from '../chat/composer-field';
const agents = useAgentsStore();
const chat = useChatStore();
const work = useWorkbenchStore();
const preferences = useSettingsStore();
const connections = useConnectionsStore();
const root = ref<HTMLElement | null>(null);
const { resize, focus } = useComposerField(root);
onMounted(() => {
  void work.refresh();
  focus();
});
watch(
  () => chat.draft,
  () => {
    void nextTick(resize);
  },
);
watch(
  () => [chat.conversationId, agents.active] as const,
  (current, previous) => {
    if (!previous || current[0] !== previous[0] || (previous[1] && !current[1]))
      void nextTick(focus);
  },
);
defineExpose({ focus });
function key(event: KeyboardEvent) {
  if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
    event.preventDefault();
    void agents.send();
  }
}
</script>
<template>
  <div
    class="relative mx-auto w-full max-w-[var(--chat-width,48rem)] px-4 pt-3 pb-4 sm:px-8"
  >
    <div class="mb-2 flex min-w-0 items-center gap-2">
      <label for="agent-workspace" class="sr-only">Agent workspace</label
      ><NativeSelect
        id="agent-workspace"
        :model-value="preferences.settings.activeDirectory ?? ''"
        :disabled="agents.active"
        @update:model-value="work.select($event)"
        ><option value="" disabled>Select workspace</option>
        <option
          v-for="directory in work.directories"
          :key="directory.id"
          :value="directory.id"
          :disabled="!directory.available"
        >
          {{ directory.name }}{{ directory.available ? '' : ' · missing' }}
        </option></NativeSelect
      ><Button
        variant="ghost"
        size="icon"
        aria-label="Choose agent workspace"
        :disabled="agents.active"
        @click="work.open"
        ><FolderOpen class="size-4"
      /></Button>
    </div>
    <div ref="root" class="rounded-xl border bg-card p-2">
      <AttachmentBar
        :disabled="agents.active"
        :files="chat.pending"
        :notice="
          chat.imagesHeld
            ? 'Images stay on this device. This model does not list vision, so they are not sent.'
            : ''
        "
        @attach="chat.attach"
        @remove="chat.removeAttachment"
      />
      <Textarea
        v-model="chat.draft"
        aria-label="Agent task"
        class="min-h-24 border-0 bg-transparent shadow-none"
        :disabled="agents.active"
        placeholder="Describe the task, paste an error, or request a review…"
        @input="resize"
        @keydown="key"
      />
      <div class="flex items-center justify-between gap-2">
        <ModelPicker /><Button
          v-if="agents.active"
          size="icon"
          aria-label="Stop agent task"
          :disabled="agents.stopping"
          @click="agents.stop"
          ><Square class="size-4" /></Button
        ><Button
          v-else
          size="icon"
          aria-label="Run agent task"
          :disabled="
            !agents.supported ||
            !connections.ready ||
            !chat.draft.trim() ||
            !preferences.settings.activeDirectory
          "
          @click="agents.send"
          ><ArrowUp class="size-4"
        /></Button>
      </div>
    </div>
    <p class="mt-2 text-[10px] text-muted-foreground">
      {{
        agents.supported
          ? 'Tools stay inside the selected workspace. Commands require a verified isolated executor.'
          : 'Select an OpenAI, Anthropic, Google or xAI API connection for tool workflows. Account chat remains available in Ask mode.'
      }}
    </p>
    <p v-if="agents.error" role="alert" class="mt-2 text-xs text-destructive">
      {{ agents.error.message }}
    </p>
  </div>
</template>
