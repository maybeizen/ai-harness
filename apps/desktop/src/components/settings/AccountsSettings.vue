<script setup lang="ts">
import type { ConnectionKind } from '@harness/contracts';
import { useConnectionsStore } from '../../stores/connections';
import { Button } from '../ui/button';
const emit = defineEmits<{ connections: [] }>();
const connections = useConnectionsStore();
function reauthenticate(id: ConnectionKind) {
  void connections.refresh(id);
}
</script>
<template>
  <section class="setting-section" aria-labelledby="accounts-settings-heading">
    <div>
      <h3 id="accounts-settings-heading" class="text-sm font-semibold">
        Accounts
      </h3>
      <p class="mt-1 text-xs leading-5 text-muted-foreground">
        These are the existing provider connections. Signing in still uses the
        connections dialog.
      </p>
    </div>
    <p v-if="connections.error" role="alert" class="text-xs text-destructive">
      {{ connections.error.message }}
    </p>
    <p v-if="!connections.records.length" class="text-xs text-muted-foreground">
      No connection accounts are loaded.
    </p>
    <ul v-else class="grid gap-3">
      <li
        v-for="record in connections.records"
        :key="record.id"
        class="grid gap-2 rounded-md border p-3 text-xs"
      >
        <div>
          <p class="font-medium">{{ record.label }}</p>
          <p class="text-muted-foreground">
            {{ record.account ?? 'No account label' }} · {{ record.status }} ·
            {{ record.storage }}
          </p>
        </div>
        <div class="flex flex-wrap gap-2">
          <Button
            v-if="record.configured"
            size="sm"
            variant="outline"
            :disabled="connections.busy === record.id"
            @click="reauthenticate(record.id)"
            >Reauthenticate</Button
          >
          <Button
            v-if="record.configured"
            size="sm"
            variant="outline"
            :disabled="connections.busy === record.id"
            @click="connections.disconnect(record.id)"
            >Disconnect</Button
          >
          <Button
            v-else
            size="sm"
            variant="outline"
            @click="emit('connections')"
            >Connect</Button
          >
        </div>
      </li>
    </ul>
  </section>
</template>
