'use client';

import { useState } from 'react';
import { SelectControl, SwitchControl } from '@/components/docs/controls';
import { FeedPicture } from '@/components/docs/feed-picture';
import { Playground } from '@/components/docs/playground';
import { ratioScenes } from '@/lib/feed-media';
import { AspectRatioPicker } from '@/registry/ui/aspect-ratio-picker/aspect-ratio-picker';
import { DEFAULT_RATIOS, fitRatio } from '@/registry/ui/aspect-ratio-picker/ratio-math';

type RatioSet = 'default' | 'scenes';

const ratioSets: { value: RatioSet; label: string; ratios: string[] }[] = [
  { value: 'default', label: 'The default eight', ratios: DEFAULT_RATIOS },
  { value: 'scenes', label: 'The four the scenes come in', ratios: ['3:4', '1:1', '16:9', '9:16'] },
];

const scenes = ratioScenes.map((scene, index) => ({ value: String(index), label: `Scene: ${scene.name}`, scene }));

// The largest a scene is shown: 448 × 288 px.
const STAGE = { width: 448, height: 288 };

/**
 * AspectRatioPicker's playground: one of the Feed's scenes, made in four ratios, changes as you
 * pick. The other four ratios have no image, so they're disabled with that reason.
 */
export function AspectRatioPickerDemo() {
  const [setName, setSetName] = useState<RatioSet>('default');
  const [disableMissing, setDisableMissing] = useState(true);
  const [sceneName, setSceneName] = useState('0');
  const [value, setValue] = useState('16:9');
  const ratios = ratioSets.find((set) => set.value === setName)?.ratios ?? DEFAULT_RATIOS;
  const scene = (scenes.find((entry) => entry.value === sceneName) ?? scenes[0])?.scene;
  if (!scene) throw new Error('No demo scenes');
  const disabled = disableMissing
    ? Object.fromEntries(
        ratios.filter((ratio) => !scene.images[ratio]).map((ratio) => [ratio, 'No demo image in this ratio']),
      )
    : {};

  return (
    <Playground
      title="AspectRatioPicker demo"
      controls={
        <div className="flex flex-col gap-4 text-sm">
          <SelectControl
            label="Ratios"
            value={setName}
            options={ratioSets}
            onValueChange={(name) => {
              setSetName(name);
              // A ratio the new set doesn't have can't stay picked.
              const next = ratioSets.find((set) => set.value === name)?.ratios ?? [];
              if (!next.includes(value)) setValue('16:9');
            }}
          />
          <SwitchControl
            label="Disable ratios with no image"
            checked={disableMissing}
            onCheckedChange={setDisableMissing}
          />
          <SelectControl label="Scene" value={sceneName} options={scenes} onValueChange={setSceneName} />
          <p className="text-muted-foreground">
            Picked <span className="text-foreground">{value}</span>
          </p>
        </div>
      }
    >
      <div className="flex w-full flex-col items-center gap-6">
        <AspectRatioPicker ratios={ratios} value={value} onValueChange={setValue} disabled={disabled} />
        <Stage ratio={value} scene={scene} />
      </div>
    </Playground>
  );
}

function Stage({ ratio, scene }: { ratio: string; scene: (typeof ratioScenes)[number] }) {
  // The ratio at the largest size that fits the stage; narrower screens shrink it.
  const shape = fitRatio(ratio);
  const scale = Math.min(STAGE.width / shape.width, STAGE.height / shape.height);
  const style = { width: `min(100%, ${String(Math.round(shape.width * scale))}px)`, aspectRatio: ratio.replace(':', ' / ') };
  const image = scene.images[ratio];

  return (
    <figure className="flex w-full flex-col items-center gap-3">
      {image ? (
        <div style={style}>
          <FeedPicture
            image={image}
            alt={`${image.description}, in ${ratio}`}
            sizes="(min-width: 768px) 448px, 90vw"
            className="size-full rounded-lg"
          />
        </div>
      ) : (
        <div
          style={style}
          className="flex items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground"
        >
          No demo image in {ratio}
        </div>
      )}
      <figcaption className="text-center text-xs text-muted-foreground">
        AI-generated images from Generation Feed: one scene in 3:4, 1:1, 16:9 and 9:16.
      </figcaption>
    </figure>
  );
}
