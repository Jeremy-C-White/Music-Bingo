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
    <div className="min-h-screen bg-neutral-950 text-neutral-50 font-sans p-4 md:p-6 selection:bg-white selection:text-black">
      <div className="max-w-[1400px] mx-auto grid grid-cols-1 lg:grid-cols-[1fr_420px] gap-6 h-full lg:h-[calc(100vh-48px)]">
        
        {/* Header (Span full width) */}
        <div className="col-span-1 lg:col-span-full flex flex-wrap justify-between items-center p-5 px-6 bg-neutral-900 border border-neutral-800 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="p-2 border border-neutral-700 bg-neutral-950">
              <Radio className="w-5 h-5 text-neutral-300" />
            </div>
            <h1 className="text-xl md:text-2xl font-serif font-medium m-0 tracking-tight text-white">
              Host <span className="text-neutral-400">Studio Console</span>
            </h1>
          </div>

          <div className="flex flex-wrap gap-3 text-xs font-semibold text-neutral-500 mt-4 md:mt-0 uppercase tracking-wide">
            <span className="border border-neutral-800 bg-neutral-950 px-4 py-2 flex items-center gap-2">
              <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse"></span>
              Players: {activePlayers}
            </span>
            <span className="border border-neutral-800 bg-neutral-950 px-4 py-2">
              Called: <strong className="text-white ml-1">{gameState?.history.length || 0}</strong>
            </span>
            <span className="border border-neutral-800 bg-neutral-950 px-4 py-2">
              Remaining: <strong className="text-white ml-1">{pool.length}</strong>
            </span>
            <span className="border border-neutral-800 bg-neutral-950 px-4 py-2 flex items-center gap-2">
              <Trophy className="w-3.5 h-3.5" /> Winners: {validWinnersCount}
            </span>
          </div>
        </div>

        {/* Main Stage */}
        <div className="bg-neutral-900 border border-neutral-800 p-8 md:p-12 flex flex-col items-center justify-center relative min-h-[500px] text-center shadow-sm">
          
          {/* Spinning Turntable Deck */}
          <div className="relative mb-8">
            <div className={`w-[200px] h-[200px] md:w-[240px] md:h-[240px] rounded-full bg-neutral-950 border-4 border-neutral-800 p-2 flex items-center justify-center transition-transform ${previewData?.previewUrl && !isAudioLocked ? 'animate-[spin_6s_linear_infinite]' : ''}`}>
              <div className="w-full h-full rounded-full bg-cover bg-center border border-neutral-700 relative overflow-hidden flex items-center justify-center" style={previewData?.artworkUrl ? { backgroundImage: `url(${previewData.artworkUrl})` } : {}}>
                {!previewData?.artworkUrl && <Disc className="w-16 h-16 text-neutral-800" />}
                <div className="absolute w-6 h-6 rounded-full bg-neutral-900 border border-neutral-700 z-10"></div>
              </div>
            </div>
            
            {gameState?.nowPlaying && (
              <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 px-4 py-1.5 bg-white text-black font-semibold text-[10px] uppercase tracking-widest shadow-md flex items-center gap-2">
                <Sparkles className="w-3 h-3" /> Live
              </div>
            )}
          </div>

          <h2 className="font-serif font-medium text-3xl md:text-5xl mb-3 tracking-tight max-w-[85%] text-balance text-white">
            {gameState?.nowPlaying ? splitSong(gameState.nowPlaying).title : (gameState?.started ? 'Game is Live!' : 'Lobby Open')}
          </h2>
          <div className="text-sm md:text-lg text-neutral-400 font-light mb-6 tracking-wide uppercase">
            {gameState?.nowPlaying ? splitSong(gameState.nowPlaying).artist : (gameState?.started ? "Click 'Play First Song' to begin" : 'Waiting to start the game')}
          </div>

          {/* Host Mic Script & Fun Fact */}
          {gameState?.nowPlaying && (
            <div className="w-full max-w-[480px] mb-8 p-5 bg-neutral-950 border border-neutral-800 text-left relative overflow-hidden group">
              <div className="flex items-center justify-between mb-3 border-b border-neutral-800 pb-2">
                <div className="flex items-center gap-2 text-neutral-300 font-medium text-xs uppercase tracking-widest">
                  <Lightbulb className="w-4 h-4 text-neutral-400" />
                  <span>Host Mic Script & Trivia</span>
                </div>
              </div>
              <p className="text-sm text-neutral-400 leading-relaxed font-light m-0">
                "{getSongFact(gameState.nowPlaying)}"
              </p>
            </div>
          )}

          {/* Action Controls & Auto-Caller Switch */}
          <div className="w-full max-w-[480px] flex flex-col gap-4">
            {!gameState?.started ? (
              <button 
                className="w-full py-5 bg-white text-black text-sm md:text-base font-semibold tracking-wide uppercase hover:bg-neutral-200 transition-colors cursor-pointer flex items-center justify-center gap-2"
                onClick={handleStartGame}
              >
                Start Game
              </button>
            ) : (
              <>
                <button 
                  className={`w-full py-5 text-sm md:text-base font-semibold tracking-wide uppercase hover:bg-neutral-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer flex items-center justify-center gap-3 ${pool.length > 0 && !callInFlight ? 'bg-white text-black' : 'bg-neutral-800 text-neutral-500'}`}
                  onClick={handleCallNext}
                  disabled={callInFlight || pool.length === 0}
                >
                  <Disc className="w-5 h-5" /> {gameState.history.length === 0 && !gameState.nowPlaying ? 'Play First Song' : 'Call Next Track'}
                </button>

                {/* Auto Caller Mode Toggle */}
                <div className="flex items-center justify-between p-4 bg-neutral-950 border border-neutral-800 text-xs">
                  <div className="flex items-center gap-2 text-neutral-400 font-medium uppercase tracking-widest">
                    <Clock className="w-4 h-4" />
                    <span>Auto-Caller</span>
                  </div>

                  <div className="flex items-center gap-4">
                    {autoCallerActive && (
                      <span className="font-mono text-white font-medium text-sm border-r border-neutral-800 pr-4">
                        {autoCountdown}s
                      </span>
                    )}
                    <button 
                      onClick={() => setAutoCallerActive(!autoCallerActive)}
                      className={`text-xs font-semibold uppercase tracking-wider transition-colors cursor-pointer ${autoCallerActive ? 'text-white hover:text-neutral-300' : 'text-neutral-500 hover:text-white'}`}
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
             <div className="mt-8 w-full max-w-[480px] bg-neutral-950 border border-neutral-800 p-4">
               <div className="flex justify-between items-center mb-4">
                 <div className={`text-[10px] font-semibold uppercase tracking-widest flex items-center gap-2 ${isAudioLocked ? 'text-neutral-500' : (volume === 0 ? 'text-neutral-600' : 'text-neutral-300')}`}>
                   <Volume2 className="w-4 h-4" />
                   {isAudioLocked ? 'Stage Board Controls Audio' : (volume === 0 ? 'Muted' : 'Local Volume')}
                 </div>
                 <div className="flex items-center gap-2">
                   <input type="range" min="0" max="1" step="0.05" value={volume} onChange={(e) => setVolume(Number(e.target.value))} className="w-24 cursor-pointer accent-white" disabled={isAudioLocked} />
                 </div>
               </div>
               <audio ref={audioRef} onEnded={() => {}} onTimeUpdate={(e) => {
                 const el = e.currentTarget;
                 const progress = document.getElementById('audioProgress');
                 if (progress) {
                   progress.style.width = `${(el.currentTime / el.duration) * 100}%`;
                 }
               }} />
               <div className="w-full h-1 bg-neutral-800 overflow-hidden">
                 <div id="audioProgress" className="h-full bg-white w-0 transition-all duration-100 ease-linear"></div>
               </div>
             </div>
          )}
        </div>

        {/* Right Panel */}
        <div className="bg-neutral-900 border border-neutral-800 p-6 flex flex-col gap-6 lg:h-full overflow-hidden shadow-sm">
          
          {/* Claims List */}
          <div className="flex flex-col min-h-[260px] lg:max-h-[50%] flex-none">
            <h2 className="flex items-center gap-2 m-0 mb-4 font-semibold text-xs uppercase tracking-widest text-neutral-400">
              <Trophy className="w-4 h-4" /> Bingo Claims <span className="bg-neutral-800 text-white px-2 py-0.5 text-[10px]">{claims.length}</span>
            </h2>
            <div className="flex-1 min-h-0 overflow-y-auto pr-2 flex flex-col gap-3 custom-scrollbar">
              {claims.length === 0 && (
                <div className="text-center text-neutral-500 font-light text-sm p-6 border border-neutral-800 bg-neutral-950 leading-relaxed">
                  No claims yet.
                </div>
              )}
              {claims.map(claim => (
                <div key={claim.id} className={`p-4 border flex flex-col gap-3 relative overflow-hidden bg-neutral-950
                  ${claim.status === 'valid' ? 'border-white' : 'border-neutral-800'}
                `}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div className={`font-serif text-lg min-w-[24px] text-center
                        ${claim.status === 'valid' && claim.position === 1 ? 'text-white' : 'text-neutral-500'}
                      `}>
                        {claim.status === 'valid' ? (claim.position === 1 ? '🥇' : claim.position === 2 ? '🥈' : claim.position === 3 ? '🥉' : `#${claim.position}`) : '—'}
                      </div>
                      <div className="font-medium text-sm text-white truncate tracking-wide">{claim.playerName}</div>
                    </div>
                    <div className="text-[10px] text-neutral-500 font-semibold whitespace-nowrap">
                      {new Date(claim.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                    </div>
                  </div>
                  
                  <div className="flex flex-wrap gap-2 items-center">
                    {claim.status === 'valid' && <span className="text-[10px] font-semibold px-2 py-1 uppercase tracking-widest bg-white text-black">Valid</span>}
                    {claim.status === 'cheating' && <span className="text-[10px] font-semibold px-2 py-1 uppercase tracking-widest border border-neutral-700 text-neutral-400">Invalid</span>}
                    {claim.status === 'no_line' && <span className="text-[10px] font-semibold px-2 py-1 uppercase tracking-widest border border-neutral-700 text-neutral-400">No Line</span>}
                    
                    {claim.winningLines?.map((line, i) => (
                      <span key={i} className="text-[10px] font-semibold px-2 py-1 border border-neutral-700 text-neutral-300">{line.label}</span>
                    ))}
                  </div>
                  
                  <div className="flex gap-2 mt-2">
                    <button onClick={() => setShowPreviewModal(claim)} className="flex-1 bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 py-2 text-xs font-semibold tracking-wide text-neutral-300 transition-colors cursor-pointer">Inspect Board</button>
                    <button onClick={() => dismissClaim(claim.id!)} className="flex-1 bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 py-2 text-xs font-semibold tracking-wide text-neutral-500 hover:text-neutral-300 transition-colors cursor-pointer">Dismiss</button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Track History */}
          <div className="flex flex-col flex-1 min-h-[140px]">
            <h2 className="flex items-center gap-2 m-0 mb-4 font-semibold text-xs uppercase tracking-widest text-neutral-400">
              📋 Called History
            </h2>
            <div className="flex-1 min-h-0 overflow-y-auto pr-2 flex flex-col gap-2 custom-scrollbar">
              {(!gameState?.history.length && !gameState?.nowPlaying) && (
                <div className="text-center text-neutral-500 font-light text-sm p-6 border border-neutral-800 bg-neutral-950">
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
            className="w-full py-4 mt-2 bg-neutral-950 hover:bg-neutral-800 border border-neutral-800 text-neutral-300 hover:text-white text-xs font-semibold tracking-wide uppercase transition-colors cursor-pointer"
            onClick={handleResetGame}
          >
            End Round & Reset
          </button>
        </div>
        
      </div>

      {/* Inspect Player Board Modal */}
      {showPreviewModal && (
        <div className="fixed inset-0 bg-neutral-950/90 z-[500] flex items-center justify-center p-4" onClick={() => setShowPreviewModal(null)}>
          <div className="w-full max-w-[640px] max-h-[92vh] overflow-y-auto bg-neutral-900 border border-neutral-800 p-8 shadow-2xl" onClick={e => e.stopPropagation()}>
            <h3 className="m-0 mb-2 text-2xl font-serif font-medium text-white">{showPreviewModal.playerName}'s Card</h3>
            
            <div className="text-xs text-neutral-400 mb-6 font-light leading-relaxed">
              <strong className={showPreviewModal.status === 'valid' ? 'text-white' : 'text-neutral-500'}>
                {showPreviewModal.status === 'valid' ? '✅ Valid Win' : showPreviewModal.status === 'cheating' ? '❌ Invalid Marks' : '⚠️ No Complete Line'}
              </strong> · Submitted at <strong>{new Date(showPreviewModal.timestamp).toLocaleTimeString()}</strong><br/>
              Songs called by then: <strong>{showPreviewModal.historyCountAtClaim}</strong>
            </div>

            <div className="grid grid-cols-5 gap-1 bg-neutral-950 border border-neutral-800 p-1">
              {showPreviewModal.songs.map((song, i) => {
                const isSelected = showPreviewModal.selected[i];
                const isFree = i === 12;
                
                const winningIndices = new Set<number>();
                showPreviewModal.winningLines?.forEach(l => l.indices.forEach(idx => winningIndices.add(idx)));
                const isWin = winningIndices.has(i);
                
                let cellClass = "aspect-square p-1 flex flex-col justify-center text-center overflow-hidden border relative text-[9px] leading-tight ";
                
                if (isFree) {
                  cellClass += "bg-neutral-800 text-neutral-300 font-semibold border-neutral-700";
                } else if (isSelected) {
                  if (showPreviewModal.status === 'cheating' && !isWin) {
                     cellClass += "border-neutral-500 bg-neutral-800 text-neutral-400";
                  } else {
                     cellClass += "border-white bg-white text-black font-semibold";
                  }
                } else {
                  cellClass += "border-neutral-900 bg-neutral-950 text-neutral-600";
                }
                
                if (isWin) {
                  cellClass += " border-2 border-white z-10 scale-[1.02]";
                }

                const { title, artist } = splitSong(song);

                return (
                  <div key={i} className={cellClass}>
                    {isFree ? (
                      <div className="font-serif font-bold text-xs uppercase">Free</div>
                    ) : (
                      <>
                        <div className="font-serif font-medium line-clamp-3 leading-snug">{title}</div>
                        <div className="text-[7.5px] mt-1 line-clamp-1 uppercase tracking-wide opacity-80">{artist}</div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="flex justify-end mt-8">
              <button onClick={() => setShowPreviewModal(null)} className="px-8 py-3 bg-white text-black text-xs font-semibold tracking-wide uppercase hover:bg-neutral-200 transition-colors cursor-pointer">Close</button>
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
    <div className={`flex items-center gap-3 p-3 border ${isCurrent ? 'border-white bg-white/5' : 'border-neutral-800 bg-neutral-950'}`}>
      <div className={`text-[10px] font-semibold tracking-widest w-8 text-center ${isCurrent ? 'text-white' : 'text-neutral-500'}`}>{label}</div>
      <div className="w-10 h-10 bg-neutral-900 flex-none border border-neutral-800 bg-cover bg-center" style={data.artworkUrl ? { backgroundImage: `url(${data.artworkUrl})` } : {}}>
        {!data.artworkUrl && <Disc className="w-full h-full p-2.5 opacity-20 text-neutral-500" />}
      </div>
      <div className="flex-1 min-w-0 flex flex-col">
        <div className={`text-xs font-medium truncate ${isCurrent ? 'text-white' : 'text-neutral-300'}`}>{data.title}</div>
        <div className="text-[10px] text-neutral-500 truncate uppercase tracking-wide mt-0.5">{data.artist}</div>
      </div>
      {isCurrent && <div className="text-[9px] font-semibold tracking-widest uppercase text-black bg-white px-2 py-1">Live</div>}
    </div>
  );
}
