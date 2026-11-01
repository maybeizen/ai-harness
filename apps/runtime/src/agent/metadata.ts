import { lstat, realpath } from 'node:fs/promises';
import { basename, relative, resolve } from 'node:path';
import { inside } from '../workspaces/paths';
import { AgentFailure } from './permissions';
import {
  hashText,
  mutationTarget,
  readForEdit,
  sensitive,
  targetPath,
} from './paths';
const manifests = new Set([
  'package.json',
  'Cargo.toml',
  'pyproject.toml',
  'go.mod',
]);
function packageFields(text: string) {
  const parsed = JSON.parse(text) as {
    name?: unknown;
    version?: unknown;
    private?: unknown;
    scripts?: Record<string, unknown>;
  };
  return {
    name: typeof parsed.name === 'string' ? parsed.name : '',
    version: typeof parsed.version === 'string' ? parsed.version : '',
    private: parsed.private === true,
    scripts: Object.keys(parsed.scripts ?? {}).slice(0, 40),
  };
}
function quoted(text: string, key: string) {
  return new RegExp(`^${key}\\s*=\\s*"([^"]*)"`, 'm').exec(text)?.[1] ?? '';
}
function fields(name: string, text: string) {
  if (name === 'package.json') return packageFields(text);
  if (name === 'Cargo.toml' || name === 'pyproject.toml')
    return { name: quoted(text, 'name'), version: quoted(text, 'version') };
  if (name === 'go.mod')
    return { module: /^module\s+(\S+)/m.exec(text)?.[1] ?? '' };
  return {};
}
async function readManifest(root: string, path: string) {
  const target = await mutationTarget(root, path);
  try {
    await target.revalidate();
    const text = await readForEdit(target.anchored);
    if (text === null) return null;
    const name = basename(path);
    let parsed: Record<string, unknown> = {};
    try {
      parsed = fields(name, text);
    } catch {
      throw new AgentFailure(
        'INVALID_TOOL_CALL',
        `${name} could not be read as project metadata.`,
      );
    }
    return { path, hash: hashText(text), fields: parsed };
  } finally {
    await target.handle.close();
  }
}
export async function projectMetadata(root: string, requested: string) {
  const rootReal = await realpath(root);
  const relativePath = requested.trim().replace(/^\.\//, '');
  if (relativePath) targetPath(rootReal, relativePath);
  const selected = relativePath ? resolve(rootReal, relativePath) : rootReal;
  let linked;
  try {
    linked = await lstat(selected);
  } catch {
    throw new AgentFailure('NOT_FOUND', 'The project path does not exist.');
  }
  if (linked.isSymbolicLink())
    throw new AgentFailure(
      'PERMISSION_DENIED',
      'Symbolic links are not allowed.',
    );
  const canonical = await realpath(selected);
  if (!inside(rootReal, canonical) || sensitive(relative(rootReal, canonical)))
    throw new AgentFailure(
      'PERMISSION_DENIED',
      'The path escapes the workspace.',
    );
  const file = linked.isFile();
  const names = file ? [basename(canonical)] : [...manifests];
  if (file && !manifests.has(basename(canonical)))
    throw new AgentFailure(
      'INVALID_TOOL_CALL',
      'Choose a project directory or a known manifest.',
    );
  const found = [];
  for (const name of names) {
    const path = file
      ? relativePath
      : relativePath
        ? `${relativePath}/${name}`
        : name;
    if (sensitive(path))
      throw new AgentFailure(
        'PERMISSION_DENIED',
        'Use an ordinary relative workspace path; sensitive paths are protected.',
      );
    try {
      const item = await readManifest(rootReal, path);
      if (item) found.push(item);
    } catch (error) {
      if (error instanceof AgentFailure) throw error;
    }
  }
  return { path: relativePath, manifests: found };
}
