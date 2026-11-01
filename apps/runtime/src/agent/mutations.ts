import { open, rename, unlink, link, lstat } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { dirname, relative } from 'node:path';
import { AgentFailure, automaticDocumentPath } from './permissions';
import { hashText, mutationTarget, readForEdit, type PathLocks } from './paths';
export interface WriteInput {
  path: string;
  text: string;
  expectedHash: string | null;
}
export interface EditInput {
  path: string;
  oldText: string;
  newText: string;
  expectedHash: string;
}
export interface DeleteInput {
  path: string;
  expectedHash: string;
}
function check(text: string | null, expected: string | null) {
  if ((text === null ? null : hashText(text)) !== expected)
    throw new AgentFailure(
      'FILE_CONFLICT',
      'The file changed since it was inspected. Read it again before editing.',
    );
}
export async function mutate(
  root: string,
  name: string,
  input: WriteInput | EditInput | DeleteInput,
  signal: AbortSignal,
  locks: PathLocks,
  automaticDocs = false,
) {
  signal.throwIfAborted();
  const target = await mutationTarget(root, input.path);
  try {
    return await locks.use(target.target, async () => {
      await target.revalidate();
      if (
        automaticDocs &&
        !automaticDocumentPath(relative(root, target.target))
      )
        throw new AgentFailure(
          'PERMISSION_DENIED',
          'Automatic creation is limited to canonical docs/ or notes/ text files.',
        );
      const before = await readForEdit(target.anchored);
      check(before, input.expectedHash);
      if (name === 'delete_file') {
        signal.throwIfAborted();
        if (before === null)
          throw new AgentFailure('NOT_FOUND', 'The file does not exist.');
        check(await readForEdit(target.anchored), input.expectedHash);
        await target.revalidate();
        await unlink(target.anchored);
        await target.handle.sync();
        return {
          path: input.path,
          deleted: true,
          beforeHash: input.expectedHash,
        };
      }
      let text = 'text' in input ? input.text : '';
      if ('oldText' in input) {
        if (
          before === null ||
          !input.oldText ||
          before.split(input.oldText).length !== 2
        )
          throw new AgentFailure(
            'FILE_CONFLICT',
            'The requested text must occur exactly once.',
          );
        text = before.replace(input.oldText, () => input.newText);
      }
      if (Buffer.byteLength(text) > 262144)
        throw new AgentFailure(
          'FILE_LIMIT',
          'The edited text exceeds 256 KiB.',
        );
      const temporary = `${dirname(target.anchored)}/.axioden-${randomUUID()}.tmp`;
      let saved = false;
      try {
        const mode =
          before === null ? 0o600 : (await lstat(target.anchored)).mode & 0o777;
        await target.revalidate();
        const file = await open(temporary, 'wx', mode);
        try {
          await file.chmod(mode);
          await file.writeFile(text, 'utf8');
          await file.sync();
        } finally {
          await file.close();
        }
        signal.throwIfAborted();
        check(await readForEdit(target.anchored), input.expectedHash);
        await target.revalidate();
        if (before === null) {
          try {
            await link(temporary, target.anchored);
          } catch (error) {
            if (
              error instanceof Error &&
              'code' in error &&
              error.code === 'EEXIST'
            )
              throw new AgentFailure(
                'FILE_CONFLICT',
                'The destination was created by another process.',
              );
            throw error;
          }
          await unlink(temporary);
        } else await rename(temporary, target.anchored);
        saved = true;
        await target.handle.sync();
      } finally {
        if (!saved) await unlink(temporary).catch(() => undefined);
      }
      return {
        path: input.path,
        beforeHash: input.expectedHash,
        hash: hashText(text),
        created: before === null,
      };
    });
  } catch (error) {
    if (error instanceof AgentFailure) throw error;
    const code =
      error instanceof Error && 'code' in error ? String(error.code) : '';
    throw new AgentFailure(
      code === 'ENOSPC' ? 'STORAGE_ERROR' : 'FILE_UNAVAILABLE',
      code === 'ENOSPC'
        ? 'The disk is full. No edit was confirmed.'
        : 'The file operation failed. Check file permissions and reopen the workspace.',
    );
  } finally {
    await target.handle.close();
  }
}
