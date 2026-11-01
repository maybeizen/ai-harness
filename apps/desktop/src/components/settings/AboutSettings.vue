<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { isTauri } from '@tauri-apps/api/core';
import { getName, getVersion, getTauriVersion } from '@tauri-apps/api/app';
import { path as nativePath } from '@tauri-apps/api';
import { useInfrastructureStore } from '../../stores/infrastructure';
import BrandMark from '../BrandMark.vue';
import { Button } from '../ui/button';
const infrastructure = useInfrastructureStore();
const name = ref('Axioden');
const version = ref('Unavailable');
const runtime = ref('Unavailable');
const data = ref('Available in the native desktop app');
const error = ref('');
const platform =
  typeof navigator === 'undefined'
    ? 'Unavailable'
    : navigator.platform || 'Unavailable';
const native = isTauri();
async function refresh() {
  if (!native) {
    error.value =
      'Browser preview: native application metadata is unavailable.';
    return;
  }
  const results = await Promise.allSettled([
    getName(),
    getVersion(),
    getTauriVersion(),
    nativePath.appDataDir(),
  ]);
  const targets = [name, version, runtime, data];
  results.forEach((result, index) => {
    const target = targets[index];
    if (result.status === 'fulfilled' && target) target.value = result.value;
  });
  error.value = results.some((result) => result.status === 'rejected')
    ? 'Some native metadata could not be loaded.'
    : '';
}
onMounted(() => {
  void refresh();
});
</script>
<template>
  <section class="setting-section" aria-labelledby="about-settings-heading">
    <div class="flex items-center gap-4">
      <BrandMark class="size-14" />
      <div>
        <h3 id="about-settings-heading" class="text-base font-semibold">
          {{ name }}
        </h3>
        <p class="mt-1 text-xs text-muted-foreground">
          Personal AI workstation
        </p>
      </div>
    </div>
    <dl class="grid grid-cols-[auto_minmax(0,1fr)] gap-x-6 gap-y-3 text-xs">
      <dt class="text-muted-foreground">Application version</dt>
      <dd>{{ version }}</dd>
      <dt class="text-muted-foreground">Tauri runtime</dt>
      <dd>{{ runtime }}</dd>
      <dt class="text-muted-foreground">Execution environment</dt>
      <dd>{{ native ? 'Native desktop' : 'Browser preview' }}</dd>
      <dt class="text-muted-foreground">Renderer platform</dt>
      <dd>{{ platform }}</dd>
      <dt class="text-muted-foreground">Application runtime status</dt>
      <dd>{{ infrastructure.status }}</dd>
      <dt class="text-muted-foreground">Application data</dt>
      <dd class="font-mono break-all">{{ data }}</dd>
    </dl>
    <p v-if="error" role="status" class="text-xs text-muted-foreground">
      {{ error }}
    </p>
    <Button variant="outline" class="justify-self-start" @click="refresh"
      >Refresh application metadata</Button
    >
    <p class="text-xs leading-5 text-muted-foreground">
      Provider authentication is managed through Connections. Local tools run
      with your operating-system user's privileges and are not an
      operating-system sandbox.
    </p>
  </section>
</template>
