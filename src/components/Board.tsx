import React, { useState, useEffect, useRef } from 'react';
import { subscribeToGameState, submitClaim, pingPresence, sendReaction } from '../lib/store';
import { GameState, Claim } from '../lib/types';
import { songs, shuffle, splitSong, WIN_PATTERNS } from '../lib/data';
import confetti from 'canvas-confetti';
import { BookOpen, Check, Sparkles, X, SmilePlus } from 'lucide-react';
import { playPopSound, playNearWinChime, playBingoFanfare } from '../lib/soundEffects';

const BOARD_STATE_KEY = 'music_bingo_board_state_v3';
const PLAYER_NAME_KEY = 'music_bingo_player_name';
const EMOJI_OPTIONS = ['🔥', '🎉', '🎸', '❤️', '🤘', '🕺', '💃', '🤣'];

const primaryGlass = 'bg-[rgba(13,18,34,0.70)] backdrop-blur-[28px] backdrop-saturate-150 border border-white/[0.14] shadow-[0_28px_90px_rgba(0,0,0,0.42),inset_0_1px_0_rgba(255,255,255,0.10)]';
const secondaryGlass = 'bg-white/[0.055] backdrop-blur-xl backdrop-saturate-150 border border-white/[0.11] shadow-[0_12px_34px_rgba(0,0,0,0.24),inset_0_1px_0_rgba(255,255,255,0.08)]';
const floatingGlass = 'bg-[rgba(15,20,38,0.82)] backdrop-blur-[30px] backdrop-saturate-150 border border-white/[0.16] shadow-[0_26px_80px_rgba(0,0,0,0.48),inset_0_1px_0_rgba(255,255,255,0.12)]';

type AmbientTheme = {
  name: string;
  primary: string;
  secondary: string;
  accent: string;
  fourth: string;
};

const AMBIENT_THEMES: AmbientTheme[] = [
  { name: 'Pop Glow', primary: '255,79,216', secondary: '139,92,246', accent: '51,216,255', fourth: '255,215,106' },
  { name: 'Rock Heat', primary: '255,116,64', secondary: '220,38,38', accent: '255,190,76', fourth: '255,79,120' },
  { name: 'Slow Wave', primary: '48,160,255', secondary: '34,211,238', accent: '99,102,241', fourth: '110,231,255' },
  { name: 'Electric Party', primary: '168,85,247', secondary: '236,72,153', accent: '45,212,191', fourth: '250,204,21' },
];

const CELEBRATION_THEME: AmbientTheme = {
  name: 'Rainbow Win',
  primary: '255,79,216',
  secondary: '51,216,255',
  accent: '255,215,106',
  fourth: '74,222,128',
};

function hashSong(value: string) {
  return value.split('').reduce((total, character) => ((total << 5) - total + character.charCodeAt(0)) | 0, 0);
}

function getAmbientTheme(nowPlaying: string | undefined, hasCompletedLine: boolean) {
  if (hasCompletedLine) return CELEBRATION_THEME;
  if (!nowPlaying) return AMBIENT_THEMES[0];
  return AMBIENT_THEMES[Math.abs(hashSong(nowPlaying)) % AMBIENT_THEMES.length];
}

