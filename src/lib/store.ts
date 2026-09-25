import { handleFirestoreError, OperationType } from './firebase-error';
import { db } from './firebase';
import { doc, getDoc, setDoc, onSnapshot, collection, query, orderBy, addDoc, updateDoc, getDocs, deleteDoc, limit, runTransaction } from 'firebase/firestore';
import { GameState, Claim } from './types';
import { songs, WIN_PATTERNS } from './data';
import { INTER_TRACK_DELAY_MS, TRACK_CYCLE_MS } from './timing';

export const GAME_DOC_ID = 'current';
const gameDocRef = doc(db, 'games', GAME_DOC_ID);
const claimsCollection = collection(db, 'games', GAME_DOC_ID, 'claims');
const playersCollection = collection(db, 'games', GAME_DOC_ID, 'players');
const reactionsCollection = collection(db, 'games', GAME_DOC_ID, 'reactions');

function normalizeGameState(data: Partial<GameState>): GameState {
  return {
    sessionId: typeof data.sessionId === 'string' ? data.sessionId : '',
    started: data.started === true,
    nowPlaying: typeof data.nowPlaying === 'string' ? data.nowPlaying : null,
    history: Array.isArray(data.history) ? data.history : [],
    visualizerAudioActive: data.visualizerAudioActive === true,
    visualizerAudioUpdatedAt: typeof data.visualizerAudioUpdatedAt === 'number' ? data.visualizerAudioUpdatedAt : null,
    updatedAt: typeof data.updatedAt === 'number' ? data.updatedAt : 0,
    trackStartedAt: typeof data.trackStartedAt === 'number' ? data.trackStartedAt : null,
    nextTrackAt: typeof data.nextTrackAt === 'number' ? data.nextTrackAt : null,
    trackEndedAt: typeof data.trackEndedAt === 'number' ? data.trackEndedAt : null,
    autoStartAt: typeof data.autoStartAt === 'number' ? data.autoStartAt : null,
    autoCallerEnabled: data.autoCallerEnabled === true,
    winnerCount: typeof data.winnerCount === 'number' ? data.winnerCount : 0,
  };
}

function verifyClaim(boardSongs: string[], selected: boolean[], gameState: GameState) {
  if (boardSongs.length !== 25 || selected.length !== 25 || boardSongs[12] !== 'FREE SPACE') {
    return {
      status: 'cheating' as const,
      reason: 'Board data was incomplete or malformed.',
      winningLines: [] as { label: string; indices: number[] }[],
      historyCountAtClaim: gameState.history.length + (gameState.nowPlaying ? 1 : 0),
      lastCalledAtClaim: gameState.nowPlaying || (gameState.history[gameState.history.length - 1] ?? null),
    };
  }

  const historySet = new Set(gameState.history);
  if (gameState.nowPlaying) historySet.add(gameState.nowPlaying);
  const invalidMarks = boardSongs.filter((song, index) => index !== 12 && selected[index] && !historySet.has(song));
  const validWinningLines: { label: string; indices: number[] }[] = [];
  let detectedLineCount = 0;

  const describePattern = (index: number) => {
    if (index <= 4) return `Row ${index + 1}`;
    if (index <= 9) return `Column ${index - 4}`;
    return index === 10 ? 'Diagonal ↘' : 'Diagonal ↙';
  };

  WIN_PATTERNS.forEach((pattern, index) => {
    if (!pattern.every(tile => selected[tile])) return;
    detectedLineCount += 1;
    if (pattern.every(tile => tile === 12 || historySet.has(boardSongs[tile]))) {
      validWinningLines.push({ label: describePattern(index), indices: pattern });
    }
  });

  let status: Claim['status'] = 'no_line';
  let reason = 'No complete bingo line detected on this board.';
  if (validWinningLines.length > 0) {
    status = 'valid';
    reason = '';
  } else if (detectedLineCount > 0 && invalidMarks.length > 0) {
    status = 'cheating';
    const bad = invalidMarks.slice(0, 5).join(', ');
    reason = `Marked songs that were never called: ${bad}${invalidMarks.length > 5 ? ', …' : ''}`;
  }

  return {
    status,
    reason,
    winningLines: validWinningLines,
    historyCountAtClaim: historySet.size,
    lastCalledAtClaim: gameState.nowPlaying || (gameState.history[gameState.history.length - 1] ?? null),
  };
}

