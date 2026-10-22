import type { ReactNode } from 'react';
import { posterUrl, previewUrl, type FeedImage } from '@/lib/feed-media';
import type { GetMediaUrl } from '@/registry/ui/media-card/media-card';

// Generation Feed's media as media items, for the media card's and grid's demos: their URLs, names
// and badges, and each one's page in the Feed. No data here: each demo brings its own items.

export interface WorldItem extends FeedImage {
  kind: 'image' | 'video';
  /** A clip's length in seconds. */
  duration?: number;
  thumbhash: string;
  alt: string;
}

/** Names an item for screen readers: what it shows, what it is, and that it's AI-generated. */
export function toWorldItem(item: Omit<WorldItem, 'alt'>): WorldItem {
  return {
    ...item,
    alt:
      item.kind === 'video'
        ? `${item.description}. Video, ${String(item.duration ?? 0)} seconds, AI-generated.`
        : `${item.description}. Image, AI-generated.`,
  };
}

/** Posters in AVIF and WebP from the Feed's bucket, and its clips' previews. */
export const getWorldUrl: GetMediaUrl<WorldItem> = (item, request) => {
  if (request.type === 'preview') return item.kind === 'video' ? previewUrl(item) : undefined;
  return request.format === 'avif' || request.format === 'webp' ? posterUrl(item, request.width, request.format) : undefined;
};

/** The item's page in Generation Feed, where Ctrl-click or Cmd-click takes you. */
export function worldHref(item: WorldItem) {
  return `https://generation-feed.vercel.app/m/${item.id}`;
}

/** "AI", and a clip's length. The card's name says the same to screen readers. */
export function worldBadges(item: WorldItem): ReactNode {
  return (
    <span aria-hidden="true" className="absolute top-1.5 left-1.5 flex gap-1 text-xs leading-5 font-medium">
      <span className="rounded-sm bg-background/70 px-1.5 uppercase">AI</span>
      {item.kind === 'video' ? (
        <span className="rounded-sm bg-background/70 px-1.5 tabular-nums">Video · {String(item.duration ?? 0)}s</span>
      ) : null}
    </span>
  );
}
