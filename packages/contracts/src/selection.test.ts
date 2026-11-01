import { describe, expect, it } from 'vitest';
import { projectDraftSchema } from './projects';
import {
  projectLayer,
  resolveSelection,
  selectionPrecedence,
} from './selection';
describe('provider, model, and mode precedence', () => {
  it('uses conversation, then project, then global settings', () => {
    expect(selectionPrecedence).toEqual(['conversation', 'project', 'global']);
    const resolved = resolveSelection({
      conversation: { provider: null, model: 'conversation-model', mode: null },
      project: projectLayer({
        preferredProvider: 'openai',
        preferredModel: '',
        defaultMode: 'edit',
      }),
      global: { provider: 'chatgpt', model: 'global-model', mode: 'ask' },
    });
    expect(resolved).toEqual({
      provider: 'openai',
      model: 'conversation-model',
      mode: 'edit',
      sources: { provider: 'project', model: 'conversation', mode: 'project' },
    });
    expect(
      resolveSelection({
        conversation: {},
        project: projectLayer(
          projectDraftSchema.parse({
            name: 'Draft',
            directoryId: null,
            instructions: '',
            pinned: false,
            archived: false,
          }),
        ),
        global: { provider: 'anthropic', model: '', mode: 'plan' },
      }),
    ).toMatchObject({
      provider: 'anthropic',
      model: '',
      mode: 'plan',
      sources: { provider: 'global', model: 'global', mode: 'global' },
    });
  });
});