function hashClaimKey(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

async function clearCollection(collectionRef: typeof claimsCollection) {
  const snapshot = await getDocs(collectionRef);
  await Promise.all(snapshot.docs.map(item => deleteDoc(item.ref)));
}

async function clearRoundData() {
  await Promise.all([
    clearCollection(claimsCollection),
    clearCollection(reactionsCollection),
    clearCollection(playersCollection),
  ]);
}

export function subscribeToGameState(callback: (state: GameState | null) => void) {
  return onSnapshot(gameDocRef, (docSnap) => {
    if (docSnap.exists()) {
      const data = docSnap.data() as Partial<GameState>;
      callback(normalizeGameState(data));
    } else {
      callback(null);
    }
  }, (err) => handleFirestoreError(err, OperationType.GET, 'games/current'));
}

export function subscribeToClaims(callback: (claims: Claim[]) => void) {
  const q = query(claimsCollection, orderBy('timestamp', 'asc'));
  return onSnapshot(q, async (snapshot) => {
    try {
      const currentGameSnapshot = await getDoc(gameDocRef);
      if (!currentGameSnapshot.exists()) {
        callback([]);
        return;
      }
      const currentGame = normalizeGameState(currentGameSnapshot.data() as Partial<GameState>);
      let fallbackPosition = 0;
      const processed = snapshot.docs.map(item => {
        const claim = { id: item.id, ...item.data() } as Claim;
        const calledAtClaim = [...currentGame.history, ...(currentGame.nowPlaying ? [currentGame.nowPlaying] : [])]
          .slice(0, Math.max(0, claim.historyCountAtClaim || 0));
        const claimTimeGame = {
          ...currentGame,
          history: calledAtClaim,
          nowPlaying: null,
        };
        const verification = verifyClaim(
          Array.isArray(claim.songs) ? claim.songs : [],
          Array.isArray(claim.selected) ? claim.selected : [],
          claimTimeGame
        );
        const storedPosition = verification.status === 'valid' && typeof claim.position === 'number'
          ? claim.position
          : undefined;
        if (storedPosition) fallbackPosition = Math.max(fallbackPosition, storedPosition);
        const position = verification.status === 'valid'
          ? storedPosition ?? ++fallbackPosition
          : undefined;
        return { ...claim, ...verification, position };
      });
      callback(processed);
    } catch (err) {
      handleFirestoreError(err, OperationType.GET, 'games/current');
      callback([]);
    }
  }, (err) => handleFirestoreError(err, OperationType.LIST, 'games/current/claims'));
}

export async function startNewGame() {
  try {
  const sessionId = Date.now().toString();
  await clearRoundData();
  
  // Create or overwrite current game state
  await setDoc(gameDocRef, {
    sessionId,
    started: true,
    nowPlaying: null,
    history: [],
    visualizerAudioActive: false,
    visualizerAudioUpdatedAt: null,
    updatedAt: Date.now(),
    trackStartedAt: null,
    nextTrackAt: null,
    trackEndedAt: null,
    autoStartAt: null,
    autoCallerEnabled: false,
    winnerCount: 0
  });
  
  return sessionId;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, 'games/current');
    throw err;
  }
}

export async function resetGame() {
  try {
    await setDoc(gameDocRef, {
      sessionId: Date.now().toString(),
      started: false,
      nowPlaying: null,
      history: [],
      visualizerAudioActive: false,
      visualizerAudioUpdatedAt: null,
      updatedAt: Date.now(),
      trackStartedAt: null,
      nextTrackAt: null,
      trackEndedAt: null,
      autoStartAt: null,
      autoCallerEnabled: false,
      winnerCount: 0
    });

    await clearRoundData();
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, 'games/current');
    throw err;
  }
}

