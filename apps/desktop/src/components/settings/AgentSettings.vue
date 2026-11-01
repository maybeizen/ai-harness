<script setup lang="ts">
import { agentModes, type AgentMode } from '@harness/contracts';
import { useSettingsStore } from '../../stores/settings';
import NativeSelect from '../ui/NativeSelect.vue';
const preferences = useSettingsStore();
const boundaries: Record<AgentMode, string> = {
  ask: 'Ask is read-only. It can use approved read context and cannot modify files or run commands.',
  plan: 'Plan is read-only. It can inspect context and write a plan. It cannot modify files.',
  edit: 'Edit can read and apply approved file writes, edits, deletes, and patches. It cannot run commands.',
  agent:
    'Agent can read, edit, and delete files and can run commands when an isolated executor is available. Writes follow the permission policy.',
  multitask:
    'Multitask can use the same tools as Agent for independent task parts. It does not grant extra permissions.',
  debug:
    'Debug can use the same tools as Agent while investigating an error. It cannot claim a fix without verification.',
  review:
    'Review is read-only. It reports findings and cannot modify files or run commands.',
  security:
    'Security is read-only. It reports evidence-backed findings and cannot modify files or run commands.',
};
</script>
<template>
  <section class="setting-section" aria-labelledby="agent-settings-heading">
    <div>
      <h3 id="agent-settings-heading" class="text-sm font-semibold">Agent</h3>
      <p class="mt-1 text-xs leading-5 text-muted-foreground">
        The saved mode is the one new tasks use.
      </p>
    </div>
    <div class="grid gap-2">
      <label for="agent-mode" class="text-xs font-medium">Mode</label
      ><NativeSelect
        id="agent-mode"
        :model-value="preferences.settings.selectedMode"
        @update:model-value="
          preferences.patch({ selectedMode: $event as AgentMode })
        "
        ><option v-for="mode in agentModes" :key="mode" :value="mode">
          {{ mode }}
        </option></NativeSelect
      >
    </div>
    <p class="text-xs leading-5 text-muted-foreground">
      {{ boundaries[preferences.settings.selectedMode] }}
    </p>
  </section>
</template>
