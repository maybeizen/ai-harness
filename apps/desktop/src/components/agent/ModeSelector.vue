<script setup lang="ts">
import { agentModes, type AgentMode } from '@harness/contracts';
import { useSettingsStore } from '../../stores/settings';
import { useChatStore } from '../../stores/chat';
import { useAgentsStore } from '../../stores/agents';
import NativeSelect from '../ui/NativeSelect.vue';
const preferences = useSettingsStore();
const chat = useChatStore();
const agents = useAgentsStore();
const labels: Record<AgentMode, string> = {
  ask: 'Ask',
  plan: 'Plan',
  edit: 'Edit',
  agent: 'Agent',
  multitask: 'Multitask',
  debug: 'Debug',
  review: 'Code review',
  security: 'Security audit',
};
</script>
<template>
  <div
    class="relative mx-auto flex w-full max-w-[var(--chat-width,48rem)] items-center gap-3 px-4 pt-2 sm:px-8"
  >
    <label for="execution-mode" class="text-xs text-muted-foreground"
      >Mode</label
    ><NativeSelect
      id="execution-mode"
      class="max-w-44"
      :model-value="preferences.settings.selectedMode"
      :disabled="chat.active || agents.starting"
      @update:model-value="
        preferences.patch({ selectedMode: $event as AgentMode })
      "
      ><option v-for="mode in agentModes" :key="mode" :value="mode">
        {{ labels[mode] }}
      </option></NativeSelect
    ><span
      v-if="preferences.settings.selectedMode !== 'ask'"
      class="truncate text-[10px] text-muted-foreground"
      >{{
        preferences.settings.permissionPolicy === 'full'
          ? 'Workspace full access'
          : preferences.settings.permissionPolicy === 'automatic'
            ? 'Safe automatic approvals'
            : 'Manual write approvals'
      }}</span
    >
  </div>
</template>
