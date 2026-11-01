import { z } from 'zod';
export const retentionPolicySchema = z
  .object({
    enabled: z.boolean().default(false),
    maxAgeDays: z.number().int().min(1).max(3650).nullable().default(null),
    maxConversations: z
      .number()
      .int()
      .min(1)
      .max(10_000)
      .nullable()
      .default(null),
    confirmBeforeDelete: z.literal(true).default(true),
    preserveActiveConversation: z.literal(true).default(true),
  })
  .strict();
export type RetentionPolicy = z.infer<typeof retentionPolicySchema>;
