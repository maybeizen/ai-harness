import type { Settings } from '@harness/contracts';
import { shellFontStacks } from '../shell/fonts';
export function applyAppearance(settings: Settings, systemDark = true) {
  const root = document.documentElement;
  root.dataset.font = settings.fontFamily;
  root.style.setProperty('--shell-font', shellFontStacks[settings.fontFamily]);
  root.dataset.theme =
    settings.theme === 'system'
      ? systemDark
        ? 'dark'
        : 'light'
      : settings.theme;
  root.dataset.accent = settings.accent;
  root.dataset.density = settings.density;
  root.dataset.motion = settings.reducedMotion ? 'reduced' : 'full';
  const colors: Record<string, string | null> = {
    '--primary': settings.customAccent,
    '--background': settings.customBackground,
    '--card': settings.customSurface,
    '--popover': settings.customSurface,
    '--foreground': settings.customText,
    '--selection-color': settings.customHighlight,
  };
  for (const [name, value] of Object.entries(colors)) {
    if (value) root.style.setProperty(name, value);
    else root.style.removeProperty(name);
  }
  if (settings.customAccent) {
    const rgb =
      settings.customAccent
        .slice(1)
        .match(/../g)
        ?.map((v) => parseInt(v, 16) / 255) ?? [];
    const luminance = rgb.reduce(
      (sum, c, i) =>
        sum +
        (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4) *
          ([0.2126, 0.7152, 0.0722][i] ?? 0),
      0,
    );
    root.style.setProperty(
      '--primary-foreground',
      luminance > 0.179 ? '#111318' : '#ffffff',
    );
  } else root.style.removeProperty('--primary-foreground');
  root.style.setProperty('--border-opacity', String(settings.borderIntensity));
  root.style.setProperty('--chat-width', `${settings.chatWidth}px`);
  root.style.setProperty('--sidebar-width', `${settings.sidebarWidth}px`);
  root.style.fontSize = `${16 * settings.fontScale}px`;
}
