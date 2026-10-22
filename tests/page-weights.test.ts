// @vitest-environment node
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { assetsOf, pagesIn } from '@/scripts/page-weights';

describe('page weights', () => {
  it("finds the scripts and stylesheets a page references, in tags and in the RSC payload", () => {
    const html = [
      '<link rel="stylesheet" href="/genframe/_next/static/chunks/site.css" data-precedence="next"/>',
      '<link rel="preload" as="script" fetchPriority="low" href="/genframe/_next/static/chunks/a.js"/>',
      '<script src="/genframe/_next/static/chunks/a.js" async=""></script>',
      // The payload is a JavaScript string inside a script, so its quotes come escaped.
      String.raw`<script>self.__next_f.push([1,"2:\"/genframe/_next/static/chunks/b-1_x.js\"\n"])</script>`,
      '<link rel="icon" href="/genframe/icon.svg"/>',
    ].join('');
    expect(assetsOf(html, '/genframe')).toEqual({
      js: ['_next/static/chunks/a.js', '_next/static/chunks/b-1_x.js'],
      css: ['_next/static/chunks/site.css'],
    });
  });

  it("leaves out the polyfills for browsers without modules, which the site's browsers never download", () => {
    const html = [
      '<script src="/genframe/_next/static/chunks/a.js" async=""></script>',
      '<script src="/genframe/_next/static/chunks/polyfills.js" noModule=""></script>',
    ].join('');
    expect(assetsOf(html, '/genframe').js).toEqual(['_next/static/chunks/a.js']);
  });

  it('ignores files outside the base path', () => {
    expect(assetsOf('<script src="/_next/static/chunks/a.js"></script>', '/genframe')).toEqual({ js: [], css: [] });
  });

  it('finds the home page, the pages beside the docs and every docs page, but not the error pages', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'genframe-pages-'));
    try {
      for (const page of ['', 'studio', 'docs', 'docs/components/compare-slider', '404', '_not-found']) {
        mkdirSync(path.join(dir, page), { recursive: true });
        writeFileSync(path.join(dir, page, 'index.html'), '');
      }
      mkdirSync(path.join(dir, 'sprites'));
      expect(pagesIn(dir)).toEqual(['/', '/studio/', '/docs/', '/docs/components/compare-slider/']);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
