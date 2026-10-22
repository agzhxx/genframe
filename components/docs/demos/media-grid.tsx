'use client';

import { useRef, useState } from 'react';
import { SelectControl, SwitchControl } from '@/components/docs/controls';
import { Playground } from '@/components/docs/playground';
import { worlds } from '@/lib/feed-worlds';
import { VideoPoolProvider } from '@/registry/hooks/use-video-pool';
import { MediaGrid } from '@/registry/ui/media-grid/media-grid';
import { LiveVideos } from './live-videos';
import { getWorldUrl, toWorldItem, worldBadges, worldHref, type WorldItem } from './world-cards';

const items = worlds.map(toWorldItem);

const poolSizes = [
  { value: '1', label: '1 video' },
  { value: '2', label: '2 videos' },
  { value: '4', label: '4 videos' },
  { value: '6', label: '6 videos (a desktop’s default)' },
] as const;
type PoolSize = (typeof poolSizes)[number]['value'];

// A lane is about a third of the playground on a wide screen, half of a phone's.
const sizes = '(max-width: 639px) 50vw, 300px';

export function MediaGridDemo() {
  const scroller = useRef<HTMLDivElement>(null);
  const [poolSize, setPoolSize] = useState<PoolSize>('2');
  const [autoplay, setAutoplay] = useState(true);
  const [opened, setOpened] = useState<WorldItem | null>(null);

  return (
    <VideoPoolProvider size={Number(poolSize)}>
      <Playground
        title="MediaGrid demo"
        wide
        controls={
          <div className="grid gap-4 sm:grid-cols-[repeat(3,minmax(0,1fr))]">
            <SelectControl label="Pool size" value={poolSize} options={poolSizes} onValueChange={setPoolSize} />
            <div className="flex flex-col gap-3">
              <SwitchControl label="Previews start on hover" checked={autoplay} onCheckedChange={setAutoplay} />
              <p className="text-sm text-muted-foreground">
                {opened ? `Opened: ${opened.description}` : 'Click a card to open it; Ctrl or Cmd opens its Feed page.'}
              </p>
            </div>
            <LiveVideos />
          </div>
        }
      >
        <div className="flex w-full flex-col gap-2">
          <div ref={scroller} className="h-128 overflow-y-auto rounded-lg border">
            <MediaGrid
              items={items}
              getMediaUrl={getWorldUrl}
              getHref={worldHref}
              onOpen={(item) => {
                setOpened(item);
              }}
              renderOverlay={worldBadges}
              aria-label="Worlds from Generation Feed"
              sizes={sizes}
              autoplay={autoplay}
              scrollRef={scroller}
            />
          </div>
          <p className="text-sm text-muted-foreground">
            120 AI-generated images and clips from Generation Feed&apos;s worlds.
          </p>
        </div>
      </Playground>
    </VideoPoolProvider>
  );
}
