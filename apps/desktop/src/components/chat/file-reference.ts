import type { StoredToolUse } from '@harness/contracts';
export function fileReference(tool: StoredToolUse) {
  const source = tool.input?.trim() ?? '';
  if (!source) return '';
  try {
    const parsed: unknown = JSON.parse(source);
    if (
      parsed &&
      typeof parsed === 'object' &&
      'path' in parsed &&
      typeof parsed.path === 'string'
    )
      return parsed.path;
  } catch {
    return source.includes('/') && !source.includes('\n') ? source : '';
  }
  return '';
}
