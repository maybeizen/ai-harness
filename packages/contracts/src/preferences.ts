import { z } from 'zod';
import { connectionKindSchema } from './chat';
import { shortcutBindingsSchema } from './shortcuts';
import { agentModeSchema, permissionPolicySchema } from './agent';
import { generationSettingsSchema } from './generation';
import { retentionPolicySchema } from './retention';
import {
  editorPreferencesSchema,
  fontFamilySchema,
  notificationPreferencesSchema,
  sidebarGroupsSchema,
  terminalPreferencesSchema,
  voicePreferencesSchema,
  windowGeometrySchema,
} from './shell';
const color = z
  .string()
  .regex(/^#[\da-f]{6}$/i, 'Use a six-digit hex color.')
  .nullable();
export const backgroundSchema = z
  .object({
    assetId: z
      .string()
      .regex(/^[a-zA-Z0-9_-]{1,128}$/)
      .nullable()
      .default(null),
    opacity: z.number().min(0).max(1).default(0.25),
    blur: z.number().min(0).max(30).default(0),
    overlay: z.number().min(0).max(1).default(0.5),
    position: z
      .enum(['center', 'top', 'bottom', 'left', 'right'])
      .default('center'),
    scope: z.enum(['global', 'conversation']).default('conversation'),
  })
  .strict();
export const appearanceSettingsSchema = z
  .object({
    theme: z.enum(['dark', 'light', 'system']).default('dark'),
    accent: z.enum(['mint', 'blue', 'violet']).default('mint'),
    density: z
      .enum(['comfortable', 'compact', 'spacious'])
      .default('comfortable'),
    reducedMotion: z.boolean().default(false),
    customAccent: color.default(null),
    customBackground: color.default(null),
    customSurface: color.default(null),
    customText: color.default(null),
    customHighlight: color.default(null),
    borderIntensity: z.number().min(0).max(1).default(0.5),
    fontScale: z.number().min(0.85).max(1.2).default(1),
    sidebarWidth: z.number().min(200).max(400).default(248),
    chatWidth: z.number().min(600).max(1200).default(768),
    compactTitlebar: z.boolean().default(false),
  })
  .strict();
export const themePresetSchema = z
  .object({
    format: z.literal('axioden-theme'),
    version: z.literal(1),
    appearance: appearanceSettingsSchema,
  })
  .strict();
export const settingsSchema = appearanceSettingsSchema
  .extend({
    schemaVersion: z.literal(1).default(1),
    selectedMode: agentModeSchema.default('ask'),
    permissionPolicy: permissionPolicySchema.default('manual'),
    activeDirectory: z.string().uuid().nullable().default(null),
    shortcuts: shortcutBindingsSchema.default(() =>
      shortcutBindingsSchema.parse({}),
    ),
    rightPanelOpen: z.boolean().default(false),
    rightPanelWidth: z.number().min(320).max(800).default(480),
    sidebarOpen: z.boolean().default(true),
    selectedProvider: connectionKindSchema.default('chatgpt'),
    selectedModel: z.string().max(256).default(''),
    activeConversation: z.string().max(128).nullable().default(null),
    background: backgroundSchema.default(() => backgroundSchema.parse({})),
    fontFamily: fontFamilySchema.default('system'),
    window: windowGeometrySchema.nullable().default(null),
    terminal: terminalPreferencesSchema.default(() =>
      terminalPreferencesSchema.parse({}),
    ),
    editor: editorPreferencesSchema.default(() =>
      editorPreferencesSchema.parse({}),
    ),
    notifications: notificationPreferencesSchema.default(() =>
      notificationPreferencesSchema.parse({}),
    ),
    voice: voicePreferencesSchema.default(() =>
      voicePreferencesSchema.parse({}),
    ),
    sidebarGroups: sidebarGroupsSchema.default(() =>
      sidebarGroupsSchema.parse({}),
    ),
    retention: retentionPolicySchema.default(() =>
      retentionPolicySchema.parse({}),
    ),
    generation: generationSettingsSchema.default(() =>
      generationSettingsSchema.parse({}),
    ),
  })
  .strict();
export type AppearanceSettings = z.infer<typeof appearanceSettingsSchema>;
export type Settings = z.infer<typeof settingsSchema>;
