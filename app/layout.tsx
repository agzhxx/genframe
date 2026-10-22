import type { Metadata } from 'next';
import { Instrument_Sans } from 'next/font/google';
import { Provider } from '@/components/provider';
import { appName } from '@/lib/shared';
import { siteUrl } from '@/lib/site';
import { cn } from '@/lib/utils';
import './global.css';

// The Feed's typeface, so the three projects read as one product.
const instrumentSans = Instrument_Sans({ subsets: ['latin'], variable: '--font-sans' });

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: { default: appName, template: `%s · ${appName}` },
  description:
    'Accessible React components for AI image and video tools, installed with one shadcn command.',
};

export default function Layout({ children }: LayoutProps<'/'>) {
  return (
    // Dark only, like the Feed: `dark` is set here instead of by a theme switch.
    <html lang="en" className={cn('dark font-sans', instrumentSans.variable)} suppressHydrationWarning>
      <body className="flex min-h-screen flex-col">
        <Provider>{children}</Provider>
      </body>
    </html>
  );
}
