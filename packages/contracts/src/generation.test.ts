import { describe, expect, it } from 'vitest';
import invalidGeneration from '../fixtures/generation-input.invalid.json';
import legacyGeneration from '../fixtures/generation-input.legacy.json';
import secretGeneration from '../fixtures/generation-input.secret.json';
import validGeneration from '../fixtures/generation-input.json';
import {
  generationControlFlags,
  generationSchema,
  generationSettingsSchema,
  modelCapabilitiesSchema,
  modelSchema,
} from './index';
describe('generation settings and capability flags', () => {
  it('accepts current and legacy generation payloads', () => {
    expect(generationSchema.parse(validGeneration)).toEqual(validGeneration);
    expect(generationSchema.parse(legacyGeneration)).toEqual(legacyGeneration);
    expect(generationSettingsSchema.parse({})).toEqual({});
    expect(
      modelSchema.parse({
        id: 'gpt-test',
        name: 'GPT Test',
        verified: false,
        available: true,
      }),
    ).toEqual({
      id: 'gpt-test',
      name: 'GPT Test',
      verified: false,
      available: true,
    });
  });
  it('rejects unsupported settings and hides controls that are not supported', () => {
    expect(generationSchema.safeParse(invalidGeneration).success).toBe(false);
    expect(generationSchema.safeParse(secretGeneration).success).toBe(false);
    for (const candidate of [
      { temperature: -0.1 },
      { temperature: 2.1 },
      { maxOutputTokens: 0 },
      { maxOutputTokens: 1.5 },
      { reasoningEffort: 'extreme' },
      { apiKey: 'secret' },
    ])
      expect(generationSettingsSchema.safeParse(candidate).success).toBe(false);
    expect(generationSettingsSchema.parse({ temperature: 0 }).temperature).toBe(
      0,
    );
    expect(generationSettingsSchema.parse({ temperature: 2 }).temperature).toBe(
      2,
    );
    expect(
      modelCapabilitiesSchema.safeParse({
        tools: 'supported',
        images: 'unknown',
      }).success,
    ).toBe(false);
    const flags = generationControlFlags({
      reasoningEffort: 'supported',
      temperature: 'unknown',
      maxOutputTokens: 'unsupported',
      images: 'supported',
    });
    expect(flags).toEqual({
      reasoningEffort: true,
      temperature: false,
      maxOutputTokens: false,
      vision: true,
    });
    expect(generationControlFlags()).toEqual({
      reasoningEffort: false,
      temperature: false,
      maxOutputTokens: false,
      vision: false,
    });
  });
});
