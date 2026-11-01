export interface SettingsPage {
  id: string;
  label: string;
  keywords: string;
}
export const settingsPages: SettingsPage[] = [
  {
    id: 'general',
    label: 'General',
    keywords: 'layout sidebar provider startup',
  },
  {
    id: 'appearance',
    label: 'Appearance',
    keywords: 'theme density font color',
  },
  { id: 'keyboard', label: 'Keyboard shortcuts', keywords: 'shortcut keys' },
  {
    id: 'models',
    label: 'Models',
    keywords: 'generation temperature reasoning tokens',
  },
  { id: 'agent', label: 'Agent', keywords: 'mode ask plan edit read-only' },
  {
    id: 'permissions',
    label: 'Permissions',
    keywords: 'manual automatic full audit',
  },
  {
    id: 'workspaces',
    label: 'Workspaces',
    keywords: 'project directory folder',
  },
  {
    id: 'terminal',
    label: 'Terminal',
    keywords: 'shell font scrollback sandbox',
  },
  { id: 'editor', label: 'Editor', keywords: 'tab wrap minimap monaco' },
  { id: 'files', label: 'Files', keywords: 'attachment retention delete' },
  {
    id: 'notifications',
    label: 'Notifications',
    keywords: 'sound do not disturb approval error',
  },
  {
    id: 'voice',
    label: 'Voice',
    keywords: 'microphone transcription push to talk',
  },
  {
    id: 'accounts',
    label: 'Accounts',
    keywords: 'connection disconnect reauthenticate',
  },
  { id: 'rules', label: 'Rules', keywords: 'untrusted context instructions' },
  { id: 'skills', label: 'Skills', keywords: 'untrusted context prompt' },
  {
    id: 'prompts',
    label: 'Prompts',
    keywords: 'untrusted context reusable prompt',
  },
  { id: 'mcp', label: 'MCP', keywords: 'server connection status approval' },
  {
    id: 'diagnostics',
    label: 'Diagnostics',
    keywords: 'version data path export secrets',
  },
  {
    id: 'providers',
    label: 'Providers',
    keywords: 'connection api key sign in',
  },
  { id: 'data', label: 'Data and storage', keywords: 'import export backup' },
  { id: 'about', label: 'About', keywords: 'version application' },
];
export function filterSettingsPages(pages: SettingsPage[], query: string) {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return pages;
  return pages.filter((page) => {
    const haystack = `${page.label} ${page.keywords}`.toLowerCase();
    return terms.every((term) => haystack.includes(term));
  });
}
