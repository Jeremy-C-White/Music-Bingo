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
    <div className="min-h-screen bg-gradient-to-br from-[#0a0b1e] via-[#15102e] to-[#0a1326] text-[#f7f8ff] font-sans p-3 md:p-6 relative overflow-hidden selection:bg-[#ff4fd8] selection:text-white">
      <div className="fixed inset-0 z-0 bg-[radial-gradient(ellipse_at_18%_22%,rgba(255,79,216,0.16)_0%,transparent_28%),radial-gradient(ellipse_at_82%_20%,rgba(51,216,255,0.16)_0%,transparent_30%),radial-gradient(ellipse_at_50%_85%,rgba(139,92,246,0.16)_0%,transparent_34%),linear-gradient(135deg,#0b1020,#170f2e_55%,#09121f)] opacity-100 transition-all duration-1000"></div>
      
      <div className="fixed inset-0 z-[1] pointer-events-none overflow-hidden">
        <div className="absolute rounded-full blur-[14px] opacity-25 animate-[drift_18s_ease-in-out_infinite_alternate] w-[180px] h-[180px] left-[6%] top-[12%] bg-[#ff4fd8]"></div>
        <div className="absolute rounded-full blur-[14px] opacity-25 animate-[drift_24s_ease-in-out_infinite_alternate] w-[220px] h-[220px] right-[8%] top-[18%] bg-[#33d8ff]"></div>
        <div className="absolute rounded-full blur-[14px] opacity-25 animate-[drift_22s_ease-in-out_infinite_alternate] w-[190px] h-[190px] left-[35%] bottom-[4%] bg-[#8b5cf6]"></div>
      </div>
      
      <div className="fixed inset-0 z-[2] pointer-events-none opacity-[0.35] bg-[radial-gradient(circle,rgba(255,255,255,0.06)_0_2px,transparent_2px_100%)] bg-[size:130px_130px] animate-[drift_24s_linear_infinite]"></div>

      <div className="max-w-[1380px] mx-auto grid grid-cols-1 lg:grid-cols-[1fr_420px] gap-5 relative z-10">
        
        {/* Header */}
        <div className="col-span-1 lg:col-span-full flex flex-wrap justify-between items-center p-4 px-6 bg-[#131728]/80 backdrop-blur-xl border border-white/10 rounded-2xl md:rounded-3xl shadow-2xl">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-gradient-to-br from-[#ff4fd8] to-[#8b5cf6]">
              <Radio className="w-5 h-5 text-white" />
            </div>
            <h1 className="text-xl md:text-2xl font-black m-0 bg-gradient-to-r from-white via-white to-white/70 bg-clip-text text-transparent uppercase tracking-tight">
              Host <span className="bg-gradient-to-r from-[#ffd76a] via-[#ff4fd8] to-[#33d8ff] bg-clip-text text-transparent">Studio Console</span>
            </h1>
          </div>

          <div className="flex flex-wrap gap-2 md:gap-3 text-xs font-bold text-white/70 mt-2 md:mt-0">
            <span className="bg-[#4ade80]/15 border border-[#4ade80]/30 px-3 py-1.5 rounded-full text-[#4ade80] flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-[#4ade80] animate-pulse"></span>
              Players: {activePlayers}
            </span>
            <span className="bg-white/10 border border-white/10 px-3 py-1.5 rounded-full text-white">
              Called: <strong>{gameState?.history.length || 0}</strong>
            </span>
            <span className="bg-white/10 border border-white/10 px-3 py-1.5 rounded-full text-white">
              Remaining: <strong>{pool.length}</strong>
            </span>
            <span className="bg-gradient-to-br from-[#ffd76a]/20 to-[#ff4fd8]/15 border border-[#ffd76a]/30 px-3 py-1.5 rounded-full text-[#ffd76a] flex items-center gap-1.5">
              <Trophy className="w-3.5 h-3.5" /> Winners: {validWinnersCount}
            </span>
          </div>
        </div>

        {/* Main Stage */}
        <div className="bg-[#131728]/80 backdrop-blur-xl border border-white/10 rounded-2xl md:rounded-3xl p-6 md:p-10 flex flex-col items-center justify-center relative min-h-[560px] text-center shadow-2xl overflow-hidden">
          
          {/* Spinning Turntable Deck */}
          <div className="relative mb-6">
            <div className={`w-[220px] h-[220px] md:w-[260px] md:h-[260px] rounded-full bg-gradient-to-br from-black via-[#111] to-[#1c1c28] border-4 border-white/20 p-2 shadow-[0_0_40px_rgba(255,79,216,0.3)] flex items-center justify-center transition-all ${previewData?.previewUrl && !isAudioLocked ? 'animate-spin' : ''}`} style={{ animationDuration: '8s' }}>
              <div className="w-full h-full rounded-full bg-cover bg-center border-2 border-white/10 relative overflow-hidden flex items-center justify-center" style={previewData?.artworkUrl ? { backgroundImage: `url(${previewData.artworkUrl})` } : {}}>
                {!previewData?.artworkUrl && <Disc className="w-20 h-20 text-white/20" />}
                <div className="absolute w-8 h-8 rounded-full bg-[#12182a] border-2 border-white/40 shadow-inner z-10"></div>
              </div>
            </div>
            
            {gameState?.nowPlaying && (
              <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-[#ff4fd8] text-white font-black text-[10px] uppercase tracking-wider shadow-lg flex items-center gap-1">
                <Sparkles className="w-3 h-3" /> Live
              </div>
            )}
          </div>

          <h2 className="font-black text-2xl md:text-4xl mb-2 leading-tight tracking-tight max-w-[85%] text-balance">
            {gameState?.nowPlaying ? splitSong(gameState.nowPlaying).title : (gameState?.started ? 'Game is Live!' : 'Lobby Open')}
          </h2>
          <div className="text-sm md:text-lg text-white/60 font-medium mb-4">
            {gameState?.nowPlaying ? splitSong(gameState.nowPlaying).artist : (gameState?.started ? "Click 'Play First Song' to begin" : 'Waiting to start the game')}
          </div>

          {/* Host Mic Script & Fun Fact */}
          {gameState?.nowPlaying && (
            <div className="w-full max-w-[460px] mb-6 p-4 rounded-2xl bg-gradient-to-br from-[#ffd76a]/15 via-[#ff4fd8]/10 to-[#12182a] border border-[#ffd76a]/30 text-left shadow-xl relative overflow-hidden group">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2 text-[#ffd76a] font-black text-xs uppercase tracking-wider">
                  <Lightbulb className="w-4 h-4 animate-pulse text-[#ffd76a]" />
                  <span>🎙️ Host Mic Script & Song Fun Fact</span>
                </div>
                <span className="text-[10px] bg-[#ffd76a]/20 text-[#ffd76a] font-bold px-2 py-0.5 rounded-full border border-[#ffd76a]/30">
                  Trivia
                </span>
              </div>
              <p className="text-xs md:text-sm text-white/90 leading-relaxed font-medium m-0">
                "{getSongFact(gameState.nowPlaying)}"
              </p>
            </div>
          )}

          {/* Action Controls & Auto-Caller Switch */}
          <div className="w-full max-w-[460px] flex flex-col gap-3">
            {!gameState?.started ? (
              <button 
                className="w-full py-4 rounded-2xl bg-gradient-to-br from-[#4ade80] to-[#22c55e] text-black text-lg md:text-xl font-black shadow-[0_12px_30px_rgba(74,222,128,0.3)] hover:-translate-y-0.5 transition-transform cursor-pointer flex items-center justify-center gap-2"
                onClick={handleStartGame}
              >
                🚀 Start Game
              </button>
            ) : (
              <>
                <button 
                  className={`w-full py-4 rounded-2xl bg-gradient-to-br from-[#ff4fd8] via-[#8b5cf6] to-[#33d8ff] text-white text-lg md:text-xl font-black shadow-[0_12px_30px_rgba(139,92,246,0.4)] hover:-translate-y-0.5 transition-transform disabled:opacity-50 disabled:grayscale cursor-pointer flex items-center justify-center gap-2 ${pool.length > 0 && !callInFlight ? 'animate-[gentlePulse_2s_infinite]' : ''}`}
                  onClick={handleCallNext}
                  disabled={callInFlight || pool.length === 0}
                >
                  <Disc className="w-5 h-5" /> {gameState.history.length === 0 && !gameState.nowPlaying ? 'Play First Song' : 'Call Next Track'}
                </button>

                {/* Auto Caller Mode Toggle */}
                <div className="flex items-center justify-between p-3 rounded-2xl bg-white/5 border border-white/10 text-xs">
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-[#ffd76a]" />
                    <span className="font-bold">Auto-Caller Mode</span>
                  </div>

                  <div className="flex items-center gap-3">
                    {autoCallerActive && (
                      <span className="font-mono text-[#ffd76a] font-black text-sm bg-black/40 px-2 py-0.5 rounded-lg border border-[#ffd76a]/30">
                        {autoCountdown}s
                      </span>
                    )}
                    <button 
                      onClick={() => setAutoCallerActive(!autoCallerActive)}
                      className={`px-3 py-1.5 rounded-xl font-bold transition-all cursor-pointer ${autoCallerActive ? 'bg-[#ffd76a] text-black shadow-md' : 'bg-white/10 hover:bg-white/20 text-white'}`}
                    >
                      {autoCallerActive ? 'PAUSE AUTO' : 'ENABLE AUTO'}
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Local Audio Player & Volume Bar */}
          {gameState?.nowPlaying && previewData && (
             <div className="mt-6 w-full max-w-[460px] bg-black/30 border border-white/10 rounded-2xl p-3 px-4 backdrop-blur-md">
               <div className="flex justify-between items-center mb-2">
                 <div className={`text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5 ${isAudioLocked ? 'text-[#ffd76a]' : (volume === 0 ? 'text-white/40' : 'text-[#33d8ff]')}`}>
                   <Volume2 className="w-3.5 h-3.5" />
                   {isAudioLocked ? 'Visualizer Controls Audio' : (volume === 0 ? 'Audio Muted' : 'Local Preview Volume')}
                 </div>
                 <div className="flex items-center gap-2">
                   <input type="range" min="0" max="1" step="0.05" value={volume} onChange={(e) => setVolume(Number(e.target.value))} className="w-20 cursor-pointer" disabled={isAudioLocked} />
                 </div>
               </div>
               <audio ref={audioRef} onEnded={() => {}} onTimeUpdate={(e) => {
                 const el = e.currentTarget;
                 const progress = document.getElementById('audioProgress');
                 if (progress) {
                   progress.style.width = `${(el.currentTime / el.duration) * 100}%`;
                 }
               }} />
               <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
                 <div id="audioProgress" className="h-full bg-gradient-to-r from-[#33d8ff] to-[#ff4fd8] w-0 transition-all duration-100 ease-linear"></div>
               </div>
             </div>
          )}
        </div>

        {/* Right Panel */}
        <div className="bg-[#131728]/80 backdrop-blur-xl border border-white/10 rounded-2xl md:rounded-3xl p-5 flex flex-col gap-4 lg:h-[calc(100vh-100px)] overflow-hidden shadow-2xl">
          
          {/* Claims List */}
          <div className="flex flex-col min-h-[260px] lg:max-h-[50%] flex-none">
            <h2 className="flex items-center gap-2 m-0 mb-2 font-black text-xs uppercase tracking-widest text-[#ffd76a]">
              <Trophy className="w-4 h-4 text-[#ffd76a]" /> Bingo Claims <span className="bg-white/10 text-white px-2 py-0.5 rounded-full text-[10px] tracking-normal">{claims.length}</span>
            </h2>
            <div className="flex-1 min-h-0 overflow-y-auto pr-1 flex flex-col gap-2 custom-scrollbar">
              {claims.length === 0 && (
                <div className="text-center text-white/50 text-xs p-4 border border-dashed border-white/10 rounded-2xl leading-relaxed">
                  No claims yet. When a player calls BINGO, their claim will appear here for verification!
                </div>
              )}
              {claims.map(claim => (
                <div key={claim.id} className={`p-3 rounded-2xl border flex flex-col gap-2 relative overflow-hidden bg-white/5
                  ${claim.status === 'valid' ? 'border-[#4ade80]/30 bg-gradient-to-br from-[#4ade80]/10 to-transparent' : ''}
                  ${claim.status === 'cheating' ? 'border-[#f87171]/40 bg-gradient-to-br from-[#f87171]/10 to-transparent' : ''}
                  ${claim.status === 'no_line' ? 'border-[#fb923c]/35 bg-gradient-to-br from-[#fb923c]/10 to-transparent' : ''}
                  ${claim.status === 'valid' && claim.position === 1 ? 'border-[#ffd76a] bg-gradient-to-br from-[#ffd76a]/15 to-[#ff4fd8]/5 shadow-[inset_0_0_0_1px_rgba(255,215,106,0.3)]' : ''}
                `}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <div className={`font-black text-sm min-w-[24px] text-center
                        ${claim.status === 'valid' && claim.position === 1 ? 'text-[#ffd76a] drop-shadow-[0_0_12px_rgba(255,215,106,0.5)]' : ''}
                        ${claim.status === 'valid' && claim.position === 2 ? 'text-[#d5d9e0]' : ''}
                        ${claim.status === 'valid' && claim.position === 3 ? 'text-[#cd7f32]' : ''}
                        ${claim.status !== 'valid' ? 'text-white/60 text-xs' : ''}
                      `}>
                        {claim.status === 'valid' ? (claim.position === 1 ? '🥇' : claim.position === 2 ? '🥈' : claim.position === 3 ? '🥉' : `#${claim.position}`) : '—'}
                      </div>
                      <div className="font-black text-sm text-white truncate">{claim.playerName}</div>
                    </div>
                    <div className="text-[10px] text-white/50 font-bold whitespace-nowrap">
                      {new Date(claim.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                    </div>
                  </div>
                  
                  <div className="flex flex-wrap gap-1.5 items-center">
                    {claim.status === 'valid' && <span className="text-[10px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider bg-[#4ade80]/20 text-[#4ade80] border border-[#4ade80]/40">✅ Valid</span>}
                    {claim.status === 'cheating' && <span className="text-[10px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider bg-[#f87171]/20 text-[#f87171] border border-[#f87171]/40">❌ Invalid</span>}
                    {claim.status === 'no_line' && <span className="text-[10px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider bg-[#fb923c]/20 text-[#fb923c] border border-[#fb923c]/40">⚠️ No Line</span>}
                    
                    {claim.winningLines?.map((line, i) => (
                      <span key={i} className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#33d8ff]/10 text-[#33d8ff] border border-[#33d8ff]/25">{line.label}</span>
                    ))}
                  </div>
                  
                  <div className="flex gap-2 mt-1">
                    <button onClick={() => setShowPreviewModal(claim)} className="flex-1 bg-white/10 hover:bg-white/20 border border-white/10 text-[#33d8ff] py-1.5 text-xs font-bold rounded-xl transition-colors cursor-pointer">👁️ Inspect Board</button>
                    <button onClick={() => dismissClaim(claim.id!)} className="flex-1 bg-white/5 hover:bg-white/10 border border-white/10 text-white/60 py-1.5 text-xs font-bold rounded-xl transition-colors cursor-pointer">✖️ Dismiss</button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Track History */}
          <div className="flex flex-col flex-1 min-h-[140px]">
            <h2 className="flex items-center gap-2 m-0 mb-2 font-black text-xs uppercase tracking-widest text-[#33d8ff]">
              📋 Called History
            </h2>
            <div className="flex-1 min-h-0 overflow-y-auto pr-1 flex flex-col gap-1.5 custom-scrollbar">
              {(!gameState?.history.length && !gameState?.nowPlaying) && (
                <div className="text-center text-white/50 text-xs p-3 border border-dashed border-white/10 rounded-xl">
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
            className="w-full py-3 mt-2 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 text-white/70 hover:text-white text-xs font-bold transition-all cursor-pointer"
            onClick={handleResetGame}
          >
            🔄 End Round & Reset Board
          </button>
        </div>
        
      </div>

      {/* Inspect Player Board Modal */}
      {showPreviewModal && (
        <div className="fixed inset-0 bg-[#03060e]/85 backdrop-blur-md z-[500] flex items-center justify-center p-4" onClick={() => setShowPreviewModal(null)}>
          <div className="w-full max-w-[640px] max-h-[92vh] overflow-y-auto bg-[#12182a] border border-white/15 rounded-3xl p-6 md:p-8 shadow-2xl" onClick={e => e.stopPropagation()}>
            <h3 className="m-0 mb-1 text-2xl font-black bg-gradient-to-r from-[#ff4fd8] to-[#33d8ff] bg-clip-text text-transparent">{showPreviewModal.playerName}'s Card</h3>
            
            <div className="text-xs text-white/70 mb-5 leading-relaxed">
              <strong className={showPreviewModal.status === 'valid' ? 'text-[#4ade80]' : showPreviewModal.status === 'cheating' ? 'text-[#f87171]' : 'text-[#fb923c]'}>
                {showPreviewModal.status === 'valid' ? '✅ Valid Win' : showPreviewModal.status === 'cheating' ? '❌ Invalid Marks' : '⚠️ No Complete Line'}
              </strong> · Submitted at <strong>{new Date(showPreviewModal.timestamp).toLocaleTimeString()}</strong><br/>
              Songs called by then: <strong>{showPreviewModal.historyCountAtClaim}</strong>
            </div>

            <div className="grid grid-cols-5 gap-1.5 bg-black/40 p-3 rounded-2xl border border-white/10">
              {showPreviewModal.songs.map((song, i) => {
                const isSelected = showPreviewModal.selected[i];
                const isFree = i === 12;
                
                const winningIndices = new Set<number>();
                showPreviewModal.winningLines?.forEach(l => l.indices.forEach(idx => winningIndices.add(idx)));
                const isWin = winningIndices.has(i);
                
                let cellClass = "aspect-square rounded-xl p-1 flex flex-col justify-center text-center overflow-hidden border relative text-[9px] leading-tight ";
                
                if (isFree) {
                  cellClass += "bg-gradient-to-br from-[#ffd76a]/30 to-[#ff4fd8]/30 text-white font-black border-[#ffd76a]/40";
                } else if (isSelected) {
                  if (showPreviewModal.status === 'cheating' && !isWin) {
                     cellClass += "border-[#f87171] bg-gradient-to-br from-[#f87171]/50 to-[#f87171]/20 text-white font-bold";
                  } else {
                     cellClass += "border-[#4ade80] bg-gradient-to-br from-[#ff4fd8]/50 to-[#8b5cf6]/60 text-white font-bold";
                  }
                } else {
                  cellClass += "border-white/10 bg-[#131a2d] text-white/70";
                }
                
                if (isWin) {
                  cellClass += " ring-2 ring-[#ffd76a] z-10 scale-[1.02] border-[#ffd76a]";
                }

                const { title, artist } = splitSong(song);

                return (
                  <div key={i} className={cellClass}>
                    {isFree ? (
                      <div className="font-black text-xs uppercase">Free</div>
                    ) : (
                      <>
                        <div className="font-bold line-clamp-3 text-balance">{title}</div>
                        <div className="text-[7.5px] mt-0.5 line-clamp-1 text-[#ffd76a]">{artist}</div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="flex justify-end mt-6">
              <button onClick={() => setShowPreviewModal(null)} className="px-6 py-2.5 bg-white/10 hover:bg-white/20 border border-white/20 text-white rounded-xl text-xs font-bold transition-all cursor-pointer">Close</button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 5px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.15); border-radius: 10px; }
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
    <div className={`flex items-center gap-2.5 p-2 rounded-xl border ${isCurrent ? 'border-[#33d8ff]/40 bg-[#33d8ff]/10' : 'border-white/10 bg-white/5'}`}>
      <div className={`text-[10px] font-black w-7 text-center ${isCurrent ? 'text-[#33d8ff]' : 'text-white/40'}`}>{label}</div>
      <div className="w-8 h-8 rounded-lg bg-black/20 overflow-hidden flex-none border border-white/10 bg-cover bg-center" style={data.artworkUrl ? { backgroundImage: `url(${data.artworkUrl})` } : {}}>
        {!data.artworkUrl && <Disc className="w-full h-full p-2 opacity-30" />}
      </div>
      <div className="flex-1 min-w-0 flex flex-col">
        <div className="text-xs font-bold text-white truncate">{data.title}</div>
        <div className="text-[10px] text-white/50 truncate">{data.artist}</div>
      </div>
      {isCurrent && <div className="text-[8px] font-black tracking-widest uppercase text-[#ff4fd8] px-2 py-0.5 rounded bg-[#ff4fd8]/15 animate-pulse">Live</div>}
    </div>
  );
}
