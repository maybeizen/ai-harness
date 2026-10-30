<script setup lang="ts">
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from './ui/dialog';
import { useSettingsStore } from '../stores/settings';
import { settingsSchema } from '@harness/contracts';
const open = defineModel<boolean>({ required: true });
const preferences = useSettingsStore();
function select(key: 'theme' | 'accent' | 'density', event: Event) {
  const value = (event.target as HTMLSelectElement).value;
  void preferences.patch(
    settingsSchema.parse({ ...preferences.settings, [key]: value }),
  );
}
</script>
<template>
  <Dialog v-model:open="open"
    ><DialogContent class="sm:max-w-md"
      ><DialogHeader>
        <DialogTitle>Appearance</DialogTitle
        ><DialogDescription
          >Make this workstation yours. Changes are saved on this
          device.</DialogDescription
        >
      </DialogHeader>
      <fieldset :disabled="!preferences.ready" class="grid gap-5 py-3 text-sm">
        <p
          v-if="!preferences.ready"
          role="status"
          class="text-xs text-muted-foreground"
        >
          Load preferences before changing appearance.
        </p>
        <div class="grid gap-2">
          <label for="appearance-theme">Theme</label
          ><select
            id="appearance-theme"
            class="h-9 rounded-md border bg-background px-3"
            :value="preferences.settings.theme"
            @change="select('theme', $event)"
          >
            <option value="dark">Dark</option>
            <option value="light">Light</option>
            <option value="system">Use system setting</option>
          </select>
        </div>
        <div class="grid gap-2">
          <label for="appearance-accent">Accent color</label
          ><select
            id="appearance-accent"
            class="h-9 rounded-md border bg-background px-3"
            :value="preferences.settings.accent"
            @change="select('accent', $event)"
          >
            <option value="mint">Mint</option>
            <option value="blue">Blue</option>
            <option value="violet">Violet</option>
          </select>
        </div>
        <div class="grid gap-2">
          <label for="appearance-density">Density</label
          ><select
            id="appearance-density"
            class="h-9 rounded-md border bg-background px-3"
            :value="preferences.settings.density"
            @change="select('density', $event)"
          >
            <option value="comfortable">Comfortable</option>
            <option value="compact">Compact</option>
          </select>
        </div>
        <label class="flex items-center gap-3"
          ><input
            type="checkbox"
            :checked="preferences.settings.reducedMotion"
            @change="
              preferences.patch({
                reducedMotion: ($event.target as HTMLInputElement).checked,
              })
            "
          />Reduce motion</label
        >
        <p
          v-if="preferences.error"
          role="alert"
          class="text-xs text-destructive"
        >
          {{ preferences.error.message }} Your latest changes may not be saved.
        </p>
        <p class="text-xs text-muted-foreground">
          Shortcuts: Ctrl/Cmd+N new chat · Ctrl/Cmd+, appearance · Ctrl/Cmd+B
          sidebar · Escape stop response
        </p>
      </fieldset></DialogContent
    ></Dialog
  >
</template>
