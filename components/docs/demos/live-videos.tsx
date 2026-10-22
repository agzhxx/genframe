'use client';

import { useEffect, useState } from 'react';
import { useVideoPool } from '@/registry/hooks/use-video-pool';

// The video pool's counts for the demos that preview clips (MediaGrid, CameraMotionPicker): the
// pool has no events, so they're read a few times a second, as in the Feed's performance overlay.

/** How many of the pool's videos hold a clip right now, read a few times a second. */
export function LiveVideos() {
  const pool = useVideoPool();
  const [counts, setCounts] = useState<{ live: number; size: number; steals: number } | null>(null);
  useEffect(() => {
    if (pool === null) return;
    const read = () => {
      setCounts({ live: pool.liveCount(), size: pool.size, steals: pool.steals() });
    };
    const timer = window.setInterval(read, 200);
    return () => {
      window.clearInterval(timer);
    };
  }, [pool]);
  return (
    <dl
      data-slot="live-videos"
      data-live={counts?.live}
      data-size={counts?.size}
      className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 text-sm tabular-nums"
    >
      <dt className="text-muted-foreground">Videos with a clip</dt>
      <dd>{counts ? `${String(counts.live)} of ${String(counts.size)}` : '–'}</dd>
      <dt className="text-muted-foreground">Taken from another preview</dt>
      <dd>{counts ? String(counts.steals) : '–'}</dd>
    </dl>
  );
}
