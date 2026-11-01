<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue';
import type { ShortcutAction } from '@harness/contracts';
import { useShortcutsStore } from '../../stores/shortcuts';
import { useSidebar } from '../ui/sidebar';
const props = withDefaults(defineProps<{ disabled?: boolean }>(), {
  disabled: false,
});
const emit = defineEmits<{
  action: [action: Exclude<ShortcutAction, 'sidebar'>];
}>();
const shortcuts = useShortcutsStore();
const sidebar = useSidebar();
function handle(event: KeyboardEvent) {
  if (
    props.disabled ||
    event.defaultPrevented ||
    (event.target instanceof Element &&
      event.target.closest(
        '[role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"]',
      ))
  )
    return;
  const action = shortcuts.match(event);
  if (!action) return;
  event.preventDefault();
  if (action === 'sidebar') sidebar.toggleSidebar();
  else emit('action', action);
}
onMounted(() => window.addEventListener('keydown', handle));
onUnmounted(() => window.removeEventListener('keydown', handle));
</script>
<template><span class="hidden" aria-hidden="true" /></template>
