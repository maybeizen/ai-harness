import { z } from 'zod';
const dimensions = {
  cols: z.number().int().min(20).max(400).default(100),
  rows: z.number().int().min(5).max(200).default(30),
};
export const terminalSummarySchema = z
  .object({
    id: z.string().uuid(),
    workspaceId: z.string().uuid(),
    label: z.string().max(256),
    pid: z.number().int().positive(),
    status: z.enum(['running', 'exited']),
    exitCode: z.number().int().nullable(),
    signal: z.number().int().nullable(),
    createdAt: z.number().int().nonnegative(),
  })
  .strict();
export const terminalPollSchema = z
  .object({
    id: z.string().uuid(),
    data: z.string(),
    cursor: z.number().int().nonnegative(),
    truncated: z.boolean(),
    status: z.enum(['running', 'exited']),
    exitCode: z.number().int().nullable(),
    signal: z.number().int().nullable(),
  })
  .strict();
export const terminalOperationSchema = z.discriminatedUnion('action', [
  z
    .object({
      action: z.literal('create'),
      workspaceId: z.string().uuid(),
      shell: z
        .string()
        .regex(/^$|^\/[A-Za-z0-9_./-]{1,255}$/)
        .default(''),
      ...dimensions,
    })
    .strict(),
  z.object({ action: z.literal('list') }).strict(),
  z
    .object({
      action: z.literal('poll'),
      id: z.string().uuid(),
      cursor: z.number().int().nonnegative().default(0),
      limit: z.number().int().min(1024).max(65536).default(32768),
    })
    .strict(),
  z
    .object({
      action: z.literal('write'),
      id: z.string().uuid(),
      data: z.string().min(1).max(16384),
    })
    .strict(),
  z
    .object({
      action: z.literal('resize'),
      id: z.string().uuid(),
      ...dimensions,
    })
    .strict(),
  z.object({ action: z.literal('kill'), id: z.string().uuid() }).strict(),
]);
export type TerminalSummary = z.infer<typeof terminalSummarySchema>;
export type TerminalPoll = z.infer<typeof terminalPollSchema>;
export type TerminalOperation = z.infer<typeof terminalOperationSchema>;
