import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import {
  defaultShortcuts,
  normalizeShortcut,
  shortcutActions,
  shortcutBindingsSchema,
  type ShortcutAction,
} from '@harness/contracts';
import { useSettingsStore } from './settings';
function eventKey(event: KeyboardEvent) {
  const punctuation: Record<string, string> = {
    Comma: ',',
    Period: '.',
    Slash: '/',
    Semicolon: ';',
    BracketLeft: '[',
    BracketRight: ']',
    Backslash: '\\',
    Quote: "'",
    Backquote: '`',
    Equal: '=',
    Minus: '-',
  };
  if (event.shiftKey && punctuation[event.code]) return punctuation[event.code];
  return event.key === ' '
    ? 'Space'
    : event.key.length === 1
      ? event.key.toUpperCase()
      : event.key;
}
export function recordShortcut(event: KeyboardEvent): string | null {
  if (
    event.isComposing ||
    ['Control', 'Meta', 'Alt', 'Shift', 'Dead', 'Unidentified'].includes(
      event.key,
    )
  )
    return null;
  if (event.ctrlKey && event.metaKey)
    throw new Error('Use Control or Command, not both.');
  const modifiers: string[] = [];
  if (event.ctrlKey || event.metaKey) modifiers.push('CtrlOrMeta');
  if (event.altKey) modifiers.push('Alt');
  if (event.shiftKey) modifiers.push('Shift');
  return normalizeShortcut([...modifiers, eventKey(event)].join('+'));
}
export const useShortcutsStore = defineStore('shortcuts', () => {
  const preferences = useSettingsStore();
  const bindings = computed(() => preferences.settings.shortcuts);
  const error = ref<string | null>(null);
  function match(event: KeyboardEvent): ShortcutAction | null {
    if (event.isComposing || event.repeat) return null;
    const key = eventKey(event);
    for (const action of shortcutActions) {
      const binding = bindings.value[action];
      if (!binding) continue;
      const parts = binding.split('+');
      const expectedKey = parts.pop();
      if (expectedKey !== key) continue;
      const portable = parts.includes('CtrlOrMeta');
      if (
        portable
          ? !(event.ctrlKey !== event.metaKey)
          : event.ctrlKey !== parts.includes('Ctrl') ||
            event.metaKey !== parts.includes('Meta')
      )
        continue;
      if (
        event.altKey !== parts.includes('Alt') ||
        event.shiftKey !== parts.includes('Shift')
      )
        continue;
      return action;
    }
    return null;
  }
  async function set(action: ShortcutAction, value: string | null) {
    const parsed = shortcutBindingsSchema.safeParse({
      ...bindings.value,
      [action]: value,
    });
    if (!parsed.success) {
      error.value = parsed.error.issues[0]?.message ?? 'Invalid shortcut.';
      return false;
    }
    await preferences.patch({ shortcuts: parsed.data });
    try {
      await preferences.flush();
      error.value = null;
      return true;
    } catch {
      error.value = 'The shortcut could not be saved. Check storage and retry.';
      return false;
    }
  }
  async function reset(action?: ShortcutAction) {
    const parsed = shortcutBindingsSchema.safeParse(
      action
        ? { ...bindings.value, [action]: defaultShortcuts[action] }
        : defaultShortcuts,
    );
    if (!parsed.success) {
      error.value =
        'This default conflicts with another shortcut. Reset all shortcuts or change the conflict first.';
      return;
    }
    await preferences.patch({ shortcuts: parsed.data });
    try {
      await preferences.flush();
      error.value = null;
    } catch {
      error.value =
        'Default shortcuts could not be saved. Check storage and retry.';
    }
  }
  function record(event: KeyboardEvent) {
    try {
      error.value = null;
      return recordShortcut(event);
    } catch (cause) {
      error.value =
        cause instanceof Error ? cause.message : 'Choose another shortcut.';
      return null;
    }
  }
  return { bindings, error, match, record, set, reset };
});
