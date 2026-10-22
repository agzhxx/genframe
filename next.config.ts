import type { NextConfig } from 'next';
import { createMDX } from 'fumadocs-mdx/next';

// GitHub Pages serves the site from https://agzhxx.github.io/genframe/, so every URL starts
// with the repo's name. lib/site.ts reads it back for the URLs Next.js doesn't prefix itself.
const basePath = '/genframe';

const config: NextConfig = {
  // Static files only: GitHub Pages has no server.
  output: 'export',
  basePath,
  // /docs/ becomes docs/index.html, which GitHub Pages finds; a docs.html next to a docs/
  // folder would 404.
  trailingSlash: true,
  reactStrictMode: true,
  env: { NEXT_PUBLIC_BASE_PATH: basePath },
};

export default createMDX()(config);
