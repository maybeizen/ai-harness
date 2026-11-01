import type { FontFamily, Settings } from '@harness/contracts';
export const shellFontStacks: Record<FontFamily, string> = {
  system: 'system-ui, sans-serif',
  sans: 'Inter, ui-sans-serif, system-ui, sans-serif',
  serif: 'Georgia, "Iowan Old Style", Palatino, serif',
  mono: 'ui-monospace, "Cascadia Mono", "Segoe UI Mono", monospace',
  readable: 'Verdana, "Segoe UI", sans-serif',
};
export const terminalFontStacks: Record<FontFamily, string> = {
  system: 'ui-monospace, monospace',
  sans: 'ui-sans-serif, sans-serif',
  serif: 'Georgia, serif',
  mono: 'ui-monospace, "Cascadia Mono", monospace',
  readable: 'Verdana, sans-serif',
};
export function terminalAppearance(
  settings: Pick<Settings, 'fontFamily' | 'terminal'>,
) {
  return {
    fontFamily: terminalFontStacks[settings.fontFamily],
    fontSize: settings.terminal.fontSize,
    scrollback: settings.terminal.scrollback,
  };
}
