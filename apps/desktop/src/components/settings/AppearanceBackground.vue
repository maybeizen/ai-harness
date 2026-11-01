<script setup lang="ts">
import { ref } from 'vue';
import { ImagePlus, Trash2 } from '@lucide/vue';
import { useSettingsStore } from '../../stores/settings';
import { useBackgroundStore } from '../../stores/background';
import { Button } from '../ui/button';
import NativeSelect from '../ui/NativeSelect.vue';
import RangeField from './RangeField.vue';
const preferences = useSettingsStore();
const background = useBackgroundStore();
const fileInput = ref<HTMLInputElement | null>(null);
const busy = ref(false);
async function choose(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file || busy.value) return;
  busy.value = true;
  try {
    await background.importImage(file);
  } finally {
    busy.value = false;
  }
}
function patch(update: Partial<typeof preferences.settings.background>) {
  void preferences.patch({
    background: { ...preferences.settings.background, ...update },
  });
}
</script>
<template>
  <section
    class="setting-section border-t pt-5"
    aria-labelledby="appearance-background"
  >
    <div>
      <h3 id="appearance-background" class="text-sm font-semibold">
        Background image
      </h3>
      <p class="mt-1 text-xs text-muted-foreground">
        Import a local PNG, JPEG or WebP up to 8 MiB. Images stay on this
        device.
      </p>
    </div>
    <input
      ref="fileInput"
      type="file"
      accept="image/png,image/jpeg,image/webp"
      class="sr-only"
      aria-label="Background image file"
      @change="choose"
    />
    <div class="flex items-center gap-2">
      <Button
        variant="outline"
        :disabled="busy || background.busy"
        @click="fileInput?.click()"
        ><ImagePlus class="size-4" />{{
          busy ? 'Importing…' : 'Choose image'
        }}</Button
      ><Button
        variant="ghost"
        :disabled="
          busy || background.busy || !preferences.settings.background.assetId
        "
        @click="background.remove()"
        ><Trash2 class="size-4" />Remove image</Button
      >
    </div>
    <p v-if="background.error" role="alert" class="text-xs text-destructive">
      {{ background.error.message }}
    </p>
    <img
      v-if="background.dataUrl"
      :src="background.dataUrl"
      alt="Current background preview"
      class="h-28 w-full rounded-md border object-cover"
    />
    <fieldset
      class="setting-grid"
      :disabled="
        !preferences.settings.background.assetId || busy || background.busy
      "
    >
      <RangeField
        label="Image opacity"
        :value="preferences.settings.background.opacity"
        :min="0"
        :max="1"
        :step="0.05"
        @change="patch({ opacity: $event })"
      />
      <RangeField
        label="Background blur"
        :value="preferences.settings.background.blur"
        :min="0"
        :max="30"
        suffix="px"
        @change="patch({ blur: $event })"
      />
      <RangeField
        label="Overlay darkness"
        :value="preferences.settings.background.overlay"
        :min="0"
        :max="1"
        :step="0.05"
        @change="patch({ overlay: $event })"
      />
      <div class="grid gap-2">
        <label for="background-position" class="text-xs font-medium"
          >Image position</label
        ><NativeSelect
          id="background-position"
          :model-value="preferences.settings.background.position"
          @update:model-value="
            patch({
              position: $event as
                'center' | 'top' | 'bottom' | 'left' | 'right',
            })
          "
          ><option value="center">Center</option>
          <option value="top">Top</option>
          <option value="bottom">Bottom</option>
          <option value="left">Left</option>
          <option value="right">Right</option></NativeSelect
        >
      </div>
      <div class="grid gap-2">
        <label for="background-scope" class="text-xs font-medium"
          >Show image behind</label
        ><NativeSelect
          id="background-scope"
          :model-value="preferences.settings.background.scope"
          @update:model-value="
            patch({ scope: $event as 'global' | 'conversation' })
          "
          ><option value="conversation">Conversation only</option>
          <option value="global">Entire workspace</option></NativeSelect
        >
      </div>
    </fieldset>
  </section>
</template>
