import { it, expect } from 'vitest';
import {
  mkdtemp,
  writeFile,
  readFile,
  rm,
  symlink,
  mkdir,
} from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { mutate } from './mutations';
import { hashText, PathLocks, targetPath } from './paths';
it('writes atomically with optimistic conflicts, unambiguous edits and explicit hashes', async () => {
  const root = await mkdtemp(join(tmpdir(), 'agent-write-'));
  const locks = new PathLocks();
  const signal = new AbortController().signal;
  try {
    await mutate(
      root,
      'write_file',
      { path: 'a.txt', text: 'first', expectedHash: null },
      signal,
      locks,
    );
    expect(await readFile(join(root, 'a.txt'), 'utf8')).toBe('first');
    await writeFile(join(root, 'a.txt'), 'external');
    await expect(
      mutate(
        root,
        'write_file',
        { path: 'a.txt', text: 'wrong', expectedHash: hashText('first') },
        signal,
        locks,
      ),
    ).rejects.toThrow('changed');
    expect(await readFile(join(root, 'a.txt'), 'utf8')).toBe('external');
    await mutate(
      root,
      'edit_file',
      {
        path: 'a.txt',
        oldText: 'external',
        newText: 'approved',
        expectedHash: hashText('external'),
      },
      signal,
      locks,
    );
    expect(await readFile(join(root, 'a.txt'), 'utf8')).toBe('approved');
    await mutate(
      root,
      'delete_file',
      { path: 'a.txt', expectedHash: hashText('approved') },
      signal,
      locks,
    );
    await expect(readFile(join(root, 'a.txt'))).rejects.toThrow();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
it('denies traversal, sensitive aliases, symlink escapes, binary edits and same-file concurrency', async () => {
  const root = await mkdtemp(join(tmpdir(), 'agent-scope-'));
  const outside = await mkdtemp(join(tmpdir(), 'agent-outside-'));
  const signal = new AbortController().signal;
  const locks = new PathLocks();
  try {
    expect(() => targetPath(root, '../outside')).toThrow('relative');
    expect(() => targetPath(root, '.env')).toThrow('protected');
    await symlink(outside, join(root, 'escape'));
    await expect(
      mutate(
        root,
        'write_file',
        { path: 'escape/a.txt', text: 'no', expectedHash: null },
        signal,
        locks,
      ),
    ).rejects.toThrow('escapes');
    await mkdir(join(root, '.config'));
    await symlink(join(root, '.config'), join(root, 'alias'));
    await expect(
      mutate(
        root,
        'write_file',
        { path: 'alias/a.txt', text: 'no', expectedHash: null },
        signal,
        locks,
      ),
    ).rejects.toThrow();
    await writeFile(join(root, 'binary'), Buffer.from([0, 1, 2]));
    await expect(
      mutate(
        root,
        'delete_file',
        { path: 'binary', expectedHash: hashText('') },
        signal,
        locks,
      ),
    ).rejects.toThrow('Binary');
    let release!: () => void;
    const pending = locks.use(
      'same',
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    await expect(locks.use('same', () => Promise.resolve())).rejects.toThrow(
      'Another session',
    );
    release();
    await pending;
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  }
});
it('rejects automatic documentation creation through a source-directory alias', async () => {
  const root = await mkdtemp(join(tmpdir(), 'agent-auto-scope-'));
  const locks = new PathLocks();
  const signal = new AbortController().signal;
  try {
    await mkdir(join(root, 'src'));
    await symlink(join(root, 'src'), join(root, 'docs'));
    await expect(
      mutate(
        root,
        'write_file',
        {
          path: 'docs/new.md',
          text: 'should need approval',
          expectedHash: null,
        },
        signal,
        locks,
        true,
      ),
    ).rejects.toThrow('canonical docs/ or notes/');
    await expect(readFile(join(root, 'src', 'new.md'))).rejects.toThrow();
    await mkdir(join(root, 'notes'));
    await mutate(
      root,
      'write_file',
      { path: 'notes/new.txt', text: 'allowed', expectedHash: null },
      signal,
      locks,
      true,
    );
    expect(await readFile(join(root, 'notes', 'new.txt'), 'utf8')).toBe(
      'allowed',
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
