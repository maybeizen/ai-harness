import { AgentFailure } from './permissions';
import { hashText, mutationTarget, readForEdit, type PathLocks } from './paths';
import { mutate } from './mutations';
import type { PatchStore } from './patch-store';
interface Hunk {
  oldStart: number;
  oldCount: number;
  newCount: number;
  lines: Array<{ kind: ' ' | '+' | '-'; text: string }>;
}
function parsePatch(patch: string): Hunk[] {
  const rows = patch.replace(/\r\n/g, '\n').split('\n');
  const hunks: Hunk[] = [];
  let current: Hunk | undefined;
  const header = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/;
  for (const row of rows) {
    const matched = header.exec(row);
    if (matched) {
      if (current) hunks.push(current);
      current = {
        oldStart: Number(matched[1]),
        oldCount: matched[2] === undefined ? 1 : Number(matched[2]),
        newCount: matched[4] === undefined ? 1 : Number(matched[4]),
        lines: [],
      };
      continue;
    }
    if (!row || !current || row.startsWith('diff ') || row.startsWith('index '))
      continue;
    if (row.startsWith('---') || row.startsWith('+++') || row.startsWith('\\'))
      continue;
    const kind = row[0];
    if (kind !== ' ' && kind !== '+' && kind !== '-')
      throw new AgentFailure(
        'INVALID_TOOL_CALL',
        'The patch contains a line that is not a hunk.',
      );
    current.lines.push({ kind, text: row.slice(1) });
  }
  if (current) hunks.push(current);
  for (const hunk of hunks) {
    const removed = hunk.lines.filter((line) => line.kind !== '+').length;
    const added = hunk.lines.filter((line) => line.kind !== '-').length;
    if (removed !== hunk.oldCount || added !== hunk.newCount)
      throw new AgentFailure(
        'INVALID_TOOL_CALL',
        'The patch hunk counts do not match its lines.',
      );
  }
  if (!hunks.length)
    throw new AgentFailure('INVALID_TOOL_CALL', 'The patch has no hunks.');
  return hunks;
}
export function applyUnifiedPatch(source: string, patch: string) {
  const lines =
    source.length === 0 ? [] : source.replace(/\n$/, '').split('\n');
  const trailing = source.endsWith('\n') || source.length === 0;
  let cursor = 0;
  for (const hunk of parsePatch(patch)) {
    const start = hunk.oldStart === 0 ? 0 : hunk.oldStart - 1;
    if (start < cursor || start > lines.length)
      throw new AgentFailure(
        'FILE_CONFLICT',
        'The patch does not match the file.',
      );
    const next: string[] = [];
    let index = start;
    for (const line of hunk.lines) {
      if (line.kind === ' ' || line.kind === '-') {
        if (lines[index] !== line.text)
          throw new AgentFailure(
            'FILE_CONFLICT',
            'The patch does not match the file.',
          );
        if (line.kind === ' ') next.push(line.text);
        index += 1;
      } else next.push(line.text);
    }
    lines.splice(start, index - start, ...next);
    cursor = start + next.length;
  }
  if (!lines.length) return '';
  const text = lines.join('\n');
  return trailing ? `${text}\n` : text;
}
async function inspected(root: string, path: string) {
  const target = await mutationTarget(root, path);
  try {
    await target.revalidate();
    return await readForEdit(target.anchored);
  } finally {
    await target.handle.close();
  }
}
function matches(text: string | null, expected: string | null) {
  return (text === null ? null : hashText(text)) === expected;
}
export async function applyPatch(input: {
  root: string;
  workspaceId: string;
  sessionId: string;
  path: string;
  expectedHash: string | null;
  patch: string;
  signal: AbortSignal;
  locks: PathLocks;
  store: PatchStore;
}) {
  const before = await inspected(input.root, input.path);
  if (!matches(before, input.expectedHash))
    throw new AgentFailure(
      'FILE_CONFLICT',
      'The file changed since it was inspected. Read it again before editing.',
    );
  const after = applyUnifiedPatch(before ?? '', input.patch);
  if (Buffer.byteLength(after) > 262144)
    throw new AgentFailure('FILE_LIMIT', 'The edited text exceeds 256 KiB.');
  const saved = await mutate(
    input.root,
    'write_file',
    { path: input.path, text: after, expectedHash: input.expectedHash },
    input.signal,
    input.locks,
  );
  const afterHash = hashText(after);
  input.store.record({
    workspaceId: input.workspaceId,
    path: input.path,
    beforeText: before ?? '',
    afterText: after,
    beforeHash: input.expectedHash,
    afterHash,
    sessionId: input.sessionId,
  });
  return {
    path: input.path,
    beforeHash: input.expectedHash,
    hash: afterHash,
    created: before === null,
    applied: true,
    write: saved,
  };
}
export async function readPatch(
  root: string,
  workspaceId: string,
  path: string,
  store: PatchStore,
) {
  const row = store.get(workspaceId, path);
  if (!row) return null;
  let current: string | null;
  try {
    current = await inspected(root, path);
  } catch (error) {
    if (error instanceof AgentFailure && error.code === 'PERMISSION_DENIED')
      throw error;
    current = null;
  }
  return {
    path: row.path,
    before: row.beforeText,
    after: row.afterText,
    beforeHash: row.beforeHash,
    afterHash: row.afterHash,
    currentHash: current === null ? null : hashText(current),
  };
}
export async function rollbackPatch(input: {
  root: string;
  workspaceId: string;
  path: string;
  signal: AbortSignal;
  locks: PathLocks;
  store: PatchStore;
}) {
  const row = input.store.get(input.workspaceId, input.path);
  if (!row)
    throw new AgentFailure(
      'NOT_FOUND',
      'This path has no applied patch to roll back.',
    );
  const current = await inspected(input.root, input.path);
  if (!matches(current, row.afterHash))
    throw new AgentFailure(
      'FILE_CONFLICT',
      'The file changed after the patch. Rollback was not applied.',
    );
  if (row.beforeHash === null)
    await mutate(
      input.root,
      'delete_file',
      { path: input.path, expectedHash: row.afterHash },
      input.signal,
      input.locks,
    );
  else
    await mutate(
      input.root,
      'write_file',
      {
        path: input.path,
        text: row.beforeText,
        expectedHash: row.afterHash,
      },
      input.signal,
      input.locks,
    );
  input.store.remove(input.workspaceId, input.path);
  return { path: input.path, restored: true, hash: row.beforeHash };
}
