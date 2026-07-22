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
  const [encouragement, setEncouragement] = useState<{ kicker: string, title: string, sub: string, isClaim?: boolean } | null>(null);
  const lastClaimsCountRef = useRef(0);
  const lastShownTrackRef = useRef(0);
  const encouragementTimerRef = useRef<NodeJS.Timeout | null>(null);
  
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

  const triggerEncouragement = (
    data: { kicker: string; title: string; sub: string; isClaim?: boolean } | null,
    durationMs = 6000
  ) => {
    if (encouragementTimerRef.current) {
      clearTimeout(encouragementTimerRef.current);
      encouragementTimerRef.current = null;
    }
    setEncouragement(data);
    if (data) {
      encouragementTimerRef.current = setTimeout(() => {
        setEncouragement(null);
        encouragementTimerRef.current = null;
      }, durationMs);
    }
  };

  useEffect(() => {
    if (!gameState?.nowPlaying) {
      if (lastShownTrackRef.current !== 0) {
        lastShownTrackRef.current = 0;
        triggerEncouragement(null);
      }
      return;
    }

    const trackNumber = (gameState.history?.length || 0) + 1;
    const setNumber = Math.floor((trackNumber - 1) / 5) + 1;

    // 1. Bingo Claim event
    if (totalClaims > 0 && totalClaims > lastClaimsCountRef.current) {
      lastClaimsCountRef.current = totalClaims;
      triggerEncouragement({
        isClaim: true,
        kicker: '📣 Hold Everything',
        title: 'BINGO!',
        sub: totalClaims > 1 ? `Claim #${totalClaims} just hit the host's desk — verifying now…` : `A claim just hit the host's desk — verifying now…`
      }, 4000);
      return;
    }

    // 2. Track / Theme transition event
    if (lastShownTrackRef.current !== trackNumber) {
      lastShownTrackRef.current = trackNumber;

      // When starting a new 5-track set (e.g., Track 6 = Set 2, Track 11 = Set 3, etc.)
      if (trackNumber > 1 && trackNumber % 5 === 1) {
        const HYPE_MESSAGES = [
          { title: 'ENERGY SHIFT!', sub: 'Set {set} is live with a fresh visual theme! Listen close for Track {track}.' },
          { title: 'THIS TRACK COULD BE IT!', sub: 'Set {set} brings a new vibe. Mystery Track {track} is playing now!' },
          { title: 'LISTEN CLOSE!', sub: 'New visual theme unlocked for Set {set}! Stay on the beat for Track {track}.' },
          { title: 'FIND THAT SQUARE!', sub: 'Set {set} is live now. Scan your board while Track {track} plays.' },
          { title: 'TRUST YOUR EARS!', sub: 'Focus on Track {track}. A fresh set of music and visuals is in motion.' },
          { title: 'MAKE THIS TRACK COUNT!', sub: 'Track {track} is live in Set {set}. Get ready to shout BINGO!' }
        ];
        const hype = HYPE_MESSAGES[(setNumber - 2) % HYPE_MESSAGES.length] || HYPE_MESSAGES[0];
        triggerEncouragement({
          kicker: `⚡ ENERGY SHIFT • SET ${String(setNumber).padStart(2, '0')} IS LIVE`,
          title: hype.title,
          sub: hype.sub.replace('{track}', String(trackNumber).padStart(2, '0')).replace('{set}', String(setNumber))
        }, 6000);
      }
    }
  }, [gameState?.nowPlaying, gameState?.history?.length, totalClaims]);

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
      )}      {gameState?.started && (
        <div className="absolute inset-0 z-10 flex p-2 sm:p-6 md:p-10 gap-4 md:gap-8 transition-all min-h-0">
          <div className="flex-1 bg-[#0e1226]/60 backdrop-blur-3xl border border-white/10 rounded-3xl md:rounded-[36px] p-4 sm:p-8 md:p-12 flex flex-col shadow-2xl relative overflow-hidden min-h-0">
            
            {/* Music Bingo Top Left Logo */}
            <div className="absolute top-4 left-4 sm:top-8 sm:left-10 flex items-center gap-2.5 sm:gap-3.5 z-30 select-none">
              <div className="w-9 h-9 sm:w-12 sm:h-12 rounded-2xl border border-white/20 bg-black/60 backdrop-blur-md flex items-center justify-center shadow-[0_0_20px_rgba(51,216,255,0.4)]">
                <Music className="w-5 h-5 sm:w-6 sm:h-6 text-[var(--scene-a)] animate-pulse" />
              </div>
              <div className="flex flex-col text-left leading-none">
                <span className="font-black text-xs sm:text-base tracking-wider bg-gradient-to-r from-white via-[#33d8ff] to-white bg-clip-text text-transparent drop-shadow-[0_0_12px_rgba(51,216,255,0.6)] uppercase">
                  Music
                </span>
                <span className="font-black text-xs sm:text-base tracking-wider bg-gradient-to-r from-[#ffd76a] via-[#ff4fd8] to-[#ffd76a] bg-clip-text text-transparent drop-shadow-[0_0_12px_rgba(255,79,216,0.6)] uppercase">
                  Bingo
                </span>
              </div>
            </div>

            {/* Round info overlay */}
            <div className="absolute top-4 right-4 sm:top-8 sm:right-10 flex items-center gap-2 sm:gap-4 z-30 scale-75 sm:scale-100 origin-top-right">
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

            <div className="flex-1 flex flex-col items-center justify-center text-center gap-6 sm:gap-8 relative z-20 min-h-0 pt-16 sm:pt-0 max-w-5xl mx-auto w-full">
              
              {/* Album Art Deck */}
              <div className="relative w-[180px] h-[180px] sm:w-[280px] sm:h-[280px] md:w-[380px] md:h-[380px] xl:w-[440px] xl:h-[440px] flex items-center justify-center flex-none">
                <svg className="absolute inset-0 w-full h-full -rotate-90 drop-shadow-[0_0_22px_rgba(51,216,255,0.25)]" viewBox="0 0 400 400">
                  <circle cx="200" cy="200" r="190" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="6" />
                  <circle cx="200" cy="200" r="190" fill="none" stroke="var(--scene-c)" strokeWidth="6" strokeLinecap="round" strokeDasharray="1194" strokeDashoffset={1194 * (1 - progress)} className="transition-all duration-150 ease-linear" />
                </svg>
                
                {/* Vinyl Background */}
                <div className={`absolute inset-[6%] rounded-full bg-[repeating-radial-gradient(circle_at_center,rgba(255,255,255,0.02)_0,rgba(255,255,255,0.02)_1px,transparent_1px,transparent_4px),radial-gradient(circle_at_center,#1a1530_0%,#0a0918_75%)] shadow-[inset_0_0_60px_rgba(0,0,0,0.8)] ${themeIndex === 1 ? 'animate-[spin_13s_linear_infinite]' : 'animate-[spin_20s_linear_infinite]'} ${themeIndex === 3 ? 'inset-[2%] opacity-80' : ''}`}>
                  <div className="absolute inset-[42%] rounded-full bg-gradient-to-br from-[var(--scene-a)] to-[var(--scene-b)] opacity-85"></div>
                </div>

                {/* The Album Art */}
                <div 
                  className="absolute z-10 overflow-hidden bg-gradient-to-br from-[#2a0a1a] to-[#1a0510] border-2 border-[var(--scene-c)]/50 flex items-center justify-center shadow-[0_30px_90px_rgba(0,0,0,0.8),0_0_80px_var(--scene-b)] transition-all duration-700 ease-out"
                  style={{
                    width: themeIndex === 3 ? '84%' : (themeIndex === 4 ? '78%' : '76%'),
                    height: themeIndex === 3 ? '68%' : (themeIndex === 4 ? '78%' : '76%'),
                    borderRadius: themeIndex === 0 ? 'clamp(16px, 2.5vh, 28px)' : (themeIndex === 1 ? '50%' : (themeIndex === 2 ? '38px 12px 38px 12px' : (themeIndex === 3 ? '52px' : '28px'))),
                    clipPath: themeIndex === 4 ? 'polygon(50% 0%, 92% 18%, 100% 60%, 72% 100%, 28% 100%, 0% 60%, 8% 18%)' : 'none',
                    transform: themeIndex === 0 ? 'rotate(0deg) scale(1)' : (themeIndex === 1 ? 'scale(0.98)' : (themeIndex === 2 ? 'rotate(-4deg) scale(0.94)' : (themeIndex === 3 ? 'translateY(1%)' : 'scale(0.98)')))
                  }}
                >
                  {previewData?.artworkUrl && <div className="absolute inset-0 bg-cover bg-center opacity-60 grayscale-[60%] blur-[5px] mix-blend-overlay" style={{backgroundImage: `url(${previewData.artworkUrl})`}}></div>}
                  <div className="text-8xl sm:text-[110px] md:text-[140px] font-black text-[var(--scene-c)] z-10 animate-[glitch_2.4s_steps(2,end)_infinite] select-none" style={{ textShadow: '0 0 40px rgba(248,113,113,0.55), 2px 0 0 rgba(255,79,216,0.5), -2px 0 0 rgba(51,216,255,0.5)'}}>?</div>
                </div>
              </div>

              {/* Mystery Track Header */}
              <div className="w-full text-center flex flex-col items-center min-h-0 overflow-y-auto custom-scrollbar px-2 pb-4">
                <div className="inline-flex items-center gap-2 px-5 py-2 rounded-full border border-[var(--scene-c)]/40 bg-gradient-to-r from-[var(--scene-b)]/20 to-[var(--scene-c)]/10 text-[var(--scene-c)] text-xs sm:text-sm font-black tracking-widest uppercase mb-3 sm:mb-4 shadow-lg">
                  <Sparkles className="w-4 h-4" /> Mystery Track Live
                </div>
                
                <div className="text-xs font-bold tracking-[0.3em] uppercase text-white/50 mb-1 sm:mb-2">Now Playing</div>
                <h2 className="text-3xl sm:text-5xl md:text-7xl xl:text-8xl font-black leading-[1.05] tracking-tight mb-2 sm:mb-3 text-balance drop-shadow-2xl">
                  {gameState.nowPlaying ? `Mystery Track #${gameState.history.length + 1}` : 'Ready?'}
                </h2>
                <div className="text-base sm:text-xl md:text-2xl font-medium text-white/80 max-w-2xl mx-auto mb-4">
                  {gameState.nowPlaying ? 'Listen closely to the hook! Find this song on your 5x5 board.' : 'Next track incoming...'}
                </div>

                {/* Stage Screen Song Fun Fact Teaser */}
                {gameState.nowPlaying && (
                  <div className="mt-2 sm:mt-4 p-4 sm:p-6 rounded-2xl md:rounded-3xl bg-black/65 border-2 border-[var(--scene-c)]/40 backdrop-blur-xl max-w-2xl w-full shadow-2xl animate-[fadeIn_0.5s_ease-out] group text-center flex flex-col items-center">
                    <div className="flex flex-wrap items-center justify-between w-full mb-2 sm:mb-3 border-b border-white/10 pb-2 gap-2">
                      <div className="flex items-center gap-2 text-[var(--scene-c)] font-black text-xs sm:text-sm uppercase tracking-widest mx-auto sm:mx-0">
                        <Lightbulb className="w-4 h-4 sm:w-5 sm:h-5 text-[var(--scene-c)] animate-pulse" />
                        <span>Did You Know?</span>
                      </div>
                      <button 
                        onClick={() => setTriviaScale(prev => prev === 'normal' ? 'large' : prev === 'large' ? 'huge' : 'normal')}
                        className="opacity-100 sm:opacity-0 group-hover:opacity-100 px-3 py-1 rounded-xl bg-white/10 hover:bg-white/20 border border-white/20 text-white text-xs font-bold transition-opacity duration-300 cursor-pointer flex items-center gap-1.5 mx-auto sm:mx-0"
                        title="Adjust text size for venue TV/projector screens"
                      >
                        <Type className="w-3.5 h-3.5 text-[var(--scene-c)]" /> <span className="hidden sm:inline">Text Size:</span> <span className="uppercase font-extrabold text-[var(--scene-c)]">{triviaScale}</span>
                      </button>
                    </div>
                    <p className={`text-white/95 leading-relaxed font-bold m-0 transition-all ${
                      triviaScale === 'normal' ? 'text-xs sm:text-sm md:text-lg' :
                      triviaScale === 'large' ? 'text-sm sm:text-base md:text-2xl xl:text-3xl' :
                      'text-base sm:text-lg md:text-3xl xl:text-4xl'
                    }`}>
                      "{getSongFact(gameState.nowPlaying)}"
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Footer Audio Vis */}
            <div className="flex-none mt-4 sm:mt-8">
              <div className="flex justify-between items-end mb-2 sm:mb-3">
                <div className="text-[10px] sm:text-xs font-bold tracking-[0.3em] uppercase text-white/40">Track Preview Countdown</div>
                <div className={`text-3xl sm:text-4xl md:text-6xl font-black tabular-nums leading-none ${remaining <= 5 && remaining > 0 ? 'text-[#f87171] drop-shadow-[0_0_30px_#f87171] animate-pulse' : 'text-[var(--scene-c)] drop-shadow-[0_0_30px_var(--scene-c)]'}`}>
                  0:{String(remaining).padStart(2, '0')}
                </div>
              </div>
              
              <div className="w-full h-1.5 sm:h-2 rounded-full bg-white/10 mb-4 sm:mb-6 overflow-hidden">
                <div className="h-full bg-gradient-to-r from-[var(--scene-a)] via-[var(--scene-b)] to-[var(--scene-c)] transition-all ease-linear shadow-[0_0_20px_var(--scene-a)]" style={{width: `${progress * 100}%`}}></div>
              </div>
              
              <div className="relative w-full h-[50px] sm:h-[90px]">
                <div className={`absolute inset-0 flex items-end justify-center w-full px-1 gap-1.5 transition-opacity ${['bars', 'bars', 'dots', 'ribbon', 'bars'][themeIndex] === 'bars' || !previewData?.previewUrl || remaining <= 0 ? 'opacity-100' : 'opacity-0'}`}>
                  {Array.from({ length: 32 }).map((_, i) => (
                    <div 
                      key={i} 
                      ref={el => barsRef.current[i] = el}
                      className="flex-1 min-w-[2px] sm:min-w-[3px] rounded-t-full bg-gradient-to-b from-[var(--scene-a)] via-[var(--scene-b)] to-[var(--scene-c)] transition-[height] duration-75 ease-out h-[10%]"
                    ></div>
                  ))}
                </div>
                <canvas 
                  ref={canvasRef} 
                  width="1000" 
                  height="90" 
                  className={`absolute inset-0 w-full h-full transition-opacity ${['bars', 'bars', 'dots', 'ribbon', 'bars'][themeIndex] === 'bars' || !previewData?.previewUrl || remaining <= 0 ? 'opacity-0' : 'opacity-40'}`}
                ></canvas>
              </div>
            </div>
            
          </div>
        </div>
      )}

      {/* Encouragement Banner / Milestone Flash */}
      {encouragement && (
        <div className="absolute inset-0 z-[100] flex items-center justify-center pointer-events-none p-4 md:p-8 animate-[popIn2_0.4s_cubic-bezier(0.16,1,0.3,1)_forwards]">
          {/* Opaque dark overlay with strong backdrop blur so background text/album art never leaks through */}
          <div className="absolute inset-0 bg-[#030612]/92 backdrop-blur-2xl transition-all"></div>
          
          <div className={`relative min-w-[min(680px,92vw)] p-8 sm:p-12 md:p-16 rounded-[36px] border-2 ${encouragement.isClaim ? 'border-[#ffd76a] bg-[#0c0f24] shadow-[0_0_150px_rgba(255,215,106,0.6)]' : 'border-[var(--scene-a)] bg-[#0c0f24] shadow-[0_0_150px_rgba(255,79,216,0.6)]'} overflow-hidden`}>
            {/* Ambient inner glow */}
            <div className={`absolute inset-0 ${encouragement.isClaim ? 'bg-gradient-to-br from-[#ffd76a]/20 via-transparent to-[#4ade80]/15' : 'bg-gradient-to-br from-[var(--scene-a)]/20 via-transparent to-[var(--scene-b)]/20'}`}></div>
            
            {/* Rotating subtle lighting */}
            <div className="absolute inset-[-60%] animate-[spin_6s_linear_infinite] opacity-40 pointer-events-none" style={{ background: 'conic-gradient(from 90deg, transparent, rgba(var(--scene-a-rgb),0.25), transparent, rgba(var(--scene-c-rgb),0.2), transparent)'}}></div>
            
            <div className="relative z-10 text-center">
              <div className={`text-xs sm:text-sm md:text-base font-extrabold tracking-[0.35em] uppercase mb-2 drop-shadow-[0_2px_10px_rgba(0,0,0,0.9)] ${encouragement.isClaim ? 'text-[#ffd76a]' : 'text-[var(--scene-a)]'}`}>
                {encouragement.kicker}
              </div>
              <h2 className="my-3 sm:my-4 text-4xl sm:text-6xl md:text-8xl xl:text-9xl leading-[0.95] tracking-tight font-black text-white drop-shadow-[0_8px_30px_rgba(0,0,0,0.95)]">
                <span className="text-transparent bg-clip-text" style={{ backgroundImage: encouragement.isClaim ? 'linear-gradient(100deg, #ffffff, #ffd76a, #4ade80)' : 'linear-gradient(100deg, #ffffff, var(--scene-c), var(--scene-b))' }}>
                  {encouragement.title}
                </span>
              </h2>
              <div className="text-base sm:text-xl md:text-3xl text-white/95 font-bold max-w-2xl mx-auto leading-relaxed drop-shadow-[0_2px_12px_rgba(0,0,0,0.9)]">
                {encouragement.sub}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Floating Reactions */}
      {createPortal(
        <div className="fixed inset-0 z-[9999] pointer-events-none">
          {reactions.map((reaction, i) => {
            // generate a deterministic pseudo-random start position from 5% to 95%
            const charCode = reaction.id.charCodeAt(0) || 50;
            const charCode2 = reaction.id.charCodeAt(1) || 50;
            const leftPercent = 5 + ((charCode * 7 + i * 13) % 90);
            
            // deterministic rotation
            const rot = ((charCode * 3 + i * 7) % 60) - 30; // -30 to 30
            
            // Adjust scale based on volume of reactions
            const scale = reactions.length > 20 ? 0.6 : (reactions.length > 10 ? 0.8 : 1.0);
            
            // Stagger the animations so they don't all appear exactly at the same moment
            const delay = ((charCode + charCode2 + i) % 15) * 0.15;
            
            return (
              <div 
                key={reaction.id}
                className="absolute bottom-[-100px] text-center flex flex-col items-center animate-emojiFloat"
                style={{
                  left: `${leftPercent}%`,
                  '--rot': `${rot}deg`,
                  animationDelay: `${delay}s`,
                  transform: `scale(${scale})`
                } as React.CSSProperties}
              >
                <div className="text-5xl md:text-7xl drop-shadow-[0_0_25px_rgba(255,255,255,0.8)] mb-2">{reaction.emoji}</div>
                <div className="bg-black/80 backdrop-blur-md border border-white/40 text-white text-[10px] md:text-xs font-black uppercase tracking-wider px-3 py-1 rounded-full whitespace-nowrap shadow-2xl">
                  {reaction.playerName}
                </div>
              </div>
            );
          })}
        </div>,
        document.body
      )}

      {/* Audio controls popup */}
      <div className="absolute bottom-4 left-4 sm:bottom-6 sm:left-6 z-50">
        <button onClick={() => setShowAudioPanel(!showAudioPanel)} className="p-2 sm:p-3 rounded-full bg-black/60 border border-white/20 text-white hover:bg-white/10 transition-colors shadow-2xl cursor-pointer">
          <Settings className="w-4 h-4 sm:w-5 sm:h-5" />
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
