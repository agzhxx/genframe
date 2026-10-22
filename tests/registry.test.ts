// @vitest-environment node
// What the shadcn CLI needs of registry.json beyond its schema, which `shadcn registry validate`
// checks.
import path from 'node:path';
import { expect, it } from 'vitest';
import { readRegistry } from '@/lib/registry';

it('has no two files with the same name: the CLI matches an import to a file by its name', () => {
  // An import of @/registry/lib/generation-queue went to ui/generation-queue/generation-queue.tsx
  // once, when both existed: the CLI takes any installed file of that name, .tsx first.
  const names = readRegistry()
    .items.flatMap((item) => item.files ?? [])
    .map((file) => path.basename(file.path).replace(/\.[jt]sx?$/, ''));
  expect(names.filter((name, index) => names.indexOf(name) !== index)).toEqual([]);
});
