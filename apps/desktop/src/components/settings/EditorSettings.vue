<script setup lang="ts">
import { useSettingsStore } from '../../stores/settings';
import { controlCheckbox, controlField } from '../ui/control-styles';
const preferences = useSettingsStore();
function patch(update: Partial<typeof preferences.settings.editor>) {
  void preferences.patch({
    editor: { ...preferences.settings.editor, ...update },
  });
}
</script>
<template>
  <section class="setting-section" aria-labelledby="editor-settings-heading">
    <div>
      <h3 id="editor-settings-heading" class="text-sm font-semibold">Editor</h3>
      <p class="mt-1 text-xs leading-5 text-muted-foreground">
        These options apply to the Monaco code viewer.
      </p>
    </div>
    <label class="grid max-w-xs gap-2 text-xs font-medium"
      >Tab size<input
        :class="controlField"
        type="number"
        min="1"
        max="8"
        :value="preferences.settings.editor.tabSize"
        @change="
          patch({ tabSize: Number(($event.target as HTMLInputElement).value) })
        "
    /></label>
    <label class="flex items-center gap-3 text-sm"
      ><input
        type="checkbox"
        :class="controlCheckbox"
        :checked="preferences.settings.editor.wordWrap"
        @change="
          patch({ wordWrap: ($event.target as HTMLInputElement).checked })
        "
      />Word wrap</label
    >
    <label class="flex items-center gap-3 text-sm"
      ><input
        type="checkbox"
        :class="controlCheckbox"
        :checked="preferences.settings.editor.minimap"
        @change="
          patch({ minimap: ($event.target as HTMLInputElement).checked })
        "
      />Minimap</label
    >
  </section>
</template>
