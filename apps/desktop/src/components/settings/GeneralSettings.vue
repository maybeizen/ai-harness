<script setup lang="ts">
import { computed, ref } from 'vue';
import {
  agentModes,
  type AgentMode,
  type PermissionPolicy,
  type ConnectionKind,
} from '@harness/contracts';
import { useSettingsStore } from '../../stores/settings';
import { useConnectionsStore } from '../../stores/connections';
import { useChatStore } from '../../stores/chat';
import NativeSelect from '../ui/NativeSelect.vue';
import { Button } from '../ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '../ui/dialog';
import { controlCheckbox } from '../ui/control-styles';
const props = withDefaults(defineProps<{ disabled?: boolean }>(), {
  disabled: false,
});
const emit = defineEmits<{ connections: [] }>();
const preferences = useSettingsStore();
const connections = useConnectionsStore();
const chat = useChatStore();
const fullConfirm = ref(false);
const policyRevision = ref(0);
const modeLabels: Record<AgentMode, string> = {
  ask: 'Ask',
  plan: 'Plan',
  edit: 'Edit',
  agent: 'Agent',
  multitask: 'Multitask',
  debug: 'Debug',
  review: 'Code Review',
  security: 'Security Audit',
};
function policy(value: string) {
  policyRevision.value++;
  if (value === 'full' && preferences.settings.permissionPolicy !== 'full')
    fullConfirm.value = true;
  else void preferences.patch({ permissionPolicy: value as PermissionPolicy });
}
const models = computed(() => connections.models[connections.selected] ?? []);
async function provider(value: string) {
  connections.select(value as ConnectionKind);
  await preferences.patch({
    selectedProvider: connections.selected,
    selectedModel: '',
  });
}
async function model(value: string) {
  connections.modelId = value;
  await preferences.patch({ selectedModel: value });
}
</script>
<template>
  <section class="setting-section" aria-labelledby="general-settings-heading">
    <div>
      <h3 id="general-settings-heading" class="text-sm font-semibold">
        General
      </h3>
      <p class="mt-1 text-xs leading-5 text-muted-foreground">
        Your last conversation, selected model and layout are restored on
        startup. Provider credentials remain in their existing secure storage.
      </p>
    </div>
    <fieldset
      class="setting-section"
      :disabled="chat.active || !!connections.busy || connections.loading"
    >
      <div class="grid gap-2">
        <label for="general-provider" class="text-xs font-medium"
          >Preferred provider connection</label
        ><NativeSelect
          id="general-provider"
          :model-value="connections.selected"
          @update:model-value="provider"
          ><option
            v-for="connection in connections.records"
            :key="connection.id"
            :value="connection.id"
          >
            {{ connection.label
            }}{{ connection.status === 'connected' ? '' : ' · Unavailable' }}
          </option></NativeSelect
        >
      </div>
      <div class="grid gap-2">
        <label for="general-model" class="text-xs font-medium"
          >Preferred model</label
        ><NativeSelect
          id="general-model"
          :model-value="connections.modelId"
          :disabled="connections.connection?.status !== 'connected'"
          @update:model-value="model"
          ><option value="">Select an available model</option>
          <option
            v-for="entry in models"
            :key="entry.id"
            :value="entry.id"
            :disabled="!entry.available"
          >
            {{ entry.name }}{{ entry.available ? '' : ' · Unavailable' }}
          </option></NativeSelect
        >
      </div>
      <p class="text-xs text-muted-foreground">
        Changes apply to this session and are saved as the selection for your
        next launch. Model changes pause while a response is running.
      </p>
    </fieldset>
    <Button
      variant="outline"
      class="justify-self-start"
      @click="emit('connections')"
      >Manage provider connections</Button
    >
    <section class="setting-section border-t pt-5" aria-label="Agent defaults">
      <h4 class="text-sm font-medium">Agent defaults</h4>
      <div class="grid gap-2">
        <label for="general-agent-mode" class="text-xs font-medium"
          >Default agent mode</label
        ><NativeSelect
          id="general-agent-mode"
          :model-value="preferences.settings.selectedMode"
          @update:model-value="
            preferences.patch({ selectedMode: $event as AgentMode })
          "
          ><option v-for="mode in agentModes" :key="mode" :value="mode">
            {{ modeLabels[mode] }}
          </option></NativeSelect
        >
      </div>
      <div class="grid gap-2">
        <label for="general-permission-policy" class="text-xs font-medium"
          >Permission policy</label
        ><NativeSelect
          id="general-permission-policy"
          :key="preferences.settings.permissionPolicy + policyRevision"
          :model-value="preferences.settings.permissionPolicy"
          @update:model-value="policy"
          ><option value="manual">Manual approvals</option>
          <option value="automatic">Automatic safe approvals</option>
          <option value="full">
            Full access within workspace
          </option></NativeSelect
        >
      </div>
      <p class="text-xs leading-5 text-muted-foreground">
        Manual approvals require a decision for sensitive effects. Automatic
        approvals permit configured safe operations. Full access still respects
        protected paths and workspace boundaries.
      </p>
    </section>
    <section
      class="setting-section border-t pt-5"
      aria-label="Panel visibility"
    >
      <h4 class="text-sm font-medium">Workspace layout</h4>
      <label class="flex items-center gap-3 text-sm"
        ><input
          type="checkbox"
          :class="controlCheckbox"
          :checked="preferences.settings.sidebarOpen"
          @change="
            preferences.patch({
              sidebarOpen: ($event.target as HTMLInputElement).checked,
            })
          "
        />Show sidebar</label
      >
      <label class="flex items-center gap-3 text-sm"
        ><input
          type="checkbox"
          :class="controlCheckbox"
          :checked="preferences.settings.rightPanelOpen"
          @change="
            preferences.patch({
              rightPanelOpen: ($event.target as HTMLInputElement).checked,
            })
          "
        />Show developer panel</label
      >
    </section>
    <Dialog
      :open="fullConfirm && !props.disabled"
      @update:open="fullConfirm = $event"
      ><DialogContent class="sm:max-w-md"
        ><DialogHeader
          ><DialogTitle>Enable full access?</DialogTitle
          ><DialogDescription
            >Agent tasks may edit files and run permitted commands within the
            selected workspace without individual approvals. Commands use your
            operating-system privileges. Protected paths and prohibited
            operations remain blocked.</DialogDescription
          ></DialogHeader
        ><DialogFooter
          ><Button variant="outline" @click="fullConfirm = false"
            >Keep current policy</Button
          ><Button
            @click="
              preferences.patch({ permissionPolicy: 'full' });
              fullConfirm = false;
            "
            >Enable full access</Button
          ></DialogFooter
        ></DialogContent
      ></Dialog
    >
  </section>
</template>
