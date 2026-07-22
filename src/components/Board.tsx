import React, { useState, useEffect, useRef } from 'react';
import { subscribeToGameState, submitClaim, pingPresence } from '../lib/store';
import { GameState, Claim } from '../lib/types';
import { songs, shuffle, splitSong, WIN_PATTERNS, getSongFact } from '../lib/data';
import confetti from 'canvas-confetti';
import { BookOpen, Disc, Sparkles, Check, HelpCircle, X, Search, Volume2, Lightbulb, ChevronDown, ChevronUp } from 'lucide-react';
import { playPopSound, playNearWinChime, playBingoFanfare } from '../lib/soundEffects';

const BOARD_STATE_KEY = 'music_bingo_board_state_v3';
const PLAYER_NAME_KEY = 'music_bingo_player_name';

export default function Board() {
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [playerName, setPlayerName] = useState('');
  const [inLobby, setInLobby] = useState(true);
  const [waiting, setWaiting] = useState(false);
  
  const [boardSongs, setBoardSongs] = useState<string[]>([]);
  const [selected, setSelected] = useState<boolean[]>(Array(25).fill(false));
  const [toastMsg, setToastMsg] = useState<{msg: React.ReactNode; id: number} | null>(null);
  
  const [showWinModal, setShowWinModal] = useState(false);
  const [showRulesModal, setShowRulesModal] = useState(false);
  const [winClaim, setWinClaim] = useState<Partial<Claim> | null>(null);
  const [claimInFlight, setClaimInFlight] = useState(false);
  
  const [nearWins, setNearWins] = useState<number[]>([]);
  const [winningLines, setWinningLines] = useState<number[]>([]);
  const [hasConfirmedWin, setHasConfirmedWin] = useState(false);
  const [highlightIdx, setHighlightIdx] = useState<number | null>(null);
  const [showFactModal, setShowFactModal] = useState(false);

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
    if (storedName) setPlayerName(storedName.trim());

    
    const unsubscribe = subscribeToGameState((state) => {
      setGameState(state);
      
      // If game ended, clear board state if session changed
      if (state && state.sessionId) {
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
      
      if (state?.started && waiting) {
        setInLobby(false);
        setWaiting(false);
        initBoard(state.sessionId);
      } else if (!state?.started && !inLobby) {
        setInLobby(true);
        setWaiting(true);
      }
    });
    
    return () => unsubscribe();
  }, [waiting, inLobby]);
  
  useEffect(() => {
    if (boardSongs.length > 0) {
      checkWin(selected);
    }
  }, [selected, boardSongs, gameState?.nowPlaying]);

  const showToast = (msg: React.ReactNode) => {
    setToastMsg({ msg, id: Date.now() });
    setTimeout(() => {
      setToastMsg(prev => prev?.id === toastMsg?.id ? null : prev);
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
    
    localStorage.setItem(BOARD_STATE_KEY, JSON.stringify({
      sessionId,
      songs: shuffled,
      selected: initialSelected
    }));
    
    showToast('✨ Fresh board loaded!');
  };

  const toggleCell = (index: number) => {
    if (index === 12) return; // FREE SPACE
    
    const newSelected = [...selected];
    const willMark = !newSelected[index];
    newSelected[index] = willMark;
    setSelected(newSelected);
    
    // Play audio effect
    playPopSound(willMark);

    if (gameState?.sessionId) {
      localStorage.setItem(BOARD_STATE_KEY, JSON.stringify({
        sessionId: gameState.sessionId,
        songs: boardSongs,
        selected: newSelected
      }));
    }
    
    if (willMark) {
      const { title } = splitSong(boardSongs[index]);
      showToast(<span>🎵 Marked <b>{title}</b></span>);
    } else {
      showToast('↩️ Tile unmarked');
    }
  };

  const checkWin = (sel: boolean[]) => {
    const near = new Set<number>();
    const win = new Set<number>();
    let lines = 0;
    
    WIN_PATTERNS.forEach(pattern => {
      const selectedCount = pattern.filter(i => sel[i]).length;
      if (selectedCount === 4) {
        pattern.forEach(i => { if (!sel[i]) near.add(i); });
      }
      if (selectedCount === 5) {
        lines++;
        pattern.forEach(i => win.add(i));
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
      showToast('🤔 No bingo line yet — keep listening!');
      return;
    }
    
    setClaimInFlight(true);
    setWinClaim({ status: undefined }); // Reset claim state to show checking
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

  if (inLobby) {
    return (
      <div className="min-h-screen bg-neutral-950 text-neutral-50 font-sans flex flex-col items-center justify-center p-6 selection:bg-white selection:text-black">
        <div className="w-full max-w-md bg-neutral-900 border border-neutral-800 p-8 shadow-2xl flex flex-col gap-8">
          <div className="text-left">
            <h1 className="text-3xl font-serif font-medium tracking-tight mb-2">
              Music Bingo
            </h1>
            <p className="text-neutral-400 text-sm font-light">Join the lobby to start playing.</p>
          </div>
          
          <div className="text-left">
            <label className="block text-xs uppercase tracking-widest font-semibold text-neutral-500 mb-2">Player Name</label>
            <input 
              type="text" 
              className="w-full px-4 py-3 border border-neutral-700 bg-neutral-950 text-white text-base outline-none focus:border-white transition-colors"
              placeholder="e.g. Sarah M."
              value={playerName}
              onChange={e => setPlayerName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !waiting && joinLobby()}
              disabled={waiting}
              maxLength={40}
            />
          </div>
          
          <button 
            className="w-full py-4 bg-white text-black text-sm font-semibold tracking-wide uppercase hover:bg-neutral-200 active:bg-neutral-300 disabled:opacity-50 transition-colors cursor-pointer"
            onClick={joinLobby}
            disabled={waiting || playerName.trim().length < 2}
          >
            {waiting ? 'Joining...' : 'Enter Game'}
          </button>
          
          {waiting && (
            <div className="text-sm text-neutral-500 font-medium flex items-center gap-2">
              <span className="w-2 h-2 bg-neutral-400 rounded-full animate-pulse"></span>
              {gameState?.started ? 'Entering game...' : 'Waiting for the host to start…'}
            </div>
          )}
        </div>
      </div>
    );
  }

  const { title: currentTitle, artist: currentArtist } = gameState?.nowPlaying ? splitSong(gameState.nowPlaying) : { title: '', artist: '' };

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-50 font-sans flex flex-col p-4 selection:bg-white selection:text-black">
      <div className="w-full max-w-4xl mx-auto flex flex-col gap-4 flex-1 h-[calc(100vh-32px)]">
        {/* Top Header */}
        <header className="flex-none flex items-center justify-between flex-wrap gap-4 bg-neutral-900 border border-neutral-800 p-4 px-6 shadow-sm">
          <h1 className="text-xl md:text-2xl font-serif font-medium tracking-tight">
            Music Bingo
          </h1>
          
          <div className="flex items-center gap-3">
            <span className="hidden md:inline-flex items-center gap-2 px-3 py-1.5 border border-neutral-700 bg-neutral-950 text-xs font-medium text-neutral-300">
              👤 {playerName}
            </span>

            <button 
              onClick={() => setShowRulesModal(true)} 
              className="flex items-center gap-1.5 px-3 py-2 border border-neutral-700 hover:border-neutral-500 text-xs font-medium transition-colors cursor-pointer"
            >
              <BookOpen size={14} /> <span className="hidden sm:inline">How To Play</span>
            </button>

            <button 
              className={`px-6 py-2 text-xs font-semibold tracking-wide uppercase transition-colors cursor-pointer
                ${winningLines.length > 0 && !hasConfirmedWin
                  ? 'bg-white text-black hover:bg-neutral-200' 
                  : 'bg-neutral-800 text-neutral-500 cursor-not-allowed'
                }`}
              onClick={handleCallBingo}
              disabled={winningLines.length === 0 && !hasConfirmedWin}
            >
              CALL BINGO
            </button>
          </div>
        </header>

        {/* Live Audio Track Locator Bar */}
        {gameState?.nowPlaying && (
          <div className="flex-none flex flex-col gap-3 bg-neutral-900 border border-neutral-800 p-4 shadow-sm">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-4 min-w-0">
                <div className="w-10 h-10 bg-neutral-950 border border-neutral-800 flex items-center justify-center shrink-0 animate-spin" style={{ animationDuration: '4s' }}>
                  <Disc className="w-5 h-5 text-neutral-300" />
                </div>
                <div className="min-w-0">
                  <div className="text-[10px] font-semibold uppercase tracking-widest text-neutral-500">Currently Playing Track</div>
                  <div className="text-sm font-medium text-white truncate">Listen closely! Mark your board if you have it.</div>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button 
                  onClick={() => setShowFactModal(!showFactModal)}
                  className={`flex items-center gap-1.5 px-4 py-2 border text-xs font-medium transition-colors cursor-pointer ${showFactModal ? 'bg-white text-black border-white' : 'hover:bg-neutral-800 border-neutral-700 text-neutral-300'}`}
                >
                  <Lightbulb className="w-3.5 h-3.5" /> Fun Fact
                </button>
              </div>
            </div>

            {/* Expandable Song Fact Drawer */}
            {showFactModal && (
              <div className="mt-2 p-4 bg-neutral-950 border border-neutral-800 text-sm text-neutral-300 leading-relaxed font-light flex items-start gap-3">
                <Lightbulb className="w-4 h-4 text-neutral-500 shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold text-white block mb-1">Song Trivia</span>
                  "{getSongFact(gameState.nowPlaying)}"
                </div>
              </div>
            )}
          </div>
        )}

        {/* Main Board Container */}
        <main className="flex-1 min-h-0 bg-[#131728]/80 backdrop-blur-xl border border-white/10 rounded-2xl md:rounded-3xl flex flex-col overflow-hidden shadow-2xl">
          <div className="flex-none p-3 px-4 md:px-6 border-b border-white/10 flex justify-between items-center bg-white/5">
            <div>
              <h2 className="text-xs md:text-sm uppercase tracking-wider font-black text-white/90">Your Bingo Card</h2>
              <p className="text-[10px] md:text-xs text-white/60 mt-0.5">Mark 5 tiles in a row, column, or diagonal to win!</p>
            </div>
            <div className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-white/5 border border-white/10 text-[#33d8ff]">
              {winningLines.length > 0 ? `🔥 ${winningLines.length / 5} Line${winningLines.length > 5 ? 's' : ''} Complete!` : nearWins.length > 0 ? `⚡ ${nearWins.length} Tile Away!` : '🎧 Listening...'}
            </div>
          </div>
          
          <div className="flex-1 min-h-0 p-3 md:p-5 flex flex-col items-center justify-center relative overflow-hidden">
            {/* B-I-N-G-O Headers */}
            <div className="w-full max-w-[min(100%,calc(100vh-280px))] grid grid-cols-5 gap-1.5 md:gap-3 mb-1.5 md:mb-2 text-center font-black text-base md:text-2xl tracking-widest text-[#ffd76a]">
              {['B', 'I', 'N', 'G', 'O'].map((letter, colIdx) => {
                const isColComplete = [0,1,2,3,4].every(rowIdx => selected[rowIdx * 5 + colIdx]);
                return (
                  <div key={letter} className={`py-1 rounded-lg transition-all ${isColComplete ? 'bg-[#ffd76a] text-black shadow-[0_0_15px_#ffd76a]' : 'bg-white/5 text-white/80'}`}>
                    {letter}
                  </div>
                );
              })}
            </div>

            {/* 5x5 Grid */}
            <div className="w-full max-w-[min(100%,calc(100vh-280px))] aspect-square grid grid-cols-5 gap-1.5 md:gap-3 relative">
              {boardSongs.map((song, i) => {
                const isSelected = selected[i];
                const isFree = i === 12;
                const isWin = winningLines.includes(i);
                const isNear = nearWins.includes(i);
                const isHighlighted = highlightIdx === i;
                const { title, artist } = splitSong(song);
                
                let cellClass = "relative w-full aspect-square p-2 flex flex-col items-center justify-center text-center cursor-pointer select-none transition-colors border border-neutral-800 shadow-sm ";
                
                if (isFree) {
                  cellClass += " bg-neutral-900 cursor-default";
                } else if (isSelected) {
                  cellClass += " bg-white border-white text-black";
                } else if (isHighlighted) {
                  cellClass += " bg-neutral-800 border-neutral-400 z-20 animate-pulse";
                } else {
                  cellClass += " bg-neutral-950 hover:bg-neutral-900 hover:border-neutral-700";
                }
                
                if (isWin) {
                  cellClass += " border-2 border-white z-10 scale-[1.02]";
                } else if (isNear && !isSelected) {
                  cellClass += " border-neutral-500 animate-pulse";
                }

                return (
                  <div 
                    key={i} 
                    className={cellClass}
                    onClick={() => toggleCell(i)}
                  >
                    {isFree ? (
                      <div className="font-serif font-bold text-xs md:text-base leading-tight uppercase z-10 flex flex-col items-center text-neutral-300">
                        <Sparkles className="w-3.5 h-3.5 md:w-5 md:h-5 text-neutral-400 mb-1" />
                        <span>FREE</span>
                      </div>
                    ) : (
                      <div className="z-10 w-full px-1">
                        <div className={`font-serif font-bold text-[9px] md:text-sm leading-tight line-clamp-3 ${isSelected ? 'text-black' : 'text-neutral-200'}`}>{title}</div>
                        <div className={`font-sans font-medium text-[7px] md:text-[10px] mt-1 line-clamp-2 uppercase tracking-wide ${isSelected ? 'text-neutral-700' : 'text-neutral-500'}`}>{artist}</div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </main>
      </div>

      {/* Toast Notification */}
      {toastMsg && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-6 py-3 bg-white text-black font-semibold text-xs md:text-sm shadow-md animate-[popIn2_0.2s_ease-out] pointer-events-none whitespace-nowrap">
          {toastMsg.msg}
        </div>
      )}

      {/* How To Play Rules Modal */}
      {showRulesModal && (
        <div className="fixed inset-0 bg-neutral-950/90 z-[100] flex items-center justify-center p-4">
          <div className="w-full max-w-lg bg-neutral-900 border border-neutral-800 p-8 shadow-2xl relative overflow-hidden animate-[popIn2_0.2s_ease-out]">
            <div className="flex items-center justify-between mb-6 pb-4 border-b border-neutral-800">
              <h2 className="text-xl font-serif font-medium uppercase text-white flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-neutral-400" /> How To Play
              </h2>
              <button onClick={() => setShowRulesModal(false)} className="p-1 text-neutral-500 hover:text-white transition-colors cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 text-sm text-neutral-400 leading-relaxed mb-8 font-light">
              <div className="p-4 bg-neutral-950 border border-neutral-800">
                <strong className="text-white block font-medium mb-1 tracking-wide">1. Listen & Identify</strong>
                The Host plays song clips. Listen carefully to identify the track name or artist.
              </div>
              <div className="p-4 bg-neutral-950 border border-neutral-800">
                <strong className="text-white block font-medium mb-1 tracking-wide">2. Mark Your Card</strong>
                If the song appears on your 5x5 grid, tap the tile to mark it. The center FREE space is already marked.
              </div>
              <div className="p-4 bg-neutral-950 border border-neutral-800">
                <strong className="text-white block font-medium mb-1 tracking-wide">3. Call Bingo!</strong>
                Complete 5 tiles in any horizontal, vertical, or diagonal line and click <b>CALL BINGO</b>.
              </div>
            </div>

            <button 
              onClick={() => setShowRulesModal(false)}
              className="w-full py-4 bg-white text-black font-semibold tracking-wide uppercase hover:bg-neutral-200 transition-colors cursor-pointer text-sm"
            >
              Got It
            </button>
          </div>
        </div>
      )}

      {/* Win Verification Modal */}
      {showWinModal && (
        <div className="fixed inset-0 bg-neutral-950/90 z-[100] flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-neutral-900 border border-neutral-800 p-8 text-center shadow-2xl relative overflow-hidden animate-[popIn2_0.2s_ease-out]">
            
            {!winClaim?.status ? (
              <>
                <h2 className="text-3xl font-serif font-medium uppercase tracking-tighter mb-2 text-white">Checking...</h2>
                <div className="text-neutral-400 text-sm mb-6 flex items-center justify-center gap-2">
                  <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>
                  Validating your bingo with the host...
                </div>
              </>
            ) : winClaim.status === 'valid' ? (
              <>
                <h2 className="text-4xl font-serif font-medium uppercase tracking-tighter mb-2 text-white">BINGO!</h2>
                <p className="text-neutral-400 text-sm mb-4 font-light">
                  Your claim is in! The host has been notified.
                </p>
                {winClaim.winningLines?.[0] && (
                  <p className="text-white font-medium text-sm mb-4">{winClaim.winningLines[0].label}</p>
                )}
                {winClaim.position && (
                  <div className="inline-flex items-center justify-center gap-2 px-6 py-3 border border-neutral-700 bg-neutral-950 text-white text-lg font-serif mb-6">
                    {winClaim.position === 1 ? '🥇 1st Place' : winClaim.position === 2 ? '🥈 2nd Place' : winClaim.position === 3 ? '🥉 3rd Place' : `#${winClaim.position}`}
                  </div>
                )}
              </>
            ) : winClaim.status === 'cheating' ? (
              <>
                <h2 className="text-3xl font-serif font-medium uppercase tracking-tighter mb-2 text-white">Not Quite Right</h2>
                <p className="text-neutral-400 text-sm mb-6 font-light">
                  Hmm — your board doesn't match the songs that have actually been called.<br/><br/>
                  Double-check your marks and unselect any squares you aren't 100% sure about, then press <b>Call Bingo</b> again.
                </p>
              </>
            ) : (
              <>
                <h2 className="text-3xl font-serif font-medium uppercase tracking-tighter mb-2 text-white">Almost!</h2>
                <p className="text-neutral-400 text-sm mb-6 font-light">
                  {winClaim.reason || "The host didn't find a complete line on your board. Keep going!"}
                </p>
              </>
            )}
            
            <button 
              className="w-full py-4 bg-white text-black font-semibold tracking-wide uppercase hover:bg-neutral-200 transition-colors cursor-pointer text-sm"
              onClick={() => setShowWinModal(false)}
            >
              Close to View Board
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

