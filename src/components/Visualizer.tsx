import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { subscribeToGameState, subscribeToClaims, setVisualizerAudioActive, subscribeToReactions, Reaction } from '../lib/store';
import { GameState } from '../lib/types';
import { splitSong, getSongFact } from '../lib/data';
import { lookupPreview } from '../lib/itunes';
import { Music, Volume2, VolumeX, Sparkles, Trophy, Disc, Radio, Settings, Lightbulb, Type, Flame } from 'lucide-react';

export default function Visualizer() {
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [previewData, setPreviewData] = useState<{previewUrl: string; artworkUrl: string} | null>(null);
  const [totalClaims, setTotalClaims] = useState(0);
  const [reactions, setReactions] = useState<Reaction[]>([]);
  const [encouragement, setEncouragement] = useState<string | null>(null);
  
  const [themeIndex, setThemeIndex] = useState(0);
  const [sceneIndex, setSceneIndex] = useState(0);
  const [triviaScale, setTriviaScale] = useState<'normal' | 'large' | 'huge'>('normal');
  const [isAudioMuted, setIsAudioMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [showAudioPanel, setShowAudioPanel] = useState(false);
  
  const audioRef = useRef<HTMLAudioElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const dataArrayRef = useRef<Uint8Array | null>(null);
  
  const [progress, setProgress] = useState(0);
  const [remaining, setRemaining] = useState(0);
  const [audioUnlocked, setAudioUnlocked] = useState(false);

  useEffect(() => {
    const unlockAudio = () => {
      if (audioRef.current && audioRef.current.paused) {
        audioRef.current.play().then(() => {
          setAudioUnlocked(true);
        }).catch(e => console.log('Autoplay still prevented', e));
      } else {
        setAudioUnlocked(true);
      }
      initAudioContext();
      
      ['click', 'touchstart', 'keydown'].forEach(evt => document.removeEventListener(evt, unlockAudio));
    };

    if (!audioUnlocked) {
      ['click', 'touchstart', 'keydown'].forEach(evt => document.addEventListener(evt, unlockAudio, { once: true }));
    }
    
    return () => {
      ['click', 'touchstart', 'keydown'].forEach(evt => document.removeEventListener(evt, unlockAudio));
    };
  }, [audioUnlocked]);

  useEffect(() => {
    const unsub = subscribeToGameState((state) => {
      setGameState(state);
      if (state) {
        const trackNumber = (state.history?.length || 0) + (state.nowPlaying ? 1 : 0);
        const setNumber = Math.max(0, Math.floor((trackNumber - 1) / 5));
        setThemeIndex(setNumber % 5);
        setSceneIndex(Math.max(0, trackNumber - 1) % 5);
        
        if (state.nowPlaying) {
          const { title, artist } = splitSong(state.nowPlaying);
          lookupPreview(title, artist).then(data => setPreviewData(data));
        } else {
          setPreviewData(null);
        }
      }
    });
    
    const unsubClaims = subscribeToClaims((claims) => {
      if (gameState?.sessionId) {
        setTotalClaims(claims.filter(c => c.sessionId === gameState?.sessionId).length);
      }
    });

    const unsubReactions = subscribeToReactions((newReactions) => {
      setReactions(newReactions);
    });
    
    return () => {
      unsub();
      unsubClaims();
      unsubReactions();
    };
  }, [gameState?.sessionId]);

  useEffect(() => {
    if (gameState?.nowPlaying) {
      const encouragements = [
        "Keep the energy up!",
        "Who's getting close?",
        "Eyes on your cards!",
        "Feel the rhythm!",
        "Is it Bingo time yet?",
        "Someone's about to win!",
        "Dance break!",
        "Mark those cards!"
      ];
      setEncouragement(encouragements[Math.floor(Math.random() * encouragements.length)]);
      const timer = setTimeout(() => setEncouragement(null), 6000);
      return () => clearTimeout(timer);
    } else {
      setEncouragement(null);
    }
  }, [gameState?.nowPlaying]);

  // Audio setup
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    audio.volume = volume;

    if (isAudioMuted || volume === 0) {
      audio.pause();
      return;
    }

    const targetUrl = previewData?.previewUrl || "https://whije02.github.io/song/Nimbus.mp3";
    const isFallback = !previewData?.previewUrl;

    if (audio.src !== targetUrl) {
      audio.src = targetUrl;
      audio.loop = isFallback;
      audio.crossOrigin = "anonymous";
      audio.load();
    }

    const playPromise = audio.play();
    if (playPromise !== undefined) {
      playPromise
        .then(() => {
          initAudioContext();
          setVisualizerAudioActive(true);
        })
        .catch(e => {
          console.log('Audio playback info', e);
        });
    }
  }, [previewData, isAudioMuted, volume]);

  const initAudioContext = () => {
    if (analyserRef.current || !audioRef.current) {
      const audioCtx = (window as any)._audioCtx;
      if (audioCtx && audioCtx.state === 'suspended') {
        audioCtx.resume();
      }
      return;
    }
    
    try {
      const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
      const ctx = new AudioContext();
      (window as any)._audioCtx = ctx;
      
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 64;
      analyser.smoothingTimeConstant = 0.78;
      
      const source = ctx.createMediaElementSource(audioRef.current);
      source.connect(analyser);
      analyser.connect(ctx.destination);
      
      analyserRef.current = analyser;
      dataArrayRef.current = new Uint8Array(analyser.frequencyBinCount);
      
      if (ctx.state === 'suspended') {
        ctx.resume();
      }
      
      draw();
    } catch (e) {
      console.error(e);
    }
  };

  const themeIndexRef = useRef(0);
  useEffect(() => { themeIndexRef.current = themeIndex; }, [themeIndex]);
  const barsRef = useRef<(HTMLDivElement | null)[]>([]);
  const canvasTRef = useRef(0);

  const draw = () => {
    requestAnimationFrame(draw);
    if (!analyserRef.current || !dataArrayRef.current) return;
    
    analyserRef.current.getByteFrequencyData(dataArrayRef.current);
    
    let bassEnergy = 0;
    for (let b = 0; b < 4; b++) bassEnergy += (dataArrayRef.current[b] || 0) / 255;
    const bassAvg = bassEnergy / 4;
    
    document.body.style.setProperty('--bass', bassAvg.toFixed(3));
    
    const currentThemeIndex = themeIndexRef.current;
    const waveMode = ['bars', 'bars', 'dots', 'ribbon', 'bars'][currentThemeIndex] || 'bars';
    
    if (waveMode === 'bars') {
      const barElements = barsRef.current.filter(Boolean);
      if (barElements.length) {
        const total = barElements.length;
        const binCount = dataArrayRef.current.length;
        const isPlaying = audioRef.current && !audioRef.current.paused && audioRef.current.volume > 0;
        for (let i = 0; i < total; i++) {
          const freqIdx = Math.min(binCount - 1, Math.round(Math.abs(i - (total - 1) / 2) * (binCount / (total / 2))));
          const norm = (dataArrayRef.current[freqIdx] || 0) / 255;
          if (isPlaying) {
            barElements[i]!.style.height = Math.max(8, norm * 100) + '%';
          } else {
            barElements[i]!.style.height = '';
          }
        }
      }
    } else {
      canvasTRef.current += 0.016;
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (!canvas || !ctx) return;
      
      const w = canvas.width;
      const h = canvas.height;
      
      const themes = [
        { a: '51,216,255', b: '255,79,216', c: '255,215,106' },
        { a: '124,247,212', b: '90,167,255', c: '216,255,106' },
        { a: '255,209,102', b: '255,95,143', c: '255,159,67' },
        { a: '183,148,255', b: '255,105,212', c: '92,225,230' },
        { a: '255,107,107', b: '255,60,172', c: '255,230,109' },
      ];
      const sceneRGB = themes[currentThemeIndex] || themes[0];
      
      const getLevels = (count: number) => {
        const levels = new Array(count).fill(0);
        let energy = 0;
        const bins = dataArrayRef.current!.length;
        for (let i = 0; i < count; i++) {
          const idx = Math.min(bins - 1, Math.round(Math.abs(i - (count - 1) / 2) * (bins / (count / 2))));
          levels[i] = (dataArrayRef.current![idx] || 0) / 255;
          energy += levels[i];
        }
        if (energy / count < 0.01) {
          for (let i = 0; i < count; i++) {
            levels[i] = 0.08 + 0.05 * Math.sin(canvasTRef.current * 1.6 + i * 0.35) + 0.03 * Math.sin(canvasTRef.current * 0.7 + i * 0.11);
          }
        }
        return levels;
      };

      ctx.clearRect(0, 0, w, h);
      
      if (waveMode === 'dots') {
        const cell = 16, dotR = 4.2;
        const cols = Math.max(8, Math.floor(w / cell));
        const rows = Math.max(4, Math.floor(h / cell));
        const levels = getLevels(cols);
        const xPad = (w - cols * cell) / 2 + cell / 2;
        for (let c = 0; c < cols; c++) {
          const lit = Math.round(levels[c] * rows);
          for (let r = 0; r < rows; r++) {
            const x = xPad + c * cell;
            const y = h - cell / 2 - r * cell;
            const isLit = r < lit;
            const isPeak = isLit && r === lit - 1;
            ctx.beginPath();
            ctx.arc(x, y, dotR, 0, Math.PI * 2);
            ctx.fillStyle = isPeak
              ? `rgba(${sceneRGB.c}, 0.95)`
              : isLit
                ? `rgba(${sceneRGB.b}, ${(0.4 + 0.5 * (r / rows)).toFixed(2)})`
                : 'rgba(255,255,255,0.05)';
            ctx.fill();
          }
        }
      } else if (waveMode === 'ribbon') {
        const N = 72;
        const levels = getLevels(N);
        const mid = h / 2;
        const xs: number[] = [], ys: number[] = [];
        for (let i = 0; i < N; i++) {
          xs.push((w / (N - 1)) * i);
          ys.push(Math.max(2.5, levels[i] * mid * 0.94));
        }
        const trace = (sign: number) => {
          ctx.moveTo(xs[0], mid - sign * ys[0]);
          for (let i = 1; i < N - 1; i++) {
            const xc = (xs[i] + xs[i + 1]) / 2;
            const yc = mid - sign * ((ys[i] + ys[i + 1]) / 2);
            ctx.quadraticCurveTo(xs[i], mid - sign * ys[i], xc, yc);
          }
          ctx.lineTo(xs[N - 1], mid - sign * ys[N - 1]);
        };
        const grad = ctx.createLinearGradient(0, 0, w, 0);
        grad.addColorStop(0, `rgba(${sceneRGB.a}, 0.30)`);
        grad.addColorStop(0.5, `rgba(${sceneRGB.b}, 0.34)`);
        grad.addColorStop(1, `rgba(${sceneRGB.c}, 0.30)`);
        ctx.beginPath();
        trace(1);
        for (let i = N - 1; i >= 0; i--) ctx.lineTo(xs[i], mid + ys[i]);
        ctx.closePath();
        ctx.fillStyle = grad;
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.shadowBlur = 14;
        ctx.shadowColor = `rgba(${sceneRGB.a}, 0.8)`;
        ctx.strokeStyle = `rgba(${sceneRGB.a}, 0.9)`;
        ctx.beginPath(); trace(1); ctx.stroke();
        ctx.shadowColor = `rgba(${sceneRGB.b}, 0.8)`;
        ctx.strokeStyle = `rgba(${sceneRGB.b}, 0.9)`;
        ctx.beginPath(); trace(-1); ctx.stroke();
        ctx.shadowBlur = 0;
      }
    }
  };

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (audioRef.current) {
      interval = setInterval(() => {
        if (audioRef.current) {
          const current = audioRef.current.currentTime;
          const dur = audioRef.current.duration || 30; // 30 second tracks typically
          if (audioRef.current.ended || dur - current < 0.2) {
            setProgress(1);
            setRemaining(0);
          } else if (!audioRef.current.paused) {
            setProgress(Math.min(1, current / dur));
            setRemaining(Math.max(0, Math.ceil(dur - current)));
          }
        }
      }, 100);
    }
    return () => clearInterval(interval);
  }, []);

  const themes = [
    { a: '#33d8ff', b: '#ff4fd8', c: '#ffd76a' },
    { a: '#7cf7d4', b: '#5aa7ff', c: '#d8ff6a' },
    { a: '#ffd166', b: '#ff5f8f', c: '#ff9f43' },
    { a: '#b794ff', b: '#ff69d4', c: '#5ce1e6' },
    { a: '#ff6b6b', b: '#ff3cac', c: '#ffe66d' },
  ];
  
  const theme = themes[themeIndex] || themes[0];

  return (
    <div className="w-screen h-screen overflow-hidden bg-[#04050d] text-[#f7f8ff] font-sans relative selection:bg-[#ff4fd8]"
         style={{
           '--scene-a': theme.a,
           '--scene-b': theme.b,
           '--scene-c': theme.c,
         } as React.CSSProperties}>
      
      {/* Background ambient light show */}
      <div className="fixed inset-0 z-0 bg-[radial-gradient(ellipse_at_18%_22%,rgba(255,79,216,0.22)_0%,transparent_40%),radial-gradient(ellipse_at_82%_12%,rgba(51,216,255,0.18)_0%,transparent_38%),radial-gradient(ellipse_at_52%_92%,rgba(139,92,246,0.22)_0%,transparent_45%),linear-gradient(140deg,#04050d,#0a0b1e_45%,#15102e_70%,#0a1326)] opacity-100 transition-all duration-1000">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_40%,rgba(0,0,0,0.55)_100%)] pointer-events-none"></div>
      </div>
      
      <div className="fixed inset-0 z-[1] pointer-events-none overflow-hidden">
        <div className="absolute rounded-full blur-[48px] opacity-55 animate-[drift_18s_ease-in-out_infinite_alternate] w-[420px] h-[420px] -left-[120px] top-[8%] bg-[radial-gradient(circle,rgba(255,79,216,0.7),transparent_70%)]"></div>
        <div className="absolute rounded-full blur-[48px] opacity-55 animate-[drift_22s_ease-in-out_infinite_alternate] w-[520px] h-[520px] -right-[160px] -top-[80px] bg-[radial-gradient(circle,rgba(51,216,255,0.55),transparent_70%)]"></div>
        <div className="absolute rounded-full blur-[48px] opacity-55 animate-[drift_26s_ease-in-out_infinite_alternate] w-[460px] h-[460px] left-[38%] -bottom-[180px] bg-[radial-gradient(circle,rgba(139,92,246,0.55),transparent_70%)]"></div>
      </div>

      {/* Creative Party Effects - Spotlights & Floating Notes */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none z-[1]">
        {/* Spotlights */}
        <div className="absolute -top-[20%] left-[10%] w-[150px] h-[150vh] bg-gradient-to-b from-[#33d8ff]/30 to-transparent origin-top animate-[spotlight_8s_ease-in-out_infinite_alternate] blur-2xl"></div>
        <div className="absolute -top-[20%] right-[10%] w-[150px] h-[150vh] bg-gradient-to-b from-[#ff4fd8]/30 to-transparent origin-top animate-[spotlight_10s_ease-in-out_infinite_alternate-reverse] blur-2xl"></div>
        
        {/* Floating Notes */}
        <div className="absolute top-1/4 left-[15%] animate-[float_15s_linear_infinite] opacity-30 text-[#ffd76a]">
          <Music size={48} />
        </div>
        <div className="absolute top-2/3 left-[10%] animate-[float_12s_linear_infinite_reverse] opacity-20 text-[#33d8ff]">
          <Music size={32} />
        </div>
        <div className="absolute top-[30%] right-[15%] animate-[float_18s_linear_infinite] opacity-40 text-[#ff4fd8]">
          <Music size={64} />
        </div>
        <div className="absolute bottom-[20%] right-[10%] animate-[float_14s_linear_infinite_reverse] opacity-20 text-white">
          <Music size={24} />
        </div>
        <div className="absolute top-[15%] left-[45%] animate-[float_20s_linear_infinite] opacity-25 text-white/50">
          <Music size={40} />
        </div>
      </div>

      {!gameState?.started && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center p-6 text-center bg-transparent overflow-hidden">
          
          <div className="w-full max-w-[900px] flex flex-col items-center animate-[fadeIn_0.6s_ease-out] z-10 mt-10">
            
            {/* Integrated Logo Section */}
            <div className="relative flex flex-col items-center justify-center w-full mb-12 animate-[logoFloat_4s_ease-in-out_infinite]">
              
              {/* Spinning Vinyl Background Element */}
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[280px] h-[280px] md:w-[400px] md:h-[400px] rounded-full bg-gradient-to-br from-[#1a0826]/80 to-[#050814]/80 border-[2px] border-white/10 shadow-[0_0_80px_rgba(255,79,216,0.3)] z-0 overflow-hidden animate-[spin_8s_linear_infinite] backdrop-blur-md opacity-60">
                <div className="absolute inset-4 rounded-full border border-white/5"></div>
                <div className="absolute inset-10 rounded-full border border-white/5"></div>
                <div className="absolute inset-16 rounded-full border border-white/5"></div>
              </div>

              {/* Giant Music Bingo Title */}
              <div className="relative z-20 text-center select-none pt-4">
                <div className="flex justify-center items-center gap-4 mb-2">
                  <Music className="w-10 h-10 md:w-14 md:h-14 text-[#33d8ff] animate-pulse drop-shadow-[0_0_15px_rgba(51,216,255,0.8)]" />
                  <Disc className="w-10 h-10 md:w-14 md:h-14 text-[#ffd76a] animate-[spin_3s_linear_infinite] drop-shadow-[0_0_15px_rgba(255,215,106,0.8)]" />
                  <Music className="w-10 h-10 md:w-14 md:h-14 text-[#ff4fd8] animate-pulse drop-shadow-[0_0_15px_rgba(255,79,216,0.8)]" />
                </div>
                
                <h1 className="text-[clamp(64px,12vw,140px)] font-black leading-[0.9] tracking-tighter uppercase m-0 flex flex-col items-center drop-shadow-2xl">
                  <span className="bg-gradient-to-r from-white via-[#33d8ff] to-white bg-[length:200%_auto] bg-clip-text text-transparent drop-shadow-[0_0_25px_rgba(51,216,255,0.5)] z-20 px-5 animate-[gradientShift_3s_linear_infinite]">MUSIC</span>
                  <span className="bg-gradient-to-r from-[#ffd76a] via-[#ff4fd8] to-[#ffd76a] bg-[length:200%_auto] bg-clip-text text-transparent drop-shadow-[0_0_35px_rgba(255,79,216,0.6)] z-20 px-5 animate-[gradientShift_3s_linear_infinite_reverse]">BINGO</span>
                </h1>
              </div>
            </div>

            {/* Stage Screen Tag */}
            <div className="inline-flex items-center gap-2 px-6 py-2.5 rounded-full border border-[#ff4fd8]/40 bg-[#ff4fd8]/15 text-[#ff4fd8] text-xs md:text-sm font-black tracking-[0.25em] uppercase mb-8 shadow-[0_0_25px_rgba(255,79,216,0.3)] backdrop-blur-md">
              <Flame className="w-5 h-5 text-[#ffd76a] animate-bounce" />
              The Ultimate Party Game • Stage Screen Ready
            </div>

            <p className="text-white/90 text-xl md:text-3xl leading-relaxed tracking-tight font-bold max-w-2xl m-0 mb-8 drop-shadow-lg text-center">
              Waiting for Host to Launch the Next Game...
            </p>

            <div className="flex items-center gap-3 px-8 py-3 rounded-full bg-white/10 border border-white/15 text-sm md:text-base text-white/90 font-bold backdrop-blur-md shadow-xl">
              <span className="w-3 h-3 rounded-full bg-[#4ade80] animate-pulse shadow-[0_0_15px_#4ade80]"></span>
              Live Stage Sync Active
            </div>

          </div>
        </div>
      )}

      {gameState?.started && (
        <div className="absolute inset-0 z-10 flex p-6 md:p-10 gap-8 transition-all min-h-0">
          <div className="flex-1 bg-[#0e1226]/60 backdrop-blur-3xl border border-white/10 rounded-[36px] p-8 md:p-12 flex flex-col shadow-2xl relative overflow-hidden min-h-0">
            
            {/* Round info overlay */}
            <div className="absolute top-8 right-10 flex items-center gap-4 z-30">
              {totalClaims > 0 && (
                <div className="flex flex-col items-center justify-center w-[84px] h-[84px] rounded-2xl border border-[var(--scene-c)]/50 bg-black/60 backdrop-blur-md shadow-[0_0_30px_var(--scene-c)] animate-bounce">
                  <span className="text-[9px] font-black tracking-widest text-[var(--scene-c)] uppercase">Bingos</span>
                  <strong className="text-3xl font-black text-[var(--scene-c)] tabular-nums leading-none mt-1">{String(totalClaims).padStart(2, '0')}</strong>
                </div>
              )}

              <div className="flex flex-col items-center justify-center w-[84px] h-[84px] rounded-2xl border border-[var(--scene-b)]/40 bg-black/60 backdrop-blur-md shadow-[0_0_30px_var(--scene-b)]">
                <span className="text-[9px] font-black tracking-widest text-white/50 uppercase">Track</span>
                <strong className="text-3xl font-black text-white tabular-nums leading-none mt-1">{String(gameState.history.length + (gameState.nowPlaying ? 1 : 0)).padStart(2, '0')}</strong>
              </div>
            </div>

            <div className="flex-1 flex flex-col lg:flex-row items-center justify-center gap-12 relative z-20 min-h-0">
              
              {/* Album Art Deck */}
              <div className="relative w-[280px] h-[280px] md:w-[380px] md:h-[380px] flex items-center justify-center flex-none">
                <svg className="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 400 400">
                  <circle cx="200" cy="200" r="190" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="8" />
                  <circle cx="200" cy="200" r="190" fill="none" stroke="var(--scene-c)" strokeWidth="8" strokeDasharray="1194" strokeDashoffset={1194 * (1 - progress)} className="transition-all duration-150 ease-linear" />
                </svg>
                
                <div className="w-[72%] h-[72%] rounded-full bg-gradient-to-br from-[#2a0a1a] to-[#1a0510] border-4 border-[var(--scene-c)]/40 shadow-[0_0_60px_var(--scene-b)] relative overflow-hidden flex items-center justify-center">
                  {previewData?.artworkUrl && <div className="absolute inset-0 bg-cover bg-center opacity-70 grayscale blur-sm mix-blend-overlay" style={{backgroundImage: `url(${previewData.artworkUrl})`}}></div>}
                  <div className="text-8xl md:text-[130px] font-black text-[var(--scene-c)] drop-shadow-[0_0_40px_var(--scene-c)] z-10 animate-pulse">?</div>
                </div>
              </div>

              {/* Mystery Track Header */}
              <div className="flex-1 text-center lg:text-left min-h-0 overflow-y-auto custom-scrollbar pr-2 pb-4">
                <div className="inline-flex items-center gap-2 px-5 py-2 rounded-full border border-[var(--scene-c)]/40 bg-gradient-to-r from-[var(--scene-b)]/20 to-[var(--scene-c)]/10 text-[var(--scene-c)] text-xs font-black tracking-widest uppercase mb-6 shadow-lg">
                  <Sparkles className="w-4 h-4" /> Mystery Track Live
                </div>
                
                <div className="text-xs font-bold tracking-[0.3em] uppercase text-white/40 mb-3">Now Playing</div>
                <h2 className="text-4xl md:text-7xl font-black leading-[1.1] tracking-tight mb-4 text-balance drop-shadow-2xl">
                  {gameState.nowPlaying ? `Mystery Track #${gameState.history.length + 1}` : 'Ready?'}
                </h2>
                <div className="text-lg md:text-2xl font-medium text-white/70 mb-4">
                  {gameState.nowPlaying ? 'Listen closely to the hook! Find this song on your 5x5 board.' : 'Next track incoming...'}
                </div>

                {/* Stage Screen Song Fun Fact Teaser */}
                {gameState.nowPlaying && (
                  <div className="mt-6 p-5 md:p-8 rounded-3xl bg-black/60 border-2 border-[var(--scene-c)]/40 backdrop-blur-xl max-w-3xl shadow-2xl animate-[fadeIn_0.5s_ease-out] group">
                    <div className="flex flex-wrap items-center justify-between mb-3 border-b border-white/10 pb-2 gap-2">
                      <div className="flex items-center gap-2 text-[var(--scene-c)] font-black text-xs md:text-sm uppercase tracking-widest">
                        <Lightbulb className="w-5 h-5 text-[var(--scene-c)] animate-pulse" />
                        <span>Did You Know? (Song Trivia)</span>
                      </div>
                      <button 
                        onClick={() => setTriviaScale(prev => prev === 'normal' ? 'large' : prev === 'large' ? 'huge' : 'normal')}
                        className="opacity-0 group-hover:opacity-100 px-3 py-1 rounded-xl bg-white/10 hover:bg-white/20 border border-white/20 text-white text-xs font-bold transition-opacity duration-300 cursor-pointer flex items-center gap-1.5"
                        title="Adjust text size for venue TV/projector screens"
                      >
                        <Type className="w-3.5 h-3.5 text-[var(--scene-c)]" /> <span className="hidden sm:inline">Text Size:</span> <span className="uppercase font-extrabold text-[var(--scene-c)]">{triviaScale}</span>
                      </button>
                    </div>
                    <p className={`text-white/95 leading-relaxed font-bold m-0 transition-all ${
                      triviaScale === 'normal' ? 'text-sm md:text-lg' :
                      triviaScale === 'large' ? 'text-base md:text-2xl xl:text-3xl' :
                      'text-lg md:text-3xl xl:text-4xl'
                    }`}>
                      "{getSongFact(gameState.nowPlaying)}"
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Footer Audio Vis */}
            <div className="flex-none mt-8">
              <div className="flex justify-between items-end mb-3">
                <div className="text-xs font-bold tracking-[0.3em] uppercase text-white/40">Track Preview Countdown</div>
                <div className={`text-4xl md:text-6xl font-black tabular-nums leading-none ${remaining <= 5 && remaining > 0 ? 'text-[#f87171] drop-shadow-[0_0_30px_#f87171] animate-pulse' : 'text-[var(--scene-c)] drop-shadow-[0_0_30px_var(--scene-c)]'}`}>
                  0:{String(remaining).padStart(2, '0')}
                </div>
              </div>
              
              <div className="w-full h-2 rounded-full bg-white/10 mb-6 overflow-hidden">
                <div className="h-full bg-gradient-to-r from-[var(--scene-a)] via-[var(--scene-b)] to-[var(--scene-c)] transition-all ease-linear shadow-[0_0_20px_var(--scene-a)]" style={{width: `${progress * 100}%`}}></div>
              </div>
              
              <div className="relative w-full h-[90px]">
                <div className={`absolute inset-0 flex items-end justify-center w-full px-1 gap-1.5 transition-opacity ${['bars', 'bars', 'dots', 'ribbon', 'bars'][themeIndex] === 'bars' || !previewData?.previewUrl || remaining <= 0 ? 'opacity-100' : 'opacity-0'}`}>
                  {Array.from({ length: 32 }).map((_, i) => (
                    <div 
                      key={i} 
                      ref={el => barsRef.current[i] = el}
                      className="flex-1 min-w-[3px] rounded-t-full bg-gradient-to-b from-[var(--scene-a)] via-[var(--scene-b)] to-[var(--scene-c)] transition-[height] duration-75 ease-out h-[10%]"
                    ></div>
                  ))}
                </div>
                <canvas 
                  ref={canvasRef} 
                  width="1000" 
                  height="90" 
                  className={`absolute inset-0 w-full h-[90px] transition-opacity ${['bars', 'bars', 'dots', 'ribbon', 'bars'][themeIndex] === 'bars' || !previewData?.previewUrl || remaining <= 0 ? 'opacity-0' : 'opacity-40'}`}
                ></canvas>
              </div>
            </div>
            
          </div>
        </div>
      )}

      {/* Encouragement Banner */}
      {encouragement && (
        <div className="absolute top-[40%] left-1/2 -translate-x-1/2 -translate-y-1/2 z-[80] pointer-events-none w-full px-4 text-center">
          <div className="inline-block animate-[popIn2_0.5s_ease-out_forwards,gentlePulse_2s_infinite]">
            <div className="relative">
              <div className="absolute inset-0 bg-gradient-to-r from-[var(--scene-a)] via-[var(--scene-b)] to-[var(--scene-c)] blur-2xl opacity-40 rounded-full"></div>
              <div className="relative bg-black/60 backdrop-blur-xl border-2 border-white/20 px-8 py-6 md:px-12 md:py-8 rounded-full shadow-2xl">
                <h2 className="text-3xl md:text-5xl font-black text-transparent bg-clip-text bg-gradient-to-r from-white to-white/70 uppercase tracking-widest leading-none m-0">
                  {encouragement}
                </h2>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Floating Reactions */}
      {createPortal(
        <div className="fixed inset-0 z-[9999] pointer-events-none">
          {reactions.map((reaction) => {
            // generate a deterministic pseudo-random start position from 10% to 90%
            const charCode = reaction.id.charCodeAt(0) || 50;
            const leftPercent = 10 + (charCode % 80);
            // deterministic rotation
            const rot = (charCode % 40) - 20; // -20 to 20
            
            return (
              <div 
                key={reaction.id}
                className="absolute bottom-[-50px] text-center flex flex-col items-center animate-emojiFloat"
                style={{
                  left: `${leftPercent}%`,
                  '--rot': `${rot}deg`
                } as React.CSSProperties}
              >
                <div className="text-6xl md:text-8xl drop-shadow-[0_0_25px_rgba(255,255,255,0.8)] mb-2">{reaction.emoji}</div>
                <div className="bg-black/80 backdrop-blur-md border border-white/40 text-white text-xs md:text-sm font-black uppercase tracking-wider px-3 py-1 rounded-full whitespace-nowrap shadow-2xl">
                  {reaction.playerName}
                </div>
              </div>
            );
          })}
        </div>,
        document.body
      )}

      {/* Audio controls popup */}
      <div className="absolute bottom-6 left-6 z-50">
        <button onClick={() => setShowAudioPanel(!showAudioPanel)} className="p-3 rounded-full bg-black/60 border border-white/20 text-white hover:bg-white/10 transition-colors shadow-2xl cursor-pointer">
          <Settings className="w-5 h-5" />
        </button>
        {showAudioPanel && (
          <div className="absolute bottom-14 left-0 bg-[#12182a]/95 backdrop-blur-xl border border-white/20 p-4 rounded-2xl flex items-center gap-3 shadow-2xl">
            <button onClick={() => setIsAudioMuted(!isAudioMuted)} className="px-4 py-2 bg-white/10 hover:bg-white/20 rounded-xl text-xs font-bold uppercase cursor-pointer flex items-center gap-2">
              {isAudioMuted ? <VolumeX className="w-4 h-4 text-[#f87171]" /> : <Volume2 className="w-4 h-4 text-[#4ade80]" />}
              {isAudioMuted ? 'Muted' : 'Audio On'}
            </button>
            <div className="flex items-center gap-2 bg-white/5 px-3 py-2 rounded-xl border border-white/10">
              <input type="range" min="0" max="1" step="0.05" value={volume} onChange={e => setVolume(Number(e.target.value))} className="w-24 cursor-pointer" />
            </div>
          </div>
        )}
      </div>

      <audio 
        ref={audioRef} 
        preload="auto" 
        onError={() => {
          if (audioRef.current && audioRef.current.src !== "https://whije02.github.io/song/Nimbus.mp3") {
            audioRef.current.src = "https://whije02.github.io/song/Nimbus.mp3";
            audioRef.current.loop = true;
            if (!isAudioMuted && volume > 0) {
              audioRef.current.play().catch(() => {});
            }
          }
        }}
      />
      
      {!audioUnlocked && (
        <div className="absolute bottom-0 left-0 right-0 bg-[#33d8ff]/20 border-t border-[#33d8ff]/40 text-white text-center p-3 text-xs md:text-sm font-bold uppercase tracking-widest z-[1000] backdrop-blur-md">
          Tap anywhere on screen to activate stage sound system! 🎧
        </div>
      )}
    </div>
  );
}
