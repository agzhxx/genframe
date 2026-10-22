// @vitest-environment node
// Every registry item has a docs page on the template: the fixed
// sections in order, both install commands, a changelog, and for components the generated props
// table and the keyboard map that their tests run.

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { readRegistry, type RegistryItem } from '@/lib/registry';

const sections: Record<RegistryItem['type'], string[]> = {
  'registry:ui': ['Installation', 'Usage', 'Props', 'Keyboard', 'Accessibility', 'Motion', 'Changelog'],
  'registry:hook': ['Installation', 'Usage', 'API', 'Changelog'],
  'registry:lib': ['Installation', 'Usage', 'API', 'Changelog'],
  'registry:item': ['Installation', 'Usage', 'API', 'Changelog'],
};

function folderOf(item: RegistryItem) {
  return item.type === 'registry:ui' ? 'content/docs/components' : 'content/docs/utilities';
}

interface Section {
  heading: string;
  text: string;
  code: { lang: string; value: string }[];
}

// Splits a page into its level-2 sections, keeping code blocks apart (a "## " inside a fence
// isn't a heading).
function parsePage(mdx: string) {
  const title = /^title: (.+)$/m.exec(mdx)?.[1]?.trim();
  const page: Section[] = [];
  let fence: { lang: string; lines: string[] } | null = null;

  for (const line of mdx.split('\n')) {
    const section = page.at(-1);
    if (fence) {
      if (line.startsWith('```')) {
        section?.code.push({ lang: fence.lang, value: fence.lines.join('\n') });
        fence = null;
      } else {
        fence.lines.push(line);
      }
    } else if (line.startsWith('```')) {
      fence = { lang: line.slice(3).trim(), lines: [] };
    } else if (line.startsWith('## ')) {
      page.push({ heading: line.slice(3).trim(), text: '', code: [] });
    } else if (section) {
      section.text += `${line}\n`;
    }
  }
  return { title, sections: page };
}

const { homepage, items } = readRegistry();

describe.each(items)('the docs page for $name', (item) => {
  const file = path.join(folderOf(item), `${item.name}.mdx`);
  const page = existsSync(file) ? parsePage(readFileSync(file, 'utf8')) : null;
  const section = (heading: string) => page?.sections.find((entry) => entry.heading === heading);

  it(`exists at ${file}, titled like the item`, () => {
    expect(page?.title).toBe(item.title);
  });

  it('has the fixed sections, in order', () => {
    expect(page?.sections.map((entry) => entry.heading)).toEqual(sections[item.type]);
  });

  it('gives both install commands as npm code blocks', () => {
    const commands = section('Installation')?.code.filter((block) => block.lang === 'npm').map((block) => block.value);
    expect(commands).toEqual([
      `npx shadcn@latest add @genframe/${item.name}`,
      `npx shadcn@latest add ${homepage}/r/${item.name}.json`,
    ]);
  });

  it('has a changelog entry', () => {
    expect(section('Changelog')?.text).toMatch(/^- \*\*\d+\.\d+\.\d+\*\*: /m);
  });

  if (item.type === 'registry:ui') {
    it('has a playground, a generated props table and the tested keyboard map', () => {
      const mdx = readFileSync(file, 'utf8');
      // Rendered through components/docs/demo.tsx, which loads it on this page only.
      expect(existsSync(`components/docs/demos/${item.name}.tsx`)).toBe(true);
      expect(mdx).toContain(`<Demo name="${item.name}" />`);
      expect(section('Props')?.text).toContain('<AutoTypeTable');
      expect(existsSync(`content/keyboard/${item.name}.ts`)).toBe(true);
      expect(mdx).toContain(`from '@/content/keyboard/${item.name}'`);
      expect(section('Keyboard')?.text).toContain('<KeyboardTable');
    });
  }
});

it('has no item pages without an item', () => {
  const names = new Set(items.map((item) => item.name));
  const pages = ['content/docs/components', 'content/docs/utilities'].flatMap((folder) =>
    readdirSync(folder)
      .filter((file) => file.endsWith('.mdx') && file !== 'index.mdx')
      .map((file) => file.replace(/\.mdx$/, '')),
  );
  expect(pages.filter((page) => !names.has(page))).toEqual([]);
});
