import type { GameState } from './types';

// iTunes previews are normally 30 seconds. Two extra seconds give the room a
// natural breath before Auto-Caller advances, while keeping one shared clock.
export const TRACK_CYCLE_SECONDS = 32;
export const TRACK_CYCLE_MS = TRACK_CYCLE_SECONDS * 1000;

export type TrackTiming = {
  remainingMs: number;
  remainingSeconds: number;
  progress: number;
  isComplete: boolean;
};

export function getTrackTiming(gameState: GameState | null, now = Date.now()): TrackTiming {
  if (!gameState?.started || !gameState.nowPlaying) {
    return { remainingMs: 0, remainingSeconds: 0, progress: 0, isComplete: false };
  }

  const startedAt = gameState.trackStartedAt
    ?? (gameState.nextTrackAt ? gameState.nextTrackAt - TRACK_CYCLE_MS : gameState.updatedAt);
  const endsAt = gameState.nextTrackAt ?? startedAt + TRACK_CYCLE_MS;
  const duration = Math.max(1000, endsAt - startedAt);
  const elapsed = Math.max(0, now - startedAt);
  const remainingMs = Math.min(duration, Math.max(0, endsAt - now));

  return {
    remainingMs,
    remainingSeconds: Math.ceil(remainingMs / 1000),
    progress: Math.min(1, elapsed / duration),
    isComplete: now >= endsAt,
  };
}
