import React, { useState, useEffect, useRef } from 'react';
import { subscribeToGameState, subscribeToClaims, startNewGame, resetGame, setNowPlaying, dismissClaim, subscribeToPlayerCount } from '../lib/store';
import { GameState, Claim } from '../lib/types';
import { songs, shuffle, splitSong, getSongFact } from '../lib/data';
import { lookupPreview } from '../lib/itunes';
import { Disc, Radio, Trophy, AlertTriangle, Sparkles, Clock, Lightbulb, MessageSquareQuote, Maximize2, Minimize2 } from 'lucide-react';
import { playCallSound } from '../lib/soundEffects';
 
export default function Caller() {
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [claims, setClaims] = useState<Claim[]>([]);
  const [pool, setPool] = useState<string[]>([]);
  const [previewData, setPreviewData] = useState<{previewUrl: string; artworkUrl: string} | null>(null);
  const [activePlayers, setActivePlayers] = useState(0);
  
  const [callInFlight, setCallInFlight] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [volume] = useState(0.5);
  const [isAudioLocked, setIsAudioLocked] = useState(false);
  
  const [showPreviewModal, setShowPreviewModal] = useState<Claim | null>(null);
  const [showResetModal, setShowResetModal] = useState(false);
  const [showTeleprompter, setShowTeleprompter] = useState(false);
  const [scriptFontSize, setScriptFontSize] = useState<'normal' | 'large' | 'xl'>('large');
  
  // Auto-Caller Mode state
  const [autoCallerActive, setAutoCallerActive] = useState(false);
  const [autoIntervalSeconds] = useState(20);
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
        audioRef.current.play().catch(() => console.log('Audio autoplay prevented'));
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
 
  const handleResetGame = () => {
    setShowResetModal(true);
  };
 
  const confirmResetGame = async () => {
    setShowResetModal(false);
    setAutoCallerActive(false);
    try {
      await resetGame();
      setPool(shuffle(songs));
    } catch (e) {
      console.error('Failed to reset game:', e);
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
      console.error('Could not call next track:', e);
    } finally {
      setCallInFlight(false);
    }
  };
 
  const validWinnersCount = claims.filter(c => c.status === 'valid').length;
 
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
          <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-2 text-[10px] xl:text-xs font-bold text-white/60 uppercase tracking-[0.14em]">
            <span className="rounded-xl border border-white/10 bg-black/35 px-3 py-2 flex items-center justify-center gap-2 shadow-inner whitespace-nowrap">
              <span className="w-1.5 h-1.5 bg-[#4ade80] rounded-full animate-pulse shadow-[0_0_8px_#4ade80]"></span>
              Players: <strong className="text-white ml-1">{activePlayers}</strong>
            </span>
            <span className="rounded-xl border border-white/10 bg-black/35 px-3 py-2 shadow-inner text-center whitespace-nowrap">
              Called: <strong className="text-white ml-1">{gameState?.history.length || 0}</strong>
            </span>
            <span className="rounded-xl border border-white/10 bg-black/35 px-3 py-2 shadow-inner text-center whitespace-nowrap">
              Remaining: <strong className="text-white ml-1">{pool.length}</strong>
            </span>
            <span className="rounded-xl border border-[#ffd76a]/20 bg-gradient-to-r from-[#ffd76a]/16 to-black/35 text-[#ffd76a] px-3 py-2 flex items-center justify-center gap-2 shadow-inner whitespace-nowrap">
              <Trophy className="w-3.5 h-3.5" /> Winners: {validWinnersCount}
            </span>
          </div>
        </div>
 
        {/* Main Stage */}
        <div className="host-stage min-w-0 min-h-[520px] lg:min-h-0 bg-[#131728]/82 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl px-4 py-5 sm:p-6 xl:p-7 flex flex-col items-center justify-center lg:overflow-y-auto custom-scrollbar relative text-center">
          
          {/* Spinning Turntable Deck */}
          <div className="host-record-wrap relative mb-5 sm:mb-6">
            <div className={`host-record w-[clamp(150px,24vh,250px)] h-[clamp(150px,24vh,250px)] rounded-full bg-gradient-to-br from-[#1a0510] to-[#04050d] shadow-[0_0_36px_rgba(255,79,216,0.26)] border-[3px] border-white/10 p-2 flex items-center justify-center transition-transform ${previewData?.previewUrl && !isAudioLocked ? 'animate-[spin_6s_linear_infinite]' : ''}`}>
              <div className="w-full h-full rounded-full bg-cover bg-center border border-white/20 relative overflow-hidden flex items-center justify-center" style={previewData?.artworkUrl ? { backgroundImage: `url(${previewData.artworkUrl})` } : {}}>
                {!previewData?.artworkUrl && <Disc className="w-16 h-16 text-white/20" />}
                <div className="absolute w-9 h-9 rounded-full bg-[#0a0b1e] border-2 border-[#ff4fd8]/50 z-10 shadow-[0_0_15px_#ff4fd8]"></div>
              </div>
            </div>
            
            {gameState?.nowPlaying && (
              <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 px-4 py-1.5 rounded-full bg-gradient-to-r from-[#ff4fd8] to-[#8b5cf6] text-white font-black text-[10px] uppercase tracking-widest shadow-[0_0_20px_#ff4fd8] flex items-center gap-2">
                <Sparkles className="w-3 h-3" /> Live
              </div>
            )}
          </div>
 
          <h2 className="host-track-title font-black text-[clamp(1.65rem,3.6vw,3.35rem)] mb-1.5 tracking-tighter uppercase max-w-[96%] sm:max-w-[88%] leading-[0.98] text-balance">
            {gameState?.nowPlaying ? splitSong(gameState.nowPlaying).title : (gameState?.started ? 'Game is Live!' : 'Lobby Open')}
          </h2>
          <div className="host-track-artist text-[clamp(0.78rem,1.2vw,1.15rem)] text-white/68 font-semibold mb-4 tracking-[0.16em] uppercase text-balance px-2">
            {gameState?.nowPlaying ? splitSong(gameState.nowPlaying).artist : (gameState?.started ? "Click 'Play First Song' to begin" : 'Waiting to start the game')}
          </div>
 
          {/* Host Mic Script & Fun Fact */}
          {gameState?.nowPlaying && (
            <div className="host-script-card w-full max-w-[660px] mb-4 p-4 sm:p-5 bg-black/55 border border-[#33d8ff]/28 rounded-2xl text-left relative overflow-hidden shadow-xl backdrop-blur-md">
              <div className="flex flex-wrap items-center justify-between mb-3 border-b border-white/10 pb-2.5 gap-2">
                <div className="flex items-center gap-2 text-[#33d8ff] font-bold text-[11px] sm:text-xs uppercase tracking-widest">
                  <Lightbulb className="w-4 h-4 text-[#33d8ff]" />
                  <span>Host Mic Script & Trivia</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="flex items-center bg-white/10 rounded-lg p-0.5 border border-white/10 text-[11px] font-bold">
                    <button 
                      onClick={() => setScriptFontSize('normal')} 
                      className={`px-2 py-1 rounded transition-colors cursor-pointer ${scriptFontSize === 'normal' ? 'bg-[#33d8ff] text-black font-extrabold' : 'text-white/70 hover:text-white'}`}
                      title="Standard text size"
                    >
                      A
                    </button>
                    <button 
                      onClick={() => setScriptFontSize('large')} 
                      className={`px-2 py-1 rounded transition-colors cursor-pointer ${scriptFontSize === 'large' ? 'bg-[#33d8ff] text-black font-extrabold' : 'text-white/70 hover:text-white'}`}
                      title="Large text size"
                    >
                      A+
                    </button>
                    <button 
                      onClick={() => setScriptFontSize('xl')} 
                      className={`px-2 py-1 rounded transition-colors cursor-pointer ${scriptFontSize === 'xl' ? 'bg-[#33d8ff] text-black font-extrabold' : 'text-white/70 hover:text-white'}`}
                      title="Extra Large text size"
                    >
                      A++
                    </button>
                  </div>
                  <button
                    onClick={() => setShowTeleprompter(true)}
                    className="px-2.5 py-1.5 rounded-lg bg-[#ff4fd8]/20 hover:bg-[#ff4fd8]/30 border border-[#ff4fd8]/40 text-[#ff4fd8] transition-colors cursor-pointer flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider"
                    title="Open Fullscreen Host Teleprompter"
                  >
                    <Maximize2 className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Teleprompter</span>
                  </button>
                </div>
              </div>
              <div className="host-script-copy max-h-[190px] overflow-y-auto custom-scrollbar pr-1">
                <p className={`text-white/95 leading-relaxed m-0 transition-all ${
                  scriptFontSize === 'normal' ? 'text-sm md:text-base font-medium' : 
                  scriptFontSize === 'large' ? 'text-base md:text-lg xl:text-xl font-semibold' : 'text-lg md:text-xl xl:text-2xl font-bold'
                }`}>
                  "{getSongFact(gameState.nowPlaying)}"
                </p>
              </div>
            </div>
          )}
 
          {/* Action Controls & Auto-Caller Switch */}
          <div className="host-actions w-full max-w-[560px] flex flex-col gap-3">
            {!gameState?.started ? (
              <button 
                className="w-full py-4 rounded-2xl bg-gradient-to-r from-[#ff4fd8] to-[#8b5cf6] text-white text-sm md:text-base font-black tracking-widest uppercase hover:brightness-110 active:scale-[0.99] transition-all cursor-pointer flex items-center justify-center gap-2 shadow-[0_0_26px_rgba(255,79,216,0.36)]"
                onClick={handleStartGame}
              >
                Start Game
              </button>
            ) : (
              <>
                <button 
                  className={`w-full py-4 rounded-2xl text-sm md:text-base font-black tracking-widest uppercase transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer flex items-center justify-center gap-3 active:scale-[0.99] ${pool.length > 0 && !callInFlight ? 'bg-gradient-to-r from-[#33d8ff] to-[#8b5cf6] text-white shadow-[0_0_26px_rgba(51,216,255,0.36)] hover:brightness-110' : 'bg-black/60 border border-white/10 text-white/50 shadow-inner'}`}
                  onClick={handleCallNext}
                  disabled={callInFlight || pool.length === 0}
                >
                  <Disc className="w-5 h-5" /> {gameState.history.length === 0 && !gameState.nowPlaying ? 'Play First Song' : 'Call Next Track'}
                </button>
 
                {/* Auto Caller Mode Toggle */}
                <div className="flex items-center justify-between px-4 py-3 bg-black/35 border border-white/10 rounded-2xl text-xs shadow-inner">
                  <div className="flex items-center gap-2 text-[#ffd76a] font-bold uppercase tracking-widest">
                    <Clock className="w-4 h-4" />
                    <span>Auto-Caller</span>
                  </div>
 
                  <div className="flex items-center gap-3 min-w-0">
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
        </div>
 
        {/* Right Panel */}
        <div className="host-sidebar min-w-0 min-h-[520px] lg:min-h-0 bg-[#131728]/82 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl p-4 xl:p-5 flex flex-col gap-4 overflow-hidden">
          
          {/* Claims List */}
          <div className="host-claims flex flex-col min-h-[220px] lg:min-h-0 lg:basis-[48%] lg:max-h-[48%] flex-none">
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
                <HistoryItem key={i + songKey} songKey={songKey} label={`#${gameState.history.length - i}`} isCurrent={false} />
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
 
      {/* Fullscreen Host Teleprompter Modal */}
      {showTeleprompter && gameState?.nowPlaying && (
        <div className="fixed inset-0 bg-[#0a0b1e]/95 backdrop-blur-2xl z-[600] flex flex-col p-4 sm:p-6 md:p-10 overflow-y-auto animate-[fadeIn_0.2s_ease-out]">
          <div className="max-w-4xl mx-auto w-full flex-1 flex flex-col justify-between">
            <div className="flex items-center justify-between pb-6 border-b border-white/20 mb-6">
              <div className="flex items-center gap-3 text-[#33d8ff]">
                <Lightbulb className="w-8 h-8 text-[#33d8ff] animate-pulse" />
                <span className="font-black text-lg md:text-2xl uppercase tracking-widest text-white">
                  Host Stage Teleprompter
                </span>
              </div>
              <button
                onClick={() => setShowTeleprompter(false)}
                className="p-3 rounded-2xl bg-white/10 hover:bg-white/20 border border-white/20 text-white font-bold cursor-pointer flex items-center gap-2 text-xs uppercase tracking-wider transition-colors"
              >
                <Minimize2 className="w-5 h-5" /> Close
              </button>
            </div>
 
            <div className="my-auto py-6">
              <div className="text-xs md:text-sm font-black uppercase tracking-[0.3em] text-[#ff4fd8] mb-2">
                Currently Calling Track:
              </div>
              <h2 className="text-3xl md:text-6xl font-black text-white tracking-tight mb-1">
                {splitSong(gameState.nowPlaying).title}
              </h2>
              <div className="text-xl md:text-3xl font-bold text-[#33d8ff] mb-8">
                {splitSong(gameState.nowPlaying).artist}
              </div>
 
              <div className="p-6 md:p-9 bg-black/80 border-2 border-[#33d8ff]/50 rounded-3xl shadow-[0_0_50px_rgba(51,216,255,0.2)]">
                <div className="text-xs md:text-sm font-black uppercase tracking-widest text-[#ffd76a] mb-4 flex items-center gap-2">
                  <MessageSquareQuote className="w-5 h-5 text-[#ffd76a]" />
                  Mic Script & Song Trivia
                </div>
                <p className="text-xl sm:text-2xl md:text-4xl text-white font-bold leading-relaxed m-0 text-balance">
                  "{getSongFact(gameState.nowPlaying)}"
                </p>
              </div>
            </div>
 
            <div className="pt-6 border-t border-white/20 flex justify-between items-center text-xs md:text-sm text-white/60 font-bold uppercase tracking-widest">
              <span>Press Close or Done to exit</span>
              <button 
                onClick={() => setShowTeleprompter(false)}
                className="px-6 py-3 rounded-xl bg-[#33d8ff] text-black font-black uppercase tracking-wider hover:opacity-90 transition-opacity cursor-pointer"
              >
                Done Reading
              </button>
            </div>
          </div>
        </div>
      )}
 
      <style>{`
        .host-shell {
          min-height: 100dvh;
        }

        .custom-scrollbar {
          scrollbar-width: thin;
          scrollbar-color: rgba(255,255,255,0.18) transparent;
        }

        .custom-scrollbar::-webkit-scrollbar {
          width: 5px;
        }

        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }

        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(255,255,255,0.18);
          border-radius: 999px;
        }

        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(255,255,255,0.3);
        }

        @media (min-width: 1024px) {
          .host-shell {
            height: 100dvh;
            min-height: 0;
            overflow: hidden;
          }

          .host-layout {
            height: 100%;
            min-height: 0;
          }

          .host-stage,
          .host-sidebar {
            height: 100%;
            min-height: 0;
          }
        }

        @media (min-width: 1024px) and (max-height: 850px) {
          .host-header {
            padding-top: 0.7rem;
            padding-bottom: 0.7rem;
          }

          .host-stage {
            padding: 1rem 1.25rem;
          }

          .host-record-wrap {
            margin-bottom: 0.9rem;
          }

          .host-record {
            width: clamp(132px, 21vh, 190px);
            height: clamp(132px, 21vh, 190px);
          }

          .host-track-title {
            font-size: clamp(1.45rem, 3vw, 2.55rem);
            margin-bottom: 0.2rem;
          }

          .host-track-artist {
            margin-bottom: 0.75rem;
          }

          .host-script-card {
            padding: 0.85rem;
            margin-bottom: 0.8rem;
          }

          .host-script-copy {
            max-height: 130px;
          }

          .host-actions {
            gap: 0.65rem;
          }

          .host-actions > button {
            padding-top: 0.8rem;
            padding-bottom: 0.8rem;
          }

          .host-sidebar {
            padding: 0.9rem;
            gap: 0.85rem;
          }

          .host-claims {
            flex-basis: 47%;
            max-height: 47%;
          }
        }

        @media (min-width: 1024px) and (max-height: 720px) {
          .host-record-wrap {
            margin-bottom: 0.65rem;
          }

          .host-record {
            width: clamp(110px, 18vh, 145px);
            height: clamp(110px, 18vh, 145px);
          }

          .host-track-title {
            font-size: clamp(1.3rem, 2.7vw, 2.15rem);
          }

          .host-track-artist {
            font-size: 0.72rem;
            margin-bottom: 0.55rem;
          }

          .host-script-card {
            margin-bottom: 0.55rem;
          }

          .host-script-copy {
            max-height: 92px;
          }

          .host-sidebar {
            padding: 0.75rem;
            gap: 0.7rem;
          }
        }
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
