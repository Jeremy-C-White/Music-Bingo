import React, { useState, useEffect, useRef } from 'react';
import { subscribeToGameState, subscribeToClaims, startNewGame, resetGame, setNowPlaying, dismissClaim, setVisualizerAudioActive, subscribeToPlayerCount } from '../lib/store';
import { GameState, Claim } from '../lib/types';
import { songs, shuffle, splitSong, getSongFact } from '../lib/data';
import { lookupPreview } from '../lib/itunes';
import { Disc, Play, Pause, RotateCcw, Volume2, Search, Zap, Radio, Trophy, CheckCircle, AlertTriangle, XCircle, Sparkles, Clock, Lightbulb, MessageSquareQuote } from 'lucide-react';
import { playCallSound } from '../lib/soundEffects';

export default function Caller() {
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [claims, setClaims] = useState<Claim[]>([]);
  const [pool, setPool] = useState<string[]>([]);
  const [previewData, setPreviewData] = useState<{previewUrl: string; artworkUrl: string} | null>(null);
  const [activePlayers, setActivePlayers] = useState(0);
  
  const [callInFlight, setCallInFlight] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [volume, setVolume] = useState(0.5);
  const [isAudioLocked, setIsAudioLocked] = useState(false);
  
  const [showPreviewModal, setShowPreviewModal] = useState<Claim | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Auto-Caller Mode state
  const [autoCallerActive, setAutoCallerActive] = useState(false);
  const [autoIntervalSeconds, setAutoIntervalSeconds] = useState(20);
  const [autoCountdown, setAutoCountdown] = useState(20);

  useEffect(() => {
    const unsubState = subscribeToGameState((state) => {
      setGameState(state);
      setIsAudioLocked(state?.visualizerAudioActive || false);
      
      if (state) {
        // Rebuild pool by removing history and nowPlaying
        const calledSet = new Set(state.history);
        if (state.nowPlaying) calledSet.add(state.nowPlaying);
        
        // Only shuffle if pool is empty or we reset
        if (pool.length === 0 || (!state.started && pool.length < songs.length)) {
          const fresh = shuffle(songs);
          setPool(fresh.filter(s => !calledSet.has(s)));
        } else {
          setPool(prev => prev.filter(s => !calledSet.has(s)));
        }
        
        if (state.nowPlaying) {
          const { title, artist } = splitSong(state.nowPlaying);
          lookupPreview(title, artist).then(data => {
            setPreviewData(data);
          });
        } else {
          setPreviewData(null);
        }
      }
    });
    
    const unsubClaims = subscribeToClaims((allClaims) => {
      setClaims(allClaims);
    });
    
    return () => {
      unsubState();
      unsubClaims();
    };
  }, []);

  useEffect(() => {
    const unsubPlayers = subscribeToPlayerCount((count) => {
      setActivePlayers(count);
    });
    return () => unsubPlayers();
  }, []);

  // Auto-Caller interval timer logic
  useEffect(() => {
    let timer: number;
    if (autoCallerActive && gameState?.started && pool.length > 0) {
      timer = window.setInterval(() => {
        setAutoCountdown((prev) => {
          if (prev <= 1) {
            handleCallNext();
            return autoIntervalSeconds;
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      setAutoCountdown(autoIntervalSeconds);
    }
    return () => clearInterval(timer);
  }, [autoCallerActive, gameState?.started, pool.length, autoIntervalSeconds]);

  useEffect(() => {
    if (audioRef.current && previewData?.previewUrl) {
      if (audioRef.current.src !== previewData.previewUrl) {
        audioRef.current.src = previewData.previewUrl;
      }
      
      if (!isAudioLocked && volume > 0) {
        audioRef.current.play().catch(e => console.log('Audio autoplay prevented'));
      } else {
        audioRef.current.pause();
      }
    }
  }, [previewData, isAudioLocked]);
  
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = isAudioLocked ? 0 : volume;
    }
  }, [volume, isAudioLocked]);

  const handleStartGame = async () => {
    await startNewGame();
  };

  const handleResetGame = async () => {
    if (confirm('Are you sure you want to end this round and reset the game?')) {
      setAutoCallerActive(false);
      await resetGame();
      setPool(shuffle(songs));
    }
  };

  const handleCallNext = async () => {
    if (callInFlight || pool.length === 0 || !gameState) return;
    
    setCallInFlight(true);
    playCallSound();
    
    const nextSong = pool[pool.length - 1];
    
    const nextHistory = [...gameState.history];
    if (gameState.nowPlaying) {
      nextHistory.push(gameState.nowPlaying);
    }
    
    try {
      await setNowPlaying(nextSong, nextHistory);
      setAutoCountdown(autoIntervalSeconds);
    } catch (e) {
      console.error(e);
      alert('Could not call next track');
    } finally {
      setCallInFlight(false);
    }
  };

  const validWinnersCount = claims.filter(c => c.status === 'valid').length;

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0a0b1e] via-[#15102e] to-[#0a1326] text-[#f7f8ff] font-sans p-4 md:p-6 relative overflow-hidden selection:bg-[#ff4fd8] selection:text-white">
      <div className="fixed inset-0 z-0 bg-[radial-gradient(ellipse_at_18%_22%,rgba(255,79,216,0.16)_0%,transparent_28%),radial-gradient(ellipse_at_82%_20%,rgba(51,216,255,0.16)_0%,transparent_30%),radial-gradient(ellipse_at_50%_85%,rgba(139,92,246,0.16)_0%,transparent_34%),linear-gradient(135deg,#0b1020,#170f2e_55%,#09121f)] opacity-100 transition-all duration-1000 pointer-events-none"></div>

      <div className="max-w-[1400px] mx-auto grid grid-cols-1 lg:grid-cols-[1fr_420px] gap-6 h-full lg:h-[calc(100vh-48px)] relative z-10">
        
        {/* Header (Span full width) */}
        <div className="col-span-1 lg:col-span-full flex flex-wrap justify-between items-center p-5 px-6 bg-[#131728]/80 backdrop-blur-xl border border-white/10 shadow-2xl rounded-2xl md:rounded-3xl">
          <div className="flex items-center gap-4">
            <div className="p-2.5 rounded-xl border border-white/20 bg-gradient-to-br from-[#ff4fd8]/20 to-[#33d8ff]/20">
              <Radio className="w-5 h-5 text-white" />
            </div>
            <h1 className="text-xl md:text-2xl font-black m-0 tracking-tight text-white uppercase flex items-center gap-2">
              Host <span className="text-[#33d8ff]">Studio Console</span>
            </h1>
          </div>
          <div className="flex flex-wrap gap-3 text-xs font-bold text-white/60 mt-4 md:mt-0 uppercase tracking-widest">
            <span className="rounded-xl border border-white/10 bg-black/40 px-4 py-2 flex items-center gap-2 shadow-inner">
              <span className="w-1.5 h-1.5 bg-[#4ade80] rounded-full animate-pulse shadow-[0_0_8px_#4ade80]"></span>
              Players: <strong className="text-white ml-1">{activePlayers}</strong>
            </span>
            <span className="rounded-xl border border-white/10 bg-black/40 px-4 py-2 shadow-inner">
              Called: <strong className="text-white ml-1">{gameState?.history.length || 0}</strong>
            </span>
            <span className="rounded-xl border border-white/10 bg-black/40 px-4 py-2 shadow-inner">
              Remaining: <strong className="text-white ml-1">{pool.length}</strong>
            </span>
            <span className="rounded-xl border border-white/10 bg-gradient-to-r from-[#ffd76a]/20 to-black/40 text-[#ffd76a] px-4 py-2 flex items-center gap-2 shadow-inner">
              <Trophy className="w-3.5 h-3.5" /> Winners: {validWinnersCount}
            </span>
          </div>
        </div>

        {/* Main Stage */}
        <div className="bg-[#131728]/80 backdrop-blur-xl border border-white/10 rounded-2xl md:rounded-3xl shadow-2xl p-8 md:p-12 flex flex-col items-center justify-center relative min-h-[500px] text-center">
          
          {/* Spinning Turntable Deck */}
          <div className="relative mb-8">
            <div className={`w-[200px] h-[200px] md:w-[240px] md:h-[240px] rounded-full bg-gradient-to-br from-[#1a0510] to-[#04050d] shadow-[0_0_40px_rgba(255,79,216,0.3)] border-4 border-white/10 p-2 flex items-center justify-center transition-transform ${previewData?.previewUrl && !isAudioLocked ? 'animate-[spin_6s_linear_infinite]' : ''}`}>
              <div className="w-full h-full rounded-full bg-cover bg-center border border-white/20 relative overflow-hidden flex items-center justify-center" style={previewData?.artworkUrl ? { backgroundImage: `url(${previewData.artworkUrl})` } : {}}>
                {!previewData?.artworkUrl && <Disc className="w-16 h-16 text-white/20" />}
                <div className="absolute w-8 h-8 rounded-full bg-[#0a0b1e] border-2 border-[#ff4fd8]/50 z-10 shadow-[0_0_15px_#ff4fd8]"></div>
              </div>
            </div>
            
            {gameState?.nowPlaying && (
              <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 px-5 py-1.5 rounded-full bg-gradient-to-r from-[#ff4fd8] to-[#8b5cf6] text-white font-black text-[10px] uppercase tracking-widest shadow-[0_0_20px_#ff4fd8] flex items-center gap-2">
                <Sparkles className="w-3 h-3" /> Live
              </div>
            )}
          </div>

          <h2 className="font-black text-3xl md:text-5xl mb-3 tracking-tighter uppercase max-w-[85%] text-balance">
            {gameState?.nowPlaying ? splitSong(gameState.nowPlaying).title : (gameState?.started ? 'Game is Live!' : 'Lobby Open')}
          </h2>
          <div className="text-sm md:text-lg text-white/70 font-medium mb-6 tracking-widest uppercase">
            {gameState?.nowPlaying ? splitSong(gameState.nowPlaying).artist : (gameState?.started ? "Click 'Play First Song' to begin" : 'Waiting to start the game')}
          </div>

          {/* Host Mic Script & Fun Fact */}
          {gameState?.nowPlaying && (
            <div className="w-full max-w-[480px] mb-8 p-5 bg-black/40 border border-white/20 rounded-2xl text-left relative overflow-hidden group shadow-inner">
              <div className="flex items-center justify-between mb-3 border-b border-white/10 pb-2">
                <div className="flex items-center gap-2 text-[#33d8ff] font-bold text-xs uppercase tracking-widest">
                  <Lightbulb className="w-4 h-4 text-[#33d8ff]" />
                  <span>Host Mic Script & Trivia</span>
                </div>
              </div>
              <p className="text-sm text-white/90 leading-relaxed font-medium m-0">
                "{getSongFact(gameState.nowPlaying)}"
              </p>
            </div>
          )}

          {/* Action Controls & Auto-Caller Switch */}
          <div className="w-full max-w-[480px] flex flex-col gap-4">
            {!gameState?.started ? (
              <button 
                className="w-full py-5 rounded-2xl bg-gradient-to-r from-[#ff4fd8] to-[#8b5cf6] text-white text-sm md:text-base font-black tracking-widest uppercase hover:opacity-90 transition-opacity cursor-pointer flex items-center justify-center gap-2 shadow-[0_0_30px_rgba(255,79,216,0.4)]"
                onClick={handleStartGame}
              >
                Start Game
              </button>
            ) : (
              <>
                <button 
                  className={`w-full py-5 rounded-2xl text-sm md:text-base font-black tracking-widest uppercase transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer flex items-center justify-center gap-3 ${pool.length > 0 && !callInFlight ? 'bg-gradient-to-r from-[#33d8ff] to-[#8b5cf6] text-white shadow-[0_0_30px_rgba(51,216,255,0.4)] hover:opacity-90' : 'bg-black/60 border border-white/10 text-white/50 shadow-inner'}`}
                  onClick={handleCallNext}
                  disabled={callInFlight || pool.length === 0}
                >
                  <Disc className="w-5 h-5" /> {gameState.history.length === 0 && !gameState.nowPlaying ? 'Play First Song' : 'Call Next Track'}
                </button>

                {/* Auto Caller Mode Toggle */}
                <div className="flex items-center justify-between p-4 bg-black/40 border border-white/10 rounded-2xl text-xs shadow-inner">
                  <div className="flex items-center gap-2 text-[#ffd76a] font-bold uppercase tracking-widest">
                    <Clock className="w-4 h-4" />
                    <span>Auto-Caller</span>
                  </div>

                  <div className="flex items-center gap-4">
                    {autoCallerActive && (
                      <span className="font-mono text-white font-bold text-sm border-r border-white/10 pr-4">
                        {autoCountdown}s
                      </span>
                    )}
                    <button 
                      onClick={() => setAutoCallerActive(!autoCallerActive)}
                      className={`text-xs font-black uppercase tracking-widest transition-colors cursor-pointer ${autoCallerActive ? 'text-[#ff4fd8] hover:text-[#ff4fd8]/80' : 'text-white/50 hover:text-white'}`}
                    >
                      {autoCallerActive ? 'PAUSE' : 'ENABLE'}
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Local Audio Player & Volume Bar */}
          {gameState?.nowPlaying && previewData && (
             <div className="mt-8 w-full max-w-[480px] bg-black/40 border border-white/10 rounded-2xl p-4 shadow-inner">
               <div className="flex justify-between items-center mb-4">
                 <div className={`text-[10px] font-bold uppercase tracking-widest flex items-center gap-2 ${isAudioLocked ? 'text-white/40' : (volume === 0 ? 'text-[#f87171]' : 'text-[#4ade80]')}`}>
                   <Volume2 className="w-4 h-4" />
                   {isAudioLocked ? 'Stage Board Controls Audio' : (volume === 0 ? 'Muted' : 'Local Volume')}
                 </div>
                 <div className="flex items-center gap-2">
                   <input type="range" min="0" max="1" step="0.05" value={volume} onChange={(e) => setVolume(Number(e.target.value))} className="w-24 cursor-pointer" disabled={isAudioLocked} />
                 </div>
               </div>
               <audio ref={audioRef} onEnded={() => {}} onTimeUpdate={(e) => {
                 const el = e.currentTarget;
                 const progress = document.getElementById('audioProgress');
                 if (progress) {
                   progress.style.width = `${(el.currentTime / el.duration) * 100}%`;
                 }
               }} />
               <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden">
                 <div id="audioProgress" className="h-full bg-gradient-to-r from-[#33d8ff] to-[#ff4fd8] w-0 transition-all duration-100 ease-linear shadow-[0_0_10px_#33d8ff]"></div>
               </div>
             </div>
          )}
        </div>

        {/* Right Panel */}
        <div className="bg-[#131728]/80 backdrop-blur-xl border border-white/10 rounded-2xl md:rounded-3xl shadow-2xl p-6 flex flex-col gap-6 lg:h-full overflow-hidden">
          
          {/* Claims List */}
          <div className="flex flex-col min-h-[260px] lg:max-h-[50%] flex-none">
            <h2 className="flex items-center gap-2 m-0 mb-4 font-black text-xs uppercase tracking-widest text-[#33d8ff] flex items-center gap-2">
              <Trophy className="w-4 h-4" /> Bingo Claims <span className="bg-[#33d8ff]/20 text-[#33d8ff] border border-[#33d8ff]/40 px-2 py-0.5 text-[10px] rounded-full">{claims.length}</span>
            </h2>
            <div className="flex-1 min-h-0 overflow-y-auto pr-2 flex flex-col gap-3 custom-scrollbar">
              {claims.length === 0 && (
                <div className="text-center text-white/50 font-bold text-sm p-6 border border-white/10 bg-black/40 rounded-2xl shadow-inner leading-relaxed uppercase tracking-widest">
                  No claims yet.
                </div>
              )}
              {claims.map(claim => (
                <div key={claim.id} className={`p-5 rounded-2xl border flex flex-col gap-3 relative overflow-hidden shadow-lg transition-all
                  ${claim.status === 'valid' ? 'bg-gradient-to-br from-[#ffd76a]/20 to-black/60 border-[#ffd76a]/50 shadow-[0_0_20px_rgba(255,215,106,0.2)]' : 'bg-black/60 border-white/10'}
                `}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div className={`font-black text-2xl min-w-[32px] drop-shadow-md text-center
                        ${claim.status === 'valid' && claim.position === 1 ? 'text-white' : 'text-white/50'}
                      `}>
                        {claim.status === 'valid' ? (claim.position === 1 ? '🥇' : claim.position === 2 ? '🥈' : claim.position === 3 ? '🥉' : `#${claim.position}`) : '—'}
                      </div>
                      <div className="font-black text-lg text-white truncate tracking-tight uppercase">{claim.playerName}</div>
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
                  
                  <div className="flex gap-2 mt-2">
                    <button onClick={() => setShowPreviewModal(claim)} className="flex-1 bg-white/10 hover:bg-white/20 rounded-xl border border-white/20 py-2 text-xs font-bold tracking-widest uppercase text-white transition-colors cursor-pointer">Inspect Board</button>
                    <button onClick={() => dismissClaim(claim.id!)} className="flex-1 bg-black/40 hover:bg-[#f87171]/20 rounded-xl border border-white/10 hover:border-[#f87171]/40 py-2 text-xs font-bold tracking-widest uppercase text-white/50 hover:text-[#f87171] transition-colors cursor-pointer">Dismiss</button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Track History */}
          <div className="flex flex-col flex-1 min-h-[140px]">
            <h2 className="flex items-center gap-2 m-0 mb-4 font-black text-xs uppercase tracking-widest text-[#ff4fd8] flex items-center gap-2">
              📋 Called History
            </h2>
            <div className="flex-1 min-h-0 overflow-y-auto pr-2 flex flex-col gap-2 custom-scrollbar">
              {(!gameState?.history.length && !gameState?.nowPlaying) && (
                <div className="text-center text-white/50 font-bold uppercase tracking-widest text-sm p-6 border border-white/10 bg-black/40 rounded-2xl shadow-inner">
                  No tracks called yet.
                </div>
              )}
              {gameState?.nowPlaying && (
                <HistoryItem songKey={gameState.nowPlaying} label="NOW" isCurrent={true} />
              )}
              {gameState?.history.slice().reverse().map((songKey, i) => (
                <HistoryItem key={i + songKey} songKey={songKey} label={`#${gameState.history.length - i}`} isCurrent={false} />
              ))}
            </div>
          </div>
          
          <button 
            className="w-full py-4 mt-4 rounded-2xl bg-black/40 hover:bg-[#f87171]/20 border border-white/10 hover:border-[#f87171]/40 text-white/70 hover:text-[#f87171] text-xs font-black tracking-widest uppercase transition-colors cursor-pointer shadow-inner"
            onClick={handleResetGame}
          >
            End Round & Reset
          </button>
        </div>
        
      </div>

      {/* Inspect Player Board Modal */}
      {showPreviewModal && (
        <div className="fixed inset-0 bg-[#0a0b1e]/90 z-[500] flex items-center justify-center p-4" onClick={() => setShowPreviewModal(null)}>
          <div className="w-full max-w-[640px] max-h-[92vh] overflow-y-auto bg-[#131728]/80 backdrop-blur-xl border border-white/10 rounded-2xl shadow-xl p-8 shadow-2xl" onClick={e => e.stopPropagation()}>
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

            <div className="flex justify-end mt-8">
              <button onClick={() => setShowPreviewModal(null)} className="px-8 py-3 rounded-xl bg-white text-black text-xs font-black tracking-widest uppercase hover:bg-neutral-200 transition-colors cursor-pointer shadow-[0_0_20px_rgba(255,255,255,0.2)]">Close</button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #333; }
      `}</style>
    </div>
  );
}

const HistoryItem: React.FC<{ songKey: string, label: string, isCurrent: boolean }> = ({ songKey, label, isCurrent }) => {
  const [data, setData] = useState<{title: string, artist: string, artworkUrl?: string} | null>(null);
  
  useEffect(() => {
    const { title, artist } = splitSong(songKey);
    lookupPreview(title, artist).then(res => {
      setData({ title, artist, artworkUrl: res.artworkUrl });
    });
  }, [songKey]);
  
  if (!data) return null;
  
  return (
    <div className={`flex items-center gap-3 p-3 rounded-2xl border transition-all ${isCurrent ? 'border-[#33d8ff]/50 bg-gradient-to-r from-[#33d8ff]/20 to-black/40 shadow-[0_0_15px_rgba(51,216,255,0.2)]' : 'border-white/10 bg-black/40 shadow-inner'}`}>
      <div className={`text-[10px] font-black tracking-widest w-8 text-center ${isCurrent ? 'text-[#33d8ff]' : 'text-white/50'}`}>{label}</div>
      <div className="w-10 h-10 bg-black flex-none border border-white/20 rounded-md bg-cover bg-center shadow-md overflow-hidden" style={data.artworkUrl ? { backgroundImage: `url(${data.artworkUrl})` } : {}}>
        {!data.artworkUrl && <Disc className="w-full h-full p-2.5 opacity-20 text-white/50" />}
      </div>
      <div className="flex-1 min-w-0 flex flex-col">
        <div className={`text-xs font-black truncate tracking-tight uppercase ${isCurrent ? 'text-white' : 'text-white/80'}`}>{data.title}</div>
        <div className="text-[10px] text-white/50 truncate uppercase tracking-wide mt-0.5">{data.artist}</div>
      </div>
      {isCurrent && <div className="text-[9px] font-black tracking-widest uppercase text-black bg-[#33d8ff] px-2 py-1 rounded-full shadow-[0_0_10px_#33d8ff]">Live</div>}
    </div>
  );
}
