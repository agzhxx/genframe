// The size check (spec sections 4.3 and 5): how many bytes each registry item adds to an app,
// minified and gzipped, against the budget in its `meta` in registry.json. For each item:
//
//   1. bundle its own files into one minified ES module with esbuild, as an app's bundler
//      would. React, shadcn's parts (@/components/ui/*, @/lib/utils) and other Genframe items
//      stay out: the app has them already, or they have budgets of their own. The npm packages
//      the item brings stay in, because the app gets them for this item;
//   2. add the CSS it writes into the app's stylesheet, if any;
//   3. gzip each and add them up.
//
// It fails when an item is over its budget or has none. A new item's budget is its first
// measurement plus 10%, rounded up to the next 100 B; the failure message
// says what to set. The results go to generated/sizes.json for the docs' size badges.
//
//   node scripts/sizes.ts

import { build, type Plugin } from 'esbuild';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import { readRegistry, type CssRules, type RegistryItem } from '../lib/registry.ts';
import { formatBytes, sizeReportPath, type ItemSize, type SizeReport } from '../lib/sizes.ts';

function sourceFile(base: string) {
  return ['.ts', '.tsx'].map((extension) => base + extension).find((file) => existsSync(file));
}

// Decides what goes into an item's bundle; see the top of this file.
function boundaries(root: string, ownFiles: Set<string>): Plugin {
  return {
    name: 'genframe-boundaries',
    setup(bundler) {
      bundler.onResolve({ filter: /^react(-dom)?($|\/)/ }, ({ path: specifier }) => ({
        path: specifier,
        external: true,
      }));
      bundler.onResolve({ filter: /^@\/(components\/ui\/|lib\/utils$)/ }, ({ path: specifier }) => ({
        path: specifier,
        external: true,
      }));
      bundler.onResolve({ filter: /^@\/registry\// }, ({ path: specifier }) => {
        const file = sourceFile(path.join(root, specifier.slice('@/'.length)));
        if (!file) return { errors: [{ text: `${specifier} doesn't exist` }] };
        return ownFiles.has(file) ? { path: file } : { path: specifier, external: true };
      });
      bundler.onResolve({ filter: /^@\// }, ({ path: specifier }) => ({
        errors: [
          {
            text: `${specifier}: items import other items as @/registry/..., and from the app only shadcn's parts and @/lib/utils`,
          },
        ],
      }));
    },
  };
}

// The package a bundled file came from: the path after its last node_modules/.
function packageName(input: string) {
  const [first = '', second = ''] = input.split('node_modules/').at(-1)?.split('/') ?? [];
  return first.startsWith('@') ? `${first}/${second}` : first;
}

/** Bundles an item's files (paths relative to root) the way the size check counts them. */
export async function bundleItem(files: string[], root: string) {
  const result = await build({
    stdin: {
      contents: files.map((file) => `export * from ${JSON.stringify(`./${file}`)};`).join('\n'),
      resolveDir: root,
      sourcefile: 'item.ts',
      loader: 'ts',
    },
    absWorkingDir: root,
    bundle: true,
    format: 'esm',
    platform: 'browser',
    target: 'es2022',
    minify: true,
    jsx: 'automatic',
    // Production builds of the packages it brings, as in an app's production build.
    define: { 'process.env.NODE_ENV': '"production"' },
    plugins: [boundaries(root, new Set(files.map((file) => path.join(root, file))))],
    write: false,
    metafile: true,
    logLevel: 'silent',
  });

  const [output] = result.outputFiles;
  if (!output) throw new Error('esbuild wrote no output');
  const inputs = Object.values(result.metafile.outputs).flatMap((meta) => Object.entries(meta.inputs));
  const packages = inputs
    .filter(([input, { bytesInOutput }]) => input.includes('node_modules/') && bytesInOutput > 0)
    .map(([input]) => packageName(input));

  return { code: output.contents, packages: [...new Set(packages)].sort() };
}

/** The CSS an item writes into the app's stylesheet, minified. */
export function cssText(rules: CssRules): string {
  return Object.entries(rules)
    .map(([key, value]) => (typeof value === 'string' ? `${key}:${value};` : `${key}{${cssText(value)}}`))
    .join('');
}

export async function measureItem(item: RegistryItem, root: string): Promise<ItemSize> {
  const parts: Uint8Array[] = [];
  let packages: string[] = [];

  const files = item.files?.map((file) => file.path) ?? [];
  if (files.length > 0) {
    const bundle = await bundleItem(files, root);
    parts.push(bundle.code);
    packages = bundle.packages;
  }
  if (item.css) parts.push(new TextEncoder().encode(cssText(item.css)));

  return {
    gzip: parts.reduce((sum, part) => sum + gzipSync(part).byteLength, 0),
    raw: parts.reduce((sum, part) => sum + part.byteLength, 0),
    packages,
    budget: item.meta?.gzipBudget ?? null,
  };
}

/** A new item's budget: its first measurement plus 10%, rounded up to the next 100 B. */
export function suggestBudget(gzip: number) {
  // In whole numbers: gzip × 1.1 / 100 in floating point turns 1,100 into 1,200.
  return Math.ceil((gzip * 11) / 1000) * 100;
}

/** What's wrong with an item's size, if anything. */
export function budgetProblem(size: ItemSize) {
  if (size.budget === null) {
    return `no budget: set "meta": { "gzipBudget": ${String(suggestBudget(size.gzip))} } in registry.json`;
  }
  if (size.gzip > size.budget) return `${formatBytes(size.gzip - size.budget)} over budget`;
  return null;
}

if (import.meta.main) {
  const root = path.resolve(import.meta.dirname, '..');
  const { items } = readRegistry(root);
  const report: SizeReport = {};
  const width = Math.max(...items.map((item) => item.name.length));
  let failed = false;

  for (const item of items) {
    const size = await measureItem(item, root);
    const problem = budgetProblem(size);
    report[item.name] = size;
    failed ||= problem !== null;

    const budget = size.budget === null ? 'none' : formatBytes(size.budget);
    console.log(
      `${problem ? '✗' : '✓'} ${item.name.padEnd(width)}  ${formatBytes(size.gzip).padStart(8)} gzip, budget ${budget}` +
        (problem ? `: ${problem}` : ''),
    );
  }

  mkdirSync(path.join(root, path.dirname(sizeReportPath)), { recursive: true });
  writeFileSync(path.join(root, sizeReportPath), `${JSON.stringify(report, null, 2)}\n`);
  if (failed) process.exitCode = 1;
}
