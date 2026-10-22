// Shiki's themes for code on the docs site: the code blocks (lib/source.ts) and the props tables
// (components/mdx.tsx). github-dark-default rather than Fumadocs' github-dark, whose comments
// fail WCAG AA contrast on our code blocks (3.8:1, against 6.0:1 here). `defaultColor: false`
// keeps both themes as CSS variables, which is how Fumadocs styles them.
export const codeThemes = {
  themes: { light: 'github-light', dark: 'github-dark-default' },
  defaultColor: false,
} as const;
