<script setup lang="ts">
import { ref } from 'vue';
import { Download, Upload, RotateCcw } from '@lucide/vue';
import {
  shortcutActions,
  shortcutLabels,
  shortcutPresetSchema,
  type ShortcutAction,
} from '@harness/contracts';
import { useSettingsStore } from '../../stores/settings';
import { useShortcutsStore } from '../../stores/shortcuts';
import { Button } from '../ui/button';
const preferences = useSettingsStore();
const shortcuts = useShortcutsStore();
const recording = ref<ShortcutAction | null>(null);
const importer = ref<HTMLInputElement | null>(null);
const transferError = ref('');
const status = ref('');
async function record(action: ShortcutAction, event: KeyboardEvent) {
  if (recording.value !== action) return;
  if (event.key === 'Tab') {
    recording.value = null;
    return;
  }
  event.preventDefault();
  event.stopPropagation();
  if (event.isComposing || event.repeat) return;
  const binding = shortcuts.record(event);
  if (binding && (await shortcuts.set(action, binding))) {
    recording.value = null;
    status.value = `${shortcutLabels[action]} shortcut saved.`;
  }
}
function download() {
  const data = shortcutPresetSchema.parse({
    format: 'axioden-shortcuts',
    version: 1,
    shortcuts: shortcuts.bindings,
  });
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }),
  );
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'axioden-shortcuts.json';
  anchor.click();
  URL.revokeObjectURL(url);
}
async function importFile(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  try {
    if (file.size > 16384) throw new Error('File too large.');
    const data = shortcutPresetSchema.parse(JSON.parse(await file.text()));
    await preferences.patch({ shortcuts: data.shortcuts });
    await preferences.flush();
    transferError.value = '';
    status.value = 'Keyboard shortcuts imported.';
  } catch {
    transferError.value =
      'Choose a valid shortcut preset under 16 KiB without duplicate or reserved shortcuts.';
  }
}
</script>
<template>
  <section class="setting-section" aria-labelledby="keyboard-settings-heading">
    <div>
      <h3 id="keyboard-settings-heading" class="text-sm font-semibold">
        Keyboard shortcuts
      </h3>
      <p class="mt-1 text-xs leading-5 text-muted-foreground">
        Choose a binding, then press the desired keys. Control and Command
        bindings travel between platforms. Shortcuts pause while a dialog is
        open.
      </p>
    </div>
    <ul class="divide-y rounded-md border">
      <li
        v-for="action in shortcutActions"
        :key="action"
        class="flex flex-wrap items-center gap-2 p-3"
      >
        <span class="min-w-40 flex-1 text-xs">{{
          shortcutLabels[action]
        }}</span>
        <Button
          variant="outline"
          class="min-w-36 font-mono text-xs"
          :aria-label="`Record ${shortcutLabels[action]} shortcut`"
          :aria-pressed="recording === action"
          @click="
            recording = action;
            shortcuts.error = null;
          "
          @keydown="record(action, $event)"
          @blur="recording = null"
          >{{
            recording === action
              ? 'Press keys…'
              : (shortcuts.bindings[action] ?? 'Disabled')
          }}</Button
        >
        <Button
          variant="ghost"
          size="sm"
          :aria-label="`Disable ${shortcutLabels[action]} shortcut`"
          :disabled="!shortcuts.bindings[action]"
          @click="shortcuts.set(action, null)"
          >Disable</Button
        >
        <Button
          variant="ghost"
          size="sm"
          :aria-label="`Reset ${shortcutLabels[action]} shortcut`"
          @click="shortcuts.reset(action)"
          >Reset</Button
        >
      </li>
    </ul>
    <p
      v-if="shortcuts.error || transferError"
      role="alert"
      class="text-xs text-destructive"
    >
      {{ shortcuts.error || transferError }}
    </p>
    <p v-if="status" role="status" class="text-xs text-muted-foreground">
      {{ status }}
    </p>
    <input
      ref="importer"
      type="file"
      class="sr-only"
      accept="application/json,.json"
      aria-label="Import shortcuts file"
      @change="importFile"
    />
    <div class="flex flex-wrap gap-2">
      <Button variant="outline" @click="importer?.click()"
        ><Upload class="size-4" />Import shortcuts</Button
      ><Button variant="outline" @click="download"
        ><Download class="size-4" />Export shortcuts</Button
      ><Button variant="ghost" @click="shortcuts.reset()"
        ><RotateCcw class="size-4" />Reset all shortcuts</Button
      >
    </div>
  </section>
</template>
