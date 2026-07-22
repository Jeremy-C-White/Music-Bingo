import React, { useState, useEffect, useRef } from 'react';
import { subscribeToGameState, submitClaim, pingPresence } from '../lib/store';
import { GameState, Claim } from '../lib/types';
import { songs, shuffle, splitSong, WIN_PATTERNS } from '../lib/data';
import confetti from 'canvas-confetti';
import { BookOpen } from 'lucide-react';

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
  const [winClaim, setWinClaim] = useState<Partial<Claim> | null>(null);
  const [claimInFlight, setClaimInFlight] = useState(false);
  
  const [nearWins, setNearWins] = useState<number[]>([]);
  const [winningLines, setWinningLines] = useState<number[]>([]);
  const [hasConfirmedWin, setHasConfirmedWin] = useState(false);

  useEffect(() => {
    let pingInterval: number;
    if (!inLobby && playerName) {
      pingPresence(playerName);
      pingInterval = window.setInterval(() => {
        pingPresence(playerName);
      }, 15000);
    }
    return () => {
      if (pingInterval) clearInterval(pingInterval);
    };
  }, [inLobby, playerName]);

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
    }, 2000);
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
    newSelected[index] = !newSelected[index];
    setSelected(newSelected);
    
    if (gameState?.sessionId) {
      localStorage.setItem(BOARD_STATE_KEY, JSON.stringify({
        sessionId: gameState.sessionId,
        songs: boardSongs,
        selected: newSelected
      }));
    }
    
    if (newSelected[index]) {
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
    
    setNearWins(Array.from(near));
    setWinningLines(Array.from(win));
    
    // Check if near win appeared
    if (lines === 0 && near.size > 0 && Array.from(near).some(i => sel.some((s, idx) => s && idx !== i))) {
      // Just a simple check to not constantly trigger
    }
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
      <div className="min-h-screen bg-gradient-to-br from-[#0a0b1e] via-[#15102e] to-[#0a1326] text-[#f7f8ff] font-sans flex flex-col items-center justify-center p-4 overflow-hidden relative">
      <div className="fixed inset-0 z-0 bg-[radial-gradient(ellipse_at_18%_22%,rgba(255,79,216,0.16)_0%,transparent_28%),radial-gradient(ellipse_at_82%_20%,rgba(51,216,255,0.16)_0%,transparent_30%),radial-gradient(ellipse_at_50%_85%,rgba(139,92,246,0.16)_0%,transparent_34%),linear-gradient(135deg,#0b1020,#170f2e_55%,#09121f)] opacity-100 transition-all duration-1000"></div>
      
      <div className="fixed inset-0 z-[1] pointer-events-none overflow-hidden">
        <div className="absolute rounded-full blur-[14px] opacity-25 animate-[drift_18s_ease-in-out_infinite_alternate] w-[180px] h-[180px] left-[6%] top-[12%] bg-[#ff4fd8]"></div>
        <div className="absolute rounded-full blur-[14px] opacity-25 animate-[drift_24s_ease-in-out_infinite_alternate] w-[220px] h-[220px] right-[8%] top-[18%] bg-[#33d8ff]"></div>
        <div className="absolute rounded-full blur-[14px] opacity-25 animate-[drift_22s_ease-in-out_infinite_alternate] w-[190px] h-[190px] left-[35%] bottom-[4%] bg-[#8b5cf6]"></div>
      </div>
      
      <div className="fixed inset-0 z-[2] pointer-events-none opacity-[0.35] bg-[radial-gradient(circle,rgba(255,255,255,0.06)_0_2px,transparent_2px_100%)] bg-[size:130px_130px] animate-[drift_24s_linear_infinite]"></div>

      <div className="w-full max-w-md bg-[#131728]/70 backdrop-blur-md border border-white/10 rounded-[32px] p-8 shadow-2xl relative z-10 overflow-hidden flex flex-col gap-6">
          <div className="text-center">
            <h1 className="text-5xl font-black tracking-tighter uppercase m-0 leading-none mb-2">
              <span className="bg-gradient-to-r from-white via-white to-white/70 bg-clip-text text-transparent drop-shadow-md">Music</span><br/>
              <span className="bg-gradient-to-r from-[#ffd76a] via-[#ff4fd8] to-[#33d8ff] bg-clip-text text-transparent drop-shadow-[0_0_15px_rgba(255,79,216,0.3)]">Bingo</span>
            </h1>
            <p className="text-white/60 text-sm font-medium mt-3">Enter your name so the host knows who won.</p>
          </div>
          
          <div className="text-left">
            <label className="block text-[11px] tracking-widest uppercase font-black text-[#33d8ff] mb-2 ml-1">Your Name</label>
            <input 
              type="text" 
              className="w-full px-4 py-3 rounded-2xl border border-white/10 bg-[#0a0b1e]/50 text-white text-base font-bold outline-none focus:border-[#ff4fd8] focus:bg-[#0a0b1e]/80 transition-all shadow-inner"
              placeholder="e.g. Sarah M."
              value={playerName}
              onChange={e => setPlayerName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !waiting && joinLobby()}
              disabled={waiting}
              maxLength={40}
            />
          </div>
          
          <button 
            className="w-full py-4 rounded-2xl bg-gradient-to-br from-[#ffd76a] to-[#ff4fd8] text-[#1a0510] text-lg font-black shadow-[0_8px_30px_rgba(255,79,216,0.4)] hover:scale-[0.98] active:scale-[0.95] ring-4 ring-[#ff4fd8]/20 disabled:opacity-50 disabled:grayscale transition-all mt-4"
            onClick={joinLobby}
            disabled={waiting || playerName.trim().length < 2}
          >
            {waiting ? 'Joining...' : 'Enter Waiting Room ✨'}
          </button>
          
          {waiting && (
            <div className="mt-5 p-4 rounded-xl bg-white/5 border border-white/10 text-sm text-white/60">
              <span className="inline-block w-2 h-2 rounded-full bg-[#4ade80] mr-2 animate-pulse"></span>
              {gameState?.started ? 'Entering game...' : 'Waiting for the host to start…'}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0a0b1e] via-[#15102e] to-[#0a1326] text-[#f7f8ff] font-sans flex flex-col p-2 md:p-4 overflow-hidden relative">
      <div className="fixed inset-0 z-0 bg-[radial-gradient(ellipse_at_18%_22%,rgba(255,79,216,0.16)_0%,transparent_28%),radial-gradient(ellipse_at_82%_20%,rgba(51,216,255,0.16)_0%,transparent_30%),radial-gradient(ellipse_at_50%_85%,rgba(139,92,246,0.16)_0%,transparent_34%),linear-gradient(135deg,#0b1020,#170f2e_55%,#09121f)] opacity-100 transition-all duration-1000"></div>
      
      <div className="fixed inset-0 z-[1] pointer-events-none overflow-hidden">
        <div className="absolute rounded-full blur-[14px] opacity-25 animate-[drift_18s_ease-in-out_infinite_alternate] w-[180px] h-[180px] left-[6%] top-[12%] bg-[#ff4fd8]"></div>
        <div className="absolute rounded-full blur-[14px] opacity-25 animate-[drift_24s_ease-in-out_infinite_alternate] w-[220px] h-[220px] right-[8%] top-[18%] bg-[#33d8ff]"></div>
        <div className="absolute rounded-full blur-[14px] opacity-25 animate-[drift_22s_ease-in-out_infinite_alternate] w-[190px] h-[190px] left-[35%] bottom-[4%] bg-[#8b5cf6]"></div>
      </div>
      
      <div className="fixed inset-0 z-[2] pointer-events-none opacity-[0.35] bg-[radial-gradient(circle,rgba(255,255,255,0.06)_0_2px,transparent_2px_100%)] bg-[size:130px_130px] animate-[drift_24s_linear_infinite]"></div>

      <div className="w-full max-w-4xl mx-auto flex flex-col gap-4 relative z-10 flex-1 h-[calc(100vh-32px)]">
        <header className="flex-none flex items-center justify-between flex-wrap gap-3 bg-[#131728]/70 backdrop-blur-md border border-white/10 p-3 px-4 md:p-4 md:px-6 rounded-3xl shadow-2xl">
          <h1 className="text-xl md:text-3xl font-black tracking-tighter uppercase m-0 leading-none">
            <span className="bg-gradient-to-r from-white via-white to-white/70 bg-clip-text text-transparent drop-shadow-md mr-1">Music</span>
            <span className="bg-gradient-to-r from-[#ffd76a] via-[#ff4fd8] to-[#33d8ff] bg-clip-text text-transparent drop-shadow-[0_0_15px_rgba(255,79,216,0.3)]">Bingo</span>
          </h1>
          
          <div className="flex items-center gap-2">
            <span className="hidden md:inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-xs font-bold text-white">
              👤 {playerName}
            </span>
            <button 
              className={`relative px-6 py-2.5 rounded-2xl font-black text-sm transition-all duration-300
                ${winningLines.length > 0 && !hasConfirmedWin
                  ? 'bg-gradient-to-br from-[#ffd76a] to-[#ff4fd8] text-[#1a0510] ring-4 ring-[#ff4fd8]/20 shadow-[0_8px_30px_rgba(255,79,216,0.4)] animate-pulse' 
                  : 'bg-white/5 border border-white/10 text-white hover:bg-white/10 opacity-50'
                }`}
              onClick={handleCallBingo}
              disabled={winningLines.length === 0 && !hasConfirmedWin}
            >
              📣 Call Bingo!
            </button>
            <a href="#" className="hidden md:flex items-center gap-2 px-4 py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-2xl text-xs font-bold transition-all shadow-lg">
              <BookOpen size={14} /> Guide
            </a>
          </div>
        </header>

        <main className="flex-1 min-h-0 bg-[#131728]/70 backdrop-blur-md border border-white/10 rounded-3xl flex flex-col overflow-hidden shadow-2xl">
          <div className="flex-none p-4 px-6 border-b border-white/20 flex justify-between items-center bg-white/5">
            <div>
              <h2 className="text-xs md:text-sm uppercase tracking-wider font-black text-white/90">Your Bingo Board</h2>
              <p className="text-[10px] md:text-xs text-white/60 mt-0.5">Tap songs as you hear them. First line wins.</p>
            </div>
            <div className="text-[10px] font-bold text-white/60">
              {boardSongs.length === 25 ? '⚡ Ready' : '⏳ Loading...'}
            </div>
          </div>
          
          <div className="flex-1 min-h-0 p-4 md:p-6 flex items-center justify-center relative overflow-hidden">
            <div className="w-full max-w-[min(100%,calc(100vh-240px))] aspect-square grid grid-cols-5 gap-2 md:gap-3 relative">
              {boardSongs.map((song, i) => {
                const isSelected = selected[i];
                const isFree = i === 12;
                const isWin = winningLines.includes(i);
                const isNear = nearWins.includes(i);
                const { title, artist } = splitSong(song);
                
                let cellClass = "relative w-full aspect-square rounded-lg md:rounded-xl p-1 md:p-2 flex flex-col items-center justify-center text-center cursor-pointer select-none transition-all duration-200 overflow-hidden border border-white/10 shadow-lg ";
                
                if (isFree) {
                  cellClass += " bg-gradient-to-br from-[#ffd76a]/20 via-[#ff4fd8]/20 to-[#33d8ff]/20 bg-[#171c2f] cursor-default border-[#ffd76a]/40";
                } else if (isSelected) {
                  cellClass += " bg-gradient-to-br from-[#ff4fd8]/60 via-[#8b5cf6]/70 to-[#33d8ff]/50 border-white/40 shadow-[0_0_15px_rgba(139,92,246,0.3)] animate-[selectedGlow_2s_infinite]";
                } else {
                  cellClass += " bg-gradient-to-b from-[#1a2238] to-[#131a2d] hover:-translate-y-0.5 hover:border-white/30";
                }
                
                if (isWin) {
                  cellClass += " ring-2 ring-white ring-offset-2 ring-offset-black/50 shadow-[0_0_20px_rgba(255,215,106,0.6)] z-10 scale-[1.02]";
                } else if (isNear && !isSelected) {
                  cellClass += " border-[#33d8ff] shadow-[0_0_10px_rgba(51,216,255,0.4)] animate-pulse";
                }

                return (
                  <div 
                    key={i} 
                    className={cellClass}
                    onClick={() => toggleCell(i)}
                  >
                    <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent opacity-50 pointer-events-none"></div>
                    {isFree ? (
                      <div className="font-black text-[10px] md:text-base leading-tight uppercase drop-shadow-[0_0_10px_rgba(255,255,255,0.3)] z-10">Free<br/>Space</div>
                    ) : (
                      <div className="z-10 w-full px-0.5">
                        <div className={`font-black text-[8px] md:text-[13px] leading-tight line-clamp-3 md:line-clamp-3 text-balance ${isSelected ? 'text-white' : 'text-white'} drop-shadow-md`}>{title}</div>
                        <div className={`font-bold text-[6px] md:text-[9px] mt-0.5 md:mt-1 line-clamp-2 md:line-clamp-2 text-balance ${isSelected ? 'text-white/90' : 'text-[#ffd76a]'} drop-shadow-md`}>{artist}</div>
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
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-full bg-white text-black font-black text-sm shadow-xl animate-[popIn2_0.2s_ease-out] pointer-events-none whitespace-nowrap">
          {toastMsg.msg}
        </div>
      )}

      {showWinModal && (
        <div className="fixed inset-0 bg-[#03060e]/80 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-[#12182a] border border-white/10 rounded-3xl p-6 text-center shadow-2xl relative overflow-hidden animate-[popIn2_0.2s_ease-out]">
            <div className="absolute inset-0 bg-gradient-to-br from-[#ff4fd8]/10 to-[#33d8ff]/10 pointer-events-none"></div>
            
            {!winClaim?.status ? (
              <>
                <h2 className="text-3xl font-black uppercase tracking-tighter mb-2 bg-gradient-to-br from-[#ffd76a] via-white to-[#ff4fd8] bg-clip-text text-transparent">Checking...</h2>
                <div className="text-white/80 text-sm mb-6 flex items-center justify-center gap-2">
                  <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>
                  Validating your bingo with the host...
                </div>
              </>
            ) : winClaim.status === 'valid' ? (
              <>
                <h2 className="text-4xl font-black uppercase tracking-tighter mb-2 bg-gradient-to-br from-[#ffd76a] via-white to-[#ff4fd8] bg-clip-text text-transparent drop-shadow-[0_0_15px_rgba(255,215,106,0.3)]">BINGO!</h2>
                <p className="text-white/80 text-sm mb-4">
                  Your claim is in! The host has been notified.
                </p>
                {winClaim.winningLines?.[0] && (
                  <p className="text-[#33d8ff] font-bold text-sm mb-4">{winClaim.winningLines[0].label}</p>
                )}
                {winClaim.position && (
                  <div className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-full bg-gradient-to-br from-[#ffd76a]/20 to-[#ff4fd8]/10 border border-[#ffd76a]/40 text-[#ffd76a] text-xl font-black mb-6">
                    {winClaim.position === 1 ? '🥇 1st Place' : winClaim.position === 2 ? '🥈 2nd Place' : winClaim.position === 3 ? '🥉 3rd Place' : `#${winClaim.position}`}
                  </div>
                )}
              </>
            ) : winClaim.status === 'cheating' ? (
              <>
                <h2 className="text-3xl font-black uppercase tracking-tighter mb-2 bg-gradient-to-br from-[#f87171] to-white bg-clip-text text-transparent">Not Quite Right</h2>
                <p className="text-white/80 text-sm mb-6">
                  Hmm — your board doesn't match the songs that have actually been called.<br/><br/>
                  Double-check your marks and unselect any squares you aren't 100% sure about, then press <b>Call Bingo</b> again.
                </p>
              </>
            ) : (
              <>
                <h2 className="text-3xl font-black uppercase tracking-tighter mb-2 bg-gradient-to-br from-[#fb923c] to-white bg-clip-text text-transparent">Almost!</h2>
                <p className="text-white/80 text-sm mb-6">
                  {winClaim.reason || "The host didn't find a complete line on your board. Keep going!"}
                </p>
              </>
            )}
            
            <button 
              className="w-full py-3 rounded-full bg-white/10 hover:bg-white/20 border border-white/20 text-white font-bold transition-all relative z-10"
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
