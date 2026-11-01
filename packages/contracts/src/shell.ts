import { z } from 'zod';
export const fontFamilies = [
  'system',
  'sans',
  'serif',
  'mono',
  'readable',
] as const;
export const fontFamilySchema = z.enum(fontFamilies);
export type FontFamily = z.infer<typeof fontFamilySchema>;
const coordinate = z.number().finite().min(-16384).max(16384);
export const windowGeometrySchema = z
  .object({
    x: coordinate,
    y: coordinate,
    width: z.number().finite().min(320).max(8192),
    height: z.number().finite().min(240).max(8192),
    maximized: z.boolean(),
  })
  .strict();
export type WindowGeometry = z.infer<typeof windowGeometrySchema>;
export const terminalPreferencesSchema = z
  .object({
    shell: z
      .string()
      .regex(/^$|^[A-Za-z0-9_./-]{1,256}$/)
      .default(''),
    fontSize: z.number().int().min(8).max(32).default(13),
    scrollback: z.number().int().min(100).max(100_000).default(5000),
  })
  .strict();
export type TerminalPreferences = z.infer<typeof terminalPreferencesSchema>;
export const editorPreferencesSchema = z
  .object({
    tabSize: z.number().int().min(1).max(8).default(2),
    wordWrap: z.boolean().default(false),
    minimap: z.boolean().default(false),
  })
  .strict();
export type EditorPreferences = z.infer<typeof editorPreferencesSchema>;
export const notificationPreferencesSchema = z
  .object({
    taskCompletion: z.boolean().default(true),
    approvalRequests: z.boolean().default(true),
    errors: z.boolean().default(true),
    sound: z.boolean().default(false),
    doNotDisturb: z.boolean().default(false),
  })
  .strict();
export type NotificationPreferences = z.infer<
  typeof notificationPreferencesSchema
>;
const localEndpoint = z
  .string()
  .max(512)
  .refine((value) => {
    if (value === '') return true;
    try {
      const url = new URL(value);
      return (
        (url.protocol === 'http:' || url.protocol === 'https:') &&
        url.username === '' &&
        url.password === ''
      );
    } catch {
      return false;
    }
  }, 'Use an HTTP or HTTPS endpoint without embedded credentials.');
export const voicePreferencesSchema = z
  .object({
    microphone: z.enum(['unknown', 'granted', 'denied']).default('unknown'),
    language: z
      .string()
      .regex(/^[a-z]{2}(-[A-Z]{2})?$/)
      .default('en'),
    pushToTalk: z
      .string()
      .regex(/^[A-Za-z0-9+]{1,64}$/)
      .default('CtrlOrMeta+Shift+M'),
    engine: z
      .enum(['unconfigured', 'local-command', 'local-endpoint'])
      .default('unconfigured'),
    localCommand: z
      .string()
      .max(512)
      .refine((value) => !value.includes('\n') && !value.includes('\r'))
      .default(''),
    localEndpoint: localEndpoint.default(''),
  })
  .strict();
export type VoicePreferences = z.infer<typeof voicePreferencesSchema>;
export const sidebarGroupsSchema = z
  .object({
    projects: z.boolean().default(true),
    directories: z.boolean().default(true),
    conversations: z.boolean().default(true),
  })
  .strict();
export type SidebarGroups = z.infer<typeof sidebarGroupsSchema>;
