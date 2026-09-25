import React, { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { subscribeToGameState, subscribeToClaims, startNewGame, resetGame, setNowPlaying, markTrackEnded, scheduleAutoCallerStart, setAutoCallerEnabled, dismissClaim, subscribeToPlayerCount } from '../lib/store';
import { GameState, Claim } from '../lib/types';
import { songs, shuffle, splitSong, getSongFact, songTeasers } from '../lib/data';
import { lookupPreview } from '../lib/itunes';
import { Disc, Radio, Trophy, AlertTriangle, Sparkles, Clock, MessageSquareQuote, Mic2, RefreshCw, ChevronLeft, ChevronRight, Play, Volume2, VolumeX, Keyboard } from 'lucide-react';
import { playCallSound } from '../lib/soundEffects';
import { getAutoStartTiming, getTrackTiming } from '../lib/timing';

type HostCue = {
  kicker: string;
  title: string;
  script: string;
  hostNote?: string;
};

type SmartGameRead = {
  onMic: string;
  note: string;
};

// NOTE: On-mic DJ lines are read as a song ends. They never reveal the title
// or artist. `teaser` is the era-and-style line already shown on the stage
// (e.g. "An '80s Synth-Pop Smash"); lines that use it have a plain version for
// songs without one.
type DjLineContext = { current: number; teaser: string | null };
type DjLine = (context: DjLineContext) => string | null;

const lowerFirst = (text: string) => text.charAt(0).toLowerCase() + text.slice(1);

const STANDARD_DJ_LINES: DjLine[] = [
  ({ current }) => `Alright, that's Track ${current}. Check your corners, check your diagonals... let's see what the next drop has in store for us.`,
  ({ current }) => `And that's a wrap on Track ${current}! Eyes on your card: rows, columns, diagonals. Next song coming up.`,
  ({ current }) => `Track ${current} is in the books. If you got it, mark it. If you didn't, there's always the next one. Here we go!`,
  ({ teaser }) => teaser ? `That was ${lowerFirst(teaser)}. Did it land on your card? Mark it, and let's keep the music coming.` : `Did that one land on your card? Mark it, and let's keep the music coming.`,
  () => `Quick board check! Anybody sitting on four in a row? Don't be shy, because the next song could be the one. Let's hear it.`,
  ({ current }) => `Track ${current} fades out... and somewhere in this room, a card just got a whole lot closer to BINGO. Next track!`,
  () => `If you knew that one in two seconds flat, take a bow. If not, no worries, the next song is already cued up.`,
  ({ current }) => `Track ${current}, done and dusted. Remember, that center square is free, so the middle row, the middle column and both diagonals only need four. Next one!`,
  ({ current, teaser }) => teaser ? `That was ${lowerFirst(teaser)}, and that's Track ${current} for the books. Corners, rows, diagonals, check 'em all. Here comes the next one.` : `That's Track ${current} for the books. Corners, rows, diagonals, check 'em all. Here comes the next one.`,
  ({ current }) => `Alright, music fans, that's Track ${current}. Scan that card, and let's drop the next one.`,
  () => `One more song closer to a winner! If you've got a full line, hit CALL BINGO right now. Otherwise, let's keep rolling.`,
  ({ current }) => `Track ${current} is history. Find the square you're one away from and keep your ears open for it. Here we go!`,
  ({ current }) => `Nice! That's ${current} tracks deep. The cards are filling up, so check every line before the next beat drops.`,
  ({ teaser }) => teaser ? `That was ${lowerFirst(teaser)}. Hope your card was ready for it! Let's see what the next track brings.` : `Hope your card was ready for that one! Let's see what the next track brings.`,
  () => `Let's pause the dance moves for one second and check those boards. Got it? Great. Next song, coming right up!`,
  ({ current }) => `And scene! Track ${current} is complete. If you're waiting on one square, now's the time to make some noise. Next track!`,
  ({ current }) => `Every song on this playlist is somebody's winning square. Was Track ${current} yours? Mark it, and let's keep going.`,
  ({ current }) => `Keep those cards open and those ears sharp. Track ${current} is done, and the next one's about to hit.`,
  ({ current }) => `That's the end of Track ${current}. Double-check your marks and only mark what you actually heard. On to the next!`,
  () => `Hope that one got you moving! Take a breath, take a look at your board, and let's find out what's next.`,
];

const FINAL_STRETCH_LINES: DjLine[] = [
  ({ current }) => `We're deep in the final stretch, finishing up Track ${current}. Only a few songs are left in the vault, which means somebody is dangerously close. If five are connected, hit CALL BINGO now. Let's spin the next one.`,
  ({ current }) => `Track ${current} is done, and the vault is almost empty. Every song left could finish somebody's line, so check every row, column and diagonal. Here comes the next one!`,
  () => `Pressure's on, everybody! Just a handful of songs to go. Look for that one missing square and keep your finger ready on CALL BINGO. Next track!`,
  ({ current }) => `That's Track ${current}, and we're running out of music. Somebody has to be one square away... is it you? Let's find out.`,
];

/** Stable per-game shuffle so lines don't repeat until the list runs out, and each game plays them in a different order. */
function seededOrder(length: number, seed: string): number[] {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) hash = Math.imul(hash ^ seed.charCodeAt(index), 16777619);
  // mulberry32: small, well-mixed PRNG so different games get different orders.
  let state = hash >>> 0;
  const random = () => {
    state = (state + 0x6D2B79F5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const order = Array.from({ length }, (_, index) => index);
  for (let index = length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [order[index], order[swap]] = [order[swap], order[index]];
  }
  return order;
}

function pickDjLine(lines: DjLine[], seed: string, step: number, context: DjLineContext): string {
  const order = seededOrder(lines.length, seed);
  for (let offset = 0; offset < lines.length; offset += 1) {
    const text = lines[order[(Math.max(0, step) + offset) % lines.length]](context);
    if (text) return text;
  }
  return lines[0]({ ...context, teaser: null }) ?? '';
}

function getPregameCues(activePlayers: number): HostCue[] {
  const roomStatus = activePlayers > 0
    ? `${activePlayers === 1 ? 'Our first player is' : `${activePlayers} players are`} already checked in, and we're about to turn this room into a music party.`
    : 'As everyone finishes joining, get your bingo card open and make sure you can hear the shared music.';

  const cues: HostCue[] = [
    {
      kicker: 'Opening • Welcome the Room',
      title: 'Welcome to Music Bingo',
      script: `What is up, everybody! Welcome to Music Bingo, where your playlist knowledge meets a little bit of luck. ${roomStatus} You don't need to sing on key, know every artist, or have perfect dance moves. You just need to listen, find the songs on your card, and be ready to make some noise.`,
      hostNote: 'Read this aloud, then click Next Cue (or press →). The next three cues explain how to play, so read every cue before you press Start Game. Before you begin: most players checked in, the stage screen visible, and the room can hear the music.'
    },
    {
      kicker: 'Rules • Listen and Identify',
      title: 'How Each Track Works',
      script: "Alright, everybody, eyes up here for thirty seconds. There are only three rules, and knowing them is the difference between winning and watching somebody else win. Rule one: I'll play a short clip from one song at a time. Listen for the melody, the chorus, or anything that helps you recognize it. I won't be saying the song name, so that part is all on your ears! Keep one eye on your card, because the clips keep moving and every track could be the square you need.",
      hostNote: 'How to play, part 1: listening. Read it, then click Next Cue. During the game, never say a song title or artist out loud.'
    },
    {
      kicker: 'Rules • Mark the Card',
      title: 'Find It and Mark It',
      script: "Rule two: if you recognize the song and it's anywhere on your card, click or tap that square to mark it. The FREE space in the middle is already marked for you. Only mark songs that have actually played, and if you mark one by mistake, just click it again to undo it.",
      hostNote: 'How to play, part 2: marking the card. Read it, then click Next Cue. If anyone looks unsure, point out the FREE center square and let them try marking and unmarking a square.'
    },
    {
      kicker: 'Rules • Call Bingo',
      title: 'How to Win',
      script: "Rule three: to win, get five marked squares in a row: across, up and down, or corner to corner. The moment your line is complete, hit the CALL BINGO button on your card. It comes straight to me to check, so don't wait, don't whisper it, and definitely don't let somebody else beat you to the button!",
      hostNote: 'How to play, part 3: winning. Read it, then click Next Cue. During the game, when a Bingo claim comes in, pause and only announce a winner once the claim shows Valid.'
    },
    {
      kicker: 'Final Check • Build the Energy',
      title: 'Ready to Start the Show',
      script: "One more thing: hit the React button at the top of your card anytime to send some energy to the big screen. Fire, dancing, rock hands, whatever fits the moment, let's see it. Cards ready? Volume up? Competitive spirit activated? Then let's play Music Bingo!",
      hostNote: 'Last cue. Read it, then press Start Game. Quick check first: the player count has settled, stage sound is on, and only one screen is playing audio so there is no echo.'
    }
  ];

  // Tell the host where they are in the intro so they click through all of it.
  return cues.map((cue, index) => ({
    ...cue,
    hostNote: `Step ${index + 1} of ${cues.length}: ${cue.hostNote}`,
  }));
}

function getLiveHostCue(gameState: GameState | null, claims: Claim[], poolLength: number, variation: number): HostCue {
  if (!gameState?.started) {
    return { kicker: 'Lobby Open', title: 'Welcome the Players', script: "Welcome, everybody, to Music Bingo! Get your card open, make sure you can hear the music, and get ready to test that playlist knowledge.", hostNote: 'Step through the intro cues below before pressing Start Game; they explain how to play.' };
  }

  const sessionClaims = claims.filter(claim => !gameState.sessionId || claim.sessionId === gameState.sessionId);
  const validClaims = sessionClaims.filter(claim => claim.status === 'valid');
  const latestWinner = validClaims.slice().sort((a, b) => Number(b.timestamp) - Number(a.timestamp))[0];

  if (latestWinner) {
    return { kicker: 'Winner Moment • Pause the Music', title: 'We Have an Official Bingo', script: `Hold everything! We have a bingo from ${latestWinner.playerName}, and I've checked the card: that line is complete and official. We have our winner! Everybody light up the reactions and make some noise for our Music Bingo champion!`, hostNote: 'Pause Auto-Caller and the music. Handle any prize or house rules, then use End & Reset only when the room is ready; resetting clears the current claims.' };
  }

  if (!gameState.nowPlaying) {
    return { kicker: 'Game Live • First Track Ready', title: 'Kick Off the Music', script: "The room is ready, the cards are live, and the only thing missing is the music. Remember, only mark a square when you recognize a song that's on your own card. Let's drop the very first track and get this game moving!", hostNote: 'Check that the Visualizer has sound and the Caller is not also playing audio. Once the room confirms they can hear, play the first song.' };
  }

  const currentTrackNumber = gameState.history.length + 1;
  const setNumber = Math.floor((currentTrackNumber - 1) / 5) + 1;

  if (currentTrackNumber === 1) {
    return { kicker: 'Opening Drop • Track 01', title: 'The Game Is Officially Live', script: "That's our very first track in the books! If it's on your card, mark it, and get comfortable, because we're rolling right into track number two.", hostNote: 'Let the preview finish and allow a short marking pause. If the room looks confused, read the Song Trivia card without revealing the title or artist.' };
  }

  const lineContext: DjLineContext = {
    current: currentTrackNumber,
    teaser: songTeasers[gameState.nowPlaying] ?? null,
  };
  // Step through a per-game order, counting only the tracks that use the
  // regular DJ lines (not the every-fifth-track milestone cues), so no line
  // repeats until the whole list has been used. "New DJ Line" moves one further.
  let regularTracksBefore = 0;
  for (let track = 2; track < currentTrackNumber; track += 1) {
    if (track % 5 !== 0 && track % 5 !== 1) regularTracksBefore += 1;
  }
  const lineStep = regularTracksBefore + variation;

  if (poolLength <= 5) {
    return { kicker: 'Final Stretch • Pressure Is Up', title: 'Every Track Matters Now', script: pickDjLine(FINAL_STRETCH_LINES, `${gameState.sessionId}-final`, lineStep, lineContext), hostNote: 'Slow the pace slightly and watch the claim queue closely. If a claim arrives, pause before calling another track.' };
  }

  if (currentTrackNumber > 1 && currentTrackNumber % 5 === 1) {
    return { kicker: `Energy Shift • Set ${String(setNumber).padStart(2, '0')}`, title: 'Fresh Set, Fresh Chances', script: `That's ${currentTrackNumber} tracks down! Reset your focus, check your whole card, and let's kick off the next set of songs.`, hostNote: 'Use this transition to check the room volume and player energy. Read the Song Trivia card or take a short pause if the room needs a breather.' };
  }

  if (currentTrackNumber % 5 === 0) {
    return { kicker: `Milestone • ${currentTrackNumber} Tracks Reached`, title: 'Board Check', script: `And that's Track ${currentTrackNumber} in the books! Time for a board check. Take a quick second to look across your whole card: every row, every column, and both diagonals, because a winning line can sneak up on you. If you've got five in a row, call it now!`, hostNote: 'Hold for a few seconds so players can check their cards. Scan the claim queue before advancing to the next track.' };
  }

  return { kicker: `Live Mix • Wrapping Track ${String(currentTrackNumber).padStart(2, '0')}`, title: 'DJ Talk Track', script: pickDjLine(STANDARD_DJ_LINES, gameState.sessionId, lineStep, lineContext), hostNote: currentTrackNumber >= 12 ? 'Optional: read the Song Trivia card. Confirm the preview has ended and no claim is waiting before advancing.' : 'Wait for the preview to finish, scan the claim queue, and make sure the Auto-Caller pace still matches the room.' };
}

function getHostGameRead(gameState: GameState, claims: Claim[], poolLength: number, activePlayers: number): SmartGameRead | null {
  const tracksHeard = gameState.history.length + (gameState.nowPlaying ? 1 : 0);
  const sessionClaims = claims
    .filter(claim => !gameState.sessionId || claim.sessionId === gameState.sessionId)
    .sort((a, b) => Number(a.timestamp) - Number(b.timestamp));
  const latestClaim = sessionClaims[sessionClaims.length - 1];

  // The winner cue already contains the complete spoken announcement. Avoid
  // following it with a generic "anyone's game" line.
  if (sessionClaims.some(claim => claim.status === 'valid')) return null;

  if (tracksHeard === 0) {
    return {
      onMic: 'Every card starts even, and the first song could help anyone.',
      note: 'The round has not started yet. Every player is beginning from the same position.',
    };
  }

  const totalTracks = Math.max(1, tracksHeard + poolLength);
  const calledShare = Math.min(1, tracksHeard / totalTracks);
  const estimatedLineChancePerCard = 1 - (Math.pow(1 - Math.pow(calledShare, 4), 4) * Math.pow(1 - Math.pow(calledShare, 5), 8));
  const estimatedRoomChance = 1 - Math.pow(1 - estimatedLineChancePerCard, Math.max(1, activePlayers));
  const activeCardText = activePlayers > 0
    ? `${activePlayers} active card${activePlayers === 1 ? '' : 's'}`
    : 'the active cards';

  const openRoundPrefix = latestClaim && latestClaim.status !== 'valid'
    ? 'A claim was checked without confirming a winner, so everyone remains in the game. '
    : '';

  if (estimatedRoomChance < 0.12) {
    return {
      onMic: 'Plenty of music ahead—every card is live.',
      note: `${openRoundPrefix}Early round with ${activeCardText}: the board patterns are still wide open.`,
    };
  }
  if (estimatedRoomChance < 0.35) {
    return {
      onMic: 'The boards are taking shape, and this is still anyone’s game.',
      note: `${openRoundPrefix}The first promising patterns may be forming across ${activeCardText}, but there is no clear favorite.`,
    };
  }
  if (estimatedRoomChance < 0.68) {
    return {
      onMic: 'Every song matters now—and this is still anyone’s game.',
      note: `${openRoundPrefix}The round is heating up and some cards may be within a few helpful tracks.`,
    };
  }
  return {
    onMic: 'Stay with it—one track can change everything.',
    note: `${openRoundPrefix}This is a high-energy stretch: one well-placed song could complete a line on any active card.`,
  };
}
 
/**
 * Shrinks text inside a fixed-height box until it fits without scrolling, up to
 * `maxPx`. The box only has a fixed height on laptop/desktop screens; on phones
 * it grows with the text, so the preferred size is always used there.
 */
function useFitText(maxPx: number, minPx: number, contentKey: string) {
  const boxRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState(maxPx);

  useLayoutEffect(() => {
    const box = boxRef.current;
    const text = textRef.current;
    if (!box || !text) return;

    const fits = () => box.scrollHeight <= box.clientHeight + 1;
    const fit = () => {
      text.style.fontSize = `${maxPx}px`;
      if (fits()) { setSize(maxPx); return; }
      let low = minPx;
      let high = maxPx;
      while (high - low > 0.5) {
        const mid = (low + high) / 2;
        text.style.fontSize = `${mid}px`;
        if (fits()) low = mid; else high = mid;
      }
      text.style.fontSize = `${low}px`;
      setSize(low);
    };

    fit();
    const observer = new ResizeObserver(() => fit());
    observer.observe(box);
    return () => observer.disconnect();
  }, [maxPx, minPx, contentKey]);

  return { boxRef, textRef, size };
}

export default function Caller() {
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [claims, setClaims] = useState<Claim[]>([]);
  const [pool, setPool] = useState<string[]>([]);
  const [previewData, setPreviewData] = useState<{previewUrl: string; artworkUrl: string} | null>(null);
  const [activePlayers, setActivePlayers] = useState(0);
  
  const [callInFlight, setCallInFlight] = useState(false);
  const callInFlightRef = useRef(false);
  const autoStartInFlightRef = useRef(false);
  const audioRef = useRef<HTMLAudioElement>(null);
  const sessionIdRef = useRef<string | null>(null);
  const currentTrackRef = useRef<string | null>(null);
  
  // Upgraded: Host Volume & Audio Progress tracking
  const [volume, setVolume] = useState(0.6);
  const [audioProgress, setAudioProgress] = useState(0);
  const [isAudioLocked, setIsAudioLocked] = useState(false);
  
  const [showPreviewModal, setShowPreviewModal] = useState<Claim | null>(null);
  const [showResetModal, setShowResetModal] = useState(false);
  const [scriptFontSize, setScriptFontSize] = useState<'normal' | 'large' | 'xl'>('large');
  const [teleprompterStep, setTeleprompterStep] = useState(0);
  const [cueVariation, setCueVariation] = useState(0);
  
  const canRefreshLineRef = useRef(false);

  // Script sizes scale with the window height so big screens get big text.
  const [viewportHeight, setViewportHeight] = useState(() => (typeof window === 'undefined' ? 800 : window.innerHeight));
  const [viewportWidth, setViewportWidth] = useState(() => (typeof window === 'undefined' ? 1280 : window.innerWidth));
  useEffect(() => {
    const onResize = () => { setViewportHeight(window.innerHeight); setViewportWidth(window.innerWidth); };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Auto-Caller Mode state
  const [autoCallerActive, setAutoCallerActive] = useState(false);
  const [clockNow, setClockNow] = useState(Date.now());
 
  // Spacebar Hotkey Setup
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if typing in an input, or if modals are open
      if (showResetModal || showPreviewModal || e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      // Never hijack typing (e.g. the volume slider or a text box).
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target?.isContentEditable) return;
      if (e.code === 'Space') {
        // Space on a focused button should just press that button.
        if (tag === 'BUTTON') return;
        e.preventDefault();
        if (gameState?.started && pool.length > 0 && !callInFlight) {
          handleCallNext();
        }
      } else if (!gameState?.started && e.key === 'ArrowRight') {
        e.preventDefault();
        setTeleprompterStep(prev => Math.min(prev + 1, 4));
      } else if (!gameState?.started && e.key === 'ArrowLeft') {
        e.preventDefault();
        setTeleprompterStep(prev => Math.max(0, prev - 1));
      } else if (canRefreshLineRef.current && (e.key === 'n' || e.key === 'N')) {
        setCueVariation(prev => prev + 1);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [gameState?.started, gameState?.nowPlaying, pool.length, callInFlight, showResetModal, showPreviewModal]);

  useEffect(() => {
    const unsubState = subscribeToGameState((state) => {
      setGameState(state);
      currentTrackRef.current = state?.nowPlaying ?? null;

      if (state?.sessionId && sessionIdRef.current && state.sessionId !== sessionIdRef.current) {
        setAudioProgress(0);
        setClockNow(Date.now());
      }
      sessionIdRef.current = state?.sessionId ?? null;
      setAutoCallerActive(state?.autoCallerEnabled === true);
      
      if (state) {
        const calledSet = new Set(state.history);
        if (state.nowPlaying) calledSet.add(state.nowPlaying);
        
        setPool(prev => {
          if (prev.length === 0 || !state.started) {
            return shuffle(songs).filter(s => !calledSet.has(s));
          }
          return prev.filter(s => !calledSet.has(s));
        });
        
        if (state.nowPlaying) {
          const requestedTrack = state.nowPlaying;
          const { title, artist } = splitSong(state.nowPlaying);
          lookupPreview(title, artist).then(data => {
            if (currentTrackRef.current !== requestedTrack) return;
            setPreviewData(data);
            setAudioProgress(0); // Reset progress on new song
          });
        } else {
          setPreviewData(null);
          setAudioProgress(0);
        }
      }
    });
    
    const unsubClaims = subscribeToClaims((allClaims) => setClaims(allClaims));
    return () => { unsubState(); unsubClaims(); };
  }, []);

  // The visualizer reports a short heartbeat while it owns the room audio.
  // Ignore an old "active" flag after a tab closes or loses connectivity.
  useEffect(() => {
    const syncAudioLock = () => {
      const heartbeatAge = Date.now() - (gameState?.visualizerAudioUpdatedAt || 0);
      setIsAudioLocked(gameState?.visualizerAudioActive === true && heartbeatAge < 20_000);
    };
    syncAudioLock();
    const interval = window.setInterval(syncAudioLock, 5_000);
    return () => window.clearInterval(interval);
  }, [gameState?.visualizerAudioActive, gameState?.visualizerAudioUpdatedAt]);
 
  useEffect(() => {
    const unsubPlayers = subscribeToPlayerCount((count) => setActivePlayers(count));
    return () => unsubPlayers();
  }, []);
 
  // Keep every visible countdown tied to the same persisted track window.
  useEffect(() => {
    setClockNow(Date.now());
    if (!gameState?.started || (!gameState.nowPlaying && typeof gameState.autoStartAt !== 'number')) return;

    const timer = window.setInterval(() => setClockNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, [gameState?.sessionId, gameState?.started, gameState?.nowPlaying, gameState?.trackStartedAt, gameState?.nextTrackAt, gameState?.autoStartAt]);

  // Auto-Caller advances exactly when the shared track countdown reaches zero.
  // Before Track 1, it first schedules a shared five-second stage countdown.
  useEffect(() => {
    if (!autoCallerActive || !gameState?.started || pool.length === 0 || callInFlight) return;

    if (!gameState.nowPlaying && typeof gameState.autoStartAt !== 'number') {
      if (!autoStartInFlightRef.current) {
        autoStartInFlightRef.current = true;
        void scheduleAutoCallerStart()
          .catch(() => {
            setAutoCallerActive(false);
            void setAutoCallerEnabled(false).catch(error => console.error('Could not disable Auto-Caller:', error));
          })
          .finally(() => { autoStartInFlightRef.current = false; });
      }
      return;
    }

    const delay = gameState.nowPlaying
      ? getTrackTiming(gameState, Date.now()).remainingMs
      : getAutoStartTiming(gameState, Date.now()).remainingMs;
    const timer = window.setTimeout(() => void handleCallNext(), delay);
    return () => clearTimeout(timer);
  }, [autoCallerActive, gameState?.sessionId, gameState?.started, gameState?.nowPlaying, gameState?.trackStartedAt, gameState?.nextTrackAt, gameState?.autoStartAt, gameState?.autoCallerEnabled, pool.length, callInFlight]);

  // A completed deck should stop Auto-Caller and return the host to a clear
  // end-of-round state instead of leaving controls looking mysteriously stuck.
  useEffect(() => {
    if (gameState?.started && pool.length === 0 && autoCallerActive) {
      setAutoCallerActive(false);
      void setAutoCallerEnabled(false).catch(error => console.error('Could not stop Auto-Caller:', error));
    }
  }, [gameState?.started, pool.length, autoCallerActive]);
 
  // Audio Playback Sync
  useEffect(() => {
    if (audioRef.current && previewData?.previewUrl) {
      if (audioRef.current.src !== previewData.previewUrl) {
        audioRef.current.src = previewData.previewUrl;
      }
      if (!isAudioLocked && volume > 0) {
        audioRef.current.play().catch(() => console.log('Audio autoplay prevented'));
      } else {
        audioRef.current.pause();
      }
    }
  }, [previewData, isAudioLocked]);
  
  // Volume Sync
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = isAudioLocked ? 0 : volume;
    }
  }, [volume, isAudioLocked]);
 
  const handleStartGame = async () => {
    setAutoCallerActive(false);
    setAudioProgress(0);
    setClockNow(Date.now());
    setCueVariation(0);
    await startNewGame();
  };
 
  const handleResetGame = () => setShowResetModal(true);
 
  const confirmResetGame = async () => {
    setShowResetModal(false);
    setAutoCallerActive(false);
    setTeleprompterStep(0);
    setCueVariation(0);
    setAudioProgress(0);
    setClockNow(Date.now());
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    try {
      await resetGame();
      setPool(shuffle(songs));
    } catch (e) {
      console.error('Failed to reset game:', e);
    }
  };
 
  const handleCallNext = async () => {
    if (callInFlightRef.current || pool.length === 0 || !gameState) return;
    
    callInFlightRef.current = true;
    setCallInFlight(true);
    
    const nextSong = pool[pool.length - 1];
    
    try {
      const didAdvance = await setNowPlaying(nextSong, gameState.nowPlaying, gameState.sessionId);
      if (!didAdvance) return;
      playCallSound();
      setClockNow(Date.now());
      setCueVariation(0);
    } catch (e) {
      console.error('Could not call next track:', e);
      setAutoCallerActive(false);
      try {
        await setAutoCallerEnabled(false);
      } catch (disableError) {
        console.error('Could not disable Auto-Caller after the failed track change:', disableError);
      }
    } finally {
      callInFlightRef.current = false;
      setCallInFlight(false);
    }
  };

  const handleToggleAutoCaller = async () => {
    if (autoCallerActive) {
      setAutoCallerActive(false);
      try {
        await setAutoCallerEnabled(false);
      } catch (e) {
        console.error('Could not pause Auto-Caller:', e);
        setAutoCallerActive(true);
      }
      return;
    }

    try {
      await setAutoCallerEnabled(true);
      setAutoCallerActive(true);
    } catch (e) {
      console.error('Could not enable Auto-Caller:', e);
      setAutoCallerActive(false);
    }
  };
 
  const validWinnersCount = claims.filter(c => c.status === 'valid').length;
  const tracksExhausted = gameState?.started === true && pool.length === 0;
  const trackTiming = getTrackTiming(gameState, clockNow);
  // The record and progress ring follow the song playing in the room, not just
  // this console's own speaker. When the stage owns the audio, this console is
  // muted on purpose, so its own audio element never plays or reports progress.
  const trackIsLive = Boolean(gameState?.nowPlaying)
    && typeof gameState?.trackEndedAt !== 'number'
    && !trackTiming.isComplete;
  const stageProgress = !gameState?.nowPlaying
    ? 0
    : typeof gameState.trackEndedAt === 'number'
      ? 100
      : typeof gameState.trackStartedAt === 'number'
        ? Math.min(100, Math.max(0, ((clockNow - gameState.trackStartedAt) / 30_000) * 100))
        : 0;
  const displayProgress = isAudioLocked ? stageProgress : audioProgress;
  const autoStartTiming = getAutoStartTiming(gameState, clockNow);
  const autoStartRemaining = autoStartTiming.remainingSeconds;
  const pregameCues = getPregameCues(activePlayers);
  const currentPregameStep = Math.min(teleprompterStep, pregameCues.length - 1);
  const activeHostCue = gameState?.started
    ? getLiveHostCue(gameState, claims, pool.length, cueVariation)
    : pregameCues[currentPregameStep];
  const smartGameRead = gameState?.started
    ? getHostGameRead(gameState, claims, pool.length, activePlayers)
    : null;
  const currentTrack = gameState?.nowPlaying ? splitSong(gameState.nowPlaying) : null;
  const currentTrackNumber = gameState?.nowPlaying ? gameState.history.length + 1 : 0;
 
  // Only the rotating DJ lines have alternatives; the milestone and winner cues are fixed.
  const canRefreshLine = Boolean(gameState?.nowPlaying) && (activeHostCue.title === 'DJ Talk Track' || activeHostCue.title === 'Every Track Matters Now');

  canRefreshLineRef.current = canRefreshLine;

  // Off-mic notes for the live game follow what's actually happening right now:
  // whether Auto-Caller is on, whether the clip is still playing, and any claims.
  const liveHostNote = (() => {
    if (!gameState?.started) return null;
    const sessionClaims = claims.filter(claim => !gameState.sessionId || claim.sessionId === gameState.sessionId);
    const hasWinner = sessionClaims.some(claim => claim.status === 'valid');
    if (hasWinner) {
      return `${autoCallerActive ? 'Pause Auto-Caller first. ' : ''}Celebrate the winner and handle any prizes. When the room is ready for a new game, use End Round & Reset (it clears the claims).`;
    }

    if (!gameState.nowPlaying) {
      if (autoCallerActive) {
        return autoStartRemaining > 0
          ? `Auto-Caller is on: Track 1 starts in ${autoStartRemaining}s. Read the line on the left before it drops.`
          : 'Auto-Caller is on and will start Track 1 after a short countdown. Read the line on the left first.';
      }
      return 'Read the line on the left, then press Play First Song (or Space). Once it starts, check that the room can hear the stage screen.';
    }

    const notes: string[] = [];
    if (trackIsLive) {
      notes.push(autoCallerActive
        ? 'The clip is playing. Auto-Caller starts the next track about 5 seconds after it ends, so have the line on the left ready as it finishes.'
        : 'The clip is playing, so let everyone listen. When it ends, read the line on the left, then press Call Next Track (or Space).');
      notes.push('Save the trivia until the clip ends; it can give the song away.');
    } else if (autoCallerActive && trackTiming.isInterTrackDelay) {
      notes.push(`Next track starts in ${trackTiming.remainingSeconds}s. Read the line on the left now, or press Pause on Auto-Caller if you need more time.`);
    } else {
      notes.push('The clip has ended. Read the line on the left, give everyone a few seconds to mark their cards, then press Call Next Track (or Space).');
      notes.push('The trivia below is safe to share now if you want to fill a moment.');
    }

    if (currentTrackNumber % 5 === 0) notes.push('Board check: give everyone a few extra seconds to look over every row, column and diagonal.');
    if (pool.length > 0 && pool.length <= 5) notes.push(`Only ${pool.length} song${pool.length === 1 ? '' : 's'} left in the deck, so somebody should be close.`);

    const trackStartedAt = gameState.trackStartedAt ?? 0;
    const missedThisTrack = sessionClaims.filter(claim => claim.status !== 'valid' && Number(claim.timestamp) >= trackStartedAt).length;
    if (missedThisTrack > 0) {
      notes.push(`${missedThisTrack === 1 ? 'A Bingo claim' : `${missedThisTrack} Bingo claims`} came in this track but ${missedThisTrack === 1 ? "wasn't a win" : "weren't wins"} (see Bingo Claims). Let ${missedThisTrack === 1 ? 'that player' : 'them'} know to keep playing.`);
    }
    return notes.join(' ');
  })();
  const displayedHostNote = liveHostNote ?? activeHostCue.hostNote;

  const deckStatus = !gameState?.started
    ? 'Lobby open'
    : !gameState.nowPlaying
      ? (autoCallerActive && autoStartRemaining > 0 ? `Track 1 in ${autoStartRemaining}s` : 'Ready for the first song')
      : trackTiming.isInterTrackDelay
        ? `Next track in ${trackTiming.remainingSeconds}s`
        : trackIsLive ? 'Song playing' : 'Song complete · ready for next';

  // The size buttons set the preferred (largest) script size; the text then
  // shrinks just enough to fit the teleprompter box without scrolling.
  const scriptSizeRatio = scriptFontSize === 'normal' ? 0.03 : scriptFontSize === 'large' ? 0.042 : 0.055;
  const scriptMaxPx = Math.round(Math.max(scriptFontSize === 'normal' ? 20 : scriptFontSize === 'large' ? 26 : 32, Math.min(viewportHeight, viewportWidth * 1.25) * scriptSizeRatio));
  const notesMaxPx = Math.round(Math.max(15, Math.min(22, viewportHeight * 0.019)));
  const scriptContentKey = `${activeHostCue.script}|${smartGameRead?.onMic ?? ''}`;
  const notesContentKey = `${displayedHostNote ?? ''}|${smartGameRead?.note ?? ''}|${gameState?.nowPlaying ?? ''}`;
  const { boxRef: scriptBoxRef, textRef: scriptTextRef, size: scriptFitSize } = useFitText(scriptMaxPx, 14, scriptContentKey);
  const { boxRef: notesBoxRef, textRef: notesTextRef, size: notesFitSize } = useFitText(notesMaxPx, 11, notesContentKey);

  return (
    <div className="host-shell min-h-screen bg-gradient-to-br from-[#0a0b1e] via-[#15102e] to-[#0a1326] text-[#f7f8ff] font-sans p-3 sm:p-4 xl:p-5 relative overflow-x-hidden selection:bg-[#ff4fd8] selection:text-white">
      <div className="fixed inset-0 z-0 bg-[radial-gradient(ellipse_at_18%_22%,rgba(255,79,216,0.16)_0%,transparent_28%),radial-gradient(ellipse_at_82%_20%,rgba(51,216,255,0.16)_0%,transparent_30%),radial-gradient(ellipse_at_50%_85%,rgba(139,92,246,0.16)_0%,transparent_34%),linear-gradient(135deg,#0b1020,#170f2e_55%,#09121f)] opacity-100 transition-all duration-1000 pointer-events-none"></div>
 
      <div className="host-layout max-w-[1520px] 2xl:max-w-[1760px] mx-auto grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_380px] xl:grid-cols-[minmax(0,1fr)_410px] 2xl:grid-cols-[minmax(0,1fr)_450px] grid-rows-[auto_auto_auto] lg:grid-rows-[auto_minmax(0,1fr)] gap-3 xl:gap-4 relative z-10">
        
        {/* Header (Span full width) */}
        <div className="host-header col-span-1 lg:col-span-full flex flex-wrap justify-between items-center gap-3 px-4 py-3.5 xl:px-5 xl:py-4 bg-[#131728]/82 backdrop-blur-xl border border-white/10 shadow-2xl rounded-2xl">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2.5 rounded-xl border border-white/20 bg-gradient-to-br from-[#ff4fd8]/20 to-[#33d8ff]/20 shadow-[0_0_18px_rgba(51,216,255,0.12)]">
              <Radio className="w-5 h-5 text-white" />
            </div>
            <h1 className="text-lg sm:text-xl xl:text-2xl font-black m-0 tracking-tight text-white uppercase flex flex-wrap items-center gap-x-2 leading-none">
              Host <span className="text-[#33d8ff]">Studio Console</span>
            </h1>
          </div>

          {/* Upgraded: Host Volume & Audio Routing Status */}
          <div className="flex items-center gap-3 ml-auto mr-2 lg:mr-6">
            {isAudioLocked ? (
              <div className="hidden md:flex items-center gap-1.5 bg-[#4ade80]/15 border border-[#4ade80]/40 text-[#4ade80] px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-widest">
                <VolumeX className="w-3.5 h-3.5" /> Stage Audio Active
              </div>
            ) : (
              <div className="hidden md:flex items-center gap-2 bg-black/40 border border-white/10 px-3 py-1.5 rounded-lg">
                <Volume2 className="w-3.5 h-3.5 text-white/50" />
                <input
                  type="range"
                  min="0" max="1" step="0.05"
                  value={volume}
                  onChange={(e) => setVolume(parseFloat(e.target.value))}
                  className="w-20 sm:w-24 cursor-pointer accent-[#33d8ff]"
                  title="Host Preview Volume"
                />
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-2 text-[10px] xl:text-xs font-bold text-white/60 uppercase tracking-[0.14em]">
            <span className="rounded-xl border border-white/10 bg-black/35 px-3 py-2 flex items-center justify-center gap-2 shadow-inner whitespace-nowrap">
              <span className="w-1.5 h-1.5 bg-[#4ade80] rounded-full animate-pulse shadow-[0_0_8px_#4ade80]"></span>
              Players: <strong className="text-white ml-1">{activePlayers}</strong>
            </span>
            <span className="rounded-xl border border-white/10 bg-black/35 px-3 py-2 shadow-inner text-center whitespace-nowrap">
              Called: <strong className="text-white ml-1">{(gameState?.history.length || 0) + (gameState?.nowPlaying ? 1 : 0)}</strong>
            </span>
            <span className="rounded-xl border border-white/10 bg-black/35 px-3 py-2 shadow-inner text-center whitespace-nowrap">
              Remaining: <strong className="text-white ml-1">{pool.length}</strong>
            </span>
            <span className="rounded-xl border border-[#ffd76a]/20 bg-gradient-to-r from-[#ffd76a]/16 to-black/35 text-[#ffd76a] px-3 py-2 flex items-center justify-center gap-2 shadow-inner whitespace-nowrap">
              <Trophy className="w-3.5 h-3.5" /> Winners: {validWinnersCount}
            </span>
          </div>
        </div>
 
        {/* Main Stage: compact "now playing" deck on top, teleprompter fills the rest */}
        <div className="host-stage min-w-0 flex flex-col gap-3 xl:gap-4 lg:min-h-0">

          {/* Now Playing deck */}
          <div className="host-deck flex-none bg-[#131728]/82 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl p-3 sm:p-4 flex flex-col md:flex-row items-center gap-4 md:gap-5">
            {/* Hidden audio element for when this console provides the sound */}
            <audio
              ref={audioRef}
              onTimeUpdate={(e) => {
                const { currentTime, duration } = e.currentTarget;
                if (duration) setAudioProgress((currentTime / duration) * 100);
              }}
              onEnded={() => {
                setAudioProgress(100);
                if (gameState?.nowPlaying) void markTrackEnded(gameState.nowPlaying);
              }}
              className="hidden"
            />

            {/* Spinning record + progress ring */}
            <div className="host-record-wrap relative flex-none flex items-center justify-center">
              <svg className="host-ring absolute pointer-events-none -rotate-90 drop-shadow-[0_0_8px_rgba(51,216,255,0.55)] z-10" viewBox="0 0 100 100">
                <circle cx="50" cy="50" r="48" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="2.5" />
                {displayProgress > 0 && (
                  <circle
                    cx="50" cy="50" r="48" fill="none" stroke="#33d8ff" strokeWidth="2.5"
                    strokeDasharray={`${(displayProgress / 100) * 301.59} 301.59`}
                    strokeLinecap="round"
                    className="transition-all duration-200 ease-linear"
                  />
                )}
              </svg>
              <div className={`host-record relative z-20 rounded-full bg-gradient-to-br from-[#1a0510] to-[#04050d] shadow-[0_0_30px_rgba(255,79,216,0.24)] border-[3px] border-white/10 p-1.5 flex items-center justify-center ${trackIsLive ? 'is-spinning' : ''}`}>
                <div className="w-full h-full rounded-full bg-cover bg-center border border-white/20 relative overflow-hidden flex items-center justify-center" style={previewData?.artworkUrl ? { backgroundImage: `url(${previewData.artworkUrl})` } : {}}>
                  {!previewData?.artworkUrl && <Disc className="w-1/2 h-1/2 text-white/20" />}
                  <div className="absolute w-[22%] h-[22%] rounded-full bg-[#0a0b1e] border-2 border-[#ff4fd8]/50 z-10 shadow-[0_0_12px_#ff4fd8]"></div>
                </div>
              </div>
            </div>

            {/* Track readout (host only) */}
            <div className="min-w-0 flex-1 text-center md:text-left">
              <div className="flex flex-wrap items-center justify-center md:justify-start gap-2 mb-1.5">
                {gameState?.nowPlaying && (
                  <span className="px-2.5 py-1 rounded-full bg-gradient-to-r from-[#ff4fd8] to-[#8b5cf6] text-white font-black text-[10px] uppercase tracking-widest flex items-center gap-1.5">
                    <Sparkles className="w-3 h-3" /> Track {String(currentTrackNumber).padStart(2, '0')}
                  </span>
                )}
                <span className={`px-2.5 py-1 rounded-full border text-[10px] font-black uppercase tracking-widest ${trackIsLive ? 'border-[#4ade80]/40 bg-[#4ade80]/10 text-[#4ade80]' : 'border-white/15 bg-white/5 text-white/60'}`}>
                  {deckStatus}
                </span>
              </div>
              <h2 className="host-track-title font-black uppercase tracking-tighter leading-[1.02] text-balance line-clamp-2 m-0">
                {currentTrack ? currentTrack.title : (gameState?.started ? 'Game Is Live!' : 'Lobby Open')}
              </h2>
              <div className="mt-1 text-xs sm:text-sm text-white/65 font-semibold tracking-[0.16em] uppercase line-clamp-2">
                {currentTrack ? currentTrack.artist : (gameState?.started ? 'Play the first song when the room is ready' : 'Read the intro, then start')}
              </div>
            </div>

            {/* Controls */}
            <div className="host-controls w-full md:w-[clamp(250px,26vw,330px)] flex-none flex flex-col gap-2">
              {!gameState?.started ? (
                <button
                  className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-[#ff4fd8] to-[#8b5cf6] text-white text-sm font-black tracking-widest uppercase hover:brightness-110 active:scale-[0.99] transition-all cursor-pointer flex items-center justify-center gap-2 shadow-[0_0_24px_rgba(255,79,216,0.34)]"
                  onClick={handleStartGame}
                >
                  <Play className="w-5 h-5 fill-current" /> Start Game
                </button>
              ) : (
                <>
                  <button
                    className={`w-full py-3.5 rounded-2xl text-sm font-black tracking-widest uppercase transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer flex items-center justify-center gap-2.5 active:scale-[0.99] ${pool.length > 0 && !callInFlight ? 'bg-gradient-to-r from-[#33d8ff] to-[#8b5cf6] text-white shadow-[0_0_24px_rgba(51,216,255,0.34)] hover:brightness-110' : 'bg-black/60 border border-white/10 text-white/50 shadow-inner'}`}
                    onClick={handleCallNext}
                    disabled={callInFlight || pool.length === 0}
                    title="Shortcut: Space"
                  >
                    <Disc className="w-5 h-5" />
                    {callInFlight
                      ? 'Loading…'
                      : tracksExhausted
                        ? 'All Tracks Played'
                        : gameState.history.length === 0 && !gameState.nowPlaying
                          ? 'Play First Song'
                          : 'Call Next Track'}
                  </button>
                  <div className="flex items-center justify-between gap-2 px-3 py-2 bg-black/35 border border-white/10 rounded-xl text-[11px] shadow-inner">
                    <span className="flex items-center gap-1.5 text-[#ffd76a] font-black uppercase tracking-widest"><Clock className="w-3.5 h-3.5" /> Auto-Caller</span>
                    {autoCallerActive && (
                      <span className="font-mono text-white/85 font-bold whitespace-nowrap">
                        {gameState.nowPlaying
                          ? trackTiming.isInterTrackDelay ? `Drops 0:${String(trackTiming.remainingSeconds).padStart(2, '0')}` : 'Listening'
                          : autoStartRemaining > 0 ? `Track 1 0:${String(autoStartRemaining).padStart(2, '0')}` : 'Starting…'}
                      </span>
                    )}
                    <button
                      onClick={handleToggleAutoCaller}
                      disabled={tracksExhausted}
                      className={`px-2.5 py-1 rounded-lg font-black uppercase tracking-widest transition-colors ${tracksExhausted ? 'text-white/25 cursor-not-allowed' : autoCallerActive ? 'bg-[#ff4fd8]/15 text-[#ff4fd8] hover:bg-[#ff4fd8]/25 cursor-pointer' : 'bg-white/10 text-white/75 hover:text-white cursor-pointer'}`}
                    >
                      {tracksExhausted ? 'Complete' : autoCallerActive ? 'Pause' : 'Enable'}
                    </button>
                  </div>
                  {tracksExhausted && (
                    <div className="rounded-xl border border-[#ffd76a]/30 bg-[#ffd76a]/10 px-3 py-2 text-[11px] leading-snug text-[#ffe49a] font-semibold">
                      Deck complete. Use <strong>End Round &amp; Reset</strong> for a new game.
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Teleprompter (always on the page, no pop-up) */}
          <section className="host-prompter flex-1 min-h-[420px] lg:min-h-0 bg-[#131728]/82 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl p-3 sm:p-4 flex flex-col gap-3" aria-label="Host teleprompter">
            {/* Toolbar */}
            <div className="flex-none flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0 flex items-center gap-2">
                <Mic2 className="w-4 h-4 flex-none text-[#33d8ff]" />
                <span className="text-[11px] sm:text-xs font-black uppercase tracking-widest text-[#33d8ff] truncate">{activeHostCue.kicker}</span>
                <span className="hidden sm:inline text-[11px] font-black uppercase tracking-[0.16em] text-[#ffd76a] truncate">· {activeHostCue.title}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="flex items-center bg-white/10 rounded-lg p-0.5 border border-white/10 text-[11px] font-bold" role="group" aria-label="Script text size">
                  {(['normal', 'large', 'xl'] as const).map((size, index) => (
                    <button key={size} onClick={() => setScriptFontSize(size)} className={`px-2 py-1 rounded cursor-pointer ${scriptFontSize === size ? 'bg-[#33d8ff] text-black font-extrabold' : 'text-white/70 hover:text-white'}`} title={['Smaller script text', 'Large script text', 'Largest script text'][index]}>
                      {['A', 'A+', 'A++'][index]}
                    </button>
                  ))}
                </div>
                {canRefreshLine && (
                  <button onClick={() => setCueVariation(prev => prev + 1)} className="px-2.5 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 border border-white/10 text-white/80 hover:text-white cursor-pointer flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wider" title="Shortcut: N">
                    <RefreshCw className="w-3.5 h-3.5" /> New Line
                  </button>
                )}
              </div>
            </div>

            {/* Script + notes */}
            <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(220px,30%)] gap-3">
              <div ref={scriptBoxRef} className="host-fit-box relative min-h-0 rounded-xl border-2 border-[#33d8ff]/35 bg-black/55 p-4 sm:p-5 shadow-[0_0_40px_rgba(51,216,255,0.10)]">
                {gameState?.nowPlaying && (
                  <div className="absolute top-0 left-0 right-0 h-1 rounded-t-xl overflow-hidden bg-white/5">
                    <div className="h-full bg-[#33d8ff] transition-all duration-200 ease-linear" style={{ width: `${displayProgress}%` }} />
                  </div>
                )}
                <div ref={scriptTextRef} style={{ fontSize: `${scriptFitSize}px` }}>
                  <div className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-[0.2em] text-[#33d8ff] mb-[0.45em]">
                    <MessageSquareQuote className="w-3.5 h-3.5" /> Read on Mic
                  </div>
                  <p className="m-0 text-white font-bold leading-[1.32] text-pretty">“{activeHostCue.script}”</p>
                  {smartGameRead && (
                    <p className="mt-[0.6em] mb-0 pt-[0.55em] border-t border-[#33d8ff]/20 text-[0.78em] leading-[1.35] text-[#b9f4ff] font-bold">“{smartGameRead.onMic}”</p>
                  )}
                </div>
              </div>

              <aside ref={notesBoxRef} className="host-fit-box min-h-0 rounded-xl border border-[#ff4fd8]/25 bg-[#ff4fd8]/[0.05] p-3 sm:p-4">
                <div ref={notesTextRef} style={{ fontSize: `${notesFitSize}px` }} className="flex flex-col gap-[0.7em]">
                  <div>
                    <div className="text-[11px] font-black uppercase tracking-[0.2em] text-[#ff4fd8] mb-[0.35em]">Notes</div>
                    {displayedHostNote && <p className="m-0 leading-[1.45] text-white/75 font-medium">{displayedHostNote}</p>}
                    {smartGameRead && <p className="mt-[0.5em] mb-0 leading-[1.45] text-white/60 font-medium">{smartGameRead.note}</p>}
                  </div>
                  {gameState?.nowPlaying && (
                    <div className="rounded-lg border border-[#ffd76a]/25 bg-[#ffd76a]/[0.07] p-[0.6em] leading-[1.45] text-white/80">
                      <span className="font-black uppercase tracking-wider text-[#ffd76a]">Optional trivia:</span>{' '}
                      {getSongFact(gameState.nowPlaying)}
                    </div>
                  )}
                </div>
              </aside>
            </div>

            {/* Intro navigation (before the game starts) */}
            {!gameState?.started && (
              <div className="flex-none flex flex-wrap items-center justify-between gap-2 pt-1">
                <button
                  onClick={() => setTeleprompterStep(prev => Math.max(0, prev - 1))}
                  disabled={currentPregameStep === 0}
                  className="px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 border border-white/15 text-white text-xs font-black uppercase tracking-wider cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-1.5"
                  title="Shortcut: ←"
                >
                  <ChevronLeft className="w-4 h-4" /> Previous
                </button>
                <div className="flex items-center gap-2" aria-label="Intro progress">
                  {pregameCues.map((cue, index) => (
                    <button
                      key={cue.title}
                      onClick={() => setTeleprompterStep(index)}
                      className={`h-2.5 rounded-full transition-all cursor-pointer ${index === currentPregameStep ? 'w-8 bg-gradient-to-r from-[#ff4fd8] to-[#33d8ff]' : index < currentPregameStep ? 'w-2.5 bg-white/40' : 'w-2.5 bg-white/15 hover:bg-white/30'}`}
                      title={`Cue ${index + 1}: ${cue.title}`}
                      aria-label={`Cue ${index + 1}: ${cue.title}`}
                      aria-current={index === currentPregameStep ? 'step' : undefined}
                    />
                  ))}
                  <span className="ml-1 text-[11px] font-black tabular-nums text-white/55 uppercase tracking-widest">{currentPregameStep + 1} / {pregameCues.length}</span>
                </div>
                {currentPregameStep < pregameCues.length - 1 ? (
                  <button
                    onClick={() => setTeleprompterStep(prev => Math.min(pregameCues.length - 1, prev + 1))}
                    className="px-4 py-2.5 rounded-xl bg-[#33d8ff] text-black text-xs font-black uppercase tracking-wider hover:brightness-110 cursor-pointer flex items-center gap-1.5"
                    title="Shortcut: →"
                  >
                    Next Cue <ChevronRight className="w-4 h-4" />
                  </button>
                ) : (
                  <button
                    onClick={handleStartGame}
                    className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-[#ff4fd8] to-[#8b5cf6] text-white text-xs font-black uppercase tracking-wider hover:brightness-110 cursor-pointer flex items-center gap-1.5"
                  >
                    <Play className="w-4 h-4 fill-current" /> Start Game
                  </button>
                )}
              </div>
            )}

            <div className="flex-none hidden lg:flex items-center justify-center gap-4 text-[10px] text-white/35 font-bold uppercase tracking-widest">
              <span className="flex items-center gap-1"><Keyboard className="w-3.5 h-3.5" /> Space: call next</span>
              {!gameState?.started ? <span>← → : intro cues</span> : <span>N: new DJ line</span>}
            </div>
          </section>
        </div>

        {/* Right Panel */}
        <div className="host-sidebar min-w-0 min-h-[520px] lg:min-h-0 bg-[#131728]/82 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl p-4 xl:p-5 flex flex-col gap-4 overflow-hidden">
          
          {/* Claims List */}
          <div className="host-claims flex flex-col flex-none min-h-0 max-h-[45%]">
            <h2 className="flex items-center gap-2 m-0 mb-3 font-black text-xs uppercase tracking-widest text-[#33d8ff]">
              <Trophy className="w-4 h-4" /> Bingo Claims <span className="bg-[#33d8ff]/20 text-[#33d8ff] border border-[#33d8ff]/40 px-2 py-0.5 text-[10px] rounded-full">{claims.length}</span>
            </h2>
            <div className="flex-1 min-h-0 overflow-y-auto pr-1.5 flex flex-col gap-2.5 custom-scrollbar">
              {claims.length === 0 && (
                <div className="text-center text-white/45 font-bold text-xs p-5 border border-dashed border-white/10 bg-black/25 rounded-2xl shadow-inner leading-relaxed uppercase tracking-widest">
                  No claims yet.
                </div>
              )}
              {claims.map(claim => (
                <div key={claim.id} className={`p-3.5 rounded-2xl border flex flex-col gap-2.5 relative overflow-hidden shadow-lg transition-all
                  ${claim.status === 'valid' ? 'bg-gradient-to-br from-[#ffd76a]/20 to-black/60 border-[#ffd76a]/50 shadow-[0_0_20px_rgba(255,215,106,0.2)]' : 'bg-black/60 border-white/10'}
                `}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div className={`font-black text-xl min-w-[28px] drop-shadow-md text-center
                        ${claim.status === 'valid' && claim.position === 1 ? 'text-white' : 'text-white/50'}
                      `}>
                        {claim.status === 'valid' ? (claim.position === 1 ? '🥇' : claim.position === 2 ? '🥈' : claim.position === 3 ? '🥉' : `#${claim.position}`) : '—'}
                      </div>
                      <div className="font-black text-base text-white truncate tracking-tight uppercase">{claim.playerName}</div>
                    </div>
                    <div className="text-[10px] text-white/50 font-semibold whitespace-nowrap">
                      {new Date(claim.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                    </div>
                  </div>
                  
                  <div className="flex flex-wrap gap-2 items-center">
                    {claim.status === 'valid' && <span className="text-[10px] font-black px-2.5 py-1 rounded-full uppercase tracking-widest bg-gradient-to-r from-[#ffd76a] to-[#ffb800] text-black shadow-md">Valid</span>}
                    {claim.status === 'cheating' && <span className="text-[10px] font-bold px-2.5 py-1 rounded-full uppercase tracking-widest border border-[#f87171]/40 text-[#f87171] bg-[#f87171]/10">Invalid</span>}
                    {claim.status === 'no_line' && <span className="text-[10px] font-bold px-2.5 py-1 rounded-full uppercase tracking-widest border border-white/20 text-white/50">No Line</span>}
                    
                    {claim.winningLines?.map((line, i) => (
                      <span key={i} className="text-[10px] font-semibold px-2 py-1 border border-white/20 text-white/90">{line.label}</span>
                    ))}
                  </div>
                  
                  <div className="flex gap-2 mt-1">
                    <button onClick={() => setShowPreviewModal(claim)} className="flex-1 bg-white/10 hover:bg-white/20 rounded-xl border border-white/20 py-2 text-[10px] font-bold tracking-widest uppercase text-white transition-colors cursor-pointer">Inspect Board</button>
                    <button onClick={() => dismissClaim(claim.id!)} className="flex-1 bg-black/40 hover:bg-[#f87171]/20 rounded-xl border border-white/10 hover:border-[#f87171]/40 py-2 text-[10px] font-bold tracking-widest uppercase text-white/50 hover:text-[#f87171] transition-colors cursor-pointer">Dismiss</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
 
          {/* Track History */}
          <div className="host-history flex flex-col flex-1 min-h-[180px] lg:min-h-0">
            <h2 className="flex items-center gap-2 m-0 mb-3 font-black text-xs uppercase tracking-widest text-[#ff4fd8]">
              📋 Called History
            </h2>
            <div className="flex-1 min-h-0 overflow-y-auto pr-2 flex flex-col gap-2 custom-scrollbar">
              {(!gameState?.history.length && !gameState?.nowPlaying) && (
                <div className="text-center text-white/45 font-bold uppercase tracking-widest text-xs p-5 border border-dashed border-white/10 bg-black/25 rounded-2xl shadow-inner">
                  No tracks called yet.
                </div>
              )}
              {gameState?.nowPlaying && (
                <HistoryItem songKey={gameState.nowPlaying} label="NOW" isCurrent={true} />
              )}
              {gameState?.history.slice().reverse().map((songKey, i) => (
                <HistoryItem key={songKey} songKey={songKey} label={`#${gameState.history.length - i}`} isCurrent={false} />
              ))}
            </div>
          </div>
          
          <button 
            className="w-full py-3.5 rounded-2xl bg-black/35 hover:bg-[#f87171]/20 border border-white/10 hover:border-[#f87171]/40 text-white/65 hover:text-[#f87171] text-[11px] font-black tracking-widest uppercase transition-colors cursor-pointer shadow-inner flex-none"
            onClick={handleResetGame}
          >
            End Round & Reset
          </button>
        </div>
      </div>
 
      {/* Inspect Player Board Modal */}
      {showPreviewModal && (
        <div className="fixed inset-0 bg-[#0a0b1e]/90 z-[500] flex items-center justify-center p-4" onClick={() => setShowPreviewModal(null)}>
          <div className="w-full max-w-[640px] max-h-[92vh] overflow-y-auto bg-[#131728]/90 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl p-5 sm:p-7" onClick={e => e.stopPropagation()}>
            <h3 className="m-0 mb-2 text-2xl font-serif font-medium text-white">{showPreviewModal.playerName}'s Card</h3>
            
            <div className="text-xs text-white/70 mb-6 font-light leading-relaxed">
              <strong className={showPreviewModal.status === 'valid' ? 'text-white' : 'text-white/50'}>
                {showPreviewModal.status === 'valid' ? '✅ Valid Win' : showPreviewModal.status === 'cheating' ? '❌ Invalid Marks' : '⚠️ No Complete Line'}
              </strong> · Submitted at <strong>{new Date(showPreviewModal.timestamp).toLocaleTimeString()}</strong><br/>
              Songs called by then: <strong>{showPreviewModal.historyCountAtClaim}</strong>
            </div>
 
            <div className="grid grid-cols-5 gap-1 bg-white/5 border border-white/10 rounded-xl p-1">
              {showPreviewModal.songs.map((song, i) => {
                const isSelected = showPreviewModal.selected[i];
                const isFree = i === 12;
                
                const winningIndices = new Set<number>();
                showPreviewModal.winningLines?.forEach(l => l.indices.forEach(idx => winningIndices.add(idx)));
                const isWin = winningIndices.has(i);
                
                let cellClass = "aspect-square p-1 flex flex-col justify-center text-center overflow-hidden border relative text-[9px] leading-tight ";
                
                if (isFree) {
                  cellClass += "bg-gradient-to-br from-[#ff4fd8]/20 to-[#8b5cf6]/20 text-[#ff4fd8] font-black border-[#ff4fd8]/40 shadow-[0_0_15px_rgba(255,79,216,0.3)]";
                } else if (isSelected) {
                  if (showPreviewModal.status === 'cheating' && !isWin) {
                     cellClass += "border-[#f87171] bg-[#f87171]/20 text-[#f87171] font-bold shadow-inner";
                  } else {
                     cellClass += "border-[#33d8ff] bg-gradient-to-br from-[#33d8ff] to-[#0ea5e9] text-black font-black shadow-[0_0_20px_rgba(51,216,255,0.5)]";
                  }
                } else {
                  cellClass += "border-white/10 bg-black/60 text-white/50 hover:bg-white/5 transition-colors shadow-inner";
                }
                
                if (isWin) {
                  cellClass += " border-4 border-[#ffd76a] z-10 scale-105 shadow-[0_0_30px_rgba(255,215,106,0.5)] bg-gradient-to-br from-[#ffd76a]/20 to-[#ffb800]/20";
                }
 
                const { title, artist } = splitSong(song);
 
                return (
                  <div key={i} className={cellClass}>
                    {isFree ? (
                      <div className="font-black text-xs uppercase tracking-widest">Free</div>
                    ) : (
                      <>
                        <div className="font-black line-clamp-3 leading-snug tracking-tight">{title}</div>
                        <div className="text-[7.5px] mt-1 line-clamp-1 uppercase tracking-wide opacity-80">{artist}</div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
 
            <div className="flex justify-end mt-5">
              <button onClick={() => setShowPreviewModal(null)} className="px-8 py-3 rounded-xl bg-white text-black text-xs font-black tracking-widest uppercase hover:bg-neutral-200 transition-colors cursor-pointer shadow-[0_0_20px_rgba(255,255,255,0.2)]">Close</button>
            </div>
          </div>
        </div>
      )}
 
      {/* End Round & Reset Confirmation Modal */}
      {showResetModal && (
        <div className="fixed inset-0 bg-[#0a0b1e]/90 backdrop-blur-md z-[500] flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-[#131728] border border-white/15 rounded-3xl p-6 text-center shadow-2xl relative overflow-hidden animate-[popIn2_0.2s_ease-out]">
            <div className="w-12 h-12 rounded-full bg-[#f87171]/20 border border-[#f87171]/40 flex items-center justify-center mx-auto mb-4 text-[#f87171]">
              <AlertTriangle className="w-6 h-6" />
            </div>
 
            <h3 className="text-2xl font-black uppercase text-white mb-2">End Round & Reset Game?</h3>
            <p className="text-white/70 text-xs leading-relaxed mb-6">
              This will end the active round, clear all player bingo claims, and return connected players to the lobby to prepare for a fresh game.
            </p>
 
            <div className="flex gap-3">
              <button 
                onClick={() => setShowResetModal(false)}
                className="flex-1 py-3 rounded-2xl bg-white/10 hover:bg-white/20 border border-white/20 text-white font-bold text-xs uppercase tracking-wider transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button 
                onClick={confirmResetGame}
                className="flex-1 py-3 rounded-2xl bg-gradient-to-r from-[#f87171] to-[#ef4444] text-white font-black text-xs uppercase tracking-wider shadow-[0_0_20px_rgba(248,113,113,0.4)] hover:opacity-90 transition-all cursor-pointer"
              >
                End & Reset
              </button>
            </div>
          </div>
        </div>
      )}
 
      <style>{`
        .host-shell {
          min-height: 100dvh;
        }

        @keyframes recordSpin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }

        .host-record {
          transform: rotate(0deg);
        }

        .host-record.is-spinning {
          animation: recordSpin 6s linear infinite;
          transform-origin: 50% 50%;
        }

        .custom-scrollbar {
          scrollbar-width: thin;
          scrollbar-color: rgba(255,255,255,0.18) transparent;
        }

        .custom-scrollbar::-webkit-scrollbar { width: 5px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(255,255,255,0.18);
          border-radius: 999px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.3); }

        .host-record { width: clamp(96px, 13vh, 132px); height: clamp(96px, 13vh, 132px); }
        .host-ring { width: calc(clamp(96px, 13vh, 132px) + 14px); height: calc(clamp(96px, 13vh, 132px) + 14px); }
        .host-track-title { font-size: clamp(1.35rem, 2.4vw, 2.3rem); }
        .host-fit-box { overflow-y: auto; }

        /* Laptop and desktop: the whole console fits the window, nothing scrolls
           except the claims and history lists. */
        @media (min-width: 1024px) {
          .host-shell { height: 100dvh; min-height: 0; overflow: hidden; }
          .host-layout { height: 100%; min-height: 0; }
          .host-stage, .host-sidebar { height: 100%; min-height: 0; }
        }

        @media (min-width: 1024px) and (max-height: 820px) {
          .host-header { padding-top: 0.55rem; padding-bottom: 0.55rem; }
          .host-deck { padding: 0.65rem 0.9rem; }
          .host-record { width: 84px; height: 84px; }
          .host-ring { width: 98px; height: 98px; }
          .host-track-title { font-size: clamp(1.2rem, 2vw, 1.8rem); }
          .host-controls > button { padding-top: 0.7rem; padding-bottom: 0.7rem; }
          .host-prompter { padding: 0.75rem; gap: 0.6rem; }
          .host-sidebar { padding: 0.8rem; gap: 0.75rem; }
        }
      `}</style>
    </div>
  );
}
 
const HistoryItem: React.FC<{ songKey: string, label: string, isCurrent: boolean }> = ({ songKey, label, isCurrent }) => {
  const [data, setData] = useState<{title: string, artist: string, artworkUrl?: string} | null>(null);
  
  useEffect(() => {
    const { title, artist } = splitSong(songKey);
    lookupPreview(title, artist).then(res => setData({ title, artist, artworkUrl: res.artworkUrl }));
  }, [songKey]);
  
  if (!data) return null;
  
  return (
    <div className={`flex items-center gap-2.5 p-2.5 rounded-xl border transition-all ${isCurrent ? 'border-[#33d8ff]/50 bg-gradient-to-r from-[#33d8ff]/20 to-black/40 shadow-[0_0_15px_rgba(51,216,255,0.2)]' : 'border-white/10 bg-black/35 shadow-inner'}`}>
      <div className={`text-[10px] font-black tracking-widest w-8 text-center ${isCurrent ? 'text-[#33d8ff]' : 'text-white/50'}`}>{label}</div>
      <div className="w-9 h-9 bg-black flex-none border border-white/20 rounded-lg bg-cover bg-center shadow-md overflow-hidden" style={data.artworkUrl ? { backgroundImage: `url(${data.artworkUrl})` } : {}}>
        {!data.artworkUrl && <Disc className="w-full h-full p-2 opacity-20 text-white/50" />}
      </div>
      <div className="flex-1 min-w-0 flex flex-col">
        <div className={`text-xs font-black truncate tracking-tight uppercase ${isCurrent ? 'text-white' : 'text-white/80'}`}>{data.title}</div>
        <div className="text-[10px] text-white/50 truncate uppercase tracking-wide mt-0.5">{data.artist}</div>
      </div>
      {isCurrent && <div className="text-[9px] font-black tracking-widest uppercase text-black bg-[#33d8ff] px-2 py-1 rounded-full shadow-[0_0_10px_#33d8ff]">Live</div>}
    </div>
  );
}
