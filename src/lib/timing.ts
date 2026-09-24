import type { GameState } from './types';

// iTunes previews are normally 30 seconds. The fallback cycle includes a small
// loading allowance plus a five-second room breather. When audio actually ends,
// the shared deadline is tightened to exactly five seconds after that moment.
export const INTER_TRACK_DELAY_SECONDS = 5;
export const TRACK_CYCLE_SECONDS = 37;
export const TRACK_CYCLE_MS = TRACK_CYCLE_SECONDS * 1000;
export const INTER_TRACK_DELAY_MS = INTER_TRACK_DELAY_SECONDS * 1000;

export type TrackTiming = {
  remainingMs: number;
  remainingSeconds: number;
  progress: number;
  isComplete: boolean;
  isInterTrackDelay: boolean;
};

export type AutoStartTiming = {
  remainingMs: number;
  remainingSeconds: number;
  isActive: boolean;
};

export function getAutoStartTiming(gameState: GameState | null, now = Date.now()): AutoStartTiming {
  if (!gameState?.started || gameState.nowPlaying || typeof gameState.autoStartAt !== 'number') {
    return { remainingMs: 0, remainingSeconds: 0, isActive: false };
  }

  const remainingMs = Math.min(INTER_TRACK_DELAY_MS, Math.max(0, gameState.autoStartAt - now));
  return {
    remainingMs,
    remainingSeconds: Math.ceil(remainingMs / 1000),
    isActive: remainingMs > 0,
  };
}

export function getTrackTiming(gameState: GameState | null, now = Date.now()): TrackTiming {
  if (!gameState?.started || !gameState.nowPlaying) {
    return { remainingMs: 0, remainingSeconds: 0, progress: 0, isComplete: false, isInterTrackDelay: false };
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
    isInterTrackDelay: typeof gameState.trackEndedAt === 'number' && now < endsAt,
  };
}
