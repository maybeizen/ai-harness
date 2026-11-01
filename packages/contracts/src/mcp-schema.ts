import { z } from 'zod';
const keys = new Set([
  '$schema',
  'type',
  'title',
  'description',
  'default',
  'examples',
  'properties',
  'required',
  'additionalProperties',
  'items',
  'enum',
  'const',
  'minLength',
  'maxLength',
  'minimum',
  'maximum',
  'exclusiveMinimum',
  'exclusiveMaximum',
  'multipleOf',
  'minItems',
  'maxItems',
]);
const types = new Set([
  'object',
  'array',
  'string',
  'number',
  'integer',
  'boolean',
  'null',
]);
/** Reject unsupported keywords instead of silently widening server-controlled schemas. */
export function mcpInputSchema(input: unknown): z.ZodType | null {
  try {
    if (serializedBytes(input) > 16384) return null;
    let count = 0;
    const visit = (candidate: unknown, depth: number): boolean => {
      if (++count > 500 || depth > 16) return false;
      if (typeof candidate === 'boolean') return true;
      if (
        !candidate ||
        typeof candidate !== 'object' ||
        Array.isArray(candidate)
      )
        return false;
      const schema = candidate as Record<string, unknown>;
      if (Object.keys(schema).some((key) => !keys.has(key))) return false;
      if (schema['type'] !== undefined && !types.has(schema['type'] as string))
        return false;
      const type = schema['type'];
      for (const [group, allowed] of [
        [['properties', 'required', 'additionalProperties'], ['object']],
        [['items', 'minItems', 'maxItems'], ['array']],
        [['minLength', 'maxLength'], ['string']],
        [
          [
            'minimum',
            'maximum',
            'exclusiveMinimum',
            'exclusiveMaximum',
            'multipleOf',
          ],
          ['number', 'integer'],
        ],
      ] as const)
        if (
          group.some((key) => schema[key] !== undefined) &&
          !allowed.some((item) => item === type)
        )
          return false;
      if (schema['properties'] !== undefined) {
        if (
          !schema['properties'] ||
          typeof schema['properties'] !== 'object' ||
          Array.isArray(schema['properties'])
        )
          return false;
        for (const [name, value] of Object.entries(schema['properties']))
          if (
            ['__proto__', 'constructor', 'prototype'].includes(name) ||
            !visit(value, depth + 1)
          )
            return false;
      }
      if (
        schema['required'] !== undefined &&
        (!Array.isArray(schema['required']) ||
          schema['required'].length > 256 ||
          schema['required'].some(
            (name) =>
              typeof name !== 'string' ||
              !schema['properties'] ||
              !Object.hasOwn(schema['properties'], name),
          ))
      )
        return false;
      for (const key of ['minLength', 'maxLength', 'minItems', 'maxItems'])
        if (
          schema[key] !== undefined &&
          (!Number.isInteger(schema[key]) ||
            (schema[key] as number) < 0 ||
            (schema[key] as number) > 65536)
        )
          return false;
      for (const key of [
        'minimum',
        'maximum',
        'exclusiveMinimum',
        'exclusiveMaximum',
        'multipleOf',
      ])
        if (
          schema[key] !== undefined &&
          (typeof schema[key] !== 'number' ||
            !Number.isFinite(schema[key]) ||
            (key === 'multipleOf' && schema[key] <= 0))
        )
          return false;
      if (schema['items'] !== undefined && !visit(schema['items'], depth + 1))
        return false;
      if (
        schema['additionalProperties'] !== undefined &&
        !visit(schema['additionalProperties'], depth + 1)
      )
        return false;
      return true;
    };
    if (
      !input ||
      typeof input !== 'object' ||
      Array.isArray(input) ||
      !visit(input, 0)
    )
      return null;
    // JSON Schema defaults are annotations, not permission to supply missing required arguments.
    const withoutDefaults = (candidate: unknown): unknown => {
      if (
        !candidate ||
        typeof candidate !== 'object' ||
        Array.isArray(candidate)
      )
        return candidate;
      const schema = { ...candidate } as Record<string, unknown>;
      delete schema['default'];
      if (schema['properties'])
        schema['properties'] = Object.fromEntries(
          Object.entries(schema['properties'] as Record<string, unknown>).map(
            ([key, value]) => [key, withoutDefaults(value)],
          ),
        );
      if (schema['items'] !== undefined)
        schema['items'] = withoutDefaults(schema['items']);
      if (schema['additionalProperties'] !== undefined)
        schema['additionalProperties'] = withoutDefaults(
          schema['additionalProperties'],
        );
      return schema;
    };
    return z.fromJSONSchema(
      withoutDefaults(input) as Parameters<typeof z.fromJSONSchema>[0],
    );
  } catch {
    return null;
  }
}
function serializedBytes(value: unknown) {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}
