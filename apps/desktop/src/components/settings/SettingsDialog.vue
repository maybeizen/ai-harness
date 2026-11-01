<script setup lang="ts">
import { computed, ref, type Component } from 'vue';
import {
  Activity,
  Bell,
  Bot,
  Cable,
  Database,
  FileCode,
  Files,
  Folder,
  Info,
  Keyboard,
  Mic,
  Palette,
  Plug,
  ScrollText,
  Shield,
  SlidersHorizontal,
  Sparkles,
  SquareTerminal,
  UserRound,
} from '@lucide/vue';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import { controlField } from '../ui/control-styles';
import { useSettingsStore } from '../../stores/settings';
import { filterSettingsPages, settingsPages } from './catalog';
import { settingsViews } from './views';
const open = defineModel<boolean>({ required: true });
const props = withDefaults(defineProps<{ disabled?: boolean }>(), {
  disabled: false,
});
const emit = defineEmits<{ connections: [] }>();
const preferences = useSettingsStore();
const query = ref('');
const selected = ref('general');
const visible = computed(() => filterSettingsPages(settingsPages, query.value));
const icons: Record<string, Component> = {
  general: SlidersHorizontal,
  appearance: Palette,
  keyboard: Keyboard,
  models: Bot,
  agent: Sparkles,
  permissions: Shield,
  workspaces: Folder,
  terminal: SquareTerminal,
  editor: FileCode,
  files: Files,
  notifications: Bell,
  voice: Mic,
  accounts: UserRound,
  rules: ScrollText,
  skills: Sparkles,
  prompts: ScrollText,
  mcp: Cable,
  diagnostics: Activity,
  providers: Plug,
  data: Database,
  about: Info,
};
function select(id: string) {
  if (id === 'providers') {
    open.value = false;
    emit('connections');
  } else selected.value = id;
}
</script>
<template>
  <Dialog :open="open && !props.disabled" @update:open="open = $event"
    ><DialogContent
      class="flex h-[min(85svh,760px)] flex-col overflow-hidden sm:max-w-4xl"
      ><DialogHeader
        ><DialogTitle>Settings</DialogTitle
        ><DialogDescription
          >Personalize your workstation and manage local
          preferences.</DialogDescription
        ></DialogHeader
      >
      <div class="flex min-h-0 flex-1 flex-col gap-4 sm:flex-row">
        <div class="flex shrink-0 flex-col gap-2 sm:w-48">
          <input
            v-model="query"
            type="search"
            aria-label="Search settings"
            placeholder="Search settings"
            :class="controlField"
          />
          <nav
            aria-label="Settings categories"
            class="flex gap-1 overflow-x-auto sm:flex-col sm:overflow-y-auto sm:border-r sm:pr-3"
          >
            <p
              v-if="!visible.length"
              class="px-3 py-2 text-xs text-muted-foreground"
            >
              No matching settings.
            </p>
            <button
              v-for="section in visible"
              :key="section.id"
              type="button"
              class="flex min-h-[var(--row-height)] shrink-0 items-center gap-2 rounded-md px-3 text-left text-xs transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              :class="
                selected === section.id
                  ? 'bg-accent text-accent-foreground'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              "
              :aria-current="selected === section.id ? 'page' : undefined"
              @click="select(section.id)"
            >
              <component :is="icons[section.id]" class="size-4 shrink-0" />{{
                section.label
              }}
            </button>
          </nav>
        </div>
        <fieldset
          :disabled="
            props.disabled || (!preferences.ready && selected !== 'about')
          "
          class="min-h-0 min-w-0 flex-1 overflow-y-auto px-1 pb-2 sm:px-3"
        >
          <component
            :is="settingsViews[selected]"
            v-if="settingsViews[selected]"
            :disabled="props.disabled"
            @connections="select('providers')"
          />
        </fieldset>
      </div>
      <p
        v-if="preferences.error && !['appearance', 'data'].includes(selected)"
        role="alert"
        class="text-xs text-destructive"
      >
        {{ preferences.error.message }} Your changes may not be saved.
      </p>
    </DialogContent></Dialog
  >
</template>
