<script setup lang="ts">
import { ref } from 'vue';
import { useSettingsStore } from '../../stores/settings';
import { controlField } from '../ui/control-styles';
const preferences = useSettingsStore();
const shellError = ref('');
function patch(update: Partial<typeof preferences.settings.terminal>) {
  void preferences.patch({
    terminal: { ...preferences.settings.terminal, ...update },
  });
}
function saveShell(value: string) {
  if (value !== '' && (!value.startsWith('/') || value.includes('..'))) {
    shellError.value =
      'Use an absolute path, or leave the field empty for /bin/bash.';
    return;
  }
  shellError.value = '';
  patch({ shell: value });
}
</script>
<template>
  <section class="setting-section" aria-labelledby="terminal-settings-heading">
    <div>
      <h3 id="terminal-settings-heading" class="text-sm font-semibold">
        Terminal
      </h3>
      <p class="mt-1 text-xs leading-5 text-muted-foreground">
        Commands you type run with your account's filesystem and network access.
        This terminal is separate from agent tools and is not a filesystem
        sandbox.
      </p>
    </div>
    <label class="grid gap-2 text-xs font-medium"
      >Shell<input
        :class="controlField"
        :value="preferences.settings.terminal.shell"
        spellcheck="false"
        placeholder="/bin/bash"
        @change="saveShell(($event.target as HTMLInputElement).value)"
    /></label>
    <p v-if="shellError" role="alert" class="text-xs text-destructive">
      {{ shellError }}
    </p>
    <div class="setting-grid">
      <label class="grid gap-2 text-xs font-medium"
        >Font size<input
          :class="controlField"
          type="number"
          min="8"
          max="32"
          :value="preferences.settings.terminal.fontSize"
          @change="
            patch({
              fontSize: Number(($event.target as HTMLInputElement).value),
            })
          "
      /></label>
      <label class="grid gap-2 text-xs font-medium"
        >Scrollback<input
          :class="controlField"
          type="number"
          min="100"
          max="100000"
          :value="preferences.settings.terminal.scrollback"
          @change="
            patch({
              scrollback: Number(($event.target as HTMLInputElement).value),
            })
          "
      /></label>
    </div>
  </section>
</template>
