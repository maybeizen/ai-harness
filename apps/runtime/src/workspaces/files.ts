import { opendir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import type { FileEntry } from '@harness/contracts';
import { openScoped, isSensitive, workspaceFailure } from './paths';
const MAX_FILE_BYTES = 131072;
export async function readText(root: string, path: string) {
  const handle = await openScoped(root, path);
  try {
    const metadata = await handle.stat();
    if (metadata.nlink > 1)
      workspaceFailure(
        'PERMISSION_DENIED',
        'Files with multiple hard links are excluded from model context.',
      );
    if (metadata.size > MAX_FILE_BYTES)
      workspaceFailure(
        'FILE_TOO_LARGE',
        'This file exceeds the 128 KiB context limit.',
      );
    const buffer = Buffer.alloc(MAX_FILE_BYTES + 1);
    let length = 0;
    while (length < buffer.length) {
      const result = await handle.read(
        buffer,
        length,
        buffer.length - length,
        length,
      );
      if (!result.bytesRead) break;
      length += result.bytesRead;
    }
    if (length > MAX_FILE_BYTES)
      workspaceFailure(
        'FILE_TOO_LARGE',
        'This file grew beyond the context limit.',
      );
    const bytes = buffer.subarray(0, length);
    if (bytes.includes(0))
      workspaceFailure(
        'BINARY_FILE',
        'Binary files cannot be included as text context.',
      );
    try {
      return {
        path,
        text: new TextDecoder('utf-8', { fatal: true }).decode(bytes),
      };
    } catch {
      workspaceFailure('BINARY_FILE', 'This file is not valid UTF-8 text.');
    }
  } finally {
    await handle.close();
  }
}
export async function listFiles(root: string, path: string) {
  const handle = await openScoped(root, path, true);
  try {
    const directory = await opendir(`/proc/self/fd/${handle.fd}`);
    const entries: FileEntry[] = [];
    let truncated = false;
    for await (const entry of directory) {
      const child = path ? `${path}/${entry.name}` : entry.name;
      if (isSensitive(child)) continue;
      if (entries.length >= 500) {
        truncated = true;
        break;
      }
      if (!entry.isDirectory() && !entry.isFile() && !entry.isSymbolicLink())
        continue;
      const kind = entry.isSymbolicLink()
        ? 'symlink'
        : entry.isDirectory()
          ? 'directory'
          : 'file';
      let size = 0;
      if (kind === 'file') {
        try {
          size = (await stat(join(`/proc/self/fd/${handle.fd}`, entry.name)))
            .size;
        } catch {
          continue;
        }
      }
      entries.push({ name: entry.name, path: child, kind, size });
    }
    entries.sort(
      (a, b) =>
        Number(b.kind === 'directory') - Number(a.kind === 'directory') ||
        a.name.localeCompare(b.name),
    );
    return { entries, truncated };
  } finally {
    await handle.close();
  }
}
export async function searchFiles(
  root: string,
  query: string,
  signal: AbortSignal,
) {
  const matches: Array<{ path: string; line: number; preview: string }> = [];
  const queue = [''];
  const needle = query.toLocaleLowerCase();
  const deadline = Date.now() + 5000;
  let visited = 0;
  let bytesRead = 0;
  let truncated = false;
  while (queue.length) {
    signal.throwIfAborted();
    if (visited >= 2000 || Date.now() > deadline) {
      truncated = true;
      break;
    }
    const path = queue.shift()!;
    let listing;
    try {
      listing = await listFiles(root, path);
    } catch {
      continue;
    }
    truncated ||= listing.truncated;
    for (const entry of listing.entries) {
      signal.throwIfAborted();
      if (
        ++visited > 2000 ||
        matches.length >= 100 ||
        Date.now() > deadline ||
        bytesRead >= 8388608
      ) {
        truncated = true;
        break;
      }
      if (entry.kind === 'directory') {
        if (
          ![
            'node_modules',
            'target',
            'dist',
            'build',
            '.cache',
            'vendor',
          ].includes(entry.name)
        )
          queue.push(entry.path);
      } else if (entry.kind === 'file' && entry.size <= MAX_FILE_BYTES) {
        if (entry.path.toLocaleLowerCase().includes(needle))
          matches.push({
            path: entry.path,
            line: 0,
            preview: 'Filename match',
          });
        if (matches.length >= 100) {
          truncated = true;
          break;
        }
        try {
          const { text } = await readText(root, entry.path);
          bytesRead += Buffer.byteLength(text);
          const lines = text.split('\n');
          for (let line = 0; line < lines.length; line++) {
            if (lines[line]!.toLocaleLowerCase().includes(needle)) {
              matches.push({
                path: entry.path,
                line: line + 1,
                preview: lines[line]!.slice(0, 240),
              });
              if (matches.length >= 100) {
                truncated = true;
                break;
              }
            }
          }
        } catch {
          /* Files can disappear, be binary, or change during a bounded search. */
        }
      }
    }
    if (
      matches.length >= 100 ||
      visited > 2000 ||
      Date.now() > deadline ||
      bytesRead >= 8388608
    ) {
      truncated = true;
      break;
    }
  }
  return { matches, truncated };
}
