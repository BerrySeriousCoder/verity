import { createHash, randomUUID } from 'node:crypto';
import { link, mkdir, open, readFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import type { BlobStore } from '@verity/core';

export function localBlobStore(directory: string): BlobStore {
  function location(sha256: string) {
    if (!/^[a-f0-9]{64}$/.test(sha256)) throw new Error('Invalid blob key.');
    return join(directory, sha256);
  }
  return {
    async put(sha256, bytes) {
      const destination = location(sha256);
      if (createHash('sha256').update(bytes).digest('hex') !== sha256)
        throw new Error('Blob checksum mismatch.');
      await mkdir(directory, { recursive: true, mode: 0o700 });
      const temporary = join(directory, `${randomUUID()}.tmp`);
      try {
        const file = await open(temporary, 'wx', 0o600);
        try {
          await file.writeFile(bytes);
          await file.sync();
        } finally {
          await file.close();
        }
        // Hard-link publication is atomic and never overwrites an existing blob.
        try {
          await link(temporary, destination);
        } catch (error) {
          if (!(
            error instanceof Error &&
            'code' in error &&
            error.code === 'EEXIST'
          ))
            throw error;
          const existing = await readFile(destination);
          if (createHash('sha256').update(existing).digest('hex') !== sha256)
            throw new Error('Existing blob is corrupt.');
        }
        const parent = await open(directory, 'r');
        try {
          await parent.sync();
        } finally {
          await parent.close();
        }
      } finally {
        await unlink(temporary).catch((error: unknown) => {
          if (!(
            error instanceof Error &&
            'code' in error &&
            error.code === 'ENOENT'
          ))
            throw error;
        });
      }
    },
    async read(sha256) {
      return readFile(location(sha256));
    },
  };
}
