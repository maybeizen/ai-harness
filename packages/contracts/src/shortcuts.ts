import { z } from 'zod';
export const shortcutActions = [
  'newChat',
  'sidebar',
  'settings',
  'focusComposer',
  'openWorkspace',
  'cancel',
] as const;
export type ShortcutAction = (typeof shortcutActions)[number];
export const shortcutLabels: Record<ShortcutAction, string> = {
  newChat: 'New conversation',
  sidebar: 'Toggle sidebar',
  settings: 'Open settings',
  focusComposer: 'Focus message composer',
  openWorkspace: 'Open workspace',
  cancel: 'Cancel generation',
};
export const defaultShortcuts: Record<ShortcutAction, string | null> = {
  newChat: 'CtrlOrMeta+N',
  sidebar: 'CtrlOrMeta+B',
  settings: 'CtrlOrMeta+,',
  focusComposer: 'CtrlOrMeta+J',
  openWorkspace: 'CtrlOrMeta+O',
  cancel: 'Escape',
};
const modifiers = ['CtrlOrMeta', 'Ctrl', 'Meta', 'Alt', 'Shift'];
export function normalizeShortcut(value: string): string {
  const parts = value.trim().split('+');
  const rawKey = parts.pop() ?? '';
  const key = rawKey.length === 1 ? rawKey.toUpperCase() : rawKey;
  const printable =
    key.length === 1 &&
    (/^[A-Z0-9]$/.test(key) || ",./;[]\\'`=-".includes(key));
  if (
    !printable &&
    !/^(?:Escape|Enter|Tab|Space|ArrowUp|ArrowDown|ArrowLeft|ArrowRight|F(?:[1-9]|1[0-2]))$/.test(
      key,
    )
  )
    throw new Error('Choose a supported key.');
  if (
    new Set(parts).size !== parts.length ||
    parts.some((part) => !modifiers.includes(part))
  )
    throw new Error('Invalid shortcut modifiers.');
  if (
    parts.includes('CtrlOrMeta') &&
    (parts.includes('Ctrl') || parts.includes('Meta'))
  )
    throw new Error('Use CtrlOrMeta or a platform modifier.');
  if (
    !parts.some((part) =>
      ['CtrlOrMeta', 'Ctrl', 'Meta', 'Alt'].includes(part),
    ) &&
    !/^(Escape|F\d+)$/.test(key)
  )
    throw new Error('Use Ctrl, Command or Alt with this key.');
  const normalized = [
    ...modifiers.filter((modifier) => parts.includes(modifier)),
    key,
  ].join('+');
  const platformVariants = [
    normalized.replace('CtrlOrMeta', 'Ctrl'),
    normalized.replace('CtrlOrMeta', 'Meta'),
  ];
  const reserved = new Set([
    'Ctrl+C',
    'Meta+C',
    'Ctrl+V',
    'Meta+V',
    'Ctrl+X',
    'Meta+X',
    'Ctrl+A',
    'Meta+A',
    'Ctrl+Z',
    'Meta+Z',
    'Ctrl+Y',
    'Meta+Y',
    'Ctrl+Shift+Z',
    'Meta+Shift+Z',
    'Alt+Tab',
    'Meta+Tab',
    'Ctrl+Tab',
    'Meta+H',
    'Meta+M',
    'Ctrl+Q',
    'Meta+Q',
    'Ctrl+W',
    'Meta+W',
    'Ctrl+R',
    'Meta+R',
    'Ctrl+L',
    'Meta+L',
    'Alt+F4',
    'Ctrl+Alt+Delete',
    'Meta+Space',
    'F5',
    'Ctrl+Shift+R',
    'Meta+Shift+R',
  ]);
  if (platformVariants.some((candidate) => reserved.has(candidate)))
    throw new Error(
      'This shortcut is reserved by the application or operating system.',
    );
  return normalized;
}
const bindingSchema = z
  .string()
  .max(80)
  .transform((value, context) => {
    try {
      return normalizeShortcut(value);
    } catch (error) {
      context.addIssue({
        code: 'custom',
        message: error instanceof Error ? error.message : 'Invalid shortcut.',
      });
      return z.NEVER;
    }
  })
  .nullable();
export const shortcutBindingsSchema = z
  .object({
    newChat: bindingSchema.default(defaultShortcuts.newChat),
    sidebar: bindingSchema.default(defaultShortcuts.sidebar),
    settings: bindingSchema.default(defaultShortcuts.settings),
    focusComposer: bindingSchema.default(defaultShortcuts.focusComposer),
    openWorkspace: bindingSchema.default(defaultShortcuts.openWorkspace),
    cancel: bindingSchema.default(defaultShortcuts.cancel),
  })
  .strict()
  .superRefine((bindings, context) => {
    const seen = new Map<string, ShortcutAction>();
    for (const action of shortcutActions) {
      const value = bindings[action];
      if (!value) continue;
      for (const expanded of new Set([
        value.replace('CtrlOrMeta', 'Ctrl'),
        value.replace('CtrlOrMeta', 'Meta'),
      ])) {
        const previous = seen.get(expanded);
        if (previous)
          context.addIssue({
            code: 'custom',
            path: [action],
            message: `Already assigned to ${shortcutLabels[previous]}.`,
          });
        seen.set(expanded, action);
      }
    }
  });
export const shortcutPresetSchema = z
  .object({
    format: z.literal('axioden-shortcuts'),
    version: z.literal(1),
    shortcuts: shortcutBindingsSchema,
  })
  .strict();
