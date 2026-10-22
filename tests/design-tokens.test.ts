// @vitest-environment node
// docs/design/tokens.figma.json is the design hand-off's copy of the code's tokens (spec M7: "a
// Figma file whose tokens match the code"). It's made by scripts/design-tokens.ts; this fails when
// the two drift apart, and checks the generator reads the code as it should.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { readRegistry } from '@/lib/registry';
import { declarationsOf, designTokens, figmaSpring, pixels, tokensFile, tokensJson } from '@/scripts/design-tokens';
import { springPosition } from '@/scripts/spring-easing';

const tokens = designTokens();
const motion = readRegistry().items.find((item) => item.name === 'motion-tokens')?.css?.[':root'];

describe('the design tokens for Figma', () => {
  it(`are what scripts/design-tokens.ts makes from the code (run it when this fails)`, () => {
    expect(readFileSync(tokensFile, 'utf8')).toBe(tokensJson());
  });

  it('have the site’s shadcn colors with the Feed’s values, but not its sidebar’s or charts’', () => {
    const colors = readFileSync('app/global.css', 'utf8');
    expect(tokens.color).toMatchObject({
      background: { $type: 'color', $value: '#0b0b0c' },
      primary: { $type: 'color', $value: '#ff7a45', $description: 'accent, "Ember"' },
      ring: { $type: 'color', $value: '#ff7a45' },
    });
    expect(colors).toContain('--primary: #ff7a45;');
    expect(Object.keys(tokens.color ?? {}).filter((name) => /sidebar|chart/.test(name))).toEqual([]);
  });

  it('have the motion tokens of registry.json', () => {
    expect(typeof motion).toBe('object');
    const css = typeof motion === 'object' ? motion : {};
    expect(tokens.motion).toMatchObject({
      'duration-fast': { $type: 'duration', $value: css['--genframe-duration-fast'] },
      'duration-base': { $type: 'duration', $value: css['--genframe-duration-base'] },
      'duration-reveal': { $type: 'duration', $value: css['--genframe-duration-reveal'] },
      'ease-out': { $type: 'cubicBezier', $value: [0.2, 0.8, 0.2, 1] },
      spring: { $extensions: { 'dev.genframe.css': css['--genframe-ease-spring'] } },
    });
  });

  it('give Figma a spring that moves as the CSS one does: settled within the duration, with the same overshoot', () => {
    const { mass, stiffness, damping } = figmaSpring(220);
    const frequency = Math.sqrt(stiffness / mass);
    expect(damping / (2 * Math.sqrt(stiffness * mass))).toBeCloseTo(0.75, 2);
    // Within 0.1% of the target from 220 ms on, as the CSS curve is at its end.
    for (const ms of [220, 260, 400]) {
      expect(Math.abs(springPosition((frequency * ms) / 1000, 0.75) - 1)).toBeLessThan(0.0011);
    }
    // Its peak: 2.8% past the target.
    const peak = Math.max(...Array.from({ length: 221 }, (_, ms) => springPosition((frequency * ms) / 1000, 0.75)));
    expect(peak).toBeCloseTo(1.028, 3);
  });

  it('read lengths, ratios and commented declarations', () => {
    expect(pixels('0.5rem')).toBe(8);
    expect(pixels('12px')).toBe(12);
    expect(pixels('calc(1.25 / 0.875)')).toBeCloseTo(1.4286, 4);
    expect(declarationsOf(':root {\n  --a: #fff;  /* one */\n  --b: 2px;\n}\n', ':root')).toEqual(
      new Map([
        ['--a', { value: '#fff', comment: 'one' }],
        ['--b', { value: '2px' }],
      ]),
    );
  });
});
