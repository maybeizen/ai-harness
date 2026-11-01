<script setup lang="ts">
import { onMounted } from 'vue';
import { Plus, X } from '@lucide/vue';
import { useTerminalsStore } from '../../stores/terminals';
import { useSettingsStore } from '../../stores/settings';
import { Button } from '../ui/button';
import TerminalView from './TerminalView.vue';
const store = useTerminalsStore();
const preferences = useSettingsStore();
onMounted(() => {
  void store.refresh();
});
</script>
<template>
  <section class="flex h-full min-h-80 flex-col" aria-label="User terminals">
    <div class="flex flex-wrap items-center gap-1 border-b p-2">
      <div
        v-for="tab in store.tabs"
        :key="tab.id"
        class="flex items-center rounded border"
        :class="tab.id === store.selectedId ? 'bg-muted' : ''"
      >
        <Button variant="ghost" size="sm" @click="store.selectedId = tab.id"
          >{{ tab.label }} · {{ tab.status }}</Button
        ><Button
          variant="ghost"
          size="icon"
          class="size-6"
          :aria-label="`Close terminal ${tab.label}`"
          @click="store.close(tab.id)"
          ><X class="size-3"
        /></Button>
      </div>
      <Button
        variant="ghost"
        size="icon"
        aria-label="New user terminal"
        :disabled="
          !preferences.settings.activeDirectory ||
          store.busy ||
          store.tabs.length >= 6
        "
        @click="store.create(preferences.settings.activeDirectory!)"
        ><Plus class="size-4"
      /></Button>
    </div>
    <p class="border-b px-3 py-2 text-[10px] text-muted-foreground">
      User commands · account filesystem and network access · separate from
      isolated agent commands.
    </p>
    <p v-if="store.error" role="alert" class="p-3 text-xs text-destructive">
      {{ store.error.message }}
    </p>
    <TerminalView
      v-if="store.selectedId"
      :id="store.selectedId"
      :key="store.selectedId"
      class="min-h-0 flex-1"
    />
    <p v-else class="p-5 text-xs leading-5 text-muted-foreground">
      Select a workspace, then create a terminal. Opening a session requires
      native confirmation.
    </p>
  </section>
</template>
