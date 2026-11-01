import { z } from 'zod';
import { attachmentReferenceSchema } from './messages';
import { conversationSchema } from './storage';
export const conversationFileSchema = z
  .object({
    format: z.literal('axioden-conversation'),
    version: z.literal(1),
    conversation: conversationSchema,
    attachments: z.array(attachmentReferenceSchema).max(32).default([]),
  })
  .strict();
export type ConversationFile = z.infer<typeof conversationFileSchema>;
