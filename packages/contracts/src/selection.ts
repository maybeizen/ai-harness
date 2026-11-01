import type { AgentMode } from './agent';
import type { ConnectionKind } from './connection';
export const selectionPrecedence = [
  'conversation',
  'project',
  'global',
] as const;
export type SelectionSource = (typeof selectionPrecedence)[number];
export interface LayerSelection {
  provider?: ConnectionKind | null;
  model?: string | null;
  mode?: AgentMode | null;
}
export interface ResolvedSelection {
  provider: ConnectionKind;
  model: string;
  mode: AgentMode;
  sources: Record<'provider' | 'model' | 'mode', SelectionSource>;
}
export function projectLayer(project: {
  preferredProvider?: ConnectionKind | null;
  preferredModel?: string | null;
  defaultMode?: AgentMode | null;
}): LayerSelection {
  return {
    provider: project.preferredProvider ?? null,
    model: project.preferredModel ?? null,
    mode: project.defaultMode ?? null,
  };
}
const chosen = (value: string | null | undefined) =>
  value != null && value.trim() !== '';
export function resolveSelection(input: {
  conversation: LayerSelection;
  project: LayerSelection;
  global: { provider: ConnectionKind; model: string; mode: AgentMode };
}): ResolvedSelection {
  const layers: Record<SelectionSource, LayerSelection> = {
    conversation: input.conversation,
    project: input.project,
    global: input.global,
  };
  const pick = (key: 'provider' | 'model' | 'mode') => {
    for (const source of selectionPrecedence) {
      const value = layers[source][key];
      if (chosen(value)) return { value: value as string, source };
    }
    return { value: input.global[key], source: 'global' as const };
  };
  const provider = pick('provider');
  const model = pick('model');
  const mode = pick('mode');
  return {
    provider: provider.value as ConnectionKind,
    model: model.value,
    mode: mode.value as AgentMode,
    sources: {
      provider: provider.source,
      model: model.source,
      mode: mode.source,
    },
  };
}
