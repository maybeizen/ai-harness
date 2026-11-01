import { z } from 'zod';
import { agentModeSchema } from './agent';
import { connectionKindSchema } from './chat';
import {
  attachmentIdSchema,
  attachmentMediaTypes,
  attachmentReferenceSchema,
  chatMessageSchema,
  messageStatuses,
} from './messages';
import { projectOperationSchema } from './projects';
import { settingsSchema } from './preferences';
export { settingsSchema, type Settings } from './preferences';
export const savedMessageSchema = chatMessageSchema
  .extend({ status: z.enum(messageStatuses) })
  .strict();
export const conversationSchema = z
  .object({
    id: z.string().min(1).max(128),
    title: z.string().min(1).max(200),
    pinned: z.boolean(),
    updatedAt: z.number().int().nonnegative(),
    messages: z.array(savedMessageSchema).max(1000),
    projectId: z.string().uuid().nullable().optional(),
    directoryId: z.string().uuid().nullable().optional(),
    archived: z.boolean().optional(),
    provider: connectionKindSchema.nullable().optional(),
    model: z.string().max(256).nullable().optional(),
    mode: agentModeSchema.nullable().optional(),
  })
  .strict();
export const conversationSummarySchema = conversationSchema.omit({
  messages: true,
});
export const historyCursorSchema = conversationSummarySchema.pick({
  pinned: true,
  updatedAt: true,
  id: true,
});
export const historyFilterSchema = z
  .discriminatedUnion('kind', [
    z.object({ kind: z.literal('all') }).strict(),
    z.object({ kind: z.literal('general') }).strict(),
    z.object({ kind: z.literal('archived') }).strict(),
    z.object({ kind: z.literal('project'), id: z.string().uuid() }).strict(),
    z.object({ kind: z.literal('directory'), id: z.string().uuid() }).strict(),
  ])
  .default({ kind: 'all' });
export type HistoryFilter = z.infer<typeof historyFilterSchema>;
export const historyPageRequestSchema = z
  .object({
    action: z.literal('history.page'),
    filter: historyFilterSchema,
    query: z.string().trim().max(200).default(''),
    limit: z.number().int().min(1).max(100).default(50),
    cursor: historyCursorSchema.nullable().default(null),
  })
  .strict();
export const historyPageSchema = z
  .object({
    items: z.array(conversationSummarySchema).max(100),
    nextCursor: historyCursorSchema.nullable(),
  })
  .strict();
export type HistoryPageRequest = z.infer<typeof historyPageRequestSchema>;
export type HistoryPage = z.infer<typeof historyPageSchema>;
export type HistoryCursor = z.infer<typeof historyCursorSchema>;
const conversationFileBody = z
  .object({
    format: z.literal('axioden-conversation'),
    version: z.literal(1),
    conversation: conversationSchema,
    attachments: z.array(attachmentReferenceSchema).max(32).default([]),
  })
  .strict();
export const attachmentWriteSchema = z
  .object({
    action: z.literal('attachment.write'),
    id: attachmentIdSchema,
    name: attachmentReferenceSchema.shape.name,
    mediaType: z.enum(attachmentMediaTypes),
    size: attachmentReferenceSchema.shape.size,
    offset: z.number().int().nonnegative().max(10_485_760),
    data: z.string().min(4).max(360_000),
  })
  .strict();
export const attachmentReadSchema = z
  .object({
    action: z.literal('attachment.read'),
    id: attachmentIdSchema,
    offset: z.number().int().nonnegative().max(10_485_760).default(0),
    length: z.number().int().min(1).max(262_144).default(196_608),
  })
  .strict();
export const attachmentMetaSchema = z
  .object({
    action: z.literal('attachment.meta'),
    ids: z.array(attachmentIdSchema).min(1).max(64),
  })
  .strict();
export const attachmentReadResultSchema = z
  .object({
    reference: attachmentReferenceSchema,
    offset: z.number().int().nonnegative(),
    data: z.string().max(360_000),
    complete: z.boolean(),
  })
  .strict();
export const retentionResultSchema = z
  .object({ removed: z.array(z.string().min(1).max(128)).max(10_000) })
  .strict();
export type AttachmentReadResult = z.infer<typeof attachmentReadResultSchema>;
export type RetentionResult = z.infer<typeof retentionResultSchema>;
export const storageOperationSchema = z.discriminatedUnion('action', [
  historyPageRequestSchema,
  ...projectOperationSchema.options,
  z
    .object({ action: z.literal('draft.get'), id: conversationSchema.shape.id })
    .strict(),
  z
    .object({
      action: z.literal('draft.set'),
      id: conversationSchema.shape.id,
      text: z.string().max(65536),
    })
    .strict(),
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
      provider: connectionKindSchema.nullable().optional(),
      model: z.string().max(256).nullable().optional(),
      mode: agentModeSchema.nullable().optional(),
    })
    .strict(),
  z
    .object({ action: z.literal('delete'), id: conversationSchema.shape.id })
    .strict(),
  attachmentWriteSchema,
  attachmentReadSchema,
  attachmentMetaSchema,
  z
    .object({
      action: z.literal('conversation.import'),
      file: conversationFileBody,
    })
    .strict(),
  z
    .object({
      action: z.literal('retention.apply'),
      activeId: conversationSchema.shape.id,
    })
    .strict(),
  z.object({ action: z.literal('settings.get') }).strict(),
  z
    .object({ action: z.literal('settings.set'), settings: settingsSchema })
    .strict(),
]);
export type SavedMessage = z.infer<typeof savedMessageSchema>;
export type Conversation = z.infer<typeof conversationSchema>;
export type ConversationSummary = z.infer<typeof conversationSummarySchema>;
export type StorageOperation = z.infer<typeof storageOperationSchema>;
