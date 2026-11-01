<script setup lang="ts">
import { onMounted, ref } from 'vue';
import {
  mcpDiscoverResultSchema,
  mcpServerConfigSchema,
  mcpStatusSchema,
  toAppError,
} from '@harness/contracts';
import type { z } from 'zod';
import { workstation } from '../../transport/workstation';
import { Button } from '../ui/button';
import { controlField } from '../ui/control-styles';
const status = ref<z.infer<typeof mcpStatusSchema> | null>(null);
const tools = ref<string[]>([]);
const error = ref('');
const name = ref('');
const transport = ref<'http' | 'stdio'>('http');
const url = ref('http://127.0.0.1:9/mcp');
const command = ref('');
const workspaceId = ref('');
async function load() {
  status.value = mcpStatusSchema.parse(
    await workstation({ action: 'mcp.status' }),
  );
  error.value = '';
}
async function run(operation: Parameters<typeof workstation>[0]) {
  try {
    await workstation(operation);
    tools.value = [];
    await load();
  } catch (cause) {
    error.value = toAppError(cause).message;
  }
}
async function save() {
  const config =
    transport.value === 'http'
      ? {
          id: crypto.randomUUID(),
          name: name.value,
          enabled: true,
          transport: 'http' as const,
          url: url.value,
          credentialRef: null,
          timeoutMs: 15000,
        }
      : {
          id: crypto.randomUUID(),
          name: name.value,
          enabled: true,
          transport: 'stdio' as const,
          command: command.value,
          args: [],
          workspaceId: workspaceId.value,
          credentialRef: null,
          timeoutMs: 15000,
        };
  const parsed = mcpServerConfigSchema.safeParse(config);
  if (!parsed.success) {
    error.value =
      'Use a name and an HTTPS or localhost HTTP endpoint, or an approved local command with a workspace id.';
    return;
  }
  await run({ action: 'mcp.save', config: parsed.data });
  name.value = '';
}
async function discover(id: string) {
  try {
    const result = mcpDiscoverResultSchema.parse(
      await workstation({ action: 'mcp.discover', id }),
    );
    tools.value = result.tools.map(
      (tool) => `${tool.name}${tool.enabled ? '' : ' (disabled)'}`,
    );
    error.value = '';
  } catch (cause) {
    error.value = toAppError(cause).message;
  }
}
onMounted(async () => {
  try {
    await load();
  } catch (cause) {
    error.value = toAppError(cause).message;
  }
});
</script>
<template>
  <section class="setting-section" aria-labelledby="mcp-settings-heading">
    <div>
      <h3 id="mcp-settings-heading" class="text-sm font-semibold">MCP</h3>
      <p class="mt-1 text-xs leading-5 text-muted-foreground">
        <template v-if="status?.registered">
          Servers are registered with the agent. External tools stay hidden from
          Ask, Plan, Review, and Security, and each call needs approval.
        </template>
        <template v-else>MCP is not registered with the runtime.</template>
      </p>
    </div>
    <p v-if="error" role="alert" class="text-xs text-destructive">
      {{ error }}
    </p>
    <p
      v-if="status && !status.servers.length"
      class="text-xs text-muted-foreground"
    >
      No saved MCP servers.
      <span v-if="status.unreadable">
        {{ status.unreadable }} saved configuration could not be read.
      </span>
    </p>
    <ul v-else-if="status" class="grid gap-2">
      <li
        v-for="server in status.servers"
        :key="server.id"
        class="grid gap-2 text-xs leading-5"
      >
        <span>
          <span class="font-medium">{{ server.name }}</span>
          {{ server.transport }} ·
          {{ server.enabled ? 'enabled' : 'disabled' }} · {{ server.status }}.
          {{ server.enabledToolCount }} of {{ server.toolCount }} tools can be
          called.
        </span>
        <span v-if="server.error">{{ server.error.message }}</span>
        <span class="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            @click="
              run({
                action: 'mcp.enable',
                id: server.id,
                enabled: !server.enabled,
              })
            "
            >{{ server.enabled ? 'Disable' : 'Enable' }}</Button
          >
          <Button
            size="sm"
            variant="outline"
            @click="
              run({ action: 'mcp.connect', id: server.id, approved: true })
            "
            >Connect</Button
          >
          <Button
            size="sm"
            variant="outline"
            @click="run({ action: 'mcp.disconnect', id: server.id })"
            >Disconnect</Button
          >
          <Button size="sm" variant="outline" @click="discover(server.id)"
            >Discover</Button
          >
        </span>
      </li>
    </ul>
    <ul v-if="tools.length" class="grid gap-1 text-xs">
      <li v-for="tool in tools" :key="tool">{{ tool }}</li>
    </ul>
    <label class="grid gap-2 text-xs font-medium"
      >Name<input v-model="name" :class="controlField" maxlength="80"
    /></label>
    <label class="grid gap-2 text-xs font-medium"
      >Transport
      <select v-model="transport" :class="controlField">
        <option value="http">Remote HTTP</option>
        <option value="stdio">Local process</option>
      </select></label
    >
    <label v-if="transport === 'http'" class="grid gap-2 text-xs font-medium"
      >Endpoint<input v-model="url" :class="controlField" maxlength="2048"
    /></label>
    <template v-else>
      <label class="grid gap-2 text-xs font-medium"
        >Command<input v-model="command" :class="controlField" maxlength="4096"
      /></label>
      <label class="grid gap-2 text-xs font-medium"
        >Workspace id<input v-model="workspaceId" :class="controlField"
      /></label>
    </template>
    <Button @click="save">Save server</Button>
  </section>
</template>
