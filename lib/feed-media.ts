// Media for the docs' demos, from Generation Feed (https://generation-feed.vercel.app): images and a
// clip made with AI, at the public URLs the Feed serves to browsers. The entries are copied from
// the Feed's data/manifest.json, only the ones the demos show, so the docs never fetch it. The
// URLs follow the Feed's lib/media-urls.ts. Showing media from another origin needs no CORS;
// nothing here reads its pixels.

/** The Feed's media bucket (NEXT_PUBLIC_MEDIA_ORIGIN in the Feed). */
export const mediaOrigin = 'https://pub-b6efd72fde71478fa4b96c65e2f0928d.r2.dev';

/** The widths the Feed makes each poster in, as AVIF and WebP; never wider than the source. */
const posterWidths = [320, 480, 640, 960, 1280, 1920];

export interface FeedImage {
  id: string;
  /** The source's size in pixels. */
  width: number;
  height: number;
  /** What it shows, for alt text. */
  description: string;
}

export interface FeedVideo extends FeedImage {
  /** Length in seconds. */
  duration: number;
}

export type PosterFormat = 'avif' | 'webp';

export function posterUrl(image: FeedImage, width: number, format: PosterFormat) {
  const widths = posterWidths.filter((candidate) => candidate <= image.width);
  // The smallest that's wide enough, or the widest there is; the Feed always makes 320.
  const chosen = widths.find((candidate) => candidate >= width) ?? widths.at(-1) ?? 320;
  return `${mediaOrigin}/m/${image.id}/v1/${String(chosen)}.${format}`;
}

export function posterSrcSet(image: FeedImage, format: PosterFormat) {
  return posterWidths
    .filter((width) => width <= image.width)
    .map((width) => `${mediaOrigin}/m/${image.id}/v1/${String(width)}.${format} ${String(width)}w`)
    .join(', ');
}

export function videoUrl(video: FeedImage) {
  return `${mediaOrigin}/m/${video.id}/v1/full.mp4`;
}

/** A clip's short, muted loop for hover previews: its first 2.5 s, 480 px on its short side. */
export function previewUrl(video: FeedImage) {
  return `${mediaOrigin}/m/${video.id}/v1/preview.mp4`;
}

export interface ImagePair {
  name: string;
  before: FeedImage;
  after: FeedImage;
}

// The Feed's "pairs": a draft and its final, made to line up exactly; the final is the draft at a
// higher resolution, made from it.
export const draftFinalPairs: ImagePair[] = [
  {
    name: 'the airplane wreck',
    before: { id: '31b76ecs43', width: 1696, height: 960, description: 'A sunken airplane wreck on white sand, with sun rays from the surface' },
    after: { id: 'fjv7aap2t5', width: 2816, height: 1584, description: 'A sunken airplane wreck on white sand, with sun rays from the surface' },
  },
  {
    name: 'the stray cat',
    before: { id: 'e3ruckq0nn', width: 1696, height: 960, description: 'A stray cat sitting in a dry doorway on a wet street, at blue hour' },
    after: { id: 'pd5mgdtl8r', width: 2816, height: 1584, description: 'A stray cat sitting in a dry doorway on a wet street, at blue hour' },
  },
  {
    name: 'the promenade',
    before: { id: 'onf4l4h3mu', width: 1152, height: 1536, description: 'A riverside promenade with lamps reflected in the rain-pocked water, at blue hour' },
    after: { id: 'ehfhtjiuf1', width: 1776, height: 2368, description: 'A riverside promenade with lamps reflected in the rain-pocked water, at blue hour' },
  },
];

// The same view by day and at night.
export const dayNightPairs: ImagePair[] = [
  {
    name: 'the lakeside village',
    before: { id: 'l1ljo19ol4', width: 2048, height: 1152, description: 'A lakeside village with wooden piers, in bright midday light' },
    after: { id: '116crkc70d', width: 2816, height: 1584, description: 'A lakeside village with wooden piers, at night under warm lights' },
  },
  {
    name: 'the seaside boardwalk',
    before: { id: '9kul9et33d', width: 2048, height: 1152, description: 'A seaside boardwalk with a carousel, in bright midday light' },
    after: { id: 'kl68h8406h', width: 2816, height: 1584, description: 'A seaside boardwalk with a carousel, at night under warm lights' },
  },
];

