<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue';
import type { mountInteractiveTerminal } from '../../integrations/interactive-terminal';
import { useTerminalsStore } from '../../stores/terminals';
import { useSettingsStore } from '../../stores/settings';
import { terminalAppearance } from '../../shell/fonts';
import { toAppError } from '@harness/contracts';
const props = defineProps<{ id: string }>();
const store = useTerminalsStore();
const preferences = useSettingsStore();
const root = ref<HTMLElement>();
let terminal: ReturnType<typeof mountInteractiveTerminal> | undefined;
let disposed = false;
let timer: ReturnType<typeof setTimeout> | undefined;
let cursor = 0;
async function poll() {
  try {
    const result = await store.poll(props.id, cursor);
    if (disposed) return;
    if (result.truncated)
      terminal?.write('\r\n[Earlier output exceeded the terminal buffer]\r\n');
    terminal?.write(result.data);
    cursor = result.cursor;
    if (result.status === 'running' || result.data.length)
      timer = setTimeout(() => {
        void poll();
      }, 100);
    else {
      terminal?.write(
        `\r\n[Terminal exited: ${result.exitCode ?? 'signal'}]\r\n`,
      );
      void store.refresh();
    }
  } catch (cause) {
    if (!disposed) store.error = toAppError(cause);
  }
}
onMounted(() => {
  void import('../../integrations/interactive-terminal').then((module) => {
    if (disposed || !root.value) return;
    terminal = module.mountInteractiveTerminal(
      root.value,
      (data) => {
        void store.write(props.id, data);
      },
      (cols, rows) => {
        void store.resize(props.id, cols, rows);
      },
      terminalAppearance(preferences.settings),
    );
    void poll();
  });
});
watch(
  () =>
    [
      preferences.settings.fontFamily,
      preferences.settings.terminal.fontSize,
    ] as const,
  () => {
    const font = terminalAppearance(preferences.settings);
    terminal?.applyFont(font.fontFamily, font.fontSize);
  },
);
onUnmounted(() => {
  disposed = true;
  clearTimeout(timer);
  terminal?.dispose();
});
</script>
<template>
  <div
    ref="root"
    class="h-full min-h-60 w-full bg-[#101318] p-2"
    aria-label="Interactive user terminal"
  />
</template>
