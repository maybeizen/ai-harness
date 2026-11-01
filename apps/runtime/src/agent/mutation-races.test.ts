import { beforeEach, it, expect, vi } from 'vitest';
import type * as Files from 'node:fs/promises';
import {
  mkdtemp,
  writeFile,
  readFile,
  mkdir,
  rename,
  rm,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mutate } from './mutations';
import { PathLocks, hashText, readForEdit } from './paths';
const changing = vi.hoisted(() => ({ path: null as string | null }));
vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof Files>();
  return {
    ...actual,
    open: async (...args: Parameters<typeof actual.open>) => {
      const handle = await actual.open(...args);
      if (args[0] === changing.path) {
        const before = await handle.stat();
        Object.defineProperty(handle, 'stat', {
          value: async () => {
            await actual.writeFile(changing.path!, 'x'.repeat(300000));
            return before;
          },
        });
      }
      return handle;
    },
  };
});
beforeEach(() => {
  changing.path = null;
});
it('bounds reads when a file grows after its initial stat', async () => {
  const root = await mkdtemp(join(tmpdir(), 'axioden-growing-'));
  const file = join(root, 'code.ts');
  await writeFile(file, 'small');
  try {
    changing.path = file;
    await expect(readForEdit(file)).rejects.toThrow('grew beyond');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
it('rejects an opened parent moved outside the workspace before mutation', async () => {
  const container = await mkdtemp(join(tmpdir(), 'axioden-moved-'));
  const root = join(container, 'root');
  const outside = join(container, 'moved');
  await mkdir(join(root, 'sub'), { recursive: true });
  await writeFile(join(root, 'sub', 'code.ts'), 'original');
  class MovingLocks extends PathLocks {
    override async use<T>(path: string, operation: () => Promise<T>) {
      await rename(join(root, 'sub'), outside);
      return super.use(path, operation);
    }
  }
  try {
    await expect(
      mutate(
        root,
        'write_file',
        {
          path: 'sub/code.ts',
          text: 'overwrite',
          expectedHash: hashText('original'),
        },
        new AbortController().signal,
        new MovingLocks(),
      ),
    ).rejects.toThrow('directory moved');
    expect(await readFile(join(outside, 'code.ts'), 'utf8')).toBe('original');
  } finally {
    await rm(container, { recursive: true, force: true });
  }
});
