<script setup lang="ts">
import { computed } from 'vue';
import { useBackgroundStore } from '../stores/background';
import { useSettingsStore } from '../stores/settings';
const backgrounds = useBackgroundStore();
const preferences = useSettingsStore();
const style = computed(() => ({
  backgroundImage: backgrounds.dataUrl
    ? `url("${backgrounds.dataUrl}")`
    : undefined,
  backgroundPosition: preferences.settings.background.position,
  opacity: preferences.settings.background.opacity,
  filter: `blur(${preferences.settings.background.blur}px)`,
}));
</script>
<template>
  <div
    v-if="backgrounds.dataUrl"
    aria-hidden="true"
    class="workspace-background pointer-events-none absolute inset-0 overflow-hidden"
  >
    <div class="absolute -inset-8 bg-cover" :style="style" />
    <div
      class="absolute inset-0 bg-background"
      :style="{ opacity: preferences.settings.background.overlay }"
    />
  </div>
</template>
