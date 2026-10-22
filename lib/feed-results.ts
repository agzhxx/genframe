// The generation demos' results, from Generation Feed (lib/feed-media.ts has its URLs): what the
// queue's jobs make, and the images DenoiseReveal and GenerationCard show. Copied from the Feed's
// data/manifest.json with their ThumbHashes and prompts; tests/feed-media.test.ts checks the copy.
// A module of their own, so the other demos' pages don't load them.

import type { FeedImage } from '@/lib/feed-media';

export interface FeedResult extends FeedImage {
  /** The Feed's ThumbHash of it, base64. */
  thumbhash: string;
  /** The prompt the Feed made it with. */
  prompt: string;
}

export interface FeedClipResult extends FeedResult {
  /** The clip's length in seconds. */
  duration: number;
}

/** The ratios the queue's demo makes jobs in. */
export const resultRatios = ['16:9', '9:16', '1:1', '3:4'] as const;
export type ResultRatio = (typeof resultRatios)[number];

// The Feed's "worlds": what the queue's demo jobs make, three in each ratio. A video job's result is
// the poster of one of the Feed's clips, and the clip plays when it's opened. The prompts are the
// Feed's own.
export const imageResults: Record<ResultRatio, FeedResult[]> = {
  '16:9': [
    { id: '0q7m07er7p', width: 2048, height: 1152, thumbhash: 'ntcJJIZph3iNd3hwd3hncHMHNw==', description: 'A cable ferry crossing a wide river at blue hour', prompt: 'A cable ferry crossing a wide river, at blue hour, long lens compression, cream and racing green, soft editorial photograph, natural light' },
    { id: 'pss10hmgv1', width: 2048, height: 1152, thumbhash: 'XCgONIx3h3ePeId0iIdngHUHeA==', description: 'A greenhouse colony on a red desert planet at sunset', prompt: 'A greenhouse colony on a red desert planet, at sunset, low angle, chrome and sky blue, dreamy painted look, soft brushwork, luminous color' },
    { id: 'senhqf4mdi', width: 2048, height: 1152, thumbhash: '1icOFIZneHiPiHd3d4aGin/3iA==', description: 'A small camper van at a mountain overlook under a full moon, seen from far above', prompt: 'A small camper van parked at a mountain overlook, seen from far above, under a full moon, wide-angle from eye level, pink alpenglow and indigo, soft editorial photograph, natural light' },
  ],
  '9:16': [
    { id: 'vavmkt81pr', width: 1152, height: 2048, thumbhash: 'UxgKHAZm94fIiXeImYdHcoAUBw==', description: 'A mint-green rowboat tied at a stone jetty at golden hour', prompt: 'A mint-green rowboat tied at a stone jetty, at golden hour, low angle, red and slate, soft editorial photograph, natural light' },
    { id: 'th862iupb2', width: 1152, height: 2048, thumbhash: '0vYBHAozt0kKeG1ydSt2cGYGeA==', description: 'A lone cyclist with a clear umbrella on a wet crosswalk after midnight, seen from above', prompt: 'A lone cyclist with a clear umbrella on a wet crosswalk, after midnight, wide-angle from above, magenta and cyan tones, 35mm film still, natural grain' },
    { id: '49itps9seh', width: 1152, height: 2048, thumbhash: 'GwgODAJI+Yh3iHd4iIdckJMHaQ==', description: 'A wooden boardwalk crossing a foggy bog at dawn, seen from the air', prompt: 'A wooden boardwalk crossing a foggy bog, at dawn, aerial view, soft grey and rust, 35mm film still, natural grain' },
  ],
  '1:1': [
    { id: 'e8bqjenrvd', width: 2048, height: 2048, thumbhash: 'lTgKHwZod3ePh4eAh1iHmJiHh3gIeIoA', description: 'A floating island city tethered by cables, under twin moons', prompt: 'A floating island city tethered by cables, under twin moons, from a high vantage point, sunset orange and lilac, 35mm film still, natural grain' },
    { id: 'ph7p33k5hl', width: 2048, height: 2048, thumbhash: 'ldcJDwJYd3d/eHdtd5d5h3d32X8C7i8A', description: 'A seaside swimming pool carved into the rocks under a storm sky', prompt: 'A seaside swimming pool carved into the rocks, under a dramatic storm sky, long lens compression, coral and aqua, 35mm film still, natural grain' },
    { id: 'tr0689j2np', width: 2048, height: 2048, thumbhash: 'EegFBwIYiHh/lIZthuZmp3iJt/J0M18O', description: 'A lone motorcycle at the mouth of a mountain tunnel at sunset', prompt: 'A lone motorcycle at the mouth of a mountain tunnel, at sunset with alpenglow, from a high vantage point, deep greens and stone grey, dreamy painted look, soft brushwork, luminous color' },
  ],
  '3:4': [
    { id: '169qh68dam', width: 1536, height: 2048, thumbhash: 'lNcJHQbHaXqGKSjniHB5iAdxdgCH', description: 'A hot air balloon being inflated in a field at blue hour', prompt: 'A hot air balloon being inflated in a field, at blue hour, three-quarter view, teal and orange, 35mm film still, natural grain' },
    { id: 'vpng7tpsqm', width: 1536, height: 2048, thumbhash: 'jigKDQRYdq+Gh3iIhmEXhzyPoPU4', description: 'A floating market of hover boats on a canal at night', prompt: 'A floating market of hover boats on a canal, at night with glowing windows, long lens compression, sunset orange and lilac, 35mm film still, natural grain' },
    { id: '58i14fh6ak', width: 1536, height: 2048, thumbhash: '3jgSDQJ4Z494p4eYeHZ3hwmrhrBI', description: 'A lone road through a field of red rock spires at sunrise, seen from above', prompt: 'A lone road cutting through a field of red rock spires, at sunrise, from a high vantage point, sand and rose tones, dreamy painted look, soft brushwork, luminous color' },
  ],
};

