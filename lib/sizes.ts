// The size check's results: scripts/sizes.ts writes them, the docs' size badges read them.
// Server and Node only (it reads the file); scripts import it by relative path.

import { readFileSync } from 'node:fs';
import path from 'node:path';

export interface ItemSize {
  /** Bytes the item adds to an app, minified and gzipped: what budgets are about. */
  gzip: number;
  /** The same, before gzip. */
  raw: number;
  /** The npm packages bundled with it (React and the app's shadcn parts never are). */
  packages: string[];
  /** Its gzip budget from registry.json, or null when it has none yet. */
  budget: number | null;
}

export type SizeReport = Record<string, ItemSize>;

// Generated and gitignored, like public/r.
export const sizeReportPath = 'generated/sizes.json';

export function readSizeReport(root = process.cwd()): SizeReport {
  const file = path.join(root, sizeReportPath);
  try {
    return JSON.parse(readFileSync(file, 'utf8')) as SizeReport;
  } catch (error) {
    throw new Error(`Can't read ${sizeReportPath}: run \`pnpm sizes\` (pnpm build and pnpm dev run it).`, {
      cause: error,
    });
  }
}

export function formatBytes(bytes: number) {
  return `${bytes.toLocaleString('en-US')} B`;
}
