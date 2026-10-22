// @vitest-environment node
// The README's table of items gives each item's size, and its size with the Genframe items it
// brings: the size check's numbers (scripts/sizes.ts, which `pnpm sizes` writes to
// generated/sizes.json). M6 found two of them stale. This measures the items the same way, so the
// table can't drift from the code, and it needs no build step first: CI runs the unit tests before
// the size check.
import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { readRegistry, withGenframeDependencies } from '@/lib/registry';
import { formatBytes } from '@/lib/sizes';
import { measureItem } from '@/scripts/sizes';

interface Row {
  name: string;
  size: string;
  withDependencies: string;
}

// The rows of the table under "## Items": | `name` | Type | What it does | ARIA pattern | Size | With … |
function readmeRows(markdown: string): Row[] {
  const section = markdown.split(/^## Items$/m)[1]?.split(/^## /m)[0] ?? '';
  return section
    .split('\n')
    .filter((line) => line.startsWith('| `'))
    .map((line) => {
      const cells = line.split('|').slice(1, -1).map((cell) => cell.trim());
      return {
        name: cells[0]?.replaceAll('`', '') ?? '',
        size: cells.at(-2) ?? '',
        withDependencies: cells.at(-1) ?? '',
      };
    });
}

const { items } = readRegistry();
const rows = readmeRows(readFileSync('README.md', 'utf8'));
const sizes = new Map<string, number>();

beforeAll(async () => {
  for (const item of items) sizes.set(item.name, (await measureItem(item, process.cwd())).gzip);
});

describe('the README', () => {
  it('lists every registry item once', () => {
    expect(rows.map((row) => row.name).sort()).toEqual(items.map((item) => item.name).sort());
  });

  it.each(rows)('gives $name its size, and its size with the Genframe items it brings', (row) => {
    const total = withGenframeDependencies(items, row.name).reduce((sum, name) => sum + (sizes.get(name) ?? 0), 0);
    expect(row.size).toBe(formatBytes(sizes.get(row.name) ?? 0));
    expect(row.withDependencies).toBe(formatBytes(total));
  });
});

describe('withGenframeDependencies', () => {
  it('follows Genframe dependencies through other items, each once, and skips shadcn’s parts', () => {
    expect(withGenframeDependencies(items, 'generation-queue')).toEqual([
      'generation-queue',
      'generation-card',
      'generation-queue-reducer',
      'denoise-reveal',
      'use-reduced-motion',
      'motion-tokens',
      'use-thumbhash',
    ]);
    expect(withGenframeDependencies(items, 'timecode')).toEqual(['timecode']);
  });
});