// The Feed has no video in two versions, so the two-video demo plays this clip in both layers.
export const ferryClip: FeedVideo = {
  id: 'cunh0gpgun',
  width: 1280,
  height: 720,
  duration: 5,
  description: 'A ferry gliding across a bay, its wake spreading behind it, as clouds drift',
};

export interface RatioScene {
  name: string;
  /** The scene in each ratio it was made in. */
  images: Partial<Record<string, FeedImage>>;
}

// The Feed's "ratios": one scene made in four shapes, 3:4, 1:1, 16:9 and 9:16, and no others.
export const ratioScenes: RatioScene[] = [
  {
    name: 'the yellow coat',
    images: {
      '3:4': { id: 'c5g8flq1ov', width: 1536, height: 2048, description: 'An adult in a yellow coat at the end of a wooden pier on a misty lake, seen from behind' },
      '1:1': { id: 'itfe2rakoi', width: 2048, height: 2048, description: 'An adult in a yellow coat at the end of a wooden pier on a misty lake, seen from behind' },
      '16:9': { id: '3ium6sbgg9', width: 2048, height: 1152, description: 'An adult in a yellow coat at the end of a wooden pier on a misty lake, seen from behind' },
      '9:16': { id: 'f6kut4ft0b', width: 1152, height: 2048, description: 'An adult in a yellow coat at the end of a wooden pier on a misty lake, seen from behind' },
    },
  },
  {
    name: 'the red umbrella',
    images: {
      '3:4': { id: 'smmp2658ea', width: 1536, height: 2048, description: 'A red umbrella in the middle of a rainy cobblestone square' },
      '1:1': { id: 'g9nrg184d9', width: 2048, height: 2048, description: 'A red umbrella in the middle of a rainy cobblestone square' },
      '16:9': { id: 'm220s1ogad', width: 2048, height: 1152, description: 'A red umbrella in the middle of a rainy cobblestone square' },
      '9:16': { id: 'o5k33knsr1', width: 1152, height: 2048, description: 'A red umbrella in the middle of a rainy cobblestone square' },
    },
  },
  {
    name: 'the hot air balloon',
    images: {
      '3:4': { id: 'v2lahv6joo', width: 1536, height: 2048, description: 'A hot air balloon over green rolling hills' },
      '1:1': { id: 'knurqthkdk', width: 2048, height: 2048, description: 'A hot air balloon over green rolling hills' },
      '16:9': { id: 'cm5h9dvnsj', width: 2048, height: 1152, description: 'A hot air balloon over green rolling hills' },
      '9:16': { id: 'tom3hq7c96', width: 1152, height: 2048, description: 'A hot air balloon over green rolling hills' },
    },
  },
];

export interface NamedImage {
  /** A short name, which the prompt composer's demo mentions as @name. */
  name: string;
  image: FeedImage;
}

// The Feed's "camera-moves" scenes: the stills its camera presets set in motion. The prompt
// composer's demo uses them as reference images.
export const cameraScenes: NamedImage[] = [
  {
    name: 'car',
    image: { id: 'u3gqg4f8av', width: 2048, height: 1152, description: 'A small red vintage car on a winding mountain road far below, snowy peaks all around' },
  },
  {
    name: 'alley',
    image: { id: 'oqiv3rfpdl', width: 2048, height: 1152, description: 'A narrow alley at night after rain, neon glowing in the puddles, a red doorway at its far end' },
  },
  {
    name: 'lighthouse',
    image: { id: 'odovk21hln', width: 2048, height: 1152, description: 'A white lighthouse on a stormy cliff, huge waves breaking on the rocks below' },
  },
  {
    name: 'leopard',
    image: { id: 'v9qvftjic3', width: 2048, height: 1152, description: 'A stone statue of a snow leopard in a quiet courtyard, light snow falling' },
  },
];
