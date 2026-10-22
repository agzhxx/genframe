// What each page of the built site loads: the scripts and stylesheets its HTML references, in
// tags or in the inline React Server Components payload (where the chunks of the page's client
// components are listed), each gzipped with Node's default level. Chunks a page only loads later
// (the search dialog's, since M8; other pages' code when a link is prefetched) aren't counted,
// nor the polyfills that only browsers without ES modules load (until M8 they were: 38.7 KB).
// docs/PERF.md records these numbers. Run `pnpm build` first.
//
//   node scripts/page-weights.ts [--dir out] [--base /genframe]

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { gzipSync } from 'node:zlib';

export interface PageWeight {
  /** The page's path under the base path: "/", "/docs/", ... */
  page: string;
  jsGzip: number;
  jsRaw: number;
  scripts: number;
  cssGzip: number;
}

/** The site's pages in the export: index.html at the root, in the folders beside docs/ (the Studio) and below docs/. */
export function pagesIn(dir: string): string[] {
  const top = readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !['docs', '404'].includes(entry.name) && !entry.name.startsWith('_'))
    .filter((entry) => existsSync(path.join(dir, entry.name, 'index.html')))
    .map((entry) => `/${entry.name}/`);
  const docs = readdirSync(path.join(dir, 'docs'), { recursive: true, encoding: 'utf8' })
    .filter((file) => path.basename(file) === 'index.html')
    .map((file) => `/docs/${path.dirname(file)}/`.replace('/./', '/'));
  return ['/', ...top.sort(), ...docs.sort()];
}

/**
 * The static files a page's HTML references, as paths under the export folder. Scripts marked
 * `noModule` (Next.js's polyfills, for browsers without ES modules) aren't counted: the browsers
 * that run the site never download them.
 */
export function assetsOf(html: string, base: string): { js: string[]; css: string[] } {
  const escapedBase = base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`${escapedBase}/(_next/static/[^"'\\\\\\s]+?\\.(js|css))`, 'g');
  const legacy = new Set(
    [...html.matchAll(/<script\b[^>]*\bnoModule\b[^>]*>/gi)].flatMap(([tag]) => [...tag.matchAll(pattern)].map(([, file = '']) => file)),
  );
  const js = new Set<string>();
  const css = new Set<string>();
  for (const [, file = '', extension] of html.matchAll(pattern)) {
    if (legacy.has(file)) continue;
    (extension === 'js' ? js : css).add(file);
  }
  return { js: [...js].sort(), css: [...css].sort() };
}

export function weighPage(dir: string, base: string, page: string): PageWeight {
  const html = readFileSync(path.join(dir, page, 'index.html'), 'utf8');
  const { js, css } = assetsOf(html, base);
  const read = (file: string) => readFileSync(path.join(dir, file));
  const gzipped = (files: string[]) => files.reduce((sum, file) => sum + gzipSync(read(file)).byteLength, 0);
  return {
    page,
    jsGzip: gzipped(js),
    jsRaw: js.reduce((sum, file) => sum + read(file).byteLength, 0),
    scripts: js.length,
    cssGzip: gzipped(css),
  };
}

// KB of 1,024 bytes, as in docs/PERF.md since M0.
function kilobytes(bytes: number) {
  return `${(bytes / 1024).toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} KB`;
}

if (import.meta.main) {
  const { values } = parseArgs({
    options: {
      dir: { type: 'string', default: 'out' },
      base: { type: 'string', default: '/genframe' },
    },
  });
  console.log('| Page | JS gzip | JS raw | scripts | CSS gzip |');
  console.log('| --- | --- | --- | --- | --- |');
  for (const page of pagesIn(values.dir)) {
    const weight = weighPage(values.dir, values.base, page);
    console.log(
      `| \`${page}\` | ${kilobytes(weight.jsGzip)} | ${kilobytes(weight.jsRaw)} | ${String(weight.scripts)} | ${kilobytes(weight.cssGzip)} |`,
    );
  }
}
