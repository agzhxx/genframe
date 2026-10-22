// The install test (spec section 5): proves every registry item installs into a fresh shadcn
// app the way a user would add it, then typechecks and builds there. Run `pnpm registry:build`
// first. For each app in fixtures/ (shadcn's default Base UI app and its Radix app):
//
//   1. copy it to a temporary folder and install its packages from its lockfile;
//   2. point the @genframe namespace at the local registry (public/r), as the docs tell users;
//   3. `shadcn add` every item in registry.json, and check that the CSS items bring (the motion
//      tokens) landed in the app's stylesheet;
//   4. import every file that arrived from the app's entry, so the build compiles it too;
//   5. `tsc -b` and `vite build` must pass, and the built CSS must still have that CSS.

import { spawn } from 'node:child_process';
import { appendFileSync, cpSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { readRegistry, type CssRules } from '../lib/registry.ts';
import { serve } from './serve.ts';

const root = path.resolve(import.meta.dirname, '..');
const fixtures = ['consumer-base', 'consumer-radix'];
const port = 4180;

const registry = readRegistry(root);
const items = registry.items.map((item) => `@genframe/${item.name}`);

// Every declaration in the items' CSS, as shadcn writes it: "--genframe-duration-fast: 120ms;".
function declarations(rules: CssRules): string[] {
  return Object.entries(rules).flatMap(([key, value]) =>
    typeof value === 'string' ? [`${key}: ${value};`] : declarations(value),
  );
}
const css = registry.items.flatMap((item) => (item.css ? declarations(item.css) : []));

// Async on purpose: the registry server runs in this process, and a synchronous child would
// block it from answering the child's own requests. No stdin, so a prompt fails instead of
// waiting forever.
function run(command: string, args: string[], cwd: string) {
  console.log(`\n$ ${command} ${args.join(' ')}`);
  return new Promise<void>((resolve, reject) => {
    spawn(command, args, { cwd, stdio: ['ignore', 'inherit', 'inherit'] })
      .on('error', reject)
      .on('exit', (code) => {
        if (code === 0) resolve();
        else reject(new Error(`${command} ${args.join(' ')} exited with ${String(code)}`));
      });
  });
}

function sourceFiles(dir: string) {
  return new Set(
    readdirSync(dir, { recursive: true, encoding: 'utf8' }).filter((file) => /\.tsx?$/.test(file)),
  );
}

const server = await serve({ dir: path.join(root, 'public'), port });

try {
  for (const fixture of fixtures) {
    const app = mkdtempSync(path.join(tmpdir(), `genframe-${fixture}-`));
    cpSync(path.join(root, 'fixtures', fixture), app, { recursive: true });
    const src = path.join(app, 'src');
    const shadcn = (...args: string[]) => run('pnpm', ['exec', 'shadcn', ...args, '--cwd', app], root);

    try {
      await run('pnpm', ['install', '--frozen-lockfile'], app);
      await shadcn('registry', 'add', `@genframe=http://127.0.0.1:${String(port)}/r/{name}.json`);

      const before = sourceFiles(src);
      await shadcn('add', '--yes', '--overwrite', ...items);
      const added = [...sourceFiles(src)].filter((file) => !before.has(file));
      if (added.length === 0) throw new Error(`${fixture}: shadcn add created no files`);

      const { tailwind } = JSON.parse(readFileSync(path.join(app, 'components.json'), 'utf8')) as {
        tailwind: { css: string };
      };
      const stylesheet = readFileSync(path.join(app, tailwind.css), 'utf8');
      const unwritten = css.filter((declaration) => !stylesheet.includes(declaration));
      if (unwritten.length > 0) throw new Error(`${fixture}: ${tailwind.css} lacks ${unwritten.join(' ')}`);

      const imports = added.map((file) => `import "./${file.replace(/\.tsx?$/, '')}"\n`);
      writeFileSync(path.join(src, 'installed.ts'), imports.join(''));
      appendFileSync(path.join(src, 'main.tsx'), 'import "./installed"\n');

      await run('pnpm', ['exec', 'tsc', '-b'], app);
      await run('pnpm', ['exec', 'vite', 'build'], app);

      const assets = path.join(app, 'dist', 'assets');
      const built = readdirSync(assets)
        .filter((file) => file.endsWith('.css'))
        .map((file) => readFileSync(path.join(assets, file), 'utf8'))
        .join('');
      const properties = css.map((declaration) => declaration.slice(0, declaration.indexOf(':') + 1));
      const lost = properties.filter((property) => !built.includes(property));
      if (lost.length > 0) throw new Error(`${fixture}: the built CSS lost ${lost.join(' ')}`);

      console.log(
        `\n✓ ${fixture}: ${String(items.length)} items installed (${added.join(', ')}; ${String(css.length)} CSS declarations), typechecked, built`,
      );
    } catch (error) {
      console.error(`\n✗ ${fixture}: the app is left at ${app} to inspect`);
      throw error;
    }

    rmSync(app, { recursive: true, force: true });
  }
} finally {
  server.close();
}
