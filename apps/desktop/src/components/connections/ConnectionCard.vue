<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import {
  ArrowUpRight,
  LoaderCircle,
  RefreshCw,
  Unplug,
  ShieldCheck,
  Clock,
} from '@lucide/vue';
import type { ConnectionSummary } from '@harness/contracts';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select';
import { useConnectionsStore } from '../../stores/connections';
import { useChatStore } from '../../stores/chat';
import { useBackend } from '../../transport/backend';
import { connectionInfo } from './info';
const props = defineProps<{ connection: ConnectionSummary }>();
const emit = defineEmits<{ connected: [] }>();
const connections = useConnectionsStore();
const chat = useChatStore();
const backend = useBackend();
const key = ref('');
const executable = ref(props.connection.executable ?? '');
const baseURL = ref('');
const storage = ref('secure');
const linkFailed = ref(false);
watch(
  () => props.connection.baseURL,
  (value) => {
    if (value) baseURL.value = value;
  },
  { immediate: true },
);
const connectDisabled = computed(
  () =>
    chat.active ||
    !!connections.busy ||
    (props.connection.method === 'api-key' && !key.value.trim()) ||
    (props.connection.id === 'custom' && !baseURL.value.trim()) ||
    (props.connection.id === 'claude-client' && !executable.value.trim()),
);
async function connect() {
  const value = key.value;
  key.value = '';
  const success = await connections.connect(props.connection.id, {
    apiKey: value,
    sessionOnly: storage.value === 'session',
    executable: executable.value,
    baseURL: baseURL.value.trim(),
  });
  if (success) emit('connected');
}
function setup() {
  void backend.open(connectionInfo[props.connection.id].setup).catch(() => {
    linkFailed.value = true;
  });
}
async function refresh() {
  try {
    await connections.refresh(props.connection.id);
  } catch {
    /* Store exposes a sanitized error. */
  }
}
</script>
<template>
  <section
    :aria-label="connection.label"
    class="rounded-xl border border-border bg-card/50 p-4"
  >
    <div class="mb-2 flex items-center justify-between gap-3">
      <h3 class="text-sm font-medium">{{ connection.label }}</h3>
      <span class="flex items-center gap-1.5 text-[11px] text-muted-foreground"
        ><span
          class="size-1.5 rounded-full"
          :class="
            connection.status === 'connected'
              ? 'bg-primary'
              : 'bg-muted-foreground/40'
          "
        />{{
          connection.status === 'checking'
            ? 'Checking'
            : connection.status === 'connected'
              ? 'Connected'
              : connection.status === 'unavailable'
                ? 'Unavailable'
                : connection.method === 'api-key'
                  ? 'API key required'
                  : 'Not connected'
        }}</span
      >
    </div>
    <p class="mb-3 text-xs leading-5 text-muted-foreground">
      {{ connectionInfo[connection.id].description }}
    </p>
    <template v-if="connection.configured">
      <p v-if="connection.account" class="mb-2 truncate text-xs">
        {{ connection.account }}
      </p>
      <p v-if="connection.baseURL" class="mb-2 truncate text-xs">
        {{ connection.baseURL }}
      </p>
      <p
        class="mb-3 flex items-center gap-1.5 text-[11px] text-muted-foreground"
      >
        <Clock
          v-if="connection.storage === 'session'"
          class="size-3"
        /><ShieldCheck v-else class="size-3" />{{
          connection.method === 'endpoint' && connection.storage === 'secure'
            ? 'Endpoint saved on this device. Bearer tokens use your OS credential service.'
            : connection.storage === 'session'
              ? 'Session only · lost when the app closes'
              : connection.storage === 'client'
                ? 'Authentication managed by the official client'
                : 'Saved in your OS credential service'
        }}
      </p>
      <div class="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          :disabled="chat.active || !!connections.busy"
          @click="refresh"
          ><RefreshCw class="mr-1.5 size-3" />Refresh models</Button
        ><Button
          variant="ghost"
          size="sm"
          :disabled="chat.active || !!connections.busy"
          @click="connections.disconnect(connection.id)"
          ><Unplug class="mr-1.5 size-3" />Disconnect</Button
        >
      </div>
    </template>
    <template
      v-if="!connection.configured || connection.status === 'unavailable'"
    >
      <div v-if="connection.method === 'endpoint'" class="mb-3">
        <label
          :for="`${connection.id}-endpoint`"
          class="mb-1.5 block text-xs text-muted-foreground"
          >Base URL</label
        ><Input
          :id="`${connection.id}-endpoint`"
          v-model="baseURL"
          spellcheck="false"
          :placeholder="
            connectionInfo[connection.id].endpoint ?? 'https://host.example/v1'
          "
          :disabled="!!connections.busy || chat.active"
        />
      </div>
      <div
        v-if="
          connection.method === 'api-key' || connection.method === 'endpoint'
        "
        class="mb-3"
      >
        <label :for="`${connection.id}-key`" class="sr-only"
          >{{ connection.label }} API key</label
        ><Input
          :id="`${connection.id}-key`"
          v-model="key"
          type="password"
          autocomplete="off"
          spellcheck="false"
          :placeholder="
            connection.method === 'endpoint'
              ? 'Bearer token, if required'
              : 'Paste API key'
          "
          :disabled="!!connections.busy || chat.active"
          @keydown.enter="connect"
        />
      </div>
      <div v-if="connection.id === 'claude-client'" class="mb-3">
        <label
          for="claude-executable"
          class="mb-1.5 block text-xs text-muted-foreground"
          >Official client executable</label
        ><Input
          id="claude-executable"
          v-model="executable"
          placeholder="/home/you/.local/bin/claude"
          :disabled="!!connections.busy || chat.active"
        />
        <p class="mt-2 text-[11px] leading-5 text-muted-foreground">
          Install the current official Claude client, then run
          <code class="rounded bg-muted px-1">claude auth login</code> in your
          terminal. Tools and project access are disabled in this app.
        </p>
      </div>
      <Select
        v-if="connection.method !== 'official-client'"
        v-model="storage"
        :disabled="!!connections.busy || chat.active"
        ><SelectTrigger
          class="mb-3 h-8 text-xs"
          :aria-label="`${connection.label} credential storage`"
          ><SelectValue /></SelectTrigger
        ><SelectContent
          ><SelectItem value="secure"
            >Save with OS credential service</SelectItem
          ><SelectItem value="session"
            >Use for this session only</SelectItem
          ></SelectContent
        ></Select
      >
      <p
        v-if="storage === 'session' && connection.method !== 'official-client'"
        class="mb-3 text-[11px] leading-5 text-muted-foreground"
      >
        Credentials stay in memory and are discarded when the app closes.
      </p>
      <div class="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          :variant="connection.id === 'chatgpt' ? 'default' : 'secondary'"
          :disabled="connectDisabled"
          @click="connect"
          ><LoaderCircle
            v-if="connections.busy === connection.id"
            class="mr-2 size-3.5 animate-spin"
          />{{
            connections.busy === connection.id
              ? connection.id === 'chatgpt'
                ? 'Waiting for browser sign-in…'
                : 'Connecting…'
              : connectionInfo[connection.id].action
          }}</Button
        ><Button
          v-if="connectionInfo[connection.id].setup"
          variant="ghost"
          size="sm"
          class="gap-1 text-xs text-muted-foreground"
          @click="setup"
          >Setup guide<ArrowUpRight class="size-3"
        /></Button>
      </div>
      <Button
        v-if="connections.busy === connection.id && connection.id === 'chatgpt'"
        variant="ghost"
        size="sm"
        class="mt-2"
        @click="connections.cancelSignIn"
        >Cancel sign-in</Button
      >
    </template>
    <p v-if="linkFailed" role="status" class="mt-2 text-xs text-destructive">
      The system browser could not open.
    </p>
  </section>
</template>
