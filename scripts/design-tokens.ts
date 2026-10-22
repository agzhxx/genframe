// The design tokens for Figma, docs/design/tokens.figma.json, in the W3C design-tokens format that
// the Tokens Studio plugin imports as Figma variables, made from the code:
//
// - colors: the docs site's shadcn variables with the Generation Feed values they map to
//   (app/global.css), the ones the Kit's components read;
// - radii: the site's Tailwind radii, by role (app/global.css);
// - type: the site's typeface (app/layout.tsx) and Tailwind's sizes and weights the components use;
// - motion: the motion-tokens item (registry.json), the spring as the stiffness and damping of
//   Figma's custom spring, which moves the same way over the same time.
//
// tests/design-tokens.test.ts fails when the file and the code disagree; run this to update it.
//
//   node scripts/design-tokens.ts

import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { readRegistry } from '../lib/registry.ts';
import { settlingTime, springToken } from './spring-easing.ts';

export const tokensFile = 'docs/design/tokens.figma.json';

interface Token {
  $type: string;
  $value: string | number | number[];
  $description?: string;
  $extensions?: Record<string, unknown>;
}

interface Group {
  $description?: string;
  $extensions?: Record<string, unknown>;
  [name: string]: Token | Group | Record<string, unknown> | string | undefined;
}

interface Declaration {
  value: string;
  comment?: string;
}

/** The custom properties of the first rule that starts with `selector`, with the comment on each line. */
export function declarationsOf(css: string, selector: string): Map<string, Declaration> {
  const start = css.indexOf(`${selector} {`);
  if (start === -1) throw new Error(`No ${selector} rule`);
  const body = css.slice(start, css.indexOf('\n}', start));
  const declarations = new Map<string, Declaration>();
  for (const [, name = '', value = '', comment] of body.matchAll(/^\s*(--[\w-]+)\s*:\s*([^;]+);[ \t]*(?:\/\*\s*(.*?)\s*\*\/)?/gm)) {
    declarations.set(name, { value: value.trim(), ...(comment ? { comment } : {}) });
  }
  return declarations;
}

/** A CSS length or a `calc(a / b)` of numbers, in pixels (1rem is 16px). */
export function pixels(value: string): number {
  const quotient = /^calc\(\s*([\d.]+)\s*\/\s*([\d.]+)\s*\)$/.exec(value);
  if (quotient) return Number(quotient[1]) / Number(quotient[2]);
  const length = /^([\d.]+)(px|rem)$/.exec(value);
  if (!length) throw new Error(`Not a length: ${value}`);
  return Number(length[1]) * (length[2] === 'rem' ? 16 : 1);
}

function round(value: number, digits = 1) {
  return Math.round(value * 10 ** digits) / 10 ** digits;
}

function px(value: number) {
  return `${String(round(value, 2))}px`;
}

/** How a spring moves that settles over `durationMs` with the token's damping ratio, in Figma's terms. */
export function figmaSpring(durationMs: number) {
  const { dampingRatio, settle } = springToken;
  // The token's curve runs the spring until it settles, over the transition's duration: its natural
  // frequency is the settling time, in units of 1 / that frequency, over the duration in seconds.
  const frequency = settlingTime(dampingRatio, settle) / (durationMs / 1000);
  return { mass: 1, stiffness: round(frequency ** 2), damping: round(2 * dampingRatio * frequency), dampingRatio };
}

// Roles of the radii, as the site's stylesheet maps the Feed's onto Tailwind's names.
const radiusRoles: Record<string, string> = {
  sm: 'Badges and small marks',
  md: 'Cards and media',
  lg: 'Controls: buttons, inputs, selects',
  xl: 'Panels: the playground, the prompt box, a card in the queue',
};

// What each duration is for.
const durationRoles: Record<string, string> = {
  fast: 'Feedback: hover, press, small changes',
  base: 'Things that move, open or appear',
  reveal: 'A result coming into view (DenoiseReveal)',
};

const fontSizes = ['xs', 'sm', 'base', 'lg', 'xl'];
const fontWeights = ['normal', 'medium', 'semibold'];