export const videoResults: Record<ResultRatio, FeedClipResult[]> = {
  '16:9': [
    { id: '5blmqndubp', width: 1280, height: 720, duration: 5, thumbhash: 'jwcKFII5Z2iIiXZweHdKgMAUCA==', description: 'A glowing whale swimming across the night sky above the rooftops', prompt: 'The glowing whale swims slowly across the night sky above the rooftops, its tail moving gently, one continuous shot, no cuts' },
    { id: 't98ol32ncs', width: 1280, height: 720, duration: 5, thumbhash: 'lggKFIINhWl5mHiaZ3ePrPSgag==', description: 'Sun rays through the trees and thin mist over a lake', prompt: 'Sun rays shift through the trees, thin mist drifts over the lake and the reflections ripple gently, one continuous shot, no cuts' },
    { id: 'ujgrb2cklj', width: 1280, height: 720, duration: 5, thumbhash: '1jgKDIJHaIifh4iVeIVl13DkDg==', description: 'Dust drifting across a plain with a windmill and still water', prompt: 'Dust drifts across the plain, the windmill turns and the water ripples, slow aerial glide, one continuous shot, no cuts' },
  ],
  '9:16': [
    { id: 'qp6m7fe9h3', width: 720, height: 1280, duration: 5, thumbhash: 'zggKDAQHqGeYZ3iHh3dXkXAOCQ==', description: 'Paper lanterns in an alley in the drizzle, reflected on the wet ground', prompt: 'The paper lanterns sway gently as drizzle falls and their reflections ripple on the wet ground, slow push down the alley, one continuous shot, no cuts' },
    { id: '0ri4m7gpkm', width: 720, height: 1280, duration: 5, thumbhash: '1RcKBABo94mHiXunR4dcz431hw==', description: 'Storm clouds over a white village, with waves breaking on the rocks below', prompt: 'Storm clouds roll over the white village as waves break against the rocks below, static camera, one continuous shot, no cuts' },
    { id: '12tn2lr22k', width: 720, height: 1280, duration: 5, thumbhash: '0ggGDAJY6ncJh4SXqXhqha/U+Q==', description: 'A moose stepping through a misty pond', prompt: 'Mist drifts across the pond as the moose lifts its head and steps slowly through the water, one continuous shot, no cuts' },
  ],
  '1:1': [
    { id: 'diq0ej7dfu', width: 960, height: 960, duration: 5, thumbhash: 'GxgKDwB2d3eAiHiAd3h4d3d8t/Z4fI8K', description: 'A fox trotting across the snow through long tree shadows', prompt: 'The fox trots across the snow from right to left through the long tree shadows, one continuous shot, no cuts' },
    { id: '05umf6fcag', width: 960, height: 960, duration: 5, thumbhash: 'VhgKRwx4h3eMh3hwh1eHl4eHhweHeHAI', description: 'Oryx walking across a red dune', prompt: 'The oryx walk steadily across the red dune from left to right as sand drifts at their hooves, one continuous shot, no cuts' },
    { id: 'l24jto5qnb', width: 960, height: 960, duration: 5, thumbhash: 'XGkGBwJTyFVfl3h/dUaqRah4CsEI42UP', description: 'Water pouring off the edge of a floating island covered in flowers', prompt: 'Water pours steadily off the edge of the floating island and the flowers sway gently, static camera, one continuous shot, no cuts' },
  ],
  '3:4': [
    { id: '91ng5l6il9', width: 828, height: 1108, duration: 5, thumbhash: 'GQgOHQanZ3+IB1eoeHlYiGdwdAU3', description: 'A hot air balloon filling in a field', prompt: 'The hot air balloon sways as it fills and lifts a little while the grass ripples below, one continuous shot, no cuts' },
    { id: 'ac106bhn97', width: 828, height: 1108, duration: 5, thumbhash: '1vgRDQKGd394h3h4eIiHeJBlQAcn', description: 'A cable car gliding toward the peaks', prompt: 'The cable car glides slowly along its cable toward the peaks as soft light shifts on the slopes, one continuous shot, no cuts' },
    { id: '87tprt8ukc', width: 828, height: 1108, duration: 5, thumbhash: 'U7cJNQJmd4B3p3iIh3iIiIeAR/7Y', description: 'A school of silver fish swirling above the coral', prompt: 'The school of silver fish swirls and turns together above the coral as light shimmers in the water, one continuous shot, no cuts' },
  ],
};
