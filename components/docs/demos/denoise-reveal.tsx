'use client';

import { useState } from 'react';
import { SelectControl, SwitchControl } from '@/components/docs/controls';
import { Playground } from '@/components/docs/playground';
import { Button } from '@/components/ui/button';
import { posterSrcSet, posterUrl } from '@/lib/feed-media';
import { imageResults, type FeedResult } from '@/lib/feed-results';
import { cn } from '@/lib/utils';
import { useThumbHash } from '@/registry/hooks/use-thumbhash';
import { DenoiseReveal } from '@/registry/ui/denoise-reveal/denoise-reveal';

// One of the Feed's worlds in each of three shapes.
const choices = [
  ['1:1', 'The floating city'],
  ['16:9', 'The cable ferry'],
  ['9:16', 'The rowboat'],
] as const;
const images: (FeedResult & { value: string; label: string })[] = choices.flatMap(([ratio, name]) => {
  const image = imageResults[ratio][0];
  return image ? [{ ...image, value: image.id, label: `${name} (${ratio})` }] : [];
});

/**
 * DenoiseReveal's playground: a Feed image that sharpens out of grain, again with Replay. Replay
 * remounts the reveal; the image comes from the cache at once, and the reveal starts from grain.
 */
export function DenoiseRevealDemo() {
  const [chosen, setChosen] = useState(images[0]?.value ?? '');
  const [withPlaceholder, setWithPlaceholder] = useState(true);
  const [replays, setReplays] = useState(0);
  const image = images.find((entry) => entry.value === chosen) ?? images[0];
  const placeholder = useThumbHash(withPlaceholder ? image?.thumbhash : undefined);
  if (!image) throw new Error('No demo images');
  const portrait = image.height > image.width;
  const sizes = portrait ? '(min-width: 768px) 288px, 100vw' : '(min-width: 768px) 448px, 100vw';

  return (
    <Playground
      title="DenoiseReveal demo"
      controls={
        <div className="flex flex-col gap-4 text-sm">
          <Button
            variant="outline"
            size="sm"
            className="self-start"
            onClick={() => {
              setReplays((count) => count + 1);
            }}
          >
            Replay
          </Button>
          <SelectControl label="Image" value={chosen} options={images} onValueChange={setChosen} />
          <SwitchControl label="ThumbHash placeholder" checked={withPlaceholder} onCheckedChange={setWithPlaceholder} />
        </div>
      }
    >
      <figure className="flex w-full flex-col items-center gap-3">
        <DenoiseReveal
          key={`${chosen}:${String(replays)}:${String(withPlaceholder)}`}
          src={posterUrl(image, 960, 'webp')}
          srcSet={posterSrcSet(image, 'webp')}
          sizes={sizes}
          width={image.width}
          height={image.height}
          alt={image.description}
          placeholder={placeholder}
          className={cn('w-full rounded-lg', portrait ? 'max-w-72' : 'max-w-md')}
        />
        <figcaption className="max-w-md text-center text-xs text-muted-foreground">
          An AI-generated image from Generation Feed.
        </figcaption>
      </figure>
    </Playground>
  );
}
