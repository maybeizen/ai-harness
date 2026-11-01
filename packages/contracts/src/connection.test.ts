import { describe, expect, it } from 'vitest';
import {
  agentOperationSchema,
  connectionAllowsTools,
  connectionKinds,
  connectionProfiles,
  connectionSchema,
  endpointIssue,
  normalizeEndpoint,
  runtimeOperationSchema,
  settingsSchema,
  toolConnectionKinds,
  unavailableCapabilityNotes,
} from './index';
const start = {
  action: 'start' as const,
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  modelId: 'fixture',
  credential: 'fixture',
};
describe('connection kinds and endpoints', () => {
  it('keeps saved official providers and accepts the new kinds', () => {
    for (const selectedProvider of [
      'chatgpt',
      'openai',
      'claude-client',
      'anthropic',
      'google',
      'xai',
    ] as const)
      expect(settingsSchema.parse({ selectedProvider }).selectedProvider).toBe(
        selectedProvider,
      );
    expect(
      connectionKinds.filter((kind) => connectionAllowsTools(kind)),
    ).toEqual([...toolConnectionKinds]);
    for (const id of connectionKinds) {
      const profile = connectionProfiles[id];
      expect(
        connectionSchema.parse({
          id,
          label: profile.label,
          provider: profile.provider,
          method: profile.method,
          configured: false,
          status: 'disconnected',
          storage: 'none',
          account: null,
          executable: null,
        }).id,
      ).toBe(id);
    }
  });
  it('rejects credential-bearing endpoints and accepts loopback bases', () => {
    expect(endpointIssue('http://user:secret-token@127.0.0.1/v1')).toMatch(
      /credentials/,
    );
    expect(endpointIssue('http://127.0.0.1/v1?api_key=secret-token')).toMatch(
      /credentials/,
    );
    expect(endpointIssue('http://127.0.0.1/v1#secret-token')).toMatch(
      /credentials/,
    );
    expect(
      JSON.stringify(endpointIssue('http://127.0.0.1/v1?token=secret-token')),
    ).not.toContain('secret-token');
    expect(normalizeEndpoint('http://127.0.0.1:11434/v1/')).toBe(
      'http://127.0.0.1:11434/v1',
    );
    expect(normalizeEndpoint('http://[::1]:11434/v1')).toBe(
      'http://[::1]:11434/v1',
    );
    const operation = {
      version: 2 as const,
      id: 'models-1',
      method: 'models' as const,
    };
    expect(
      runtimeOperationSchema.safeParse({
        ...operation,
        params: {
          connectionId: 'openai',
          credential: 'fixture',
        },
      }).success,
    ).toBe(true);
    expect(
      runtimeOperationSchema.safeParse({
        ...operation,
        params: {
          connectionId: 'ollama',
          baseURL: 'http://127.0.0.1:11434/v1',
        },
      }).success,
    ).toBe(true);
    expect(
      runtimeOperationSchema.safeParse({
        ...operation,
        params: {
          connectionId: 'custom',
          baseURL: 'http://user:secret-token@127.0.0.1/v1',
        },
      }).success,
    ).toBe(false);
  });
  it('allows tool connections in the agent wire and hides unconfirmed controls', () => {
    expect(
      agentOperationSchema.safeParse({
        ...start,
        connectionId: 'openai',
      }).success,
    ).toBe(true);
    expect(
      agentOperationSchema.safeParse({
        ...start,
        connectionId: 'openrouter',
      }).success,
    ).toBe(true);
    expect(
      agentOperationSchema.safeParse({
        ...start,
        connectionId: 'ollama',
        credential: '',
      }).success,
    ).toBe(true);
    expect(
      agentOperationSchema.safeParse({
        ...start,
        connectionId: 'chatgpt',
      }).success,
    ).toBe(false);
    expect(unavailableCapabilityNotes()).toEqual([
      'Tool calls, Image input, Reasoning effort, Temperature, Output limit stay off until this model confirms support.',
    ]);
    expect(
      unavailableCapabilityNotes({
        tools: 'unsupported',
        temperature: 'supported',
        vision: 'unknown',
      }),
    ).toEqual([
      'Tool calls unavailable for this model.',
      'Image input stays off until support is confirmed.',
      'Reasoning effort stays off until support is confirmed.',
      'Output limit stays off until support is confirmed.',
    ]);
  });
});