export function designTokens(root = process.cwd()): Group {
  const read = (file: string) => readFileSync(path.join(root, file), 'utf8');
  const siteCss = read('app/global.css');
  const tailwind = read('node_modules/tailwindcss/theme.css');

  const color: Group = {
    $description:
      'shadcn’s color variables, which the Kit’s components use, with the Feed’s values (app/global.css); a description names the Feed token',
  };
  const rootVariables = declarationsOf(siteCss, ':root');
  for (const [name, { value, comment }] of rootVariables) {
    // The docs site's own sidebar and charts aren't the Kit's.
    if (!/^#[0-9a-f]{6}$/i.test(value) || /^--(sidebar|chart)/.test(name)) continue;
    color[name.slice(2)] = { $type: 'color', $value: value.toLowerCase(), ...(comment ? { $description: comment } : {}) };
  }

  const radius: Group = { $description: 'Corner radii by role (app/global.css)' };
  const theme = declarationsOf(siteCss, '@theme inline');
  for (const [size, role] of Object.entries(radiusRoles)) {
    const value = theme.get(`--radius-${size}`)?.value ?? '';
    const resolved = value === 'var(--radius)' ? (rootVariables.get('--radius')?.value ?? '') : value;
    radius[size] = { $type: 'dimension', $value: px(pixels(resolved)), $description: role };
  }
  radius.full = { $type: 'dimension', $value: '9999px', $description: 'Pills and round handles' };

  const tailwindTheme = declarationsOf(tailwind, '@theme default');
  const fontSize: Group = { $description: 'Tailwind’s sizes, as the components use them (text-xs to text-xl)' };
  const lineHeight: Group = { $description: 'The line height that goes with each size' };
  for (const size of fontSizes) {
    const value = pixels(tailwindTheme.get(`--text-${size}`)?.value ?? '');
    const ratio = pixels(tailwindTheme.get(`--text-${size}--line-height`)?.value ?? '');
    fontSize[size] = { $type: 'dimension', $value: px(value) };
    lineHeight[size] = { $type: 'dimension', $value: px(value * ratio) };
  }
  const fontWeight: Group = {};
  for (const weight of fontWeights) {
    fontWeight[weight] = { $type: 'fontWeight', $value: Number(tailwindTheme.get(`--font-weight-${weight}`)?.value) };
  }
  // next/font names a Google font with underscores: Instrument_Sans.
  const family = /import \{ (\w+) \} from 'next\/font\/google'/.exec(read('app/layout.tsx'))?.[1]?.replaceAll('_', ' ');

  const motionCss = readRegistry(root).items.find((item) => item.name === 'motion-tokens')?.css?.[':root'];
  const motionToken = (name: string) => {
    const value = typeof motionCss === 'object' ? motionCss[`--genframe-${name}`] : undefined;
    if (typeof value !== 'string') throw new Error(`No --genframe-${name} in registry.json`);
    return value;
  };
  const motion: Group = {
    $description: 'The motion-tokens item (registry.json): CSS variables named --genframe-…',
  };
  for (const [name, role] of Object.entries(durationRoles)) {
    motion[`duration-${name}`] = { $type: 'duration', $value: motionToken(`duration-${name}`), $description: role };
  }
  const bezier = /^cubic-bezier\(([^)]+)\)$/.exec(motionToken('ease-out'))?.[1]?.split(',').map(Number) ?? [];
  motion['ease-out'] = { $type: 'cubicBezier', $value: bezier, $description: 'Every transition but the spring' };
  const base = Number.parseFloat(motionToken('duration-base'));
  const spring = figmaSpring(base);
  motion.spring = {
    $description: `--genframe-ease-spring over duration-base: a damped spring (damping ratio ${String(spring.dampingRatio)}, 2.8% overshoot) for movement to a place the user asked for, like a slider's handle to a click. In Figma: Custom spring with this mass, stiffness and damping.`,
    mass: { $type: 'number', $value: spring.mass },
    stiffness: { $type: 'number', $value: spring.stiffness },
    damping: { $type: 'number', $value: spring.damping },
    // The same spring as CSS linear(), timed by duration-base: no design-token type holds it.
    $extensions: { 'dev.genframe.css': motionToken('ease-spring') },
  };

  return {
    $description:
      'Genframe’s design tokens, made from the code by scripts/design-tokens.ts; tests/design-tokens.test.ts keeps them equal. The code stays the source of truth.',
    color,
    radius,
    'font-family': { sans: { $type: 'fontFamily', $value: family ?? '' } },
    'font-size': fontSize,
    'line-height': lineHeight,
    'font-weight': fontWeight,
    motion,
  };
}

export function tokensJson(root = process.cwd()) {
  return `${JSON.stringify(designTokens(root), null, 2)}\n`;
}

if (import.meta.main) {
  const root = path.resolve(import.meta.dirname, '..');
  writeFileSync(path.join(root, tokensFile), tokensJson(root));
  console.log(`Wrote ${tokensFile}`);
}
