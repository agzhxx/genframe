// The Studio's results: the Feed's images and clips that its simulated jobs "make", and the models
// that made them. Copied from Generation Feed's data/manifest.json with their ThumbHashes;
// tests/feed-media.test.ts checks the copy, and tests/sprites.test.ts the clips' sprites in
// public/sprites/, which scripts/make-sprites.ts made. lib/studio-results.ts picks among them. A
// module of its own, so other pages don't load it.

import type { CameraMove } from '@/lib/feed-camera-moves';
import type { FeedImage } from '@/lib/feed-media';
import type { SpriteFile } from '@/scripts/make-sprites';
import alley1 from '@/public/sprites/k4hu95gmtu.json';
import alley2 from '@/public/sprites/e82ner82ms.json';
import alley3 from '@/public/sprites/tafhsg5pmo.json';
import alley4 from '@/public/sprites/phmre54mk7.json';
import car1 from '@/public/sprites/2ku2vlkbhr.json';
import car2 from '@/public/sprites/a6ok00bmk5.json';
import car3 from '@/public/sprites/tvl7jqk4h2.json';
import car4 from '@/public/sprites/4m6g4ut215.json';
import car5 from '@/public/sprites/u6lr2d2mum.json';
import car6 from '@/public/sprites/jafcke9v49.json';
import car7 from '@/public/sprites/h1dhp17s02.json';
import car8 from '@/public/sprites/n960mhu8as.json';
import leopard1 from '@/public/sprites/1j5nl53q8r.json';
import leopard2 from '@/public/sprites/f8n04p4giv.json';
import leopard3 from '@/public/sprites/h5cbbdav89.json';
import lighthouse1 from '@/public/sprites/3qg8g0fs02.json';
import lighthouse2 from '@/public/sprites/rnqrbcdgi0.json';
import lighthouse3 from '@/public/sprites/0k3pdh22ap.json';
import lighthouse4 from '@/public/sprites/krjqtn7u8s.json';
import square1 from '@/public/sprites/diq0ej7dfu.json';
import square2 from '@/public/sprites/05umf6fcag.json';
import square3 from '@/public/sprites/l24jto5qnb.json';
import story1 from '@/public/sprites/qjr027827t.json';
import story2 from '@/public/sprites/hoasfc54e8.json';
import story3 from '@/public/sprites/a7391hh3rt.json';
import tall1 from '@/public/sprites/qp6m7fe9h3.json';
import tall2 from '@/public/sprites/0ri4m7gpkm.json';
import tall3 from '@/public/sprites/12tn2lr22k.json';
import upright1 from '@/public/sprites/91ng5l6il9.json';
import upright2 from '@/public/sprites/ac106bhn97.json';
import upright3 from '@/public/sprites/87tprt8ukc.json';

/** The shapes the Studio makes: the four the Feed has both images and clips in. */
export const studioRatios = ['16:9', '9:16', '1:1', '3:4'] as const;
export type StudioRatio = (typeof studioRatios)[number];

export interface StudioMedia extends FeedImage {
  /** The Feed's ThumbHash of it, base64. */
  thumbhash: string;
  /** The model that made it, as lib/demo-models.ts names it. */
  model: string;
}

export interface StudioImage extends StudioMedia {
  kind: 'image';
  ratio: StudioRatio;
  /** For the Feed's draft and final pairs: the draft this final was made from. */
  draft?: StudioMedia;
}

export interface StudioClip extends StudioMedia {
  kind: 'video';
  ratio: StudioRatio;
  /** Its length in seconds. */
  duration: number;
  /** The camera move it shows, for the Feed's camera-move clips. */
  move?: CameraMove;
  /** Its thumbnails: `url` is relative to public/sprites/. */
  sprite: SpriteFile;
}

export type StudioResult = StudioImage | StudioClip;

type Media = [id: string, width: number, height: number, thumbhash: string];

// The Feed's "pairs": a draft made with Soul 2, and a final made from it with Grok Imagine 2.0,
// which keeps its composition, so the two line up. The Feed has them in 16:9 and 3:4 only.
function pair(ratio: StudioRatio, description: string, draft: Media, final: Media): StudioImage {
  const media = ([id, width, height, thumbhash]: Media, model: string) => ({ id, width, height, thumbhash, model, description });
  return { kind: 'image', ratio, ...media(final, 'Grok Imagine 2.0'), draft: media(draft, 'Soul 2') };
}

