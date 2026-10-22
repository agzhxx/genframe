// CameraMotionPicker's demo clips: Generation Feed's "camera-moves", one still set in motion by
// different camera moves. The red car has all eight, made with Higgsfield's Cinema Studio 4.0
// presets; three more scenes have four or three, made with Kling 2.5. 5 s each. Copied from the
// Feed's data/manifest.json (lib/feed-media.ts has the stills and the URLs);
// tests/feed-media.test.ts checks the copy. A module of its own, so other pages don't load it.

import type { FeedImage } from '@/lib/feed-media';

export type CameraMove =
  | 'dolly-in'
  | 'dolly-out'
  | 'orbit'
  | 'crane-up'
  | 'crash-zoom'
  | 'whip-pan'
  | 'dolly-zoom'
  | 'bullet-time';

/** Each move's name and what it does, in the order the picker lists them. */
export const cameraMoves: Record<CameraMove, { label: string; description: string }> = {
  'dolly-in': { label: 'Dolly in', description: 'The camera moves in toward the subject.' },
  'dolly-out': { label: 'Dolly out', description: 'The camera pulls back, and more of the scene comes into view.' },
  orbit: { label: 'Orbit', description: 'The camera circles around the subject.' },
  'crane-up': { label: 'Crane up', description: 'The camera rises and looks down on the scene.' },
  'crash-zoom': { label: 'Crash zoom', description: 'A sudden, fast zoom in on the subject.' },
  'whip-pan': { label: 'Whip pan', description: 'The camera swings sideways so fast the picture blurs.' },
  'dolly-zoom': {
    label: 'Dolly zoom',
    description: 'The camera moves one way while the lens zooms the other: the subject holds, the background stretches.',
  },
  'bullet-time': { label: 'Bullet time', description: 'Time all but stops while the camera sweeps around.' },
};

export interface CameraMoveClip extends FeedImage {
  move: CameraMove;
}

export interface CameraMoveScene {
  /** For the scene control. */
  name: string;
  /** What made its clips. */
  model: string;
  clips: CameraMoveClip[];
}

const car = 'A small red vintage car on a winding mountain road far below';
const leopard = 'A stone statue of a snow leopard in a quiet courtyard';
const alley = 'A narrow alley at night after rain, a red doorway at its far end';
const lighthouse = 'A white lighthouse on a stormy cliff';

function clips(width: number, height: number, description: string, moves: [CameraMove, string][]) {
  return moves.map(([move, id]) => ({ id, move, width, height, description: `${description}: ${cameraMoves[move].label.toLowerCase()}` }));
}

export const cameraMoveScenes: CameraMoveScene[] = [
  {
    name: 'The red car',
    model: 'Cinema Studio 4.0',
    clips: clips(854, 480, car, [
      ['dolly-in', '2ku2vlkbhr'],
      ['dolly-out', 'a6ok00bmk5'],
      ['orbit', 'tvl7jqk4h2'],
      ['crane-up', '4m6g4ut215'],
      ['crash-zoom', 'u6lr2d2mum'],
      ['whip-pan', 'jafcke9v49'],
      ['dolly-zoom', 'h1dhp17s02'],
      ['bullet-time', 'n960mhu8as'],
    ]),
  },
  {
    name: 'The neon alley',
    model: 'Kling 2.5',
    clips: clips(1280, 720, alley, [
      ['dolly-in', 'k4hu95gmtu'],
      ['dolly-out', 'e82ner82ms'],
      ['crane-up', 'tafhsg5pmo'],
      ['whip-pan', 'phmre54mk7'],
    ]),
  },
  {
    name: 'The lighthouse',
    model: 'Kling 2.5',
    clips: clips(1280, 720, lighthouse, [
      ['dolly-in', '3qg8g0fs02'],
      ['dolly-out', 'rnqrbcdgi0'],
      ['crane-up', '0k3pdh22ap'],
      ['whip-pan', 'krjqtn7u8s'],
    ]),
  },
  {
    name: 'The snow leopard',
    model: 'Kling 2.5',
    clips: clips(1280, 720, leopard, [
      ['dolly-in', '1j5nl53q8r'],
      ['crane-up', 'f8n04p4giv'],
      ['whip-pan', 'h5cbbdav89'],
    ]),
  },
];
