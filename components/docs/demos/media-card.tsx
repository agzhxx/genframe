'use client';

import { useState } from 'react';
import { SelectControl, SwitchControl } from '@/components/docs/controls';
import { Playground } from '@/components/docs/playground';
import { imageResults, videoResults } from '@/lib/feed-results';
import { VideoPoolProvider } from '@/registry/hooks/use-video-pool';
import { MediaCard, type MediaCardProps } from '@/registry/ui/media-card/media-card';
import { getWorldUrl, toWorldItem, worldBadges, worldHref, type WorldItem } from './world-cards';

const [balloon] = imageResults['3:4'];
const [whale, mist] = videoResults['16:9'];
if (!balloon || !whale || !mist) throw new Error('No demo media');

const image = toWorldItem({ ...balloon, kind: 'image' });
const video = toWorldItem({ ...whale, kind: 'video' });
// Named by its caption, like a clip in an editor's media bin.
const clip = { ...toWorldItem({ ...mist, kind: 'video' }), alt: '' };

const placeholders = [
  { value: 'blur', label: 'ThumbHash' },
  { value: 'color', label: 'Average color' },
  { value: 'none', label: 'None' },
] as const;
type Placeholder = (typeof placeholders)[number]['value'];

export function MediaCardDemo() {
  const [placeholder, setPlaceholder] = useState<Placeholder>('blur');
  const [posters, setPosters] = useState(true);
  const [autoplay, setAutoplay] = useState(true);
  const [opened, setOpened] = useState<string | null>(null);

  const shared = {
    getMediaUrl: getWorldUrl,
    sizes: '(max-width: 639px) 100vw, 240px',
    placeholder,
    showPoster: posters,
    autoplay,
    onOpen: (item: WorldItem) => {
      setOpened(item.description);
    },
  } satisfies Partial<MediaCardProps<WorldItem>>;

  return (
    <VideoPoolProvider size={2}>
      <Playground
        title="MediaCard demo"
        wide
        controls={
          <div className="grid gap-4 sm:grid-cols-[repeat(3,minmax(0,1fr))]">
            <SelectControl label="Placeholder" value={placeholder} options={placeholders} onValueChange={setPlaceholder} />
            <div className="flex flex-col gap-3">
              <SwitchControl label="Posters" checked={posters} onCheckedChange={setPosters} />
              <SwitchControl label="Previews start on hover" checked={autoplay} onCheckedChange={setAutoplay} />
            </div>
            <p className="text-sm text-muted-foreground">
              {opened ? `Opened: ${opened}` : 'Hover a video to preview it; click a card to open it.'}
            </p>
          </div>
        }
      >
        {/* Mounted again when the placeholder changes: a card decides whether its poster fades when it appears. */}
        <div key={placeholder} className="grid w-full max-w-3xl items-start gap-4 sm:grid-cols-3">
          <MediaCard item={image} href={worldHref(image)} {...shared}>
            {worldBadges(image)}
          </MediaCard>
          <MediaCard item={video} href={worldHref(video)} {...shared}>
            {worldBadges(video)}
          </MediaCard>
          <MediaCard
            item={clip}
            ratio={16 / 9}
            description={`AI-generated, ${String(clip.duration ?? 0)} seconds. Press it to open it.`}
            caption={
              <span className="mt-1.5 block text-sm">
                Sun rays over the lake <span className="block text-muted-foreground">A card that’s a button</span>
              </span>
            }
            {...shared}
          >
            {worldBadges(clip)}
          </MediaCard>
        </div>
      </Playground>
    </VideoPoolProvider>
  );
}
