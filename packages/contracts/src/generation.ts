import { z } from 'zod';
export const supportLevels = ['supported', 'unsupported', 'unknown'] as const;
export const supportSchema = z.enum(supportLevels);
export type Support = z.infer<typeof supportSchema>;
export const modelCapabilitiesSchema = z
  .object({
    tools: supportSchema,
    images: supportSchema,
    structuredOutput: supportSchema,
    reasoningEffort: supportSchema.optional(),
    temperature: supportSchema.optional(),
    maxOutputTokens: supportSchema.optional(),
    vision: supportSchema.optional(),
  })
  .strict();
export type ModelCapabilities = z.infer<typeof modelCapabilitiesSchema>;
export const reasoningEfforts = ['minimal', 'low', 'medium', 'high'] as const;
export const generationSettingsSchema = z
  .object({
    reasoningEffort: z.enum(reasoningEfforts).optional(),
    temperature: z.number().finite().min(0).max(2).optional(),
    maxOutputTokens: z.number().int().min(1).max(200_000).optional(),
  })
  .strict();
export type GenerationSettings = z.infer<typeof generationSettingsSchema>;
export const generationControlFlagsSchema = z
  .object({
    reasoningEffort: z.boolean(),
    temperature: z.boolean(),
    maxOutputTokens: z.boolean(),
    vision: z.boolean(),
  })
  .strict();
export type GenerationControlFlags = z.infer<
  typeof generationControlFlagsSchema
>;
const visible = (value: Support | undefined) => value === 'supported';
const featureLabels = {
  tools: 'Tool calls',
  vision: 'Image input',
  reasoningEffort: 'Reasoning effort',
  temperature: 'Temperature',
  maxOutputTokens: 'Output limit',
} as const;
type ListedFeature = keyof typeof featureLabels;
function featureState(
  capabilities: Partial<ModelCapabilities> | undefined,
  feature: ListedFeature,
): Support {
  const value =
    feature === 'vision'
      ? (capabilities?.vision ?? capabilities?.images)
      : capabilities?.[feature];
  return value === 'supported' || value === 'unsupported' ? value : 'unknown';
}
export function unavailableCapabilityNotes(
  capabilities?: Partial<ModelCapabilities>,
): string[] {
  const hidden = (Object.keys(featureLabels) as ListedFeature[]).flatMap(
    (feature) => {
      const state = featureState(capabilities, feature);
      return state === 'supported' ? [] : [{ feature, state }];
    },
  );
  if (!hidden.length) return [];
  if (hidden.every((item) => item.state === 'unknown'))
    return [
      `${hidden.map((item) => featureLabels[item.feature]).join(', ')} stay off until this model confirms support.`,
    ];
  return hidden.map((item) =>
    item.state === 'unsupported'
      ? `${featureLabels[item.feature]} unavailable for this model.`
      : `${featureLabels[item.feature]} stays off until support is confirmed.`,
  );
}
export function generationControlFlags(
  capabilities: Partial<
    Pick<
      ModelCapabilities,
      | 'reasoningEffort'
      | 'temperature'
      | 'maxOutputTokens'
      | 'vision'
      | 'images'
    >
  > = {},
): GenerationControlFlags {
  return {
    reasoningEffort: visible(capabilities.reasoningEffort),
    temperature: visible(capabilities.temperature),
    maxOutputTokens: visible(capabilities.maxOutputTokens),
    vision: visible(capabilities.vision ?? capabilities.images),
  };
}