function StageBackground({ theme, celebratory = false }: { theme: AmbientTheme; celebratory?: boolean }) {
  const orbTransition = 'background-color 1400ms ease, opacity 900ms ease, transform 1200ms ease';

  return (
    <>
      <style>{`
        @keyframes tileGlassShimmer {
          0%, 18% { transform: translateX(-180%) skewX(-18deg); opacity: 0; }
          30% { opacity: .75; }
          62%, 100% { transform: translateX(260%) skewX(-18deg); opacity: 0; }
        }
        @keyframes bingoSparkleSweep {
          0%, 12% { transform: translateX(-180%) skewX(-16deg); opacity: 0; }
          24% { opacity: .9; }
          54%, 100% { transform: translateX(260%) skewX(-16deg); opacity: 0; }
        }
        @keyframes completedLetterGlow {
          0%, 100% { box-shadow: 0 0 20px rgba(255,215,106,.38), inset 0 1px 0 rgba(255,255,255,.45); }
          50% { box-shadow: 0 0 34px rgba(255,215,106,.72), inset 0 1px 0 rgba(255,255,255,.65); }
        }
        @keyframes ambientRainbowFloat {
          0%, 100% { filter: hue-rotate(0deg) saturate(1.05); transform: scale(1); }
          50% { filter: hue-rotate(36deg) saturate(1.28); transform: scale(1.08); }
        }
        @media (prefers-reduced-motion: reduce) {
          .mb-ambient-motion,
          .mb-tile-shimmer,
          .mb-letter-sweep,
          .mb-letter-pulse { animation: none !important; }
        }
      `}</style>

      <div className="fixed inset-0 z-0 bg-[linear-gradient(135deg,#070b16_0%,#120e28_44%,#091523_100%)]" />
      <div className="fixed inset-0 z-[1] pointer-events-none overflow-hidden">
        <div
          className={`mb-ambient-motion absolute left-[-6%] top-[2%] h-[330px] w-[330px] rounded-full opacity-30 blur-[90px] ${celebratory ? 'animate-[ambientRainbowFloat_7s_ease-in-out_infinite]' : 'animate-[drift_18s_ease-in-out_infinite_alternate]'}`}
          style={{ backgroundColor: `rgb(${theme.primary})`, transition: orbTransition }}
        />
        <div
          className={`mb-ambient-motion absolute right-[-3%] top-[10%] h-[360px] w-[360px] rounded-full opacity-[0.28] blur-[95px] ${celebratory ? 'animate-[ambientRainbowFloat_8s_ease-in-out_infinite_reverse]' : 'animate-[drift_22s_ease-in-out_infinite_alternate]'}`}
          style={{ backgroundColor: `rgb(${theme.secondary})`, transition: orbTransition }}
        />
        <div
          className={`mb-ambient-motion absolute bottom-[-12%] left-[22%] h-[380px] w-[380px] rounded-full opacity-[0.28] blur-[100px] ${celebratory ? 'animate-[ambientRainbowFloat_9s_ease-in-out_infinite]' : 'animate-[drift_24s_ease-in-out_infinite_alternate]'}`}
          style={{ backgroundColor: `rgb(${theme.accent})`, transition: orbTransition }}
        />
        <div
          className={`mb-ambient-motion absolute bottom-[8%] right-[20%] h-[220px] w-[220px] rounded-full opacity-[0.18] blur-[85px] ${celebratory ? 'animate-[ambientRainbowFloat_6s_ease-in-out_infinite_reverse]' : 'animate-[drift_20s_ease-in-out_infinite_alternate]'}`}
          style={{ backgroundColor: `rgb(${theme.fourth})`, transition: orbTransition }}
        />
      </div>
      <div className="fixed inset-0 z-[2] pointer-events-none opacity-40 bg-[radial-gradient(circle,rgba(255,255,255,0.075)_0_1.5px,transparent_1.5px_100%)] bg-[size:120px_120px] animate-[drift_28s_linear_infinite]" />
      <div className="fixed inset-0 z-[3] pointer-events-none bg-[linear-gradient(180deg,rgba(255,255,255,0.055),transparent_18%,transparent_82%,rgba(255,255,255,0.035))]" />
      <div className="fixed inset-0 z-[4] pointer-events-none bg-black/[0.16]" />
    </>
  );
}

