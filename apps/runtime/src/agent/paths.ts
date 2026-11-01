import { constants } from 'node:fs';
import { open, realpath, lstat } from 'node:fs/promises';
import { resolve, relative, isAbsolute, dirname, basename } from 'node:path';
import { createHash } from 'node:crypto';
import { AgentFailure } from './permissions';
import { isSensitive, inside } from '../workspaces/paths';
export const hashText = (text: string) =>
  createHash('sha256').update(text).digest('hex');
export function sensitive(path: string) {
  return (
    isSensitive(path) ||
    path
      .split(/[\\/]/)
      .some((part) =>
        /^\.(env(?:\..*)?|git|ssh|aws|azure|config|npmrc|netrc)$|^(credentials?|secrets?|id_rsa|id_ed25519)(\..*)?$|\.(pem|key|p12|pfx)$/i.test(
          part,
        ),
      )
  );
}
export function targetPath(root: string, path: string) {
  if (
    !path ||
    isAbsolute(path) ||
    path.includes('\\') ||
    path.includes('\0') ||
    path.split('/').includes('..') ||
    sensitive(path)
  )
    throw new AgentFailure(
      'PERMISSION_DENIED',
      'Use an ordinary relative workspace path; sensitive paths are protected.',
    );
  const target = resolve(root, path);
  const rel = relative(root, target);
  if (!rel || rel.startsWith('..') || isAbsolute(rel))
    throw new AgentFailure(
      'PERMISSION_DENIED',
      'The path escapes the workspace.',
    );
  return target;
}
export async function mutationTarget(root: string, path: string) {
  if (process.platform !== 'linux')
    throw new AgentFailure(
      'UNSUPPORTED_PLATFORM',
      'Verified file mutations require Linux.',
    );
  const target = targetPath(root, path);
  const parent = await realpath(dirname(target));
  const rel = relative(root, parent);
  if (
    !inside(root, parent) ||
    sensitive(relative(root, parent)) ||
    rel.startsWith('..') ||
    isAbsolute(rel)
  )
    throw new AgentFailure(
      'PERMISSION_DENIED',
      'The parent directory escapes the workspace.',
    );
  const handle = await open(
    parent,
    constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW,
  );
  try {
    const opened = await realpath(`/proc/self/fd/${handle.fd}`);
    if (opened !== parent)
      throw new AgentFailure('FILE_CONFLICT', 'The target directory changed.');
    const anchored = `/proc/self/fd/${handle.fd}/${basename(target)}`;
    try {
      if ((await lstat(anchored)).isSymbolicLink())
        throw new AgentFailure(
          'PERMISSION_DENIED',
          'Symbolic-link writes are not allowed.',
        );
    } catch (error) {
      if (!(
        error instanceof Error &&
        'code' in error &&
        error.code === 'ENOENT'
      ))
        throw error;
    }
    async function revalidate() {
      const current = await realpath(`/proc/self/fd/${handle.fd}`);
      if (
        current !== parent ||
        !inside(root, current) ||
        sensitive(relative(root, current))
      )
        throw new AgentFailure(
          'FILE_CONFLICT',
          'The target directory moved. Reopen the workspace before editing.',
        );
    }
    return {
      handle,
      anchored,
      revalidate,
      target: resolve(parent, basename(target)),
    };
  } catch (error) {
    await handle.close();
    throw error;
  }
}
export async function readForEdit(anchored: string): Promise<string | null> {
  let handle;
  try {
    handle = await open(
      anchored,
      constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
    );
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size > 262144 || stat.nlink > 1)
      throw new AgentFailure(
        'FILE_LIMIT',
        'Use a text file smaller than 256 KiB.',
      );
    const buffer = Buffer.alloc(262145);
    let length = 0;
    while (length < buffer.length) {
      const part = await handle.read(
        buffer,
        length,
        buffer.length - length,
        length,
      );
      if (!part.bytesRead) break;
      length += part.bytesRead;
    }
    if (length > 262144)
      throw new AgentFailure(
        'FILE_LIMIT',
        'The file grew beyond the 256 KiB edit limit.',
      );
    const bytes = buffer.subarray(0, length);
    if (bytes.includes(0))
      throw new AgentFailure('FILE_LIMIT', 'Binary files cannot be edited.');
    try {
      return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    } catch {
      throw new AgentFailure(
        'FILE_LIMIT',
        'Only valid UTF-8 text files can be edited.',
      );
    }
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT')
      return null;
    throw error;
  } finally {
    await handle?.close();
  }
}
export class PathLocks {
  private active = new Set<string>();
  async use<T>(path: string, operation: () => Promise<T>): Promise<T> {
    if (this.active.has(path))
      throw new AgentFailure(
        'FILE_CONFLICT',
        'Another session is modifying this file. Retry after it finishes.',
      );
    this.active.add(path);
    try {
      return await operation();
    } finally {
      this.active.delete(path);
    }
  }
}
