import { defineComponent, h, type Component } from 'vue';
import AboutSettings from './AboutSettings.vue';
import AccountsSettings from './AccountsSettings.vue';
import AgentSettings from './AgentSettings.vue';
import AppearanceSettings from './AppearanceSettings.vue';
import ContextSettings from './ContextSettings.vue';
import DataSettings from './DataSettings.vue';
import DiagnosticsSettings from './DiagnosticsSettings.vue';
import EditorSettings from './EditorSettings.vue';
import FilesSettings from './FilesSettings.vue';
import GeneralSettings from './GeneralSettings.vue';
import KeyboardSettings from './KeyboardSettings.vue';
import McpSettings from './McpSettings.vue';
import ModelsSettings from './ModelsSettings.vue';
import NotificationsSettings from './NotificationsSettings.vue';
import PermissionsSettings from './PermissionsSettings.vue';
import TerminalSettings from './TerminalSettings.vue';
import VoiceSettings from './VoiceSettings.vue';
import WorkspacesSettings from './WorkspacesSettings.vue';
const contextPage = (kind: 'rule' | 'skill' | 'prompt') =>
  defineComponent({
    name:
      kind === 'rule'
        ? 'RulesSettings'
        : kind === 'skill'
          ? 'SkillsSettings'
          : 'PromptsSettings',
    setup: () => () => h(ContextSettings, { kind }),
  });
export const settingsViews: Record<string, Component> = {
  general: GeneralSettings,
  appearance: AppearanceSettings,
  keyboard: KeyboardSettings,
  models: ModelsSettings,
  agent: AgentSettings,
  permissions: PermissionsSettings,
  workspaces: WorkspacesSettings,
  terminal: TerminalSettings,
  editor: EditorSettings,
  files: FilesSettings,
  notifications: NotificationsSettings,
  voice: VoiceSettings,
  accounts: AccountsSettings,
  rules: contextPage('rule'),
  skills: contextPage('skill'),
  prompts: contextPage('prompt'),
  mcp: McpSettings,
  diagnostics: DiagnosticsSettings,
  data: DataSettings,
  about: AboutSettings,
};
