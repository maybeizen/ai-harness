import { it, expect } from 'vitest';
import type { ProviderMessage } from '@harness/providers';
import {
  CHARACTERS_PER_TOKEN,
  appendSummary,
  contextTokens,
  estimateTokens,
  prepareContext,
  reportedTokens,
} from './budget';
const prefix: ProviderMessage[] = [
  { role: 'system', content: 'Stay within the budget.' },
  { role: 'user', content: 'Continue' },
];
function bulky(text: string): ProviderMessage[] {
  return [{ role: 'assistant', content: text }];
}
it('prefers provider-reported usage and otherwise estimates four characters per token', () => {
  expect(CHARACTERS_PER_TOKEN).toBe(4);
  expect(estimateTokens('abcd')).toBe(1);
  expect(estimateTokens('abcde')).toBe(2);
  expect(contextTokens('abcd', 9)).toBe(9);
  expect(contextTokens('abcd')).toBe(1);
  expect(
    reportedTokens({ totalTokens: 11, inputTokens: 1, outputTokens: 1 }),
  ).toBe(11);
  expect(reportedTokens({ inputTokens: 3, outputTokens: 4 })).toBe(7);
  expect(reportedTokens(undefined)).toBeUndefined();
});
it('stores a summary of dropped turns instead of only deleting them', () => {
  const groups = [bulky('x'.repeat(2000)), bulky('kept detail')];
  const fitted = prepareContext({
    prefix,
    groups,
    summary: '',
    maxBytes: 200000,
    maxTokens: 400,
  });
  expect(fitted.compacted).toBe(true);
  expect(fitted.groups).toHaveLength(1);
  expect(fitted.summary).toContain('xxxx');
  expect(fitted.messages.some((message) => message.role === 'user')).toBe(true);
  expect(JSON.stringify(fitted.messages)).toContain(
    'Stored summary of earlier turns',
  );
  expect(JSON.stringify(fitted.messages)).toContain('kept detail');
  expect(appendSummary('earlier', bulky('later note'), 400)).toContain('later');
});
