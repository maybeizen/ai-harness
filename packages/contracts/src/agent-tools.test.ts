import { expect, it } from 'vitest';
import { agentOperationSchema, agentToolSchemas, findingSchema } from './index';
const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
it('accepts patch, test, and metadata tools and rejects unconfirmed rollback', () => {
  expect(
    agentToolSchemas.apply_patch.safeParse({
      path: 'src/a.ts',
      expectedHash: 'a'.repeat(64),
      patch: '@@ -1 +1 @@\n-a\n+b\n',
    }).success,
  ).toBe(true);
  expect(
    agentToolSchemas.run_tests.safeParse({ command: 'npm test' }).success,
  ).toBe(true);
  expect(agentToolSchemas.project_metadata.safeParse({}).success).toBe(true);
  expect(
    findingSchema.safeParse({
      severity: 'high',
      file: 'src/a.ts',
      line: 4,
      evidence: 'The check is missing.',
    }).success,
  ).toBe(true);
  expect(
    agentOperationSchema.safeParse({
      action: 'patch.rollback',
      workspaceId: id,
      path: 'src/a.ts',
      confirmed: false,
    }).success,
  ).toBe(false);
  expect(
    agentOperationSchema.safeParse({
      action: 'resume',
      id,
      connectionId: 'custom',
      modelId: 'local',
      credential: '',
      baseURL: 'http://127.0.0.1:9/v1',
    }).success,
  ).toBe(true);
  expect(
    agentOperationSchema.safeParse({
      action: 'start',
      id,
      connectionId: 'openai',
      modelId: 'gpt',
      credential: 'secret',
      baseURL: 'https://evil.invalid/v1',
    }).success,
  ).toBe(false);
});
