import { constants } from 'node:fs';
import { open, realpath, type FileHandle } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { ProviderFailure } from '@harness/providers';
export function workspaceFailure(code: string, message: string): never {
  throw new ProviderFailure({ code, message });
}
export function inside(root: string, target: string) {
  const path = relative(root, target);
  return (
    path === '' ||
    (!isAbsolute(path) && path !== '..' && !path.startsWith(`..${sep}`))
  );
}
export function isSensitive(path: string) {
  return path
    .split(/[\\/]/)
    .some(
      (part) =>
        /^(?:\.git|\.ssh|\.gnupg|\.aws|\.kube|\.azure|\.npmrc|\.pypirc|\.netrc|\.env(?:\..*)?|id_rsa|id_ed25519|credentials(?:\.json)?|tokens?\.json|auth\.json|connections\.json)$/i.test(
          part,
        ) ||
        /\.(?:pem|key|p12|pfx|kdbx|sqlite(?:-.*)?|db(?:-.*)?)$/i.test(part),
    );
}
export async function openScoped(
  root: string,
  path: string,
  directory = false,
): Promise<FileHandle> {
  if (process.platform !== 'linux')
    workspaceFailure(
      'UNSUPPORTED_PLATFORM',
      'Verified workspace file access currently requires Linux.',
    );
  if (
    isAbsolute(path) ||
    path.includes('\0') ||
    path.split(/[\\/]/).includes('..') ||
    isSensitive(path)
  )
    workspaceFailure(
      'PERMISSION_DENIED',
      'This path is outside the approved workspace or is sensitive.',
    );
  let handle: FileHandle | undefined;
  try {
    const target = await realpath(resolve(root, path));
    if (!inside(root, target) || isSensitive(relative(root, target)))
      workspaceFailure(
        'PERMISSION_DENIED',
        'This path resolves outside the approved workspace or is sensitive.',
      );
    handle = await open(
      target,
      constants.O_RDONLY |
        constants.O_NONBLOCK |
        constants.O_NOFOLLOW |
        (directory ? constants.O_DIRECTORY : 0),
    );
    // Validate the opened inode, not just the pre-open path, against parent/symlink races.
    const actual = await realpath(`/proc/self/fd/${handle.fd}`);
    if (!inside(root, actual) || isSensitive(relative(root, actual)))
      workspaceFailure(
        'PERMISSION_DENIED',
        'The file moved outside the approved workspace.',
      );
    const stat = await handle.stat();
    if (directory ? !stat.isDirectory() : !stat.isFile())
      workspaceFailure(
        'INVALID_FILE',
        directory
          ? 'Choose a directory.'
          : 'Only regular text files can be read.',
      );
    return handle;
  } catch (error) {
    await handle?.close();
    if (error instanceof ProviderFailure) throw error;
    workspaceFailure(
      'FILE_UNAVAILABLE',
      'This workspace path is missing or cannot be accessed.',
    );
  }
}
