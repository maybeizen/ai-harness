<script setup lang="ts">
import type { NotificationPreferences } from '@harness/contracts';
import { useSettingsStore } from '../../stores/settings';
import { controlCheckbox } from '../ui/control-styles';
const preferences = useSettingsStore();
const rows: { key: keyof NotificationPreferences; label: string }[] = [
  { key: 'taskCompletion', label: 'Task completion' },
  { key: 'approvalRequests', label: 'Approval requests' },
  { key: 'errors', label: 'Errors' },
  { key: 'sound', label: 'Sound after a delivered notification' },
  { key: 'doNotDisturb', label: 'Do Not Disturb' },
];
function toggle(key: keyof NotificationPreferences, checked: boolean) {
  void preferences.patch({
    notifications: { ...preferences.settings.notifications, [key]: checked },
  });
}
</script>
<template>
  <section
    class="setting-section"
    aria-labelledby="notifications-settings-heading"
  >
    <div>
      <h3 id="notifications-settings-heading" class="text-sm font-semibold">
        Notifications
      </h3>
      <p class="mt-1 text-xs leading-5 text-muted-foreground">
        Do Not Disturb and a denied system permission both fail closed: no
        notification is shown and no sound is played.
      </p>
    </div>
    <label
      v-for="row in rows"
      :key="row.key"
      class="flex items-center gap-3 text-sm"
      ><input
        type="checkbox"
        :class="controlCheckbox"
        :checked="preferences.settings.notifications[row.key]"
        @change="toggle(row.key, ($event.target as HTMLInputElement).checked)"
      />{{ row.label }}</label
    >
  </section>
</template>
