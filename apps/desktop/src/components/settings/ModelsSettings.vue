<script setup lang="ts">
import { computed } from 'vue';
import {
  generationControlFlags,
  reasoningEfforts,
  type GenerationSettings,
} from '@harness/contracts';
import { useConnectionsStore } from '../../stores/connections';
import { useSettingsStore } from '../../stores/settings';
import NativeSelect from '../ui/NativeSelect.vue';
import { controlField } from '../ui/control-styles';
const preferences = useSettingsStore();
const connections = useConnectionsStore();
const flags = computed(() =>
  generationControlFlags(connections.model?.capabilities),
);
const visible = computed(
  () =>
    flags.value.reasoningEffort ||
    flags.value.temperature ||
    flags.value.maxOutputTokens,
);
function patch(update: GenerationSettings) {
  void preferences.patch({
    generation: { ...preferences.settings.generation, ...update },
  });
}
</script>
<template>
  <section class="setting-section" aria-labelledby="models-settings-heading">
    <div>
      <h3 id="models-settings-heading" class="text-sm font-semibold">Models</h3>
      <p class="mt-1 text-xs leading-5 text-muted-foreground">
        Generation settings apply to the selected model.
        {{ connections.model?.name ?? 'No model is selected.' }}
      </p>
    </div>
    <p v-if="!visible" class="text-xs leading-5 text-muted-foreground">
      Temperature, reasoning effort, and max output tokens stay hidden until the
      selected model reports that it supports them.
    </p>
    <div v-else class="setting-grid">
      <div v-if="flags.reasoningEffort" class="grid gap-2">
        <label for="generation-reasoning" class="text-xs font-medium"
          >Reasoning effort</label
        ><NativeSelect
          id="generation-reasoning"
          :model-value="preferences.settings.generation.reasoningEffort ?? ''"
          @update:model-value="
            patch({
              reasoningEffort: $event
                ? ($event as (typeof reasoningEfforts)[number])
                : undefined,
            })
          "
          ><option value="">Unset</option>
          <option
            v-for="effort in reasoningEfforts"
            :key="effort"
            :value="effort"
          >
            {{ effort }}
          </option></NativeSelect
        >
      </div>
      <label v-if="flags.temperature" class="grid gap-2 text-xs font-medium"
        >Temperature<input
          :class="controlField"
          type="number"
          min="0"
          max="2"
          step="0.1"
          :value="preferences.settings.generation.temperature ?? ''"
          @change="
            patch({
              temperature:
                ($event.target as HTMLInputElement).value === ''
                  ? undefined
                  : Number(($event.target as HTMLInputElement).value),
            })
          "
      /></label>
      <label v-if="flags.maxOutputTokens" class="grid gap-2 text-xs font-medium"
        >Max output tokens<input
          :class="controlField"
          type="number"
          min="1"
          max="200000"
          step="1"
          :value="preferences.settings.generation.maxOutputTokens ?? ''"
          @change="
            patch({
              maxOutputTokens:
                ($event.target as HTMLInputElement).value === ''
                  ? undefined
                  : Number(($event.target as HTMLInputElement).value),
            })
          "
      /></label>
    </div>
  </section>
</template>
