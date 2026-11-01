import { z } from 'zod';
import {
  appearanceSettingsSchema,
  settingsSchema,
  shortcutBindingsSchema,
  type Settings,
} from '@harness/contracts';
export const portableSettingsSchema = appearanceSettingsSchema
  .extend({
    sidebarOpen: settingsSchema.shape.sidebarOpen,
    rightPanelOpen: settingsSchema.shape.rightPanelOpen,
    rightPanelWidth: settingsSchema.shape.rightPanelWidth,
    selectedProvider: settingsSchema.shape.selectedProvider,
    selectedModel: settingsSchema.shape.selectedModel,
    shortcuts: shortcutBindingsSchema,
  })
  .strict();
export const settingsBackupSchema = z
  .object({
    format: z.literal('axioden-settings'),
    version: z.literal(1),
    settings: portableSettingsSchema,
  })
  .strict();
export function exportSettings(settings: Settings) {
  const portable = portableSettingsSchema.parse(
    Object.fromEntries(
      Object.keys(portableSettingsSchema.shape).map((key) => [
        key,
        settings[key as keyof Settings],
      ]),
    ),
  );
  return JSON.stringify(
    { format: 'axioden-settings', version: 1, settings: portable },
    null,
    2,
  );
}
export function importSettings(text: string) {
  if (new TextEncoder().encode(text).byteLength > 262144)
    throw new Error('The settings file exceeds 256 KiB.');
  return settingsBackupSchema.parse(JSON.parse(text)).settings;
}
