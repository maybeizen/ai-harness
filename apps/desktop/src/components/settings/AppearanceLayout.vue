<script setup lang="ts">
import { useSettingsStore } from '../../stores/settings';
import RangeField from './RangeField.vue';
import { controlCheckbox } from '../ui/control-styles';
const preferences = useSettingsStore();
</script>
<template>
  <section
    class="setting-section border-t pt-5"
    aria-labelledby="appearance-layout"
  >
    <div>
      <h3 id="appearance-layout" class="text-sm font-semibold">Layout</h3>
      <p class="mt-1 text-xs text-muted-foreground">
        Widths remain bounded by the available window space.
      </p>
    </div>
    <div class="setting-grid">
      <RangeField
        label="Sidebar width"
        :value="preferences.settings.sidebarWidth"
        :min="200"
        :max="400"
        :step="8"
        suffix="px"
        @change="preferences.patch({ sidebarWidth: $event })"
      />
      <RangeField
        label="Chat width"
        :value="preferences.settings.chatWidth"
        :min="600"
        :max="1200"
        :step="24"
        suffix="px"
        @change="preferences.patch({ chatWidth: $event })"
      />
    </div>
    <label class="flex items-center gap-3 text-sm"
      ><input
        type="checkbox"
        :class="controlCheckbox"
        :checked="preferences.settings.compactTitlebar"
        @change="
          preferences.patch({
            compactTitlebar: ($event.target as HTMLInputElement).checked,
          })
        "
      />Compact titlebar</label
    >
  </section>
</template>
