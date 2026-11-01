import { it, expect } from 'vitest';
import { mcpServerConfigSchema, mcpOperationSchema } from './mcp';
import { mcpInputSchema } from './mcp-schema';
const id = '12345678-1234-4123-8123-123456789abc';
it('validates endpoints/credential references and rejects persisted bearer values', () => {
  const config = {
    id,
    name: 'Fixture',
    enabled: true,
    transport: 'http',
    url: 'https://fixture.invalid/mcp',
  };
  expect(mcpServerConfigSchema.parse(config).credentialRef).toBeNull();
  for (const url of [
    'http://fixture.invalid/mcp',
    'https://user:secret@fixture.invalid/mcp',
    'https://fixture.invalid/mcp?token=secret',
    'file:///tmp/server',
  ])
    expect(mcpServerConfigSchema.safeParse({ ...config, url }).success).toBe(
      false,
    );
  expect(
    mcpServerConfigSchema.safeParse({
      ...config,
      url: 'http://127.0.0.1:1234/mcp',
    }).success,
  ).toBe(true);
  expect(
    mcpServerConfigSchema.safeParse({ ...config, bearer: 'private' }).success,
  ).toBe(false);
  expect(
    mcpServerConfigSchema.safeParse({
      ...config,
      credentialRef: '99999999-1234-4123-8123-123456789abc',
    }).success,
  ).toBe(true);
  expect(
    mcpServerConfigSchema.safeParse({ ...config, credentialRef: 'not-a-uuid' })
      .success,
  ).toBe(false);
  expect(
    mcpOperationSchema.safeParse({
      action: 'execute',
      name: 'model-tool',
      input: {},
    }).success,
  ).toBe(false);
});
it('validates supported JSON schemas and disables unsupported features instead of widening them', () => {
  const schema = mcpInputSchema({
    type: 'object',
    properties: {
      name: { type: 'string', minLength: 2 },
      count: { type: 'integer', minimum: 1 },
    },
    required: ['name', 'count'],
    additionalProperties: false,
  });
  expect(schema?.safeParse({ name: 'ok', count: 1 }).success).toBe(true);
  expect(schema?.safeParse({ name: 'x', count: 1 }).success).toBe(false);
  expect(schema?.safeParse({ name: 'ok', count: 0 }).success).toBe(false);
  expect(
    schema?.safeParse({ name: 'ok', count: 1, unsafe: true }).success,
  ).toBe(false);
  for (const feature of [
    { $ref: 'https://malicious.invalid/schema' },
    { type: 'string', pattern: '(a+)+$' },
    { type: 'object', unevaluatedProperties: false },
    { type: 'object', properties: { name: { format: 'unvalidated' } } },
  ])
    expect(mcpInputSchema(feature)).toBeNull();
});
it('does not let schema defaults bypass required fields or ignore untyped constraints', () => {
  const required = mcpInputSchema({
    type: 'object',
    properties: { name: { type: 'string', default: 'fallback' } },
    required: ['name'],
    additionalProperties: false,
  });
  expect(required?.safeParse({}).success).toBe(false);
  expect(mcpInputSchema({ minimum: 2 })).toBeNull();
  expect(mcpInputSchema({ type: 'object', required: ['unknown'] })).toBeNull();
});
it('requires explicitly declared keys even when their value schema is unconstrained', () => {
  const schema = mcpInputSchema({
    type: 'object',
    properties: { payload: {} },
    required: ['payload'],
    additionalProperties: false,
  });
  expect(schema?.safeParse({}).success).toBe(false);
  expect(schema?.safeParse({ payload: null }).success).toBe(true);
});