export default function Board() {
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [playerName, setPlayerName] = useState('');
  const [inLobby, setInLobby] = useState(true);
  const [waiting, setWaiting] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);

  const [boardSongs, setBoardSongs] = useState<string[]>([]);
  const [selected, setSelected] = useState<boolean[]>(Array(25).fill(false));
  const [toastMsg, setToastMsg] = useState<{ msg: React.ReactNode; id: number } | null>(null);

  const [showWinModal, setShowWinModal] = useState(false);
  const [showRulesModal, setShowRulesModal] = useState(false);
  const [winClaim, setWinClaim] = useState<Partial<Claim> | null>(null);
  const [claimInFlight, setClaimInFlight] = useState(false);

  const [nearWins, setNearWins] = useState<number[]>([]);
  const [winningLines, setWinningLines] = useState<number[]>([]);
  const [hasConfirmedWin, setHasConfirmedWin] = useState(false);

  const prevNearWinsCount = useRef(0);

  useEffect(() => {
    let pingInterval: number;
    if (playerName.trim()) {
      pingPresence(playerName);
      pingInterval = window.setInterval(() => {
        pingPresence(playerName);
      }, 10000);
    }
    return () => {
      if (pingInterval) clearInterval(pingInterval);
    };
  }, [playerName]);

  useEffect(() => {
    const storedName = localStorage.getItem(PLAYER_NAME_KEY);
    if (storedName && !playerName) setPlayerName(storedName.trim());

    const unsubscribe = subscribeToGameState((state) => {
      setGameState(state);
      if (!state) return;

      const currentStoredName = localStorage.getItem(PLAYER_NAME_KEY);

      if (state.sessionId) {
        const stored = localStorage.getItem(BOARD_STATE_KEY);
        if (stored) {
          try {
            const parsed = JSON.parse(stored);
            if (parsed.sessionId !== state.sessionId) {
              localStorage.removeItem(BOARD_STATE_KEY);
              setBoardSongs([]);
              setSelected(Array(25).fill(false));
              setHasConfirmedWin(false);
            }
          } catch (e) {}
        }
      }

      if (state.started) {
        if (currentStoredName && currentStoredName.length >= 2) {
          setInLobby(false);
          setWaiting(false);
          initBoard(state.sessionId);
        }
      } else {
        setInLobby(true);
        if (currentStoredName && currentStoredName.length >= 2) {
          setWaiting(true);
        } else {
          setWaiting(false);
        }
      }
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (boardSongs.length > 0) {
      checkWin(selected);
    }
  }, [selected, boardSongs, gameState?.nowPlaying]);

  const showToast = (msg: React.ReactNode) => {
    const id = Date.now();
    setToastMsg({ msg, id });
    setTimeout(() => {
      setToastMsg((prev) => (prev?.id === id ? null : prev));
    }, 2200);
  };

  const joinLobby = () => {
    if (playerName.trim().length < 2) return;
    localStorage.setItem(PLAYER_NAME_KEY, playerName.trim());
    setWaiting(true);
    if (gameState?.started) {
      setInLobby(false);
      setWaiting(false);
      initBoard(gameState.sessionId);
    }
  };

  const initBoard = (sessionId: string) => {
    const stored = localStorage.getItem(BOARD_STATE_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        if (parsed.sessionId === sessionId && parsed.songs?.length === 25) {
          setBoardSongs(parsed.songs);
          setSelected(parsed.selected);
          showToast('💾 Your saved board was restored.');
          return;
        }
      } catch (e) {}
    }

    const shuffled = shuffle(songs).slice(0, 24);
    shuffled.splice(12, 0, 'FREE SPACE');
    setBoardSongs(shuffled);

    const initialSelected = Array(25).fill(false);
    initialSelected[12] = true;
    setSelected(initialSelected);

    localStorage.setItem(
      BOARD_STATE_KEY,
      JSON.stringify({
        sessionId,
        songs: shuffled,
        selected: initialSelected,
      })
    );

    showToast('✨ Fresh board loaded!');
  };

  const toggleCell = (index: number) => {
    if (index === 12) return;

    const newSelected = [...selected];
    const willMark = !newSelected[index];
    newSelected[index] = willMark;
    setSelected(newSelected);

    playPopSound(willMark);

    if (gameState?.sessionId) {
      localStorage.setItem(
        BOARD_STATE_KEY,
        JSON.stringify({
          sessionId: gameState.sessionId,
          songs: boardSongs,
          selected: newSelected,
        })
      );
    }

    if (willMark) {
      const { title } = splitSong(boardSongs[index]);
      showToast(
        <span>
          🎵 Marked <b>{title}</b>
        </span>
      );
    } else {
      showToast('↩️ Tile unmarked');
    }
  };

  const checkWin = (sel: boolean[]) => {
    const near = new Set<number>();
    const win = new Set<number>();
    let lines = 0;

    WIN_PATTERNS.forEach((pattern) => {
      const selectedCount = pattern.filter((i) => sel[i]).length;
      if (selectedCount === 4) {
        pattern.forEach((i) => {
          if (!sel[i]) near.add(i);
        });
      }
      if (selectedCount === 5) {
        lines++;
        pattern.forEach((i) => win.add(i));
      }
    });

    const nearArr = Array.from(near);
    if (nearArr.length > prevNearWinsCount.current && lines === 0) {
      playNearWinChime();
    }
    prevNearWinsCount.current = nearArr.length;

    setNearWins(nearArr);
    setWinningLines(Array.from(win));
  };

  const handleCallBingo = async () => {
    if (claimInFlight || !gameState) return;

    if (hasConfirmedWin) {
      setShowWinModal(true);
      return;
    }

    if (winningLines.length === 0) {
      showToast('🤔 No bingo line yet. Keep listening!');
      return;
    }

    setClaimInFlight(true);
    setWinClaim({ status: undefined });
    setShowWinModal(true);

    try {
      const claim = await submitClaim(playerName, boardSongs, selected, gameState);
      setWinClaim(claim);

      if (claim.status === 'valid') {
        setHasConfirmedWin(true);
        playBingoFanfare();
        const d = { origin: { y: 0.7 } };
        confetti({ ...d, particleCount: 110, spread: 90, startVelocity: 50 });
        confetti({ ...d, particleCount: 70, angle: 60, spread: 70, origin: { x: 0.15, y: 0.65 } });
        confetti({ ...d, particleCount: 70, angle: 120, spread: 70, origin: { x: 0.85, y: 0.65 } });
      }
    } catch (e: any) {
      setWinClaim({ status: undefined, reason: e.message });
    } finally {
      setClaimInFlight(false);
    }
  };

  const handleSendReaction = async (emoji: string) => {
    setShowEmojiPicker(false);
    try {
      await sendReaction(playerName, emoji);
      showToast(`Sent ${emoji} to the big screen!`);
    } catch (error) {
      showToast(`Failed to send ${emoji}.`);
    }
  };

  const hasCompletedLine = winningLines.length > 0;
  const ambientTheme = getAmbientTheme(gameState?.nowPlaying, hasCompletedLine);

  if (inLobby) {
    return (
      <div className="relative min-h-screen overflow-hidden px-4 py-8 text-[#f7f8ff]">
        <StageBackground theme={ambientTheme} />

        <div className="relative z-10 mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-lg items-center justify-center">
          <div className={`relative w-full overflow-hidden rounded-[34px] p-[1px] ${primaryGlass}`}>
            <div className="pointer-events-none absolute inset-0 rounded-[34px] bg-[linear-gradient(135deg,rgba(255,255,255,0.24),transparent_28%,transparent_70%,rgba(255,255,255,0.12))]" />
            <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-white/70 to-transparent" />

            <div className="relative rounded-[33px] bg-[linear-gradient(180deg,rgba(17,22,39,0.84),rgba(13,18,32,0.9))] px-7 py-8 md:px-9 md:py-10">
              <div className="mb-7 text-center">
                <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/[0.12] bg-white/[0.08] px-4 py-1.5 text-[11px] font-bold uppercase tracking-[0.28em] text-white/70">
                  <span className="h-2 w-2 rounded-full bg-[#4ade80] shadow-[0_0_12px_rgba(74,222,128,0.75)]" />
                  Live Party Room
                </div>

                <h1 className="m-0 text-5xl font-black uppercase leading-none tracking-[-0.05em] md:text-6xl">
                  <span className="bg-gradient-to-r from-white via-white to-white/70 bg-clip-text text-transparent drop-shadow-md">Music</span>
                  <br />
                  <span className="bg-gradient-to-r from-[#ffd76a] via-[#ff4fd8] to-[#33d8ff] bg-clip-text text-transparent drop-shadow-[0_0_18px_rgba(255,79,216,0.35)]">Bingo</span>
                </h1>
                <p className="mx-auto mt-4 max-w-sm text-sm font-medium text-white/[0.65] md:text-[15px]">
                  Join the room, grab your card, and get ready for a more premium game board experience.
                </p>
              </div>

              <div className={`mb-5 rounded-[28px] p-[1px] ${secondaryGlass}`}>
                <div className="rounded-[27px] bg-black/20 p-4">
                  <label className="mb-2 ml-1 block text-[11px] font-black uppercase tracking-[0.28em] text-[#7fe8ff]">
                    Your Name
                  </label>
                  <input
                    type="text"
                    className="w-full rounded-2xl border border-white/10 bg-white/[0.07] px-4 py-3.5 text-base font-bold text-white outline-none transition-all placeholder:text-white/[0.28] focus:border-[#ff4fd8]/70 focus:bg-white/[0.10] focus:shadow-[0_0_0_4px_rgba(255,79,216,0.12)]"
                    placeholder="e.g. Sarah M."
                    value={playerName}
                    onChange={(e) => setPlayerName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && !waiting && joinLobby()}
                    disabled={waiting}
                    maxLength={40}
                  />
                </div>
              </div>

              <button
                className="group relative mt-1 w-full overflow-hidden rounded-2xl bg-gradient-to-br from-[#ffe083] via-[#ff74da] to-[#44dcff] px-6 py-4 text-lg font-black text-[#160611] shadow-[0_18px_44px_rgba(255,79,216,0.35)] ring-1 ring-white/20 transition-all hover:-translate-y-0.5 hover:shadow-[0_24px_54px_rgba(255,79,216,0.42)] active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-50 disabled:grayscale"
                onClick={joinLobby}
                disabled={waiting || playerName.trim().length < 2}
              >
                <span className="pointer-events-none absolute inset-0 bg-[linear-gradient(120deg,transparent_15%,rgba(255,255,255,0.45)_50%,transparent_85%)] opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
                <span className="relative">{waiting ? 'Joining...' : 'Enter Waiting Room ✨'}</span>
              </button>

              {waiting && (
                <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-3 text-center text-sm text-white/70">
                  <span className="mr-2 inline-block h-2 w-2 rounded-full bg-[#4ade80] animate-pulse" />
                  {gameState?.started ? 'Entering game...' : 'Waiting for the host to start...'}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen overflow-hidden px-2 py-2 text-[#f7f8ff] md:px-4 md:py-4 selection:bg-[#ff4fd8] selection:text-white">
      <StageBackground theme={ambientTheme} celebratory={hasCompletedLine} />

      <div className="relative z-10 mx-auto flex h-[calc(100vh-16px)] w-full max-w-4xl flex-1 flex-col gap-3 2xl:max-w-6xl 2xl:gap-5 3xl:max-w-7xl">
        <header className={`relative flex flex-none flex-wrap items-center justify-between gap-3 overflow-visible rounded-[28px] px-4 py-3 md:px-6 2xl:px-8 2xl:py-5 ${primaryGlass}`}>
          <div className="pointer-events-none absolute inset-0 rounded-[28px] bg-[linear-gradient(135deg,rgba(255,255,255,0.14),transparent_28%,transparent_78%,rgba(255,255,255,0.10))]" />
          <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-white/75 to-transparent" />

          <div className="relative flex items-center gap-3">
            <div>
              <h1 className="m-0 flex items-center gap-2 text-xl font-black uppercase leading-none tracking-[-0.05em] md:text-3xl 2xl:text-4xl">
                <span className="bg-gradient-to-r from-white via-white to-white/70 bg-clip-text text-transparent drop-shadow-md">Music</span>
                <span className="bg-gradient-to-r from-[#ffd76a] via-[#ff4fd8] to-[#33d8ff] bg-clip-text text-transparent drop-shadow-[0_0_18px_rgba(255,79,216,0.35)]">Bingo</span>
              </h1>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px] font-bold uppercase tracking-[0.24em] text-white/[0.55] md:text-[11px]">
                <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.05] px-3 py-1.5 text-white/70">
                  <span className="h-2 w-2 rounded-full bg-[#4ade80] shadow-[0_0_12px_rgba(74,222,128,0.7)]" />
                  Live Session
                </span>
                <span className="hidden rounded-full border border-white/10 bg-white/[0.05] px-3 py-1.5 text-[#7fe8ff] md:inline-flex">
                  Player: {playerName}
                </span>
              </div>
            </div>
          </div>

          <div className="relative flex items-center gap-2 2xl:gap-3">
            <button
              onClick={() => setShowRulesModal(true)}
              className={`relative flex items-center gap-1.5 overflow-hidden rounded-xl px-3 py-2 text-xs font-bold shadow-md transition-all hover:-translate-y-0.5 hover:bg-white/[0.09] 2xl:px-4 2xl:py-2.5 2xl:text-sm ${secondaryGlass}`}
            >
              <BookOpen size={14} className="text-[#33d8ff] 2xl:h-4 2xl:w-4" />
              <span className="hidden sm:inline">How To Play</span>
            </button>

            <div className="relative">
              <button
                onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                className={`relative flex items-center gap-1.5 overflow-hidden rounded-xl px-3 py-2 text-xs font-bold shadow-md transition-all hover:-translate-y-0.5 hover:bg-white/[0.09] 2xl:px-4 2xl:py-2.5 2xl:text-sm ${secondaryGlass}`}
                title="Send a reaction to the stage screen"
              >
                <SmilePlus size={14} className="text-[#ff4fd8] 2xl:h-4 2xl:w-4" />
                <span className="hidden sm:inline">React</span>
              </button>

              {showEmojiPicker && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowEmojiPicker(false)} />
                  <div className={`absolute right-0 top-full z-[100] mt-2 grid w-48 grid-cols-4 place-items-center gap-3 rounded-2xl p-4 ${floatingGlass}`}>
                    <div className="pointer-events-none absolute inset-0 rounded-2xl bg-[linear-gradient(135deg,rgba(255,255,255,0.16),transparent_30%,transparent_70%,rgba(255,255,255,0.12))]" />
                    {EMOJI_OPTIONS.map((emoji) => (
                      <button
                        key={emoji}
                        onClick={() => handleSendReaction(emoji)}
                        className="relative flex h-9 w-9 items-center justify-center rounded-xl bg-white/[0.06] text-2xl transition-transform hover:scale-125 hover:bg-white/[0.10]"
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>

            <button
              className={`relative overflow-hidden rounded-xl px-5 py-2.5 text-xs font-black transition-all duration-300 md:px-6 md:text-sm 2xl:px-8 2xl:py-3 2xl:text-base ${
                winningLines.length > 0 && !hasConfirmedWin
                  ? 'bg-gradient-to-br from-[#ffe083] via-[#ff74da] to-[#44dcff] text-[#1a0510] ring-1 ring-white/[0.25] shadow-[0_18px_44px_rgba(255,79,216,0.35)] animate-pulse'
                  : `${secondaryGlass} text-white/70 hover:bg-white/[0.09]`
              }`}
              onClick={handleCallBingo}
              disabled={winningLines.length === 0 && !hasConfirmedWin}
            >
              <span className="pointer-events-none absolute inset-0 bg-[linear-gradient(120deg,transparent_10%,rgba(255,255,255,0.35)_50%,transparent_90%)] opacity-0 transition-opacity hover:opacity-100" />
              <span className="relative">📣 CALL BINGO!</span>
            </button>
          </div>
        </header>

        <main className={`relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-[30px] ${primaryGlass}`}>
          <div className="pointer-events-none absolute inset-0 rounded-[30px] bg-[linear-gradient(135deg,rgba(255,255,255,0.12),transparent_22%,transparent_78%,rgba(255,255,255,0.08))]" />
          <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-white/70 to-transparent" />

          <div className="relative flex flex-none items-center justify-between border-b border-white/10 bg-white/[0.04] px-4 py-3 md:px-6 2xl:px-8 2xl:py-4">
            <div>
              <h2 className="text-xs font-black uppercase tracking-[0.24em] text-white/90 md:text-sm 2xl:text-base">Your Bingo Card</h2>
              <p className="mt-0.5 text-[10px] text-white/60 md:text-xs 2xl:text-sm">Mark 5 tiles in a row, column, or diagonal to win.</p>
            </div>
            <div className={`rounded-full px-3 py-1.5 text-[10px] font-bold 2xl:px-4 2xl:py-2 2xl:text-xs ${secondaryGlass} text-[#7fe8ff]`}>
              {winningLines.length > 0
                ? `🔥 ${winningLines.length / 5} Line${winningLines.length > 5 ? 's' : ''} Complete!`
                : nearWins.length > 0
                ? `⚡ ${nearWins.length} Tile Away!`
                : '🎧 Listening...'}
            </div>
          </div>

          <div className="relative flex min-h-0 flex-1 flex-col items-center justify-center overflow-hidden px-3 py-3 md:px-5 md:py-5 2xl:px-8 2xl:py-8">
            <div className="mb-1.5 grid w-full max-w-[min(100%,calc(100vh-280px))] grid-cols-5 gap-1 text-center text-sm font-black tracking-[0.28em] text-[#ffd76a] md:mb-2 md:gap-3 md:text-2xl 2xl:mb-3 2xl:max-w-[min(100%,calc(100vh-340px))] 2xl:gap-4 2xl:text-3xl 3xl:max-w-[min(100%,calc(100vh-400px))] 3xl:text-4xl">
              {['B', 'I', 'N', 'G', 'O'].map((letter, colIdx) => {
                const columnSelectedCount = [0, 1, 2, 3, 4].filter((rowIdx) => selected[rowIdx * 5 + colIdx]).length;
                const isColComplete = columnSelectedCount === 5;

                const letterStateClass = isColComplete
                  ? 'mb-letter-pulse border-[#ffd76a]/70 bg-[linear-gradient(145deg,rgba(255,232,146,0.98),rgba(255,199,74,0.92))] text-[#251400] shadow-[0_0_28px_rgba(255,215,106,0.62),inset_0_1px_0_rgba(255,255,255,0.68)] animate-[completedLetterGlow_2.3s_ease-in-out_infinite]'
                  : columnSelectedCount === 4
                  ? 'mb-letter-pulse border-[#ffd76a]/55 bg-[linear-gradient(145deg,rgba(255,215,106,0.24),rgba(255,79,216,0.13))] text-[#ffe9a8] shadow-[0_0_22px_rgba(255,215,106,0.30),inset_0_1px_0_rgba(255,255,255,0.16)] animate-pulse'
                  : columnSelectedCount >= 3
                  ? 'border-white/20 bg-[linear-gradient(145deg,rgba(255,79,216,0.18),rgba(139,92,246,0.18),rgba(51,216,255,0.14))] text-white shadow-[0_0_18px_rgba(139,92,246,0.24),inset_0_1px_0_rgba(255,255,255,0.13)]'
                  : columnSelectedCount >= 1
                  ? 'border-white/[0.13] bg-white/[0.07] text-white/[0.88] shadow-[0_8px_24px_rgba(0,0,0,0.20),inset_0_1px_0_rgba(255,255,255,0.09)]'
                  : `${secondaryGlass} text-white/[0.62]`;

                return (
                  <div
                    key={letter}
                    className={`relative overflow-hidden rounded-xl py-1.5 transition-all duration-500 2xl:py-2 ${letterStateClass}`}
                    title={`${columnSelectedCount} of 5 tiles marked in column ${letter}`}
                  >
                    {isColComplete && (
                      <span className="mb-letter-sweep pointer-events-none absolute inset-y-0 left-0 w-1/3 bg-gradient-to-r from-transparent via-white/80 to-transparent blur-[1px] animate-[bingoSparkleSweep_2.8s_ease-in-out_infinite]" />
                    )}
                    <span className="relative z-10">{letter}</span>
                  </div>
                );
              })}
            </div>

            <div className="grid aspect-square w-full max-w-[min(100%,calc(100vh-280px))] grid-cols-5 gap-1 md:gap-3 2xl:max-w-[min(100%,calc(100vh-340px))] 2xl:gap-4 3xl:max-w-[min(100%,calc(100vh-400px))]">
              {boardSongs.map((song, i) => {
                const isSelected = selected[i];
                const isFree = i === 12;
                const isWin = winningLines.includes(i);
                const isNear = nearWins.includes(i);
                const { title, artist } = splitSong(song);

                let cellClass = 'group relative flex aspect-square w-full cursor-pointer select-none flex-col items-center justify-center overflow-hidden rounded-xl border p-0.5 text-center shadow-[0_14px_30px_rgba(0,0,0,0.24)] transition-all duration-200 md:rounded-2xl md:p-2 2xl:p-3 ';

                if (isFree) {
                  cellClass += ' border-[#ffd76a]/[0.35] bg-[linear-gradient(145deg,rgba(255,215,106,0.18),rgba(255,79,216,0.18),rgba(51,216,255,0.18))] backdrop-blur-xl cursor-default shadow-[0_18px_38px_rgba(0,0,0,0.25),inset_0_1px_0_rgba(255,255,255,0.18)]';
                } else if (isSelected) {
                  cellClass += ' border-[#8ce8ff]/70 bg-[linear-gradient(145deg,rgba(13,20,38,0.86),rgba(35,24,67,0.84),rgba(13,31,48,0.82))] backdrop-blur-xl shadow-[0_0_0_1px_rgba(255,255,255,0.07),0_0_22px_rgba(51,216,255,0.25),0_18px_42px_rgba(0,0,0,0.34),inset_0_1px_0_rgba(255,255,255,0.16)] hover:-translate-y-0.5';
                } else {
                  cellClass += ' border-white/10 bg-white/[0.06] backdrop-blur-xl shadow-[0_14px_30px_rgba(0,0,0,0.24),inset_0_1px_0_rgba(255,255,255,0.10)] hover:-translate-y-0.5 hover:border-white/20 hover:bg-white/[0.09]';
                }

                if (isWin) {
                  cellClass += ' ring-2 ring-white/90 ring-offset-2 ring-offset-black/50 shadow-[0_0_0_1px_rgba(255,255,255,0.2),0_0_24px_rgba(255,215,106,0.75)]';
                } else if (isNear && !isSelected) {
                  cellClass += ' border-[#33d8ff]/60 shadow-[0_0_18px_rgba(51,216,255,0.35)] animate-pulse';
                }

                return (
                  <div
                    key={i}
                    className={`${cellClass} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7fe8ff] focus-visible:ring-offset-2 focus-visible:ring-offset-[#080d18]`}
                    onClick={() => toggleCell(i)}
                    onKeyDown={(event) => {
                      if (!isFree && (event.key === 'Enter' || event.key === ' ')) {
                        event.preventDefault();
                        toggleCell(i);
                      }
                    }}
                    role={isFree ? undefined : 'button'}
                    tabIndex={isFree ? -1 : 0}
                    aria-pressed={isFree ? undefined : isSelected}
                    aria-label={isFree ? 'Free space' : `${isSelected ? 'Unmark' : 'Mark'} ${title} by ${artist}`}
                  >
                    <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.16),transparent_54%)]" />
                    <div className="pointer-events-none absolute inset-x-2 top-0 h-px bg-gradient-to-r from-transparent via-white/60 to-transparent" />
                    <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.08),transparent_35%,transparent_70%,rgba(0,0,0,0.10))]" />

                    {isSelected && !isFree && (
                      <>
                        <span className="absolute right-1 top-1 z-20 flex h-4 w-4 items-center justify-center rounded-full border border-white/30 bg-white/[0.14] text-white shadow-[0_4px_14px_rgba(0,0,0,0.30),0_0_14px_rgba(51,216,255,0.28)] backdrop-blur-md sm:h-5 sm:w-5 md:right-1.5 md:top-1.5 md:h-6 md:w-6">
                          <Check className="h-2.5 w-2.5 stroke-[3.25] sm:h-3 sm:w-3 md:h-3.5 md:w-3.5" />
                        </span>
                        <span className="mb-tile-shimmer pointer-events-none absolute inset-y-[-15%] left-[-45%] z-[5] w-[34%] bg-gradient-to-r from-transparent via-white/30 to-transparent blur-[1px] animate-[tileGlassShimmer_3.4s_ease-in-out_infinite]" />
                      </>
                    )}

                    {isFree ? (
                      <div className="relative z-10 flex flex-col items-center font-black uppercase leading-tight">
                        <Sparkles className="mb-0.5 h-3.5 w-3.5 text-[#ffd76a] md:h-5 md:w-5 2xl:h-7 2xl:w-7" />
                        <span className="text-[9px] drop-shadow-[0_0_10px_rgba(255,255,255,0.3)] sm:text-[10px] md:text-base 2xl:text-xl">FREE</span>
                      </div>
                    ) : (
                      <div className="relative z-10 w-full px-0.5 sm:px-1">
                        <div className="line-clamp-3 text-balance text-[8px] font-black leading-[1.1] text-white drop-shadow-md sm:text-[10px] sm:leading-tight md:text-[13px] 2xl:text-[16px] 3xl:text-[19px]">
                          {title}
                        </div>
                        <div className={`mt-0.5 line-clamp-2 text-balance text-[6px] font-bold drop-shadow-md sm:text-[8px] md:mt-1 md:text-[9px] 2xl:text-[12px] 3xl:text-[14px] ${isSelected ? 'text-white/[0.92]' : 'text-[#ffd76a]'}`}>
                          {artist}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </main>
      </div>

      {toastMsg && (
        <div className={`fixed left-1/2 top-6 z-[100] -translate-x-1/2 whitespace-nowrap rounded-full px-6 py-3 text-xs font-black text-white shadow-[0_16px_42px_rgba(0,0,0,0.42)] md:text-sm ${floatingGlass}`}>
          <div className="pointer-events-none absolute inset-0 rounded-full bg-[linear-gradient(135deg,rgba(255,255,255,0.16),transparent_28%,transparent_78%,rgba(255,255,255,0.10))]" />
          <span className="relative">{toastMsg.msg}</span>
        </div>
      )}

      {showRulesModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 p-4 backdrop-blur-md">
          <div className={`relative w-full max-w-lg overflow-hidden rounded-[30px] p-[1px] ${floatingGlass}`}>
            <div className="pointer-events-none absolute inset-0 rounded-[30px] bg-[linear-gradient(135deg,rgba(255,255,255,0.18),transparent_30%,transparent_72%,rgba(255,255,255,0.12))]" />
            <div className="relative rounded-[29px] bg-[linear-gradient(180deg,rgba(16,22,37,0.92),rgba(12,17,31,0.95))] p-6">
              <div className="mb-4 flex items-center justify-between border-b border-white/10 pb-3">
                <h2 className="flex items-center gap-2 text-xl font-black uppercase text-white">
                  <BookOpen className="text-[#33d8ff]" /> How To Play
                </h2>
                <button onClick={() => setShowRulesModal(false)} className="rounded-full bg-white/10 p-1 text-white/70 transition-all hover:bg-white/20 hover:text-white">
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="mb-6 space-y-3 text-xs leading-relaxed text-white/80">
                <div className="rounded-2xl border border-white/10 bg-white/[0.05] p-3">
                  <strong className="mb-1 block text-sm text-[#ffd76a]">1. Listen & Identify</strong>
                  The host plays song clips. Listen carefully to identify the track name or artist.
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/[0.05] p-3">
                  <strong className="mb-1 block text-sm text-[#ff4fd8]">2. Mark Your Card</strong>
                  If the song appears on your 5x5 grid, tap the tile to mark it. The center FREE space is already marked.
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/[0.05] p-3">
                  <strong className="mb-1 block text-sm text-[#33d8ff]">3. Call Bingo!</strong>
                  Complete 5 tiles in any horizontal, vertical, or diagonal line and click <b>CALL BINGO</b>.
                </div>
              </div>

              <button
                onClick={() => setShowRulesModal(false)}
                className="w-full rounded-2xl bg-gradient-to-r from-[#ffe083] via-[#ff74da] to-[#44dcff] py-3 text-sm font-black text-black shadow-[0_14px_32px_rgba(255,79,216,0.32)] transition-all hover:-translate-y-0.5"
              >
                Got It! Let's Play 🎵
              </button>
            </div>
          </div>
        </div>
      )}

      {showWinModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[#03060e]/80 p-4 backdrop-blur-md">
          <div className={`relative w-full max-w-md overflow-hidden rounded-[30px] p-[1px] ${floatingGlass}`}>
            <div className="pointer-events-none absolute inset-0 rounded-[30px] bg-[linear-gradient(135deg,rgba(255,255,255,0.18),transparent_30%,transparent_72%,rgba(255,255,255,0.12))]" />
            <div className="relative rounded-[29px] bg-[linear-gradient(180deg,rgba(16,22,37,0.92),rgba(12,17,31,0.96))] p-6 text-center">
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,79,216,0.10),transparent_36%),radial-gradient(circle_at_bottom,rgba(51,216,255,0.10),transparent_34%)]" />

              {!winClaim?.status ? (
                <>
                  <h2 className="mb-2 bg-gradient-to-br from-[#ffd76a] via-white to-[#ff4fd8] bg-clip-text text-3xl font-black uppercase tracking-[-0.05em] text-transparent">Checking...</h2>
                  <div className="mb-6 flex items-center justify-center gap-2 text-sm text-white/80">
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/20 border-t-white" />
                    Validating your bingo with the host...
                  </div>
                </>
              ) : winClaim.status === 'valid' ? (
                <>
                  <h2 className="mb-2 bg-gradient-to-br from-[#ffd76a] via-white to-[#ff4fd8] bg-clip-text text-4xl font-black uppercase tracking-[-0.05em] text-transparent drop-shadow-[0_0_15px_rgba(255,215,106,0.3)]">BINGO!</h2>
                  <p className="mb-4 text-sm text-white/80">Your claim is in. The host has been notified.</p>
                  {winClaim.winningLines?.[0] && <p className="mb-4 text-sm font-bold text-[#33d8ff]">{winClaim.winningLines[0].label}</p>}
                  {winClaim.position && (
                    <div className="mb-6 inline-flex items-center justify-center gap-2 rounded-full border border-[#ffd76a]/[0.35] bg-gradient-to-br from-[#ffd76a]/[0.18] to-[#ff4fd8]/[0.10] px-6 py-3 text-xl font-black text-[#ffd76a]">
                      {winClaim.position === 1
                        ? '🥇 1st Place'
                        : winClaim.position === 2
                        ? '🥈 2nd Place'
                        : winClaim.position === 3
                        ? '🥉 3rd Place'
                        : `#${winClaim.position}`}
                    </div>
                  )}
                </>
              ) : winClaim.status === 'cheating' ? (
                <>
                  <h2 className="mb-2 bg-gradient-to-br from-[#f87171] to-white bg-clip-text text-3xl font-black uppercase tracking-[-0.05em] text-transparent">Not Quite Right</h2>
                  <p className="mb-6 text-sm text-white/80">
                    Hmm. Your board does not match the songs that have actually been called.
                    <br />
                    <br />
                    Double-check your marks and unselect any squares you are not 100% sure about, then press <b>Call Bingo</b> again.
                  </p>
                </>
              ) : (
                <>
                  <h2 className="mb-2 bg-gradient-to-br from-[#fb923c] to-white bg-clip-text text-3xl font-black uppercase tracking-[-0.05em] text-transparent">Almost!</h2>
                  <p className="mb-6 text-sm text-white/80">{winClaim.reason || "The host did not find a complete line on your board. Keep going!"}</p>
                </>
              )}

              <button
                className="relative z-10 w-full rounded-2xl border border-white/[0.15] bg-white/[0.08] py-3 font-bold text-white transition-all hover:bg-white/[0.14]"
                onClick={() => setShowWinModal(false)}
              >
                Close to View Board
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
