import { it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import {
  historyPageRequestSchema,
  projectOperationSchema,
  type HistoryPage,
  type Project,
  type GenerationInput,
} from '@harness/contracts';
import { openDatabase } from './database';
import { Repository } from './repository';
const configuration = {
  name: 'A project',
  directoryId: null,
  instructions: 'Use the project tests.',
  preferredProvider: 'openai',
  preferredModel: 'fixture',
  defaultMode: 'agent',
  pinned: false,
  archived: false,
} as const;
const generation: GenerationInput = {
  generationId: 'response',
  conversationId: 'general',
  connectionId: 'openai',
  modelId: 'fixture',
  messages: [{ id: 'user', role: 'user', text: 'Hello' }],
};
it('organizes general, directory, project and archived chats without losing conversations when projects are deleted', () => {
  const db = openDatabase(':memory:');
  try {
    const first = randomUUID();
    const second = randomUUID();
    db.prepare(
      'INSERT INTO workspace_directories(id,name,path) VALUES(?,?,?)',
    ).run(first, 'One', '/one');
    db.prepare(
      'INSERT INTO workspace_directories(id,name,path) VALUES(?,?,?)',
    ).run(second, 'Two', '/two');
    const repository = new Repository(db);
    const dispatch = (value: unknown) =>
      repository.dispatch(projectOperationSchema.parse(value));
    const project = dispatch({
      action: 'project.create',
      project: { ...configuration, directoryId: first },
    }) as Project;
    for (const id of ['general', 'directory', 'project'])
      repository.begin({ ...generation, conversationId: id });
    dispatch({
      action: 'conversation.associate',
      id: 'directory',
      projectId: null,
      directoryId: first,
    });
    dispatch({
      action: 'conversation.associate',
      id: 'project',
      projectId: project.id,
      directoryId: null,
    });
    const ids = (filter: unknown) =>
      (
        repository.dispatch(
          historyPageRequestSchema.parse({ action: 'history.page', filter }),
        ) as HistoryPage
      ).items.map((item) => item.id);
    expect(ids({ kind: 'general' })).toEqual(['general']);
    expect(ids({ kind: 'directory', id: first })).toEqual(['directory']);
    expect(ids({ kind: 'project', id: project.id })).toEqual(['project']);
    dispatch({ action: 'conversation.archive', id: 'general', archived: true });
    expect(ids({ kind: 'archived' })).toEqual(['general']);
    expect(ids({ kind: 'general' })).toEqual([]);
    const { updatedAt: _updatedAt, ...editable } = project;
    void _updatedAt;
    dispatch({
      action: 'project.update',
      project: {
        ...editable,
        name: 'Moved',
        directoryId: second,
        pinned: true,
      },
    });
    expect(repository.get('project')?.directoryId).toBe(second);
    dispatch({ action: 'project.delete', id: project.id });
    expect(repository.get('project')).toMatchObject({
      projectId: null,
      directoryId: second,
    });
    expect(ids({ kind: 'directory', id: second })).toEqual(['project']);
    expect(repository.get('project')?.messages).toHaveLength(2);
    expect(
      db.prepare('SELECT id FROM workspace_directories').all(),
    ).toHaveLength(2);
  } finally {
    db.close();
  }
});
it('rejects unknown roots and missing projects transactionally and omits instructions from project summaries', () => {
  const db = openDatabase(':memory:');
  try {
    const repository = new Repository(db);
    const dispatch = (value: unknown) =>
      repository.dispatch(projectOperationSchema.parse(value));
    expect(() =>
      dispatch({
        action: 'project.create',
        project: { ...configuration, directoryId: randomUUID() },
      }),
    ).toThrow('registered directory');
    expect(dispatch({ action: 'project.list' })).toEqual([]);
    const created = dispatch({
      action: 'project.create',
      project: configuration,
    }) as Project;
    const summaries = dispatch({ action: 'project.list' }) as unknown[];
    expect(summaries).toHaveLength(1);
    expect(summaries[0]).not.toHaveProperty('instructions');
    repository.begin(generation);
    expect(() =>
      dispatch({
        action: 'conversation.associate',
        id: 'general',
        projectId: randomUUID(),
        directoryId: null,
      }),
    ).toThrow('no longer exists');
    expect(repository.get('general')?.projectId).toBeUndefined();
    const { updatedAt: _updatedAt, ...editable } = created;
    void _updatedAt;
    dispatch({
      action: 'project.update',
      project: { ...editable, archived: true },
    });
    expect(dispatch({ action: 'project.list' })).toEqual([]);
    expect(
      dispatch({ action: 'project.list', includeArchived: true }),
    ).toHaveLength(1);
  } finally {
    db.close();
  }
});
it('creates an empty associated conversation atomically and rejects conflicting identities', () => {
  const db = openDatabase(':memory:');
  try {
    const repository = new Repository(db);
    const dispatch = (value: unknown) =>
      repository.dispatch(projectOperationSchema.parse(value));
    expect(() =>
      dispatch({
        action: 'conversation.create',
        id: 'missing',
        projectId: randomUUID(),
        directoryId: null,
      }),
    ).toThrow('no longer exists');
    expect(repository.get('missing')).toBeNull();
    const project = dispatch({
      action: 'project.create',
      project: configuration,
    }) as Project;
    dispatch({
      action: 'conversation.create',
      id: 'created',
      projectId: project.id,
      directoryId: null,
    });
    expect(repository.get('created')).toMatchObject({
      projectId: project.id,
      messages: [],
    });
    expect(() =>
      dispatch({
        action: 'conversation.create',
        id: 'created',
        projectId: null,
        directoryId: null,
      }),
    ).toThrow('already exists');
    repository.begin({ ...generation, conversationId: 'created' });
    expect(repository.get('created')).toMatchObject({
      projectId: project.id,
      title: 'Hello',
    });
    dispatch({
      action: 'conversation.create',
      id: 'preferred',
      projectId: null,
      directoryId: null,
      provider: 'openai',
      model: 'fixture',
      mode: 'edit',
    });
    expect(repository.get('preferred')).toMatchObject({
      provider: 'openai',
      model: 'fixture',
      mode: 'edit',
      messages: [],
    });
    expect(
      db
        .prepare('SELECT provider, model, mode FROM conversations WHERE id=?')
        .get('preferred'),
    ).toEqual({ provider: 'openai', model: 'fixture', mode: 'edit' });
    const draft = dispatch({
      action: 'project.create',
      project: {
        name: 'Inherited',
        directoryId: null,
        instructions: '',
        pinned: false,
        archived: false,
      },
    }) as Project;
    expect(draft).toMatchObject({
      preferredProvider: null,
      preferredModel: '',
      defaultMode: null,
    });
  } finally {
    db.close();
  }
});
