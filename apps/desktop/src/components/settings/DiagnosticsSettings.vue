<script setup lang="ts">
import { onMounted, ref } from 'vue';
import {
  diagnosticsReportSchema,
  stripSecrets,
  toAppError,
} from '@harness/contracts';
import { workstation } from '../../transport/workstation';
import { Button } from '../ui/button';
const report = ref('');
const error = ref('');
async function load() {
  try {
    const parsed = diagnosticsReportSchema.parse(
      stripSecrets(await workstation({ action: 'diagnostics' })),
    );
    report.value = JSON.stringify(parsed, null, 2);
    error.value = '';
  } catch (cause) {
    report.value = '';
    error.value = toAppError(cause).message;
  }
}
function download() {
  if (!report.value) return;
  const url = URL.createObjectURL(
    new Blob([report.value], { type: 'application/json' }),
  );
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'axioden-diagnostics.json';
  anchor.click();
  URL.revokeObjectURL(url);
}
onMounted(() => {
  void load();
});
</script>
<template>
  <section
    class="setting-section"
    aria-labelledby="diagnostics-settings-heading"
  >
    <div>
      <h3 id="diagnostics-settings-heading" class="text-sm font-semibold">
        Diagnostics
      </h3>
      <p class="mt-1 text-xs leading-5 text-muted-foreground">
        The export includes version, data path, and runtime status. Secret
        fields are replaced before the file is saved.
      </p>
    </div>
    <p v-if="error" role="alert" class="text-xs text-destructive">
      {{ error }}
    </p>
    <pre
      v-else-if="report"
      class="max-h-64 overflow-auto rounded-md border p-3 text-xs"
      >{{ report }}</pre>
    <Button variant="outline" :disabled="!report" @click="download"
      >Export diagnostics</Button
    >
  </section>
</template>
