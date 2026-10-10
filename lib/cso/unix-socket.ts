import * as fs from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { CsoError } from './contracts';

// macOS의 Bun은 소켓 자체의 realpath를 지원하지 않으므로 부모와 링크를 분리해 확인한다.
export function canonicalUnixSocketPath(input: string): string {
  let candidate = input;
  for (let depth = 0; depth < 40; depth++) {
    const parent = fs.realpathSync(dirname(candidate));
    const current = join(parent, basename(candidate));
    const stat = fs.lstatSync(current);
    if (!stat.isSymbolicLink()) {
      if (!stat.isSocket())
        throw new CsoError('ISOLATION_FAILED', 'Docker endpoint is not a local Unix socket');
      return current;
    }
    candidate = resolve(parent, fs.readlinkSync(current));
  }
  throw new CsoError('ISOLATION_FAILED', 'Docker socket symlink chain exceeds its bounded limit');
}
