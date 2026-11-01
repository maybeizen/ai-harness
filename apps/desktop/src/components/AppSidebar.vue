<script setup lang="ts">
import ProjectNavigation from './projects/ProjectNavigation.vue';
import BrandMark from './BrandMark.vue';
import { Plus, SlidersHorizontal, ArrowUpRight } from '@lucide/vue';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  useSidebar,
} from './ui/sidebar';
import { Button } from './ui/button';
import { useChatStore } from '../stores/chat';
import { useConnectionsStore } from '../stores/connections';
import ConversationHistory from './chat/ConversationHistory.vue';
const emit = defineEmits<{ connections: [] }>();
const chat = useChatStore();
const connections = useConnectionsStore();
const sidebar = useSidebar();
async function newChat() {
  await chat.newChat();
  if (sidebar.isMobile.value) sidebar.setOpenMobile(false);
}
function configure() {
  emit('connections');
  if (sidebar.isMobile.value) sidebar.setOpenMobile(false);
}
</script>
<template>
  <Sidebar collapsible="offcanvas" class="border-r border-sidebar-border">
    <SidebarHeader class="gap-6 px-5 pt-6 pb-3"
      ><div class="flex items-center gap-2.5">
        <span
          class="flex size-8 items-center justify-center rounded-xl border border-primary/25 bg-primary/8 text-primary"
          ><BrandMark class="size-5"
        /></span>
        <div>
          <p class="text-sm font-semibold tracking-tight">Axioden</p>
          <p class="mt-0.5 text-[10px] tracking-wide text-muted-foreground">
            PERSONAL WORKSTATION
          </p>
        </div>
      </div>
      <Button
        variant="outline"
        class="h-9 justify-start gap-2 border-sidebar-border bg-sidebar text-xs font-normal"
        @click="newChat"
        ><Plus class="size-3.5" />New chat</Button
      ></SidebarHeader
    >
    <SidebarContent
      ><ProjectNavigation /><ConversationHistory
        @selected="sidebar.setOpenMobile(false)"
    /></SidebarContent>
    <SidebarFooter class="gap-4 px-3 pb-5"
      ><Button
        variant="ghost"
        class="h-9 justify-start gap-2 px-3 text-xs font-normal text-muted-foreground hover:text-foreground"
        @click="configure"
        ><SlidersHorizontal class="size-3.5" />Connections<span
          class="ml-auto text-[10px]"
          >{{
            connections.records.filter(
              (record) => record.status === 'connected',
            ).length
          }}
          connected</span
        ></Button
      >
      <div
        class="mx-2 flex items-start gap-2 rounded-lg border border-sidebar-border p-3 text-[10px] leading-4 text-muted-foreground/75"
      >
        <ArrowUpRight class="mt-0.5 size-3 shrink-0" /><span
          >Conversations are stored on this device.<br />Responses come from
          your selected provider.</span
        >
      </div></SidebarFooter
    >
  </Sidebar>
</template>
