// registry.json, typed: the docs pages, the scripts and the tests read the items through here.
// Server and Node only (it reads the file); scripts import it by relative path.

import { readFileSync } from 'node:fs';
import path from 'node:path';

/** CSS as shadcn's registry writes it: selectors and at-rules nest, properties map to values. */
export interface CssRules {
  [selectorOrProperty: string]: string | CssRules;
}

export interface RegistryItem {
  name: string;
  type: 'registry:ui' | 'registry:hook' | 'registry:lib' | 'registry:item';
  title: string;
  description: string;
  files?: { path: string; type: string }[];
  css?: CssRules;
  /** shadcn's parts by name ("button"), and other Genframe items as "@genframe/<name>". */
  registryDependencies?: string[];
  meta?: {
    /** The item's size budget in bytes, gzipped (scripts/sizes.ts). */
    gzipBudget?: number;
  };
}

export interface Registry {
  name: string;
  homepage: string;
  items: RegistryItem[];
}

export function readRegistry(root = process.cwd()): Registry {
  return JSON.parse(readFileSync(path.join(root, 'registry.json'), 'utf8')) as Registry;
}

/** An item's name and the names of every Genframe item it brings, theirs too, each once. */
export function withGenframeDependencies(items: readonly RegistryItem[], name: string): string[] {
  const names: string[] = [];
  const visit = (current: string) => {
    if (names.includes(current)) return;
    names.push(current);
    const item = items.find((candidate) => candidate.name === current);
    for (const dependency of item?.registryDependencies ?? []) {
      if (dependency.startsWith('@genframe/')) visit(dependency.slice('@genframe/'.length));
    }
  };
  visit(name);
  return names;
}
