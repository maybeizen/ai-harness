import { z } from 'zod';
import { connectionKindSchema, textMessageSchema } from './chat';
export const savedMessageSchema = textMessageSchema
  .extend({
    status: z.enum(['completed', 'streaming', 'stopped', 'error']),
    modelName: z.string().max(256).optional(),
    connectionId: connectionKindSchema.optional(),
  })
  .strict();
export const conversationSchema = z
  .object({
    id: z.string().min(1).max(128),
    title: z.string().min(1).max(200),
    pinned: z.boolean(),
    updatedAt: z.number().int().nonnegative(),
    messages: z.array(savedMessageSchema).max(1000),
  })
  .strict();
export const conversationSummarySchema = conversationSchema.omit({
  messages: true,
});
export const settingsSchema = z
  .object({
    schemaVersion: z.literal(1).default(1),
    theme: z.enum(['dark', 'light', 'system']).default('dark'),
    accent: z.enum(['mint', 'blue', 'violet']).default('mint'),
    density: z.enum(['comfortable', 'compact']).default('comfortable'),
    reducedMotion: z.boolean().default(false),
    sidebarOpen: z.boolean().default(true),
    selectedProvider: connectionKindSchema.default('chatgpt'),
    selectedModel: z.string().max(256).default(''),
    activeConversation: z.string().max(128).nullable().default(null),
  })
  .strict();
export const storageOperationSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('list') }).strict(),
  z
    .object({ action: z.literal('get'), id: conversationSchema.shape.id })
    .strict(),
  z
    .object({
      action: z.literal('update'),
      id: conversationSchema.shape.id,
      title: conversationSchema.shape.title,
      pinned: z.boolean(),
    })
    .strict(),
  z
    .object({ action: z.literal('delete'), id: conversationSchema.shape.id })
    .strict(),
  z.object({ action: z.literal('settings.get') }).strict(),
  z
    .object({ action: z.literal('settings.set'), settings: settingsSchema })
    .strict(),
]);
export type SavedMessage = z.infer<typeof savedMessageSchema>;
export type Conversation = z.infer<typeof conversationSchema>;
export type ConversationSummary = z.infer<typeof conversationSummarySchema>;
export type Settings = z.infer<typeof settingsSchema>;
export type StorageOperation = z.infer<typeof storageOperationSchema>;
