'use client';

import { useState } from 'react';
import { SelectControl } from '@/components/docs/controls';
import { Playground } from '@/components/docs/playground';
import { cameraMoves, cameraMoveScenes } from '@/lib/feed-camera-moves';
import { posterUrl, videoUrl } from '@/lib/feed-media';
import { VideoPoolProvider } from '@/registry/hooks/use-video-pool';
import { CameraMotionPicker, type CameraMotionOption } from '@/registry/ui/camera-motion-picker/camera-motion-picker';
import { LiveVideos } from './live-videos';

// Each scene's moves as options: the whole clip, since a move takes all of its 5 seconds (the
// Feed's previews are their first 2.5), and a poster about twice a tile's width.
const scenes = cameraMoveScenes.map((scene) => ({
  value: scene.name,
  label: `${scene.name}: ${String(scene.clips.length)} moves, ${scene.model}`,
  options: scene.clips.map(
    (clip): CameraMotionOption => ({
      id: clip.move,
      ...cameraMoves[clip.move],
      previewSrc: videoUrl(clip),
      poster: posterUrl(clip, 480, 'webp'),
    }),
  ),
}));

const poolSizes = [
  { value: '1', label: '1 video' },
  { value: '2', label: '2 videos' },
  { value: '4', label: '4 videos' },
  { value: '6', label: '6 videos (a desktop’s default)' },
] as const;
type PoolSize = (typeof poolSizes)[number]['value'];

export function CameraMotionPickerDemo() {
  const [sceneName, setSceneName] = useState(scenes[0]?.value ?? '');
  const [poolSize, setPoolSize] = useState<PoolSize>('2');
  const [value, setValue] = useState('dolly-in');
  const scene = scenes.find((candidate) => candidate.value === sceneName) ?? scenes[0];
  if (!scene) throw new Error('No demo scene');
  const picked = scene.options.find((option) => option.id === value);

  return (
    <VideoPoolProvider size={Number(poolSize)}>
      <Playground
        title="CameraMotionPicker demo"
        wide
        controls={
          <div className="grid gap-4 sm:grid-cols-[repeat(3,minmax(0,1fr))]">
            <SelectControl
              label="Scene"
              value={sceneName}
              options={scenes}
              onValueChange={(name) => {
                setSceneName(name);
                // A scene without the picked move picks its first.
                const next = scenes.find((candidate) => candidate.value === name);
                if (next && !next.options.some((option) => option.id === value)) setValue(next.options[0]?.id ?? '');
              }}
            />
            <div className="flex flex-col gap-3">
              <SelectControl label="Pool size" value={poolSize} options={poolSizes} onValueChange={setPoolSize} />
              <p className="text-sm text-muted-foreground">
                Picked: <span className="text-foreground">{picked?.label ?? 'none'}</span>
              </p>
            </div>
            <LiveVideos />
          </div>
        }
      >
        <figure className="flex w-full flex-col gap-3">
          <CameraMotionPicker options={scene.options} value={value} onValueChange={setValue} />
          <figcaption className="text-xs text-muted-foreground">
            AI-generated clips from Generation Feed: the red car’s moves made with Higgsfield’s Cinema Studio 4.0
            presets, the other scenes’ with Kling 2.5.
          </figcaption>
        </figure>
      </Playground>
    </VideoPoolProvider>
  );
}
