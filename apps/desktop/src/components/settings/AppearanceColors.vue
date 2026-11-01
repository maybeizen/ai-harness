<script setup lang="ts">
import { computed } from 'vue';
import { usePreferredDark } from '@vueuse/core';
import { useSettingsStore } from '../../stores/settings';
import ColorField from './ColorField.vue';
import RangeField from './RangeField.vue';
import { contrastRatio } from './theme';
const preferences = useSettingsStore();
const systemDark = usePreferredDark();
const light = computed(
  () =>
    preferences.settings.theme === 'light' ||
    (preferences.settings.theme === 'system' && !systemDark.value),
);
const ratio = computed(() =>
  contrastRatio(
    preferences.settings.customBackground ??
      (light.value ? '#F8FAFC' : '#15181E'),
    preferences.settings.customText ?? (light.value ? '#202833' : '#EDF0F4'),
  ),
);
</script>
<template>
  <section
    class="setting-section border-t pt-5"
    aria-labelledby="appearance-colors"
  >
    <div>
      <h3 id="appearance-colors" class="text-sm font-semibold">
        Custom colors
      </h3>
      <p class="mt-1 text-xs text-muted-foreground">
        Enable an override to customize a semantic color. Disable it to follow
        the selected theme.
      </p>
    </div>
    <div class="setting-grid">
      <ColorField
        label="Custom accent"
        :value="preferences.settings.customAccent"
        fallback="#34A995"
        @change="preferences.patch({ customAccent: $event })"
      />
      <ColorField
        label="Background"
        :value="preferences.settings.customBackground"
        :fallback="light ? '#F8FAFC' : '#15181E'"
        @change="preferences.patch({ customBackground: $event })"
      />
      <ColorField
        label="Surface"
        :value="preferences.settings.customSurface"
        :fallback="light ? '#FFFFFF' : '#1C2027'"
        @change="preferences.patch({ customSurface: $event })"
      />
      <ColorField
        label="Text"
        :value="preferences.settings.customText"
        :fallback="light ? '#202833' : '#EDF0F4'"
        @change="preferences.patch({ customText: $event })"
      />
      <ColorField
        label="Highlight"
        :value="preferences.settings.customHighlight"
        :fallback="light ? '#E4ECEA' : '#303A3B'"
        @change="preferences.patch({ customHighlight: $event })"
      />
      <RangeField
        label="Border intensity"
        :value="preferences.settings.borderIntensity"
        :min="0"
        :max="1"
        :step="0.05"
        @change="preferences.patch({ borderIntensity: $event })"
      />
    </div>
    <p
      class="text-xs"
      :class="ratio < 4.5 ? 'text-destructive' : 'text-muted-foreground'"
      role="status"
    >
      Text/background contrast preview: {{ ratio.toFixed(1) }}:1.
      {{
        ratio < 4.5
          ? 'Choose colors with more contrast for readable body text.'
          : 'Body text has a readable contrast ratio.'
      }}
    </p>
  </section>
</template>
