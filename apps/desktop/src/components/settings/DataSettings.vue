<script setup lang="ts">
import { ref } from 'vue';
import { Download, Upload } from '@lucide/vue';
import { useSettingsStore } from '../../stores/settings';
import { useConnectionsStore } from '../../stores/connections';
import { useChatStore } from '../../stores/chat';
import { Button } from '../ui/button';
import { exportSettings, importSettings } from './settings-transfer';
const preferences = useSettingsStore();
const connections = useConnectionsStore();
const chat = useChatStore();
const importer = ref<HTMLInputElement | null>(null);
const preview = ref<ReturnType<typeof importSettings> | null>(null);
const message = ref('');
const error = ref('');
const busy = ref(false);
function download() {
  const url = URL.createObjectURL(
    new Blob([exportSettings(preferences.settings)], {
      type: 'application/json',
    }),
  );
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'axioden-settings.json';
  anchor.click();
  URL.revokeObjectURL(url);
  message.value = 'Settings export downloaded.';
}
async function choose(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  try {
    if (file.size > 262144) throw new Error('File too large.');
    preview.value = importSettings(await file.text());
    error.value = '';
    message.value = '';
  } catch {
    preview.value = null;
    error.value =
      'Choose a valid Axioden settings file under 256 KiB. Local asset references and credentials cannot be imported.';
  }
}
async function apply() {
  if (!preview.value || busy.value || chat.active) return;
  busy.value = true;
  try {
    connections.select(preview.value.selectedProvider);
    connections.modelId = preview.value.selectedModel;
    await preferences.patch(preview.value);
    await preferences.flush();
    preview.value = null;
    message.value = 'Imported settings saved.';
    error.value = '';
  } catch {
    error.value = 'These settings could not be saved. Check storage and retry.';
  } finally {
    busy.value = false;
  }
}
</script>
<template>
  <section class="setting-section" aria-labelledby="data-settings-heading">
    <div>
      <h3 id="data-settings-heading" class="text-sm font-semibold">
        Data and storage
      </h3>
      <p class="mt-1 text-xs leading-5 text-muted-foreground">
        Conversations are stored in a local SQLite database. Content is
        plaintext on disk; operating-system permissions and disk encryption
        control access.
      </p>
    </div>
    <div
      class="rounded-md border bg-muted/30 p-4 text-xs leading-5 text-muted-foreground"
    >
      Settings exports include appearance, layout, selected model and shortcuts.
      They exclude credentials, conversations and local background-image
      references. Back up the application data directory while the app is closed
      to preserve the database and its journals together.
    </div>
    <input
      ref="importer"
      type="file"
      accept="application/json,.json"
      class="sr-only"
      aria-label="Import settings file"
      @change="choose"
    />
    <div class="flex flex-wrap gap-2">
      <Button variant="outline" :disabled="busy" @click="download"
        ><Download class="size-4" />Export settings</Button
      ><Button variant="outline" :disabled="busy" @click="importer?.click()"
        ><Upload class="size-4" />Import settings</Button
      >
    </div>
    <section
      v-if="preview"
      class="setting-section rounded-md border border-primary/40 bg-primary/5 p-4"
      aria-label="Settings import preview"
    >
      <h4 class="text-sm font-semibold">Review imported settings</h4>
      <dl class="grid grid-cols-2 gap-2 text-xs">
        <dt class="text-muted-foreground">Theme</dt>
        <dd>{{ preview.theme }}</dd>
        <dt class="text-muted-foreground">Density</dt>
        <dd>{{ preview.density }}</dd>
        <dt class="text-muted-foreground">Selected connection</dt>
        <dd>{{ preview.selectedProvider }}</dd>
        <dt class="text-muted-foreground">Selected model</dt>
        <dd class="break-all">{{ preview.selectedModel || 'None' }}</dd>
        <dt class="text-muted-foreground">Font scale</dt>
        <dd>{{ preview.fontScale }}×</dd>
      </dl>
      <p class="text-xs leading-5 text-muted-foreground">
        Applying replaces portable preferences and shortcuts. Your
        conversations, credentials and current background image stay unchanged.
        An imported model may need another connection before it is available.
      </p>
      <div class="flex flex-wrap gap-2">
        <Button :disabled="busy || chat.active" @click="apply"
          >Apply imported settings</Button
        ><Button variant="outline" :disabled="busy" @click="preview = null"
          >Cancel import</Button
        >
      </div>
    </section>
    <p
      v-if="error || preferences.error"
      role="alert"
      class="text-xs text-destructive"
    >
      {{ error || preferences.error?.message }}
    </p>
    <p v-if="message" role="status" class="text-xs text-muted-foreground">
      {{ message }}
    </p>
  </section>
</template>
