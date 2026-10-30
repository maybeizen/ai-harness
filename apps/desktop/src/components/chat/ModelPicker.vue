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
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select';
import { useConnectionsStore } from '../../stores/connections';
import { useChatStore } from '../../stores/chat';
import type { ConnectionKind } from '@harness/contracts';
const connections = useConnectionsStore();
const chat = useChatStore();
const open = ref(false);
const models = computed(() => connections.models[connections.selected] ?? []);
function select(value: unknown) {
  if (typeof value === 'string' && !chat.active)
    connections.select(value as ConnectionKind);
}
</script>
<template>
  <div class="flex min-w-0 flex-wrap items-center gap-1.5">
    <Select
      :model-value="connections.selected"
      :disabled="chat.active || !!connections.busy"
      @update:model-value="select"
    >
      <SelectTrigger
        aria-label="AI provider connection"
        class="h-8 w-auto max-w-44 gap-2 border-0 bg-transparent px-2 text-xs shadow-none focus:ring-1"
        ><SelectValue placeholder="Select provider">{{
          connections.connection?.label ?? 'Select provider'
        }}</SelectValue></SelectTrigger
      >
      <SelectContent
        ><SelectItem
          v-for="connection in connections.records"
          :key="connection.id"
          :value="connection.id"
          ><span>{{ connection.label }}</span
          ><span class="ml-2 text-xs text-muted-foreground">{{
            connection.status === 'connected'
              ? 'Connected'
              : connection.status === 'checking'
                ? 'Checking'
                : connection.configured
                  ? 'Unavailable'
                  : 'Not connected'
          }}</span></SelectItem
        ></SelectContent
      >
    </Select>
    <span class="text-border">/</span>
    <Popover v-model:open="open"
      ><PopoverTrigger as-child
        ><Button
          variant="ghost"
          size="sm"
          class="h-8 max-w-56 gap-2 px-2 text-xs font-normal"
          :disabled="
            chat.active || connections.connection?.status !== 'connected'
          "
          aria-label="Select model"
          :aria-expanded="open"
          ><LoaderCircle
            v-if="connections.connection?.status === 'checking'"
            class="size-3 animate-spin" /><span class="truncate">{{
            connections.model?.name ?? 'Select model'
          }}</span
          ><ChevronDown class="size-3 text-muted-foreground" /></Button
      ></PopoverTrigger>
      <PopoverContent class="w-80 p-0" align="start"
        ><Command
          ><CommandInput placeholder="Find a model…" /><CommandList
            ><CommandEmpty>No available text models.</CommandEmpty
            ><CommandGroup heading="Available through this connection"
              ><CommandItem
                v-for="model in models"
                :key="model.id"
                :value="`${model.name} ${model.id}`"
                :disabled="!model.available"
                @select="
                  () => {
                    connections.modelId = model.id;
                    open = false;
                  }
                "
                ><span class="min-w-0 flex-1 truncate">{{ model.name }}</span
                ><Check
                  v-if="connections.modelId === model.id"
                  class="size-3.5 text-primary" /></CommandItem></CommandGroup></CommandList></Command
      ></PopoverContent>
    </Popover>
  </div>
</template>
