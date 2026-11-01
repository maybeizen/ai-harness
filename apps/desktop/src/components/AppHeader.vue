<script setup lang="ts">
import { PanelRight, Settings2 } from '@lucide/vue';
import { SidebarTrigger } from './ui/sidebar';
import { Button } from './ui/button';
import BrandMark from './BrandMark.vue';
import { useSettingsStore } from '../stores/settings';
const preferences = useSettingsStore();
defineProps<{ title: string; status: string }>();
defineEmits<{ appearance: []; settings: []; workspace: [] }>();
</script>
<template>
  <header
    :style="{
      height: preferences.settings.compactTitlebar ? '44px' : undefined,
    }"
    class="app-header relative flex h-[var(--toolbar-height,4rem)] shrink-0 items-center justify-between gap-3 border-b border-border/45 px-3 sm:px-5"
  >
    <div class="flex min-w-0 items-center gap-2">
      <SidebarTrigger class="text-muted-foreground" /><Button
        variant="ghost"
        size="sm"
        class="text-xs text-muted-foreground"
        @click="$emit('appearance')"
        >Appearance</Button
      ><span class="h-4 w-px bg-border" />
      <h2 class="truncate text-xs font-medium text-muted-foreground">
        {{ title }}
      </h2>
    </div>
    <div class="flex shrink-0 items-center gap-2">
      <span
        role="status"
        class="hidden text-[10px] text-muted-foreground lg:block"
        >{{
          status === 'ready'
            ? 'Local workstation'
            : status === 'starting'
              ? 'Starting runtime…'
              : 'Runtime unavailable'
        }}</span
      ><Button
        variant="ghost"
        size="icon"
        aria-label="Toggle workspace panel"
        @click="$emit('workspace')"
        ><PanelRight class="size-4" /></Button
      ><Button
        variant="ghost"
        size="icon"
        aria-label="Open settings"
        @click="$emit('settings')"
        ><Settings2 class="size-4" /></Button
      ><BrandMark class="size-5" />
    </div>
  </header>
</template>