// The Feed's "ratios": one scene made with Soul 2 in each of four shapes.
function still(ratio: StudioRatio, description: string, [id, width, height, thumbhash]: Media): StudioImage {
  return { kind: 'image', ratio, id, width, height, thumbhash, model: 'Soul 2', description };
}

function clip(
  ratio: StudioRatio,
  model: string,
  description: string,
  [id, width, height, thumbhash]: Media,
  sprite: SpriteFile,
  move?: CameraMove,
): StudioClip {
  return { kind: 'video', ratio, id, width, height, thumbhash, model, description, duration: 5, sprite, ...(move ? { move } : {}) };
}

const car = 'A small red vintage car on a winding mountain road far below';
const alley = 'A narrow alley at night after rain, a red doorway at its far end';
const lighthouse = 'A white lighthouse on a stormy cliff';
const leopard = 'A stone statue of a snow leopard in a quiet courtyard';

/** Every result, in the order each kind of job takes them. */
export const studioResults: StudioResult[] = [
  pair(
    '16:9',
    'A sunken airplane wreck on white sand, with sun rays from the surface',
    ['31b76ecs43', 1696, 960, '5NcRDIRkZ4iXd4hvd3xUmA+l+w=='],
    ['fjv7aap2t5', 2816, 1584, '04YFHIYWWIlklnlvhpeHgGcJeQ=='],
  ),
  pair(
    '16:9',
    'A stray cat sitting in a dry doorway on a wet street, at blue hour',
    ['e3ruckq0nn', 1696, 960, '2KYFLIxKeHiPdneId2YTcFcDhw=='],
    ['pd5mgdtl8r', 2816, 1584, 'EMcFJIhMeHiPd3eHd2YTYFcDhw=='],
  ),
  pair(
    '16:9',
    'A narrow-gauge railway winding along a cliff at first light, seen from the air',
    ['781es5g95l', 1696, 960, 'nQgWDIJid3hvd3eZdokFgQKBaA=='],
    ['9qt3mm2guh', 2816, 1584, 'GhgWDIJyd3hvd3eZdokIYwfypg=='],
  ),
  pair(
    '16:9',
    'A lighthouse beaming light up into space at golden hour, seen from the air',
    ['m4frsq1pho', 1696, 960, 'mBgSFIZ0h3d/h3iIeIhgf0f3hw=='],
    ['rsuep4m7iv', 2816, 1584, 'nBgKHIY1d3iPdoiAeIUjixDSCA=='],
  ),
  pair(
    '3:4',
    'A riverside promenade with lamps reflected in the rain-pocked water, at blue hour',
    ['onf4l4h3mu', 1152, 1536, 'F+gNFQJliH+Hh5hXh4WIl5pgswoW'],
    ['ehfhtjiuf1', 1776, 2368, 'VdcNFQRViH+Hh5hHh4WIl6pgowom'],
  ),
  pair(
    '3:4',
    'An airship drifting over rolling green hills at golden hour',
    ['pr8plk2d7m', 1152, 1536, 'nAgWHQR2d393V4hYiHmHeIdwcWgG'],
    ['75ekrd96ep', 1776, 2368, 'nggaHQZ3d393V3hYiHl4eIdgcGgG'],
  ),
  pair(
    '3:4',
    'A red-roofed rescue hut on a snowy ridge at first light, seen from the air',
    ['cfh7un6sia', 1152, 1536, 'XQgODQCHeI+HaHiHh4eHh09H+tMi'],
    ['vb6n7gersi', 1776, 2368, 'HggSDQKHd4+Hd3iHh4d4dz9Ny/Rl'],
  ),
  pair(
    '3:4',
    'A coral garden on a shallow reef top, with sun rays from the surface',
    ['4p6m3nd0ud', 1152, 1536, 'jscJHQwHmI12yHfIWHiId4hwhwln'],
    ['gd9c8db5d7', 1776, 2368, 'ELcJJQoHiI52uHe4aHiId3hwigiX'],
  ),
  still('1:1', 'An adult in a yellow coat at the end of a wooden pier on a misty lake, seen from behind', ['itfe2rakoi', 2048, 2048, 'ZggKFwKIaIePiYd4dpd3mId3aHBpBpYG']),
  still('1:1', 'A red umbrella in the middle of a rainy cobblestone square', ['g9nrg184d9', 2048, 2048, 'VygGDwb2iIiPhIh1hmh3qHdzjbAICIoA']),
  still('1:1', 'A sailboat on a calm turquoise sea', ['hlccgosjri', 2048, 2048, 'HZcFDwRzh4h/eHd3iJd3h4h3aPVXdn8H']),
  still('1:1', 'A hot air balloon over green rolling hills', ['knurqthkdk', 2048, 2048, 'ktgFHwJ5ZpmPiId3mWiXmIeLiAqIZ4AA']),
  still('9:16', 'An adult in a yellow coat at the end of a wooden pier on a misty lake, seen from behind', ['f6kut4ft0b', 1152, 2048, '2OcJFASXt4gHeHFHeJgHcGQEFw==']),
  still('9:16', 'A red umbrella in the middle of a rainy cobblestone square', ['o5k33knsr1', 1152, 2048, 'mjgGDAik9jeWWIVYd6g4g3BjBw==']),
  still('9:16', 'A sailboat on a calm turquoise sea', ['6ur6palqn7', 1152, 2048, 'HbcJDARr9ndYmIiHV5gqn4X0aQ==']),
  still('9:16', 'A hot air balloon over green rolling hills', ['tom3hq7c96', 1152, 2048, 'UegFHAQ98WkVlVB6x3qYcHUHZw==']),

  // The Feed's "camera-moves": the red car in all eight moves, made with Cinema Studio 4.0's presets,
  // and three scenes in some of them, made with Kling 2.5.
  clip('16:9', 'Cinema Studio 4.0', `${car}: dolly in`, ['2ku2vlkbhr', 854, 480, '2QgGFIJpqnc/yIaKl2qpUKQJJg=='], car1, 'dolly-in'),
  clip('16:9', 'Cinema Studio 4.0', `${car}: dolly out`, ['a6ok00bmk5', 854, 480, 'mQgGFIJVi3kf2JWcqFyXUHYJVg=='], car2, 'dolly-out'),
  clip('16:9', 'Cinema Studio 4.0', `${car}: orbit`, ['tvl7jqk4h2', 854, 480, 'mQgGFIJVi3kf2JWcp1yXUHYJVg=='], car3, 'orbit'),
  clip('16:9', 'Cinema Studio 4.0', `${car}: crane up`, ['4m6g4ut215', 854, 480, '1RgKDIJvhomGaIhciIiPm/2WuA=='], car4, 'crane-up'),
  clip('16:9', 'Cinema Studio 4.0', `${car}: crash zoom`, ['u6lr2d2mum', 854, 480, 'nggKFIJ5iGd/iHiMd5dpkJYGaQ=='], car5, 'crash-zoom'),
  clip('16:9', 'Cinema Studio 4.0', `${car}: whip pan`, ['jafcke9v49', 854, 480, 'mQgGFIJVi3kf2JWcp1yXUHYJVg=='], car6, 'whip-pan'),
  clip('16:9', 'Cinema Studio 4.0', `${car}: dolly zoom`, ['h1dhp17s02', 854, 480, '2QgGFIJYqnc/uHeKh2qZUKQINg=='], car7, 'dolly-zoom'),
  clip('16:9', 'Cinema Studio 4.0', `${car}: bullet time`, ['n960mhu8as', 854, 480, '3ggOBIJ4d3iPeHd8d3lcIHgGRQ=='], car8, 'bullet-time'),
  clip('16:9', 'Kling 2.5', `${alley}: dolly in`, ['k4hu95gmtu', 1280, 720, 'C/gFDIQHqWaGapV3h4T3d2ZvZw=='], alley1, 'dolly-in'),
  clip('16:9', 'Kling 2.5', `${alley}: dolly out`, ['e82ner82ms', 1280, 720, 'C/gFDIQHqWaGapV3h4T3d2ZvZw=='], alley2, 'dolly-out'),
  clip('16:9', 'Kling 2.5', `${alley}: crane up`, ['tafhsg5pmo', 1280, 720, 'C/gFDIQHqWaGapV3h4T3d2ZvZw=='], alley3, 'crane-up'),
  clip('16:9', 'Kling 2.5', `${alley}: whip pan`, ['phmre54mk7', 1280, 720, 'C/gFDIQHqWaGapV3h4T3d2ZvZw=='], alley4, 'whip-pan'),
  clip('16:9', 'Kling 2.5', `${lighthouse}: dolly in`, ['3qg8g0fs02', 1280, 720, 'DvgFBIAEh3qmeXZqmF0bkNFfBQ=='], lighthouse1, 'dolly-in'),
  clip('16:9', 'Kling 2.5', `${lighthouse}: dolly out`, ['rnqrbcdgi0', 1280, 720, 'DvgFBIAEh3qmeXZqmF0bkNFfBQ=='], lighthouse2, 'dolly-out'),
  clip('16:9', 'Kling 2.5', `${lighthouse}: crane up`, ['0k3pdh22ap', 1280, 720, 'DvgFBIAEh3qmeXZqmF0bkNFfBQ=='], lighthouse3, 'crane-up'),
  clip('16:9', 'Kling 2.5', `${lighthouse}: whip pan`, ['krjqtn7u8s', 1280, 720, 'DvgFBIAEh3qmeXZqmF0bkNFfBQ=='], lighthouse4, 'whip-pan'),
  clip('16:9', 'Kling 2.5', `${leopard}: dolly in`, ['1j5nl53q8r', 1280, 720, 'FggGDIJ9aGdvdIiJeHlQeghodw=='], leopard1, 'dolly-in'),
  clip('16:9', 'Kling 2.5', `${leopard}: crane up`, ['f8n04p4giv', 1280, 720, 'FggGDIJ9aGdvdIiJeHlQewhodw=='], leopard2, 'crane-up'),
  clip('16:9', 'Kling 2.5', `${leopard}: whip pan`, ['h5cbbdav89', 1280, 720, 'FggGDIJ9aGdvdIiJeHlQewhodw=='], leopard3, 'whip-pan'),

  // Three shots of the Feed's "story", made with Kling 2.5 Pro, which VideoScrubber's demo plays too.
  clip(
    '16:9',
    'Kling 2.5 Pro',
    'A tram passes a small orange robot waiting at a crossing on a rainy night, then the robot rolls on',
    ['qjr027827t', 1920, 1080, 'jSgGFIKFJQJ5ZppzyGdqY8A1Bw=='],
    story1,
  ),
  clip(
    '16:9',
    'Kling 2.5 Pro',
    'The camera cranes up from the robot on a hillside street to the city lights below',
    ['hoasfc54e8', 1920, 1080, 'SigGFIIIRJZ2VpiWmZWPsfQYPA=='],
    story2,
  ),
  clip(
    '16:9',
    'Kling 2.5 Pro',
    'The robot rolls away down a snowy mountain road under the stars',
    ['a7391hh3rt', 1920, 1080, '2dYNFIKXWIeAd4iFd3YJY5YgZg=='],
    story3,
  ),

  // The Feed's "worlds" clips in the other shapes, made with Kling 2.5 (lib/feed-results.ts too).
  clip('9:16', 'Kling 2.5', 'Paper lanterns in an alley in the drizzle, reflected on the wet ground', ['qp6m7fe9h3', 720, 1280, 'zggKDAQHqGeYZ3iHh3dXkXAOCQ=='], tall1),
  clip('9:16', 'Kling 2.5', 'Storm clouds over a white village, with waves breaking on the rocks below', ['0ri4m7gpkm', 720, 1280, '1RcKBABo94mHiXunR4dcz431hw=='], tall2),
  clip('9:16', 'Kling 2.5', 'A moose stepping through a misty pond', ['12tn2lr22k', 720, 1280, '0ggGDAJY6ncJh4SXqXhqha/U+Q=='], tall3),
  clip('1:1', 'Kling 2.5', 'A fox trotting across the snow through long tree shadows', ['diq0ej7dfu', 960, 960, 'GxgKDwB2d3eAiHiAd3h4d3d8t/Z4fI8K'], square1),
  clip('1:1', 'Kling 2.5', 'Oryx walking across a red dune', ['05umf6fcag', 960, 960, 'VhgKRwx4h3eMh3hwh1eHl4eHhweHeHAI'], square2),
  clip('1:1', 'Kling 2.5', 'Water pouring off the edge of a floating island covered in flowers', ['l24jto5qnb', 960, 960, 'XGkGBwJTyFVfl3h/dUaqRah4CsEI42UP'], square3),
  clip('3:4', 'Kling 2.5', 'A hot air balloon filling in a field', ['91ng5l6il9', 828, 1108, 'GQgOHQanZ3+IB1eoeHlYiGdwdAU3'], upright1),
  clip('3:4', 'Kling 2.5', 'A cable car gliding toward the peaks', ['ac106bhn97', 828, 1108, '1vgRDQKGd394h3h4eIiHeJBlQAcn'], upright2),
  clip('3:4', 'Kling 2.5', 'A school of silver fish swirling above the coral', ['87tprt8ukc', 828, 1108, 'U7cJNQJmd4B3p3iIh3iIiIeAR/7Y'], upright3),
];
