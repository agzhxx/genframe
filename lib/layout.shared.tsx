import type { BaseLayoutProps } from 'fumadocs-ui/layouts/shared';
import { appName, gitConfig } from './shared';

export function baseOptions(): BaseLayoutProps {
  return {
    nav: {
      title: appName,
    },
    // In the home page's bar and at the top of the docs' sidebar.
    links: [
      { text: 'Docs', url: '/docs/', active: 'nested-url' },
      { text: 'Studio', url: '/studio/' },
    ],
    githubUrl: `https://github.com/${gitConfig.user}/${gitConfig.repo}`,
    themeSwitch: { enabled: false },
  };
}
