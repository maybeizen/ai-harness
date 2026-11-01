import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import {
  conversationSchema,
  projectSchema,
  projectSummarySchema,
  MAX_MESSAGE_BYTES,
  type Project,
  type ProjectOperation,
} from '@harness/contracts';
import { ProviderFailure } from '@harness/providers';
function rejected(code: string, message: string): never {
  throw new ProviderFailure({ code, message });
}
export class ProjectRepository {
  constructor(private db: Database.Database) {}
  private directory(id: string | null) {
    if (
      id &&
      !this.db
        .prepare('SELECT id FROM workspace_directories WHERE id=?')
        .get(id)
    )
      rejected(
        'NOT_FOUND',
        'Select a registered directory before associating it.',
      );
  }
  get(id: string): Project | null {
    const row = this.db
      .prepare('SELECT data FROM projects WHERE id=?')
      .get(id) as { data: string } | undefined;
    return row ? projectSchema.parse(JSON.parse(row.data)) : null;
  }
  private write(project: Project) {
    this.directory(project.directoryId);
    this.db
      .prepare(
        'INSERT INTO projects(id,name,directory_id,pinned,archived,updated_at,data) VALUES(?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,directory_id=excluded.directory_id,pinned=excluded.pinned,archived=excluded.archived,updated_at=excluded.updated_at,data=excluded.data',
      )
      .run(
        project.id,
        project.name,
        project.directoryId,
        Number(project.pinned),
        Number(project.archived),
        project.updatedAt,
        JSON.stringify(project),
      );
  }
  dispatch(operation: ProjectOperation): unknown {
    if (operation.action === 'conversation.create') {
      return this.db.transaction(() => {
        if (
          this.db
            .prepare('SELECT id FROM conversations WHERE id=?')
            .get(operation.id)
        )
          rejected('ALREADY_EXISTS', 'This conversation already exists.');
        const conversation = {
          id: operation.id,
          title: operation.title,
          pinned: false,
          updatedAt: Date.now(),
          messages: [],
          projectId: null,
          directoryId: null,
          archived: false,
          provider: operation.provider ?? null,
          model: operation.model ?? null,
          mode: operation.mode ?? null,
        };
        this.db
          .prepare(
            'INSERT INTO conversations(id,updated_at,pinned,title,data,provider,model,mode) VALUES(?,?,?,?,?,?,?,?)',
          )
          .run(
            conversation.id,
            conversation.updatedAt,
            0,
            conversation.title,
            JSON.stringify(conversation),
            conversation.provider,
            conversation.model,
            conversation.mode,
          );
        return this.dispatch({
          action: 'conversation.associate',
          id: conversation.id,
          projectId: operation.projectId,
          directoryId: operation.directoryId,
        });
      })();
    }
    if (operation.action === 'project.list') {
      const rows = this.db
        .prepare(
          `SELECT data FROM projects ${operation.includeArchived ? '' : 'WHERE archived=0'} ORDER BY pinned DESC,updated_at DESC,id ASC`,
        )
        .all() as { data: string }[];
      const items = rows.map((row) =>
        projectSummarySchema
          .strip()
          .parse(projectSchema.parse(JSON.parse(row.data))),
      );
      if (Buffer.byteLength(JSON.stringify(items)) > MAX_MESSAGE_BYTES - 32768)
        rejected(
          'CONTEXT_LIMIT',
          'Project metadata is too large to load. Export or archive projects before continuing.',
        );
      return items;
    }
    if (operation.action === 'project.get') return this.get(operation.id);
    if (operation.action === 'project.create') {
      const project: Project = {
        ...operation.project,
        id: randomUUID(),
        updatedAt: Date.now(),
      };
      this.write(project);
      return project;
    }
    if (operation.action === 'project.update') {
      const project = { ...operation.project, updatedAt: Date.now() };
      this.db.transaction(() => {
        if (!this.get(operation.project.id))
          rejected('NOT_FOUND', 'This project no longer exists.');
        this.write(project);
        this.db
          .prepare(
            "UPDATE conversations SET directory_id=?,data=CASE WHEN json_valid(data) THEN json_set(data,'$.directoryId',?) ELSE data END WHERE project_id=?",
          )
          .run(project.directoryId, project.directoryId, project.id);
      })();
      return project;
    }
    if (operation.action === 'project.delete') {
      this.db.transaction(() => {
        // Preserve conversation bodies and directory associations when removing the collection.
        this.db
          .prepare(
            "UPDATE conversations SET project_id=NULL,data=CASE WHEN json_valid(data) THEN json_set(data,'$.projectId',NULL) ELSE data END WHERE project_id=?",
          )
          .run(operation.id);
        this.db.prepare('DELETE FROM projects WHERE id=?').run(operation.id);
      })();
      return null;
    }
    return this.db.transaction(() => {
      const row = this.db
        .prepare('SELECT data FROM conversations WHERE id=?')
        .get(operation.id) as { data: string } | undefined;
      if (!row) rejected('NOT_FOUND', 'This conversation no longer exists.');
      const conversation = conversationSchema.parse(JSON.parse(row.data));
      if (operation.action === 'conversation.archive')
        conversation.archived = operation.archived;
      else {
        const project = operation.projectId
          ? this.get(operation.projectId)
          : null;
        if (operation.projectId && !project)
          rejected('NOT_FOUND', 'This project no longer exists.');
        const directoryId =
          operation.directoryId ?? project?.directoryId ?? null;
        this.directory(directoryId);
        if (project?.directoryId && directoryId !== project.directoryId)
          rejected(
            'INVALID_REQUEST',
            'The directory must match this project directory.',
          );
        conversation.projectId = operation.projectId;
        conversation.directoryId = directoryId;
      }
      this.db
        .prepare(
          'UPDATE conversations SET project_id=?,directory_id=?,archived=?,data=? WHERE id=?',
        )
        .run(
          conversation.projectId ?? null,
          conversation.directoryId ?? null,
          Number(conversation.archived ?? false),
          JSON.stringify(conversation),
          operation.id,
        );
      return conversation;
    })();
  }
}
