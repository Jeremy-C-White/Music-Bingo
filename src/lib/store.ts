import { db } from './firebase';
import { doc, getDoc, setDoc, onSnapshot, collection, query, orderBy, addDoc, updateDoc } from 'firebase/firestore';
import { GameState, Claim } from './types';
import { songs, WIN_PATTERNS } from './data';

export const GAME_DOC_ID = 'current';
const gameDocRef = doc(db, 'games', GAME_DOC_ID);
const claimsCollection = collection(db, 'games', GAME_DOC_ID, 'claims');

export function subscribeToGameState(callback: (state: GameState | null) => void) {
  return onSnapshot(gameDocRef, (docSnap) => {
    if (docSnap.exists()) {
      callback(docSnap.data() as GameState);
    } else {
      callback(null);
    }
  });
}

export function subscribeToClaims(callback: (claims: Claim[]) => void) {
  const q = query(claimsCollection, orderBy('timestamp', 'asc'));
  return onSnapshot(q, (snapshot) => {
    const claims = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Claim));
    
    // Sort valid claims to assign positions
    let validCounter = 0;
    const processed = claims.map(c => {
      let position = undefined;
      if (c.status === 'valid') {
        validCounter++;
        position = validCounter;
      }
      return { ...c, position };
    });
    
    callback(processed);
  });
}

export async function startNewGame() {
  const sessionId = Date.now().toString();
  
  // Create or overwrite current game state
  await setDoc(gameDocRef, {
    sessionId,
    started: true,
    nowPlaying: null,
    history: [],
    visualizerAudioActive: false,
    updatedAt: Date.now()
  });
  
  return sessionId;
}

export async function resetGame() {
  await setDoc(gameDocRef, {
    sessionId: Date.now().toString(),
    started: false,
    nowPlaying: null,
    history: [],
    visualizerAudioActive: false,
    updatedAt: Date.now()
  });
}

export async function setNowPlaying(songKey: string, history: string[]) {
  await updateDoc(gameDocRef, {
    nowPlaying: songKey,
    history: history,
    updatedAt: Date.now()
  });
}

export async function setVisualizerAudioActive(active: boolean) {
  await updateDoc(gameDocRef, {
    visualizerAudioActive: active,
    updatedAt: Date.now()
  });
}

export async function submitClaim(playerName: string, boardSongs: string[], selected: boolean[], gameState: GameState) {
  // Integrity check
  if (boardSongs[12] !== 'FREE SPACE' || boardSongs.length !== 25) {
    throw new Error('Board data malformed.');
  }
  
  const historySet = new Set(gameState.history);
  if (gameState.nowPlaying) historySet.add(gameState.nowPlaying);
  
  const invalidMarks: { index: number; song: string }[] = [];
  for (let i = 0; i < 25; i++) {
    if (i === 12) continue; // FREE SPACE
    if (selected[i] && !historySet.has(boardSongs[i])) {
      invalidMarks.push({ index: i, song: boardSongs[i] });
    }
  }
  
  const validWinningLines: { label: string; indices: number[] }[] = [];
  let allDetectedLines = 0;
  
  const describePattern = (idx: number) => {
    if (idx <= 4) return 'Row ' + (idx + 1);
    if (idx <= 9) return 'Column ' + (idx - 4);
    if (idx === 10) return 'Diagonal ↘';
    if (idx === 11) return 'Diagonal ↙';
    return 'Line';
  };
  
  WIN_PATTERNS.forEach((pattern, idx) => {
    if (pattern.every(i => selected[i])) {
      allDetectedLines++;
      const patternValid = pattern.every(i => i === 12 || historySet.has(boardSongs[i]));
      if (patternValid) {
        validWinningLines.push({ label: describePattern(idx), indices: pattern });
      }
    }
  });
  
  let status: 'valid' | 'cheating' | 'no_line' = 'no_line';
  let reason = 'No complete bingo line detected on this board.';
  
  if (validWinningLines.length > 0) {
    status = 'valid';
    reason = '';
  } else if (allDetectedLines > 0 && invalidMarks.length > 0) {
    status = 'cheating';
    const bad = invalidMarks.slice(0, 5).map(m => m.song).join(', ');
    reason = 'Marked songs that were never called: ' + bad + (invalidMarks.length > 5 ? ', …' : '');
  }
  
  const claim: Omit<Claim, 'id' | 'position'> = {
    timestamp: Date.now(),
    playerName,
    sessionId: gameState.sessionId,
    songs: boardSongs,
    selected,
    status,
    reason,
    winningLines: validWinningLines,
    historyCountAtClaim: historySet.size,
    lastCalledAtClaim: gameState.nowPlaying || (gameState.history.length ? gameState.history[gameState.history.length - 1] : null)
  };
  
  await addDoc(claimsCollection, claim);
  return claim;
}

export async function dismissClaim(claimId: string) {
  // We can just add a 'dismissed' flag or delete it. Let's delete it.
  // Wait, no, we shouldn't delete claims entirely if we want them out of view for caller, 
  // but deletion is easiest. Let's delete it.
  const { deleteDoc, doc } = await import('firebase/firestore');
  await deleteDoc(doc(db, 'games', GAME_DOC_ID, 'claims', claimId));
}

export async function pingPresence(playerName: string) {
  if (!playerName) return;
  const playerRef = doc(db, 'games', GAME_DOC_ID, 'players', playerName);
  await setDoc(playerRef, {
    name: playerName,
    lastSeen: Date.now()
  });
}

export function subscribeToPlayerCount(callback: (count: number) => void) {
  const playersCollection = collection(db, 'games', GAME_DOC_ID, 'players');
  return onSnapshot(playersCollection, (snapshot) => {
    const now = Date.now();
    // Count players seen in the last 30 seconds
    const activeCount = snapshot.docs.filter(doc => {
      const data = doc.data();
      return (now - data.lastSeen) < 30000;
    }).length;
    callback(activeCount);
  });
}
