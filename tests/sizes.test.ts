// @vitest-environment node
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { RegistryItem } from '@/lib/registry';
import { budgetProblem, bundleItem, measureItem, suggestBudget } from '@/scripts/sizes';

const root = process.cwd();
const widget = ['tests/fixtures/sizes/widget.tsx', 'tests/fixtures/sizes/label.ts'];

async function bundledText(files: string[], dir = root) {
  return new TextDecoder().decode((await bundleItem(files, dir)).code);
}

describe('the size check', () => {
  it("bundles an item's own files and the npm packages it brings", async () => {
    expect(await bundledText(widget)).toContain('Pressed ');
    expect((await bundleItem(widget, root)).packages).toEqual(['class-variance-authority', 'clsx']);
  });

  it("leaves out React, shadcn's parts, cn and other Genframe items", async () => {
    const text = await bundledText(widget);
    for (const external of [
      'react',
      'react/jsx-runtime',
      '@/components/ui/button',
      '@/lib/utils',
      '@/registry/hooks/use-reduced-motion',
    ]) {
      expect(text).toContain(`from"${external}"`);
    }
    // The hook's own code isn't charged to the widget.
    expect(text).not.toContain('prefers-reduced-motion');
  });

  it("rejects anything else from the app's @/ folders", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'genframe-sizes-'));
    try {
      writeFileSync(path.join(dir, 'stray.ts'), 'export { useThing } from "@/hooks/use-thing"\n');
      await expect(bundleItem(['stray.ts'], dir)).rejects.toThrow('@/hooks/use-thing');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('counts the CSS an item writes into the app', async () => {
    const tokens: RegistryItem = {
      name: 'tokens',
      type: 'registry:item',
      title: 'Tokens',
      description: 'A CSS-only item.',
      css: { ':root': { '--genframe-duration-base': '220ms' } },
      meta: { gzipBudget: 100 },
    };
    const size = await measureItem(tokens, root);
    expect(size.raw).toBe(':root{--genframe-duration-base:220ms;}'.length);
    expect(size.gzip).toBeGreaterThan(0);
    expect(size.budget).toBe(100);
  });

  it('suggests a first budget of the measurement plus 10%, rounded up to the next 100 B', () => {
    expect(suggestBudget(330)).toBe(400);
    expect(suggestBudget(455)).toBe(600);
    expect(suggestBudget(1000)).toBe(1100);
  });

  it('fails an item that is over its budget or has none', () => {
    const size = { gzip: 450, raw: 900, packages: [], budget: 400 };
    expect(budgetProblem(size)).toBe('50 B over budget');
    expect(budgetProblem({ ...size, budget: 500 })).toBeNull();
    expect(budgetProblem({ ...size, budget: null })).toContain('"gzipBudget": 500');
  });
});
