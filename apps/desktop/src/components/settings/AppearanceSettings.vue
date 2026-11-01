<script setup lang="ts">
import { ref } from 'vue';
import { Download, Upload, RotateCcw } from '@lucide/vue';
import { appearanceSettingsSchema } from '@harness/contracts';
import { Button } from '../ui/button';
import { useSettingsStore } from '../../stores/settings';
import AppearanceBasics from './AppearanceBasics.vue';
import AppearanceColors from './AppearanceColors.vue';
import AppearanceLayout from './AppearanceLayout.vue';
import AppearanceBackground from './AppearanceBackground.vue';
import { exportTheme, importTheme } from './theme';
const preferences = useSettingsStore();
const importer = ref<HTMLInputElement | null>(null);
const transferError = ref('');
async function importFile(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  try {
    if (file.size > 65536)
      throw new Error('Theme files must be smaller than 64 KiB.');
    await preferences.patch(importTheme(await file.text()));
    transferError.value = '';
  } catch {
    transferError.value =
      'This theme could not be imported. Choose a valid Axioden theme JSON file smaller than 64 KiB.';
  }
}
function download() {
  const url = URL.createObjectURL(
    new Blob([exportTheme(preferences.settings)], { type: 'application/json' }),
  );
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'axioden-theme.json';
  anchor.click();
  URL.revokeObjectURL(url);
}
function reset() {
  void preferences.patch(appearanceSettingsSchema.parse({}));
}
</script>
<template>
  <fieldset
    :disabled="!preferences.ready"
    class="min-h-0 space-y-6 overflow-y-auto px-1 pb-2"
  >
    <p
      v-if="!preferences.ready"
      role="status"
      class="text-xs text-muted-foreground"
    >
      Load preferences before changing appearance.
    </p>
    <AppearanceBasics /><AppearanceColors /><AppearanceLayout /><AppearanceBackground />
    <section class="setting-section border-t pt-5" aria-label="Theme presets">
      <div>
        <h3 class="text-sm font-semibold">Theme presets</h3>
        <p class="mt-1 text-xs text-muted-foreground">
          Presets include appearance preferences. Account details and background
          images stay on this device.
        </p>
      </div>
      <input
        ref="importer"
        type="file"
        accept="application/json,.json"
        aria-label="Import theme file"
        class="sr-only"
        @change="importFile"
      />
      <div class="flex flex-wrap gap-2">
        <Button variant="outline" @click="importer?.click()"
          ><Upload class="size-4" />Import theme</Button
        ><Button variant="outline" @click="download"
          ><Download class="size-4" />Export theme</Button
        ><Button variant="ghost" @click="reset"
          ><RotateCcw class="size-4" />Reset appearance</Button
        >
      </div>
      <p v-if="transferError" role="alert" class="text-xs text-destructive">
        {{ transferError }}
      </p>
    </section>
    <p v-if="preferences.error" role="alert" class="text-xs text-destructive">
      {{ preferences.error.message }} Your latest changes may not be saved.
    </p>
  </fieldset>
</template>
