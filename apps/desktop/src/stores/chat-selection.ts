import {
  projectLayer,
  projectSchema,
  resolveSelection,
  type ConnectionKind,
  type ResolvedSelection,
} from '@harness/contracts';
import type { Backend } from '../transport/backend';
export interface ConversationMeta {
  projectId: string | null;
  directoryId: string | null;
  provider: ConnectionKind | null;
  model: string | null;
  mode: ResolvedSelection['mode'] | null;
}
export async function resolveActiveSelection(input: {
  backend: Pick<Backend, 'storage'>;
  meta: ConversationMeta | null;
  global: {
    provider: ConnectionKind;
    model: string;
    mode: ResolvedSelection['mode'];
  };
}): Promise<ResolvedSelection> {
  const project = input.meta?.projectId
    ? projectLayer(
        projectSchema.parse(
          await input.backend.storage({
            action: 'project.get',
            id: input.meta.projectId,
          }),
        ),
      )
    : {};
  return resolveSelection({
    conversation: {
      provider: input.meta?.provider ?? null,
      model: input.meta?.model ?? null,
      mode: input.meta?.mode ?? null,
    },
    project,
    global: input.global,
  });
}
