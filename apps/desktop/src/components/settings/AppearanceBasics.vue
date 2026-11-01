<script setup lang="ts">
import { fontFamilies, type FontFamily } from '@harness/contracts';
import { useSettingsStore } from '../../stores/settings';
import NativeSelect from '../ui/NativeSelect.vue';
import RangeField from './RangeField.vue';
import { controlCheckbox } from '../ui/control-styles';
const preferences = useSettingsStore();
</script>
<template>
  <section class="setting-section" aria-labelledby="appearance-basics">
    <div>
      <h3 id="appearance-basics" class="text-sm font-semibold">
        Theme and typography
      </h3>
      <p class="mt-1 text-xs text-muted-foreground">
        Changes preview throughout the workstation.
      </p>
    </div>
    <div class="setting-grid">
      <div class="grid gap-2">
        <label for="appearance-theme" class="text-xs font-medium">Theme</label
        ><NativeSelect
          id="appearance-theme"
          :model-value="preferences.settings.theme"
          @update:model-value="
            preferences.patch({ theme: $event as 'dark' | 'light' | 'system' })
          "
          ><option value="dark">Dark</option>
          <option value="light">Light</option>
          <option value="system">Use system setting</option></NativeSelect
        >
      </div>
      <div class="grid gap-2">
        <label for="appearance-accent" class="text-xs font-medium"
          >Accent color</label
        ><NativeSelect
          id="appearance-accent"
          :model-value="preferences.settings.accent"
          @update:model-value="
            preferences.patch({ accent: $event as 'mint' | 'blue' | 'violet' })
          "
          ><option value="mint">Mint</option>
          <option value="blue">Blue</option>
          <option value="violet">Violet</option></NativeSelect
        >
      </div>
      <div class="grid gap-2">
        <label for="appearance-density" class="text-xs font-medium"
          >Density</label
        ><NativeSelect
          id="appearance-density"
          :model-value="preferences.settings.density"
          @update:model-value="
            preferences.patch({
              density: $event as 'compact' | 'comfortable' | 'spacious',
            })
          "
          ><option value="compact">Compact</option>
          <option value="comfortable">Comfortable</option>
          <option value="spacious">Spacious</option></NativeSelect
        >
      </div>
      <div class="grid gap-2">
        <label for="appearance-font" class="text-xs font-medium"
          >Font family</label
        ><NativeSelect
          id="appearance-font"
          :model-value="preferences.settings.fontFamily"
          @update:model-value="
            preferences.patch({ fontFamily: $event as FontFamily })
          "
          ><option v-for="family in fontFamilies" :key="family" :value="family">
            {{ family }}
          </option></NativeSelect
        >
      </div>
      <RangeField
        label="Font scale"
        :value="preferences.settings.fontScale"
        :min="0.85"
        :max="1.2"
        :step="0.05"
        suffix="×"
        @change="preferences.patch({ fontScale: $event })"
      />
    </div>
    <label class="flex items-center gap-3 text-sm"
      ><input
        type="checkbox"
        :class="controlCheckbox"
        :checked="preferences.settings.reducedMotion"
        @change="
          preferences.patch({
            reducedMotion: ($event.target as HTMLInputElement).checked,
          })
        "
      />Reduce motion</label
    >
  </section>
</template>
