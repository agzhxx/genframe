// What a Studio job "makes": one of the Feed's images or clips (lib/feed-studio.ts), picked by the
// job's settings, never by its prompt. The kind and the shape always match. Then, among those, the
// clips of the camera move asked for, if the Feed has that move in that shape; then the ones the
// model picked made, if the Feed has its work there. Jobs with the same settings take what's left
// in turn, so three of them make three different things.

import type { CameraMove } from '@/lib/feed-camera-moves';
import { studioResults, type StudioRatio, type StudioResult } from '@/lib/feed-studio';
import type { GenerationJob, GenerationRequest } from '@/registry/lib/generation-queue-reducer';

/** A job's settings: what the results are picked by. */
export interface StudioSettings {
  kind: 'image' | 'video';
  ratio: StudioRatio;
  /** The model picked, by name, as lib/demo-models.ts has it. */
  model: string;
  /** The camera move asked for, for a video. */
  move?: CameraMove;
}

/**
 * A Studio job's request: the queue carries the settings along, and the media picked for it,
 * which the simulated generator hands back as its result.
 */
export interface StudioRequest extends GenerationRequest {
  ratio: StudioRatio;
  /** The model picked, by id. */
  model: string;
  move?: CameraMove;
  media: StudioResult;
}

export type StudioJob = GenerationJob<StudioRequest>;

// Narrows the candidates to the ones that pass, unless none do.
function prefer(candidates: StudioResult[], test: (candidate: StudioResult) => boolean) {
  const preferred = candidates.filter(test);
  return preferred.length > 0 ? preferred : candidates;
}

/** The results a job with these settings can make, in the order jobs take them. */
export function studioCandidates(settings: StudioSettings, results: readonly StudioResult[] = studioResults) {
  const { kind, ratio, model, move } = settings;
  const shaped = results.filter((result) => result.kind === kind && result.ratio === ratio);
  const moved = move ? prefer(shaped, (result) => result.kind === 'video' && result.move === move) : shaped;
  return prefer(moved, (result) => result.model === model);
}

/** What the job with these settings makes on its `turn` (0 for the first such job, then 1…). */
export function pickResult(settings: StudioSettings, turn: number, results: readonly StudioResult[] = studioResults) {
  const candidates = studioCandidates(settings, results);
  const result = candidates[turn % candidates.length];
  if (!result) throw new Error(`The Feed has no ${settings.ratio} ${settings.kind} for the Studio`);
  return result;
}

/** The same for jobs with the same settings: the Studio counts their turns by it. */
export function settingsKey({ kind, ratio, model, move }: StudioSettings) {
  return [kind, ratio, model, move ?? 'no move'].join(' · ');
}
