export interface GameState {
  sessionId: string;
  started: boolean;
  nowPlaying: string | null;
  history: string[];
  visualizerAudioActive: boolean;
  updatedAt: number;
}

export interface Claim {
  id?: string;
  timestamp: number;
  playerName: string;
  sessionId: string;
  songs: string[];
  selected: boolean[];
  status: 'valid' | 'cheating' | 'no_line';
  reason?: string;
  winningLines?: { label: string; indices: number[] }[];
  historyCountAtClaim: number;
  lastCalledAtClaim: string | null;
  position?: number;
}
