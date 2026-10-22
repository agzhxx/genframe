// Serves a folder over HTTP the way GitHub Pages serves the site: under a base path, with
// /docs/ answered by docs/index.html and /docs redirected to /docs/, and text gzipped for
// clients that accept it, so lab measurements download what visitors do. The end-to-end tests
// run against it, and the install test serves the registry with it.
//
//   node scripts/serve.ts [--dir out] [--base /genframe] [--port 4173]

import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { createGzip } from 'node:zlib';

const contentTypes: Record<string, string> = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.mp4': 'video/mp4',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
};

function isText(type: string) {
  return /^text\/|^application\/json|^image\/svg\+xml/.test(type);
}

async function isFile(file: string) {
  return (await stat(file).catch(() => null))?.isFile() ?? false;
}

async function isDirectory(file: string) {
  return (await stat(file).catch(() => null))?.isDirectory() ?? false;
}

export function serve(options: { dir: string; base?: string; port: number }): Promise<Server> {
  const root = path.resolve(options.dir);
  const base = options.base ?? '';

  const server = createServer((request, response) => {
    void (async () => {
      const { pathname } = new URL(request.url ?? '/', 'http://localhost');
      const inside = pathname === base || pathname.startsWith(`${base}/`);
      const relative = inside ? decodeURIComponent(pathname.slice(base.length)) : null;
      let file = relative === null ? null : path.join(root, relative);

      if (file && file !== root && !file.startsWith(root + path.sep)) file = null;
      if (file && (await isDirectory(file))) {
        if (!pathname.endsWith('/')) {
          response.writeHead(301, { Location: `${pathname}/` }).end();
          return;
        }
        file = path.join(file, 'index.html');
      }

      let status = 200;
      if (!file || !(await isFile(file))) {
        status = 404;
        file = path.join(root, '404.html');
        if (!(await isFile(file))) {
          response.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found');
          return;
        }
      }

      const type = contentTypes[path.extname(file)] ?? 'application/octet-stream';
      // GitHub Pages gzips text (never brotli) and leaves images, video and fonts alone.
      const gzip = isText(type) && /\bgzip\b/.test(String(request.headers['accept-encoding']));
      response.writeHead(status, {
        'Content-Type': type,
        ...(gzip ? { 'Content-Encoding': 'gzip', Vary: 'Accept-Encoding' } : {}),
      });
      const body = createReadStream(file);
      if (gzip) body.pipe(createGzip()).pipe(response);
      else body.pipe(response);
    })();
  });

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(options.port, '127.0.0.1', () => {
      resolve(server);
    });
  });
}

if (import.meta.main) {
  const { values } = parseArgs({
    options: {
      dir: { type: 'string', default: 'out' },
      base: { type: 'string', default: '/genframe' },
      port: { type: 'string', default: '4173' },
    },
  });
  await serve({ dir: values.dir, base: values.base, port: Number(values.port) });
  console.log(`Serving ${values.dir} at http://127.0.0.1:${values.port}${values.base}/`);
}
