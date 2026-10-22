import { createGenerator, type GenerateOptions } from 'fumadocs-typescript';
import { AutoTypeTable, type AutoTypeTableProps } from 'fumadocs-typescript/ui';
import defaultMdxComponents from 'fumadocs-ui/mdx';
import type { MDXComponents } from 'mdx/types';
import { Demo } from '@/components/docs/demo';
import { KeyboardTable } from '@/components/docs/keyboard-table';
import { codeThemes } from '@/lib/code-themes';

// Props tables read the types and doc comments from the source at build time (TypeScript runs
// during `next build`); only the finished table reaches the page.
const generator = createGenerator();

const typeTableOptions = {
  transform(entry) {
    // Fumadocs shortens every union to "union"; a short one reads better written out.
    const written = entry.type.replace(/ \| undefined$/, '');
    if (entry.simplifiedType === 'union' && written.length <= 40) entry.simplifiedType = written;
  },
} satisfies GenerateOptions;

export function getMDXComponents(components?: MDXComponents) {
  return {
    ...defaultMdxComponents,
    AutoTypeTable: (props: Omit<AutoTypeTableProps, 'generator' | 'options' | 'shiki'>) => (
      <AutoTypeTable {...props} generator={generator} options={typeTableOptions} shiki={codeThemes} />
    ),
    Demo,
    KeyboardTable,
    ...components,
  } satisfies MDXComponents;
}

export const useMDXComponents = getMDXComponents;

declare global {
  type MDXProvidedComponents = ReturnType<typeof getMDXComponents>;
}
