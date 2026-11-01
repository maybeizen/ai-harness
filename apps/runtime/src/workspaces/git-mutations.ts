import { git, withRepository } from './git';
import { isSensitive, workspaceFailure } from './paths';
import { metadata, paths, configuredFilters } from './git-policy';
import { sandbox, identity } from './git-isolation';
export async function gitStage(
  root: string,
  items: string[],
  unstage: boolean,
  signal: AbortSignal,
) {
  return withRepository(root, signal, async (cwd) => {
    await metadata(root, cwd, signal);
    await paths(root, items);
    signal.throwIfAborted();
    if (!unstage) {
      if (await configuredFilters(cwd, signal))
        workspaceFailure(
          'GIT_FILTER_UNSUPPORTED',
          'This repository configures Git filters. Stage with your existing Git client so LFS and clean/process filters remain correct.',
        );
      const attributes = (
        await git(cwd, ['check-attr', '-z', 'filter', '--', ...items], signal)
      ).split('\0');
      for (let index = 2; index < attributes.length; index += 3)
        if (
          attributes[index] &&
          !['unspecified', 'unset'].includes(attributes[index]!)
        )
          workspaceFailure(
            'GIT_FILTER_UNSUPPORTED',
            'A selected file uses a Git filter. Stage it with your existing Git client.',
          );
    }
    let args = ['add', '-A', '--', ...items];
    if (unstage) {
      let head = true;
      try {
        await git(cwd, ['rev-parse', '--verify', 'HEAD'], signal);
      } catch {
        head = false;
      }
      args = head
        ? ['restore', '--staged', '--', ...items]
        : ['rm', '--cached', '-f', '--ignore-unmatch', '--', ...items];
    }
    await sandbox(cwd, args, signal);
    return { paths: items, staged: !unstage };
  });
}
export async function gitCommit(
  root: string,
  message: string,
  signal: AbortSignal,
) {
  return withRepository(root, signal, async (cwd) => {
    await metadata(root, cwd, signal);
    const staged = (
      await git(
        cwd,
        [
          'diff',
          '--cached',
          '--name-only',
          '-z',
          '--no-ext-diff',
          '--no-textconv',
        ],
        signal,
      )
    )
      .split('\0')
      .filter(Boolean);
    if (!staged.length)
      workspaceFailure('GIT_EMPTY', 'Stage changes before committing.');
    if (staged.some(isSensitive))
      workspaceFailure(
        'PERMISSION_DENIED',
        'The index contains sensitive files. Remove them before committing.',
      );
    const author = await identity(cwd, signal);
    const summary = await sandbox(
      cwd,
      ['commit', '--no-verify', '--no-gpg-sign', '-m', message],
      signal,
      author,
    );
    const hash = (await git(cwd, ['rev-parse', 'HEAD'], signal)).trim();
    return { hash, summary, hooksRun: false as const, signed: false as const };
  });
}