export async function setNowPlaying(songKey: string, expectedNowPlaying: string | null, expectedSessionId: string): Promise<boolean> {
  try {
    return await runTransaction(db, async transaction => {
      const snapshot = await transaction.get(gameDocRef);
      if (!snapshot.exists()) return false;

      const data = snapshot.data() as Partial<GameState>;
      const currentSong = typeof data.nowPlaying === 'string' ? data.nowPlaying : null;
      if (
        data.started !== true ||
        data.sessionId !== expectedSessionId ||
        currentSong !== expectedNowPlaying ||
        currentSong === songKey
      ) {
        return false;
      }

      const liveHistory = Array.isArray(data.history) ? [...data.history] : [];
      if (currentSong && liveHistory[liveHistory.length - 1] !== currentSong) {
        liveHistory.push(currentSong);
      }

      const trackStartedAt = Date.now();
      transaction.update(gameDocRef, {
        nowPlaying: songKey,
        history: liveHistory,
        updatedAt: trackStartedAt,
        trackStartedAt,
        nextTrackAt: trackStartedAt + TRACK_CYCLE_MS,
        trackEndedAt: null,
        autoStartAt: null,
      });
      return true;
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, 'games/current');
    throw err;
  }
}

export async function scheduleAutoCallerStart() {
  try {
    await runTransaction(db, async transaction => {
      const snapshot = await transaction.get(gameDocRef);
      if (!snapshot.exists()) return;

      const data = snapshot.data() as Partial<GameState>;
      if (data.started !== true || data.autoCallerEnabled !== true || data.nowPlaying || typeof data.autoStartAt === 'number') return;

      const now = Date.now();
      transaction.update(gameDocRef, {
        autoStartAt: now + INTER_TRACK_DELAY_MS,
        updatedAt: now,
      });
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, 'games/current');
    throw err;
  }
}

export async function setAutoCallerEnabled(enabled: boolean) {
  try {
    await runTransaction(db, async transaction => {
      const snapshot = await transaction.get(gameDocRef);
      if (!snapshot.exists()) return;

      const data = snapshot.data() as Partial<GameState>;
      const now = Date.now();
      const resumeFinishedTrack = enabled
        && Boolean(data.nowPlaying)
        && typeof data.trackEndedAt === 'number';

      transaction.update(gameDocRef, {
        autoCallerEnabled: enabled,
        ...(enabled
          ? (resumeFinishedTrack ? { nextTrackAt: now + INTER_TRACK_DELAY_MS } : {})
          : { autoStartAt: null, nextTrackAt: null }),
        updatedAt: now,
      });
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, 'games/current');
    throw err;
  }
}

export async function cancelAutoCallerStart() {
  try {
    await runTransaction(db, async transaction => {
      const snapshot = await transaction.get(gameDocRef);
      if (!snapshot.exists()) return;

      const data = snapshot.data() as Partial<GameState>;
      if (data.nowPlaying || typeof data.autoStartAt !== 'number') return;

      transaction.update(gameDocRef, {
        autoStartAt: null,
        updatedAt: Date.now(),
      });
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, 'games/current');
    throw err;
  }
}

export async function markTrackEnded(songKey: string) {
  try {
    await runTransaction(db, async transaction => {
      const snapshot = await transaction.get(gameDocRef);
      if (!snapshot.exists()) return;

      const data = snapshot.data() as Partial<GameState>;
      if (data.nowPlaying !== songKey || typeof data.trackEndedAt === 'number') return;

      const trackEndedAt = Date.now();
      transaction.update(gameDocRef, {
        trackEndedAt,
        nextTrackAt: data.autoCallerEnabled === true ? trackEndedAt + INTER_TRACK_DELAY_MS : null,
        updatedAt: trackEndedAt,
      });
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, 'games/current');
  }
}

export async function setVisualizerAudioActive(active: boolean) {
  try {
  await updateDoc(gameDocRef, {
    visualizerAudioActive: active,
    visualizerAudioUpdatedAt: Date.now(),
    updatedAt: Date.now()
  });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, 'games/current');
    throw err;
  }
}

export async function submitClaim(playerName: string, boardSongs: string[], selected: boolean[], gameState: GameState) {
  try {
    if (boardSongs.length !== 25 || selected.length !== 25 || boardSongs[12] !== 'FREE SPACE') {
      throw new Error('Your saved board is incomplete. Refresh the board and try again.');
    }

    const normalizedName = playerName.trim();
    if (normalizedName.length < 2) throw new Error('Please enter your player name before calling bingo.');

    const claimKeySource = `${gameState.sessionId}|${normalizedName.toLowerCase()}|${boardSongs.join('|')}`;
    const validClaimId = `${gameState.sessionId}_${hashClaimKey(claimKeySource)}`;
    const attemptId = `${validClaimId}_${hashClaimKey(selected.map(marked => marked ? '1' : '0').join(''))}`;

    const existingClaimsSnapshot = await getDocs(claimsCollection);
    const existingValidPositions = existingClaimsSnapshot.docs
      .map(item => item.data() as Partial<Claim>)
      .filter(item => item.sessionId === gameState.sessionId && item.status === 'valid')
      .map(item => typeof item.position === 'number' ? item.position : 0);
    const existingWinnerBaseline = Math.max(existingValidPositions.length, 0, ...existingValidPositions);

    return await runTransaction(db, async transaction => {
      const currentGameSnapshot = await transaction.get(gameDocRef);
      if (!currentGameSnapshot.exists()) throw new Error('The current game could not be found.');

      const currentGame = normalizeGameState(currentGameSnapshot.data() as Partial<GameState>);
      if (!currentGame.started || currentGame.sessionId !== gameState.sessionId) {
        throw new Error('That round has ended. Return to the board for the current game.');
      }

      const verification = verifyClaim(boardSongs, selected, currentGame);
      // A valid card keeps one stable ID so refreshing cannot create a second
      // winner. Failed attempts include the marked squares, so correcting the
      // board creates a fresh attempt instead of returning the old failure.
      const claimRef = doc(claimsCollection, verification.status === 'valid' ? validClaimId : attemptId);
      const existingClaimSnapshot = await transaction.get(claimRef);
      if (existingClaimSnapshot.exists()) {
        return { id: existingClaimSnapshot.id, ...existingClaimSnapshot.data() } as Claim;
      }

      const currentWinnerCount = Math.max(currentGame.winnerCount || 0, existingWinnerBaseline);
      const position = verification.status === 'valid' ? currentWinnerCount + 1 : undefined;
      const claim: Claim = {
        id: claimRef.id,
        timestamp: Date.now(),
        playerName: normalizedName,
        sessionId: currentGame.sessionId,
        songs: boardSongs,
        selected,
        ...verification,
        ...(position ? { position } : {}),
      };

      if (position) {
        transaction.update(gameDocRef, { winnerCount: position });
      }
      const { id: _id, ...storedClaim } = claim;
      transaction.set(claimRef, storedClaim);
      return claim;
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, 'games/current/claims');
    throw err;
  }
}

export async function dismissClaim(claimId: string) {
  try {
    await deleteDoc(doc(db, 'games', GAME_DOC_ID, 'claims', claimId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, 'games/current/claims');
    throw err;
  }
}

export async function pingPresence(playerName: string) {
  if (!playerName || !playerName.trim()) return;
  const cleanName = playerName.trim();
  const playerDocId = cleanName.replace(/[/\\?%*:|"<>#]/g, '_');
  const playerRef = doc(db, 'games', GAME_DOC_ID, 'players', playerDocId);
  try {
    await setDoc(playerRef, {
      name: cleanName,
      lastSeen: Date.now()
    });
  } catch (err) {
    console.error("Presence ping failed:", err);
  }
}

export interface Reaction {
  id: string;
  playerName: string;
  emoji: string;
  sessionId?: string;
  timestamp: number;
}

export function subscribeToReactions(callback: (reactions: Reaction[]) => void, sessionId = '', since = Date.now()) {
  const q = query(reactionsCollection, orderBy('timestamp', 'desc'), limit(30));
  
  return onSnapshot(q, (snapshot) => {
    const reactions = snapshot.docs
      .map(doc => ({ id: doc.id, ...doc.data() } as Reaction))
      .filter(reaction => reaction.timestamp >= since && (!sessionId || reaction.sessionId === sessionId));
    callback(reactions);
  }, (err) => handleFirestoreError(err, OperationType.LIST, 'games/current/reactions'));
}

export async function sendReaction(playerName: string, emoji: string, sessionId: string) {
  if (!playerName || !playerName.trim() || !emoji) throw new Error("Missing name or emoji");
  try {
    await addDoc(reactionsCollection, {
      playerName: playerName.trim(),
      emoji,
      sessionId,
      timestamp: Date.now()
    });
  } catch (err) {
    console.error("Failed to send reaction:", err);
    throw err;
  }
}

export function subscribeToPlayerCount(callback: (count: number) => void) {
  let latestPlayers: { lastSeen?: number }[] = [];
  const publishCount = () => {
    const now = Date.now();
    const activeCount = latestPlayers.filter(player => player.lastSeen && (now - player.lastSeen) < 30000).length;
    callback(activeCount);
  };
  const unsubscribe = onSnapshot(playersCollection, (snapshot) => {
    latestPlayers = snapshot.docs.map(item => item.data() as { lastSeen?: number });
    publishCount();
  }, (err) => handleFirestoreError(err, OperationType.LIST, 'games/current/players'));
  const interval = window.setInterval(publishCount, 5000);
  return () => {
    window.clearInterval(interval);
    unsubscribe();
  };
}
