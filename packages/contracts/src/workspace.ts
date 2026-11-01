import { z } from 'zod';
export const directorySchema = z
  .object({
    id: z.string().uuid(),
    name: z.string(),
    path: z.string(),
    available: z.boolean(),
  })
  .strict();
export const fileEntrySchema = z
  .object({
    name: z.string(),
    path: z.string(),
    kind: z.enum(['file', 'directory', 'symlink']),
    size: z.number().nonnegative(),
  })
  .strict();
export const workspaceOperationSchema = z.discriminatedUnion('action', [
  z
    .object({
      action: z.literal('git.stage'),
      id: z.string().uuid(),
      paths: z.array(z.string().min(1).max(4096)).min(1).max(100),
    })
    .strict(),
  z
    .object({
      action: z.literal('git.unstage'),
      id: z.string().uuid(),
      paths: z.array(z.string().min(1).max(4096)).min(1).max(100),
    })
    .strict(),
  z
    .object({
      action: z.literal('git.commit'),
      id: z.string().uuid(),
      message: z.string().trim().min(1).max(4000),
    })
    .strict(),
  z
    .object({
      action: z.literal('register'),
      path: z.string().min(1).max(4096),
    })
    .strict(),
  z.object({ action: z.literal('list') }).strict(),
  z
    .object({
      action: z.literal('files'),
      id: z.string().uuid(),
      path: z.string().max(4096).default(''),
    })
    .strict(),
  z
    .object({
      action: z.literal('read'),
      id: z.string().uuid(),
      path: z.string().min(1).max(4096),
    })
    .strict(),
  z
    .object({
      action: z.literal('search'),
      id: z.string().uuid(),
      query: z.string().min(1).max(256),
    })
    .strict(),
  z.object({ action: z.literal('git.status'), id: z.string().uuid() }).strict(),
  z
    .object({
      action: z.literal('git.diff'),
      id: z.string().uuid(),
      staged: z.boolean().default(false),
    })
    .strict(),
  z
    .object({
      action: z.literal('git.sides'),
      id: z.string().uuid(),
      path: z.string().min(1).max(4096),
      staged: z.boolean().default(false),
    })
    .strict(),
]);
export type Directory = z.infer<typeof directorySchema>;
export type FileEntry = z.infer<typeof fileEntrySchema>;
export type WorkspaceOperation = z.infer<typeof workspaceOperationSchema>;

export const directoryListSchema = z.array(directorySchema);
export const workspaceFilesSchema = z
  .object({
    entries: z.array(fileEntrySchema).max(500),
    truncated: z.boolean(),
  })
  .strict();
export const workspaceReadSchema = z
  .object({ path: z.string(), text: z.string() })
  .strict();
export const workspaceSearchSchema = z
  .object({
    matches: z
      .array(
        z
          .object({
            path: z.string(),
            line: z.number().int().nonnegative(),
            preview: z.string(),
          })
          .strict(),
      )
      .max(100),
    truncated: z.boolean(),
  })
  .strict();
export const workspaceGitStatusSchema = z
  .object({
    root: z.string(),
    branch: z.string(),
    entries: z.array(
      z
        .object({
          path: z.string(),
          index: z.string().length(1),
          worktree: z.string().length(1),
        })
        .strict(),
    ),
  })
  .strict();
export const workspaceGitDiffSchema = z
  .object({ text: z.string(), staged: z.boolean() })
  .strict();
export const workspaceGitSidesSchema = z
  .object({
    path: z.string(),
    original: z.string(),
    modified: z.string(),
    staged: z.boolean(),
  })
  .strict();

export const workspaceGitCommitSchema = z
  .object({
    hash: z.string().regex(/^[a-f0-9]{40,64}$/),
    summary: z.string(),
    hooksRun: z.literal(false),
    signed: z.literal(false),
  })
  .strict();
