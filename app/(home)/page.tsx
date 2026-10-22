import Link from 'next/link';
import { LazyStudio } from '@/components/studio/lazy-studio';
import { Button } from '@/components/ui/button';
import { gitConfig } from '@/lib/shared';
import { registryUrl } from '@/lib/site';

const githubUrl = `https://github.com/${gitConfig.user}/${gitConfig.repo}`;

const principles = [
  {
    title: 'Accessible',
    body: 'Every interactive part follows its WAI-ARIA pattern, works fully from the keyboard and documents its keys.',
  },
  {
    title: 'Motion explains state',
    body: 'Animation shows what changed and nothing more, and every animation has a reduced-motion version.',
  },
  {
    title: 'Small',
    body: 'Each item has a size budget that CI checks, and it brings only the packages it needs.',
  },
];

const links = [
  { label: 'Getting started', href: '/docs/', about: 'requirements, the registry, your first item' },
  { label: 'Components', href: '/docs/components/', about: 'every item, with a live playground' },
  { label: 'Studio', href: '/studio/', about: 'the components working together, on a page of its own' },
  { label: 'Changelog', href: '/docs/changelog/', about: 'what each release changed' },
];

const elsewhere = [
  { label: 'GitHub', href: githubUrl, about: 'the code, the decisions and the numbers' },
  { label: 'Generation Feed', href: 'https://generation-feed.vercel.app', about: 'where the demos’ media comes from' },
  { label: 'Storyboard Timeline', href: 'https://storyboard-timeline.vercel.app', about: 'an editor that uses the Kit' },
];

export default function HomePage() {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-12 px-4 py-12 sm:py-16">
      <header className="flex max-w-3xl flex-col gap-4">
        <p className="text-sm font-medium text-primary">In development</p>
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">Genframe</h1>
        <p className="text-lg text-muted-foreground">
          React components for AI image and video tools: a prompt box, model and aspect-ratio pickers, a generation
          queue, a before/after slider and more, each installed into your shadcn app with one command.
        </p>
        <div className="flex flex-wrap gap-3">
          <Button asChild size="lg">
            <Link href="/docs/">Get started</Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link href="/studio/">Open the Studio</Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <a href={githubUrl}>GitHub</a>
          </Button>
        </div>
      </header>

      {/* The Studio, running live: its HTML comes with the page, its code after it. */}
      <LazyStudio />

      <section aria-labelledby="install" className="flex max-w-3xl flex-col gap-3">
        <h2 id="install" className="text-xl font-semibold">
          Install
        </h2>
        <p className="text-muted-foreground">
          Add the registry to a project that has shadcn set up, then add items by name.
        </p>
        {/* Focusable, so keyboard users can scroll it on narrow screens. */}
        <pre tabIndex={0} className="overflow-x-auto rounded-lg border bg-card p-4 text-sm">
          <code>
            {`npx shadcn@latest registry add @genframe=${registryUrl}/{name}.json\n`}
            {'npx shadcn@latest add @genframe/compare-slider'}
          </code>
        </pre>
      </section>

      <section aria-labelledby="principles" className="flex flex-col gap-4">
        <h2 id="principles" className="text-xl font-semibold">
          Principles
        </h2>
        <ul className="grid gap-4 sm:grid-cols-3">
          {principles.map((principle) => (
            <li key={principle.title} className="rounded-xl border bg-card p-4">
              <h3 className="font-medium">{principle.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{principle.body}</p>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="links" className="flex flex-col gap-4">
        <h2 id="links" className="text-xl font-semibold">
          Links
        </h2>
        <div className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
          <ul className="flex flex-col gap-2 text-sm">
            {links.map((link) => (
              <li key={link.label}>
                <Link href={link.href} className="font-medium underline underline-offset-4">
                  {link.label}
                </Link>
                <span className="text-muted-foreground">: {link.about}</span>
              </li>
            ))}
          </ul>
          <ul className="flex flex-col gap-2 text-sm">
            {elsewhere.map((link) => (
              <li key={link.label}>
                <a href={link.href} className="font-medium underline underline-offset-4">
                  {link.label}
                </a>
                <span className="text-muted-foreground">: {link.about}</span>
              </li>
            ))}
          </ul>
        </div>
        <p className="text-sm text-muted-foreground">Independent project, not affiliated with Higgsfield.</p>
      </section>
    </div>
  );
}
