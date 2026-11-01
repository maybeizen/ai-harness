import { z } from 'zod';
import { agentModeSchema } from './agent';
import { connectionKindSchema } from './chat';
export const projectSchema = z
  .object({
    id: z.string().uuid(),
    name: z.string().trim().min(1).max(100),
    directoryId: z.string().uuid().nullable(),
    instructions: z.string().max(16000),
    preferredProvider: connectionKindSchema.nullable().default(null),
    preferredModel: z.string().max(256).default(''),
    defaultMode: agentModeSchema.nullable().default(null),
    pinned: z.boolean(),
    archived: z.boolean(),
    updatedAt: z.number().int().nonnegative(),
  })
  .strict();
export const projectSummarySchema = projectSchema.omit({ instructions: true });
export const projectDraftSchema = projectSchema.omit({
  id: true,
  updatedAt: true,
});
export type ProjectDraft = z.infer<typeof projectDraftSchema>;
export const projectOperationSchema = z.discriminatedUnion('action', [
  z
    .object({
      action: z.literal('conversation.create'),
      id: z.string().min(1).max(128),
      title: z.string().trim().min(1).max(200).default('New conversation'),
      projectId: z.string().uuid().nullable(),
      directoryId: z.string().uuid().nullable(),
      provider: connectionKindSchema.nullable().optional(),
      model: z.string().max(256).nullable().optional(),
      mode: agentModeSchema.nullable().optional(),
    })
    .strict(),
  z
    .object({
      action: z.literal('project.list'),
      includeArchived: z.boolean().default(false),
    })
    .strict(),
  z
    .object({ action: z.literal('project.get'), id: z.string().uuid() })
    .strict(),
  z
    .object({
      action: z.literal('project.create'),
      project: projectDraftSchema,
    })
    .strict(),
  z
    .object({
      action: z.literal('project.update'),
      project: projectSchema.omit({ updatedAt: true }),
    })
    .strict(),
  z
    .object({ action: z.literal('project.delete'), id: z.string().uuid() })
    .strict(),
  z
    .object({
      action: z.literal('conversation.associate'),
      id: z.string().min(1).max(128),
      projectId: z.string().uuid().nullable(),
      directoryId: z.string().uuid().nullable(),
    })
    .strict(),
  z
    .object({
      action: z.literal('conversation.archive'),
      id: z.string().min(1).max(128),
      archived: z.boolean(),
    })
    .strict(),
]);
export type Project = z.infer<typeof projectSchema>;
export type ProjectSummary = z.infer<typeof projectSummarySchema>;
export type ProjectOperation = z.infer<typeof projectOperationSchema>;
