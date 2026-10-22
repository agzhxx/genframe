// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { readRegistry } from '@/lib/registry';
import { springEasing, springToken } from '@/scripts/spring-easing';

// The custom properties declared in one rule of a stylesheet, comments removed. Enough for the
// flat rules these tests read; it doesn't understand nesting.
function declarations(css: string, selector: string) {
  const uncommented = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const body = new RegExp(`(?:^|\\n)${escaped}\\s*\\{([^}]*)\\}`).exec(uncommented)?.[1] ?? '';
  return Object.fromEntries(
    [...body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map(([, name = '', value = '']) => [name, value.trim()]),
  );
}

const root = readRegistry().items.find((item) => item.name === 'motion-tokens')?.css?.[':root'];
const tokens = Object.fromEntries(
  Object.entries(typeof root === 'object' ? root : {}).filter(
    (entry): entry is [string, string] => typeof entry[1] === 'string',
  ),
);
const docsCss = readFileSync('app/global.css', 'utf8');

describe('motion tokens', () => {
  it('are in the registry, named with the genframe prefix', () => {
    expect(Object.keys(tokens)).toEqual([
      '--genframe-duration-fast',
      '--genframe-duration-base',
      '--genframe-duration-reveal',
      '--genframe-ease-out',
      '--genframe-ease-spring',
    ]);
  });

  it('have a spring easing made by scripts/spring-easing.ts', () => {
    expect(tokens['--genframe-ease-spring']).toBe(springEasing(springToken));
  });

  it('have the same values on the docs site as in the registry', () => {
    const docsRoot = declarations(docsCss, ':root');
    for (const [name, value] of Object.entries(tokens)) expect(docsRoot[name], name).toBe(value);
  });

  it("last four times as long in the playground's slow motion", () => {
    const slow = Object.fromEntries(
      Object.entries(tokens)
        .filter(([name]) => name.startsWith('--genframe-duration-'))
        .map(([name, value]) => [name, `${String(Number(/^(\d+)ms$/.exec(value)?.[1]) * 4)}ms`]),
    );
    expect(declarations(docsCss, '[data-slow-motion]')).toEqual(slow);
  });
});
