import Link from 'next/link';
import { formatBytes, readSizeReport } from '@/lib/sizes';

/**
 * An item's size from the size check (generated/sizes.json), next to its budget. Rendered at
 * build time; it links to Getting started's note on what the number counts.
 */
export function SizeBadge({ item }: { item: string }) {
  const size = readSizeReport()[item];
  if (!size) throw new Error(`The size report has no "${item}": run \`pnpm sizes\`.`);

  return (
    <Link
      href="/docs/#sizes"
      className="inline-flex items-center gap-1.5 rounded-md border bg-secondary px-2 py-1 text-xs text-secondary-foreground hover:bg-accent"
    >
      <span className="font-medium">{formatBytes(size.gzip)} gzip</span>
      {size.budget === null ? null : (
        <span className="text-muted-foreground">· budget {formatBytes(size.budget)}</span>
      )}
    </Link>
  );
}
