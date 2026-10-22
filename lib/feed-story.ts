// VideoScrubber's demo clips: three shots of Generation Feed's story (a small delivery robot's night
// run), 5 s each at 24 fps, with the sprite sheets scripts/make-sprites.ts made of them in
// public/sprites/. Copied from the Feed's data/manifest.json; tests/feed-media.test.ts checks the
// copy and tests/sprites.test.ts the sprites. A module of its own, so other pages don't load it.

import craneUp from '@/public/sprites/hoasfc54e8.json';
import rollsAway from '@/public/sprites/a7391hh3rt.json';
import tram from '@/public/sprites/qjr027827t.json';
import type { FeedVideo } from '@/lib/feed-media';
import type { SpriteFile } from '@/scripts/make-sprites';

export interface StoryClip extends FeedVideo {
  /** The shot's name in the Feed's story. */
  shot: string;
  /** Its thumbnails: `url` is relative to public/sprites/. */
  sprite: SpriteFile;
}

export const storyClips: StoryClip[] = [
  {
    id: 'qjr027827t',
    shot: '10-wide',
    width: 1920,
    height: 1080,
    duration: 5,
    description: 'A tram passes a small orange robot waiting at a crossing on a rainy night, then the robot rolls on',
    sprite: tram,
  },
  {
    id: 'hoasfc54e8',
    shot: '11-crane-up',
    width: 1920,
    height: 1080,
    duration: 5,
    description: 'The camera cranes up from the robot on a hillside street to the city lights below',
    sprite: craneUp,
  },
  {
    id: 'a7391hh3rt',
    shot: '15-wide',
    width: 1920,
    height: 1080,
    duration: 5,
    description: 'The robot rolls away down a snowy mountain road under the stars',
    sprite: rollsAway,
  },
];
