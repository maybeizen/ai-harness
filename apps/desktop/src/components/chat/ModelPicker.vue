<script setup lang="ts">
import { computed, ref } from 'vue';
import { Check, ChevronDown, LoaderCircle } from '@lucide/vue';
import { Button } from '../ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '../ui/command';
import {
  Select,
  SelectGroup,
  SelectLabel,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select';
import { useConnectionsStore } from '../../stores/connections';
import { useAgentsStore } from '../../stores/agents';
import { useChatStore } from '../../stores/chat';
import { useSettingsStore } from '../../stores/settings';
import {
  connectionKinds,
  connectionProfiles,
  unavailableCapabilityNotes,
  type ConnectionKind,
  type ConnectionSummary,
} from '@harness/contracts';
const connections = useConnectionsStore();
const chat = useChatStore();
const agents = useAgentsStore();
const preferences = useSettingsStore();
const open = ref(false);
const company = computed(
  () => connectionProfiles[connections.selected].company,
);
const groups = computed(() =>
  [...new Set(connectionKinds.map((id) => connectionProfiles[id].company))]
    .map((name) => ({
      name,
      records: connections.records.filter(
        (record) => connectionProfiles[record.id].company === name,
      ),
    }))
    .filter((group) => group.records.length),
);
const unavailable = computed(
  () => !!connections.modelId && !connections.model && !connections.loading,
);
const models = computed(() => connections.models[connections.selected] ?? []);
const capabilityNotes = computed(() =>
  connections.model
    ? unavailableCapabilityNotes(connections.model.capabilities)
    : [],
);
function accessLabel(method: ConnectionSummary['method']) {
  switch (method) {
    case 'api-key':
      return 'API';
    case 'endpoint':
      return 'Endpoint';
    case 'official-client':
      return 'Client';
    case 'subscription':
      return 'Account';
  }
}
function toolBlocked(tools: string | undefined) {
  return preferences.settings.selectedMode !== 'ask' && tools === 'unsupported';
}
function select(value: unknown) {
  if (typeof value === 'string' && !chat.active && !agents.active)
    connections.select(value as ConnectionKind);
}
</script>
<template>
  <div class="flex min-w-0 flex-wrap items-center gap-1.5">
    <Select
      :model-value="connections.selected"
      :disabled="chat.active || agents.active || !!connections.busy"
      @update:model-value="select"
    >
      <SelectTrigger
        aria-label="AI provider connection"
        class="h-[var(--control-small-height)] w-auto max-w-44 gap-2 border-0 bg-transparent px-2 text-xs shadow-none focus:ring-1"
        ><SelectValue placeholder="Select provider">{{
          company ?? 'Select provider'
        }}</SelectValue></SelectTrigger
      >
      <SelectContent>
        <SelectGroup v-for="group in groups" :key="group.name">
          <SelectLabel>{{ group.name }}</SelectLabel>
          <SelectItem
            v-for="connection in group.records"
            :key="connection.id"
            :value="connection.id"
          >
            <span>{{ group.name }} · {{ accessLabel(connection.method) }}</span>
            <span class="ml-2 text-xs text-muted-foreground">{{
              connection.status === 'connected'
                ? 'Connected'
                : connection.status === 'checking'
                  ? 'Checking'
                  : connection.configured
                    ? 'Unavailable'
                    : 'Not connected'
            }}</span>
          </SelectItem>
        </SelectGroup>
      </SelectContent>
    </Select>
    <span class="text-border">/</span>
    <Popover v-model:open="open"
      ><PopoverTrigger as-child
        ><Button
          variant="ghost"
          size="sm"
          class="h-[var(--control-small-height)] max-w-56 gap-2 px-2 text-xs font-normal"
          :disabled="
            chat.active ||
            agents.active ||
            connections.connection?.status !== 'connected'
          "
          aria-label="Select model"
          :aria-expanded="open"
          ><LoaderCircle
            v-if="connections.connection?.status === 'checking'"
            class="size-3 animate-spin" /><span class="truncate">{{
            connections.model?.name ??
            (unavailable ? 'Model unavailable' : 'Select model')
          }}</span
          ><ChevronDown class="size-3 text-muted-foreground" /></Button
      ></PopoverTrigger>
      <PopoverContent class="w-80 p-0" align="start"
        ><Command
          ><CommandInput placeholder="Find a model…" /><CommandList
            ><CommandEmpty>No available text models.</CommandEmpty
            ><CommandGroup :heading="`${company} models`"
              ><CommandItem
                v-for="model in models"
                :key="model.id"
                :value="`${model.name} ${model.id}`"
                :disabled="
                  !model.available || toolBlocked(model.capabilities?.tools)
                "
                @select="
                  () => {
                    if (
                      chat.active ||
                      agents.active ||
                      !model.available ||
                      toolBlocked(model.capabilities?.tools)
                    )
                      return;
                    connections.modelId = model.id;
                    open = false;
                  }
                "
                ><span class="min-w-0 flex-1 truncate">{{ model.name }}</span
                ><span
                  v-if="toolBlocked(model.capabilities?.tools)"
                  class="max-w-28 truncate text-[10px] text-muted-foreground"
                  >Tool calls unavailable</span
                ><Check
                  v-if="connections.modelId === model.id"
                  class="size-3.5 text-primary" /></CommandItem></CommandGroup></CommandList></Command
      ></PopoverContent>
    </Popover>
    <p
      v-if="unavailable"
      class="w-full px-2 text-[11px] text-muted-foreground"
      role="status"
    >
      Your saved model is unavailable. Refresh the connection in settings or
      select another model.
    </p>
    <ul
      v-if="capabilityNotes.length"
      class="w-full list-none px-2 text-[11px] leading-5 text-muted-foreground"
    >
      <li v-for="note in capabilityNotes" :key="note">{{ note }}</li>
    </ul>
  </div>
</template>
