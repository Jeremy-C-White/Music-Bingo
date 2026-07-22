import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { subscribeToGameState, subscribeToClaims, setVisualizerAudioActive, subscribeToReactions, Reaction } from '../lib/store';
import { GameState } from '../lib/types';
import { splitSong, getSongFact } from '../lib/data';
import { lookupPreview } from '../lib/itunes';
import { Music, Volume2, VolumeX, Trophy, Disc, Radio, Settings, Lightbulb, Type, Flame } from 'lucide-react';

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
  const [trackBurstKey, setTrackBurstKey] = useState(0);
  
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
      setTrackBurstKey(trackNumber);

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
    document.body.style.setProperty('--bass-scale', (1 + bassAvg * 0.045).toFixed(3));
    document.body.style.setProperty('--bass-glow', (0.30 + bassAvg * 0.55).toFixed(3));
    document.body.style.setProperty('--bass-light', (0.55 + bassAvg * 0.45).toFixed(3));
    
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
    { a: '#33d8ff', b: '#ff4fd8', c: '#ffd76a', ar: '51,216,255', br: '255,79,216', cr: '255,215,106' },
    { a: '#7cf7d4', b: '#5aa7ff', c: '#d8ff6a', ar: '124,247,212', br: '90,167,255', cr: '216,255,106' },
    { a: '#ffd166', b: '#ff5f8f', c: '#ff9f43', ar: '255,209,102', br: '255,95,143', cr: '255,159,67' },
    { a: '#b794ff', b: '#ff69d4', c: '#5ce1e6', ar: '183,148,255', br: '255,105,212', cr: '92,225,230' },
    { a: '#ff6b6b', b: '#ff3cac', c: '#ffe66d', ar: '255,107,107', br: '255,60,172', cr: '255,230,109' },
  ];

  const HOOK_PROMPTS = [
    'Listen closely to the hook and find this song on your board.',
    'Catch the hook, scan your board, and dab that square.',
    'Know it the second it drops? Mark it on your card.',
    'Lock into the melody and hunt it down on your board.',
    'This one on your board? Ears up — find the match.',
    'Trust your gut. Spot this track and claim the square.',
    'One line in and you know it? Get to marking.',
    'Feel that hook? Sweep your board and tag it.',
    'Name that tune in your head, then find it on your grid.',
    'If it\u2019s on your board, don\u2019t sleep — mark it now.',
  ];

  const theme = themes[themeIndex] || themes[0];
  const sceneParticles = Array.from({ length: 30 }, (_, i) => ({
    left: 4 + ((i * 29) % 92),
    top: 8 + ((i * 41) % 82),
    size: 3 + ((i * 7) % 8),
    duration: 7 + ((i * 5) % 12),
    delay: -((i * 0.73) % 10),
    color: i % 3 === 0 ? theme.a : i % 3 === 1 ? theme.b : theme.c,
  }));
  const danceStars = Array.from({ length: 26 }, (_, i) => ({
    left: 5 + ((i * 37) % 90),
    top: 45 + ((i * 19) % 48),
    delay: -((i * 0.31) % 3),
    size: 2 + (i % 4),
  }));
  const orbitLights = Array.from({ length: 6 }, (_, i) => i);

  return (
    <div
      className="music-bingo-stage w-screen h-screen overflow-hidden bg-[#04050d] text-[#f7f8ff] font-sans relative selection:bg-[#ff4fd8]"
      style={{
        '--scene-a': theme.a,
        '--scene-b': theme.b,
        '--scene-c': theme.c,
        '--scene-a-rgb': theme.ar,
        '--scene-b-rgb': theme.br,
        '--scene-c-rgb': theme.cr,
        '--bass-scale': 1,
        '--bass-glow': 0.3,
        '--bass-light': 0.55,
      } as React.CSSProperties}
    >
      <style>{`
        @keyframes mbAmbientDrift {
          0% { transform: scale(1.08) translate3d(-1.5%, -1%, 0) rotate(-1deg); }
          50% { transform: scale(1.14) translate3d(1.8%, 1%, 0) rotate(1.5deg); }
          100% { transform: scale(1.09) translate3d(-0.5%, 2%, 0) rotate(-0.5deg); }
        }
        @keyframes mbSpotlightOne { 0% { transform: rotate(-24deg) translateX(-10vw); } 100% { transform: rotate(24deg) translateX(11vw); } }
        @keyframes mbSpotlightTwo { 0% { transform: rotate(20deg) translateX(8vw); } 100% { transform: rotate(-29deg) translateX(-9vw); } }
        @keyframes mbSpotlightThree { 0% { transform: rotate(-8deg) translateX(-16vw); } 100% { transform: rotate(31deg) translateX(14vw); } }
        @keyframes mbSpotlightFour { 0% { transform: rotate(10deg) translateX(13vw); } 100% { transform: rotate(-34deg) translateX(-12vw); } }
        @keyframes mbGridTravel { 0% { background-position: 0 0, 0 0; } 100% { background-position: 0 72px, 72px 0; } }
        @keyframes mbStarPulse { 0%,100% { opacity: .18; transform: scale(.75); } 45% { opacity: .95; transform: scale(1.8); } }
        @keyframes mbLaserSweep { 0%,100% { opacity: .08; transform: rotate(var(--laser-angle)) scaleY(.8); } 50% { opacity: .72; transform: rotate(calc(var(--laser-angle) + 10deg)) scaleY(1.08); } }
        @keyframes mbParticleFloat { 0% { transform: translate3d(0, 22px, 0) scale(.7); opacity: 0; } 18% { opacity: .75; } 75% { opacity: .38; } 100% { transform: translate3d(14px, -105px, 0) scale(1.35); opacity: 0; } }
        @keyframes mbAuroraOne { 0%,100% { transform: translate3d(-5%, -8%, 0) rotate(-7deg) scaleX(1.05); } 50% { transform: translate3d(8%, 12%, 0) rotate(5deg) scaleX(1.2); } }
        @keyframes mbAuroraTwo { 0%,100% { transform: translate3d(8%, 12%, 0) rotate(7deg) scaleX(1.15); } 50% { transform: translate3d(-9%, -6%, 0) rotate(-5deg) scaleX(.95); } }
        @keyframes mbStarburstSpin { to { transform: translate(-50%, -50%) rotate(360deg); } }
        @keyframes mbOrbit { to { transform: rotate(360deg); } }
        @keyframes mbOrbitReverse { to { transform: rotate(-360deg); } }
        @keyframes mbRingPulse { 0%,100% { transform: scale(.97); opacity: .18; } 50% { transform: scale(1.055); opacity: .72; } }
        @keyframes mbReflectSweep { 0% { transform: translateX(-170%) skewX(-18deg); opacity: 0; } 18% { opacity: .65; } 52%,100% { transform: translateX(230%) skewX(-18deg); opacity: 0; } }
        @keyframes mbTrackBurst { 0% { opacity: .95; transform: scale(.18); } 45% { opacity: .52; } 100% { opacity: 0; transform: scale(2.4); } }
        @keyframes mbVisualizerSweep { 0% { transform: translateX(-120%) skewX(-16deg); } 100% { transform: translateX(520%) skewX(-16deg); } }
        @keyframes mbPanelShimmer { 0%,100% { opacity: .16; transform: translateX(-8%); } 50% { opacity: .34; transform: translateX(8%); } }

        .mb-ambient { animation: mbAmbientDrift 20s ease-in-out infinite alternate; }
        .mb-spotlight { transform-origin: 50% 0%; mix-blend-mode: screen; filter: blur(18px); opacity: var(--bass-light, .55); }
        .mb-spotlight-one { animation: mbSpotlightOne 9s ease-in-out infinite alternate; }
        .mb-spotlight-two { animation: mbSpotlightTwo 12s ease-in-out infinite alternate; }
        .mb-spotlight-three { animation: mbSpotlightThree 14s ease-in-out infinite alternate; }
        .mb-spotlight-four { animation: mbSpotlightFour 11s ease-in-out infinite alternate; }
        .mb-album-bass { transform: scale(var(--bass-scale, 1)); filter: brightness(calc(.92 + var(--bass-glow, .3))); transition: transform 90ms linear, filter 90ms linear; }
        .mb-ring-pulse { animation: mbRingPulse 2.8s ease-in-out infinite; }
        .mb-reflect-sweep { animation: mbReflectSweep 5.2s ease-in-out infinite; }
        .mb-visualizer-sweep { animation: mbVisualizerSweep 4.7s linear infinite; }

        @media (prefers-reduced-motion: reduce) {
          .music-bingo-stage *, .music-bingo-stage *::before, .music-bingo-stage *::after {
            animation-duration: .001ms !important;
            animation-iteration-count: 1 !important;
            scroll-behavior: auto !important;
            transition-duration: .001ms !important;
          }
          .mb-album-bass { transform: none !important; filter: none !important; }
        }
      `}</style>

      {/* Theme-colored ambient background that slowly drifts and responds to bass */}
      <div
        className="mb-ambient fixed -inset-[8%] z-0 pointer-events-none"
        style={{
          background: `radial-gradient(ellipse at 16% 20%, rgba(${theme.ar}, .30) 0%, transparent 39%), radial-gradient(ellipse at 84% 12%, rgba(${theme.br}, .27) 0%, transparent 38%), radial-gradient(ellipse at 52% 94%, rgba(${theme.cr}, .22) 0%, transparent 46%), linear-gradient(140deg, #04050d, #0a0b1e 45%, #15102e 72%, #081426)`,
          filter: 'brightness(var(--bass-light, .7)) saturate(1.15)',
        }}
      />
      <div className="fixed inset-0 z-[1] bg-[radial-gradient(ellipse_at_center,transparent_34%,rgba(0,0,0,0.72)_100%)] pointer-events-none" />

      {/* Four independent, theme-colored moving spotlights */}
      <div className="fixed inset-0 z-[2] pointer-events-none overflow-hidden">
        <div className="mb-spotlight mb-spotlight-one absolute -top-[22%] left-[7%] w-[12vw] min-w-[110px] h-[155vh]" style={{ background: `linear-gradient(to bottom, rgba(${theme.ar}, .42), transparent 76%)` }} />
        <div className="mb-spotlight mb-spotlight-two absolute -top-[22%] right-[7%] w-[12vw] min-w-[110px] h-[155vh]" style={{ background: `linear-gradient(to bottom, rgba(${theme.br}, .42), transparent 76%)` }} />
        <div className="mb-spotlight mb-spotlight-three absolute -top-[24%] left-[37%] w-[10vw] min-w-[90px] h-[150vh]" style={{ background: `linear-gradient(to bottom, rgba(${theme.cr}, .30), transparent 72%)` }} />
        <div className="mb-spotlight mb-spotlight-four absolute -top-[24%] right-[35%] w-[10vw] min-w-[90px] h-[150vh]" style={{ background: `linear-gradient(to bottom, rgba(${theme.ar}, .26), transparent 72%)` }} />
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
        <div className="absolute inset-0 z-10 p-2 sm:p-4 lg:p-6 transition-all">
          <div className="h-full min-h-0 bg-[#0e1226]/68 backdrop-blur-xl border border-white/10 rounded-3xl lg:rounded-[36px] p-[clamp(12px,2vw,28px)] flex flex-col shadow-2xl relative overflow-hidden">

            {/* Per-track scene personalities. The scene changes every track and the palette every five tracks. */}
            <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
              <div
                className="absolute inset-0 opacity-40"
                style={{ background: `radial-gradient(circle at 26% 38%, rgba(${theme.ar}, var(--bass-glow, .3)), transparent 31%), radial-gradient(circle at 76% 52%, rgba(${theme.br}, .20), transparent 35%)` }}
              />

              {sceneIndex === 0 && (
                <>
                  <div
                    className="absolute -left-[15%] -right-[15%] -bottom-[48%] h-[105%] opacity-55"
                    style={{
                      transform: 'perspective(620px) rotateX(66deg)',
                      transformOrigin: 'bottom center',
                      backgroundImage: `repeating-linear-gradient(0deg, rgba(${theme.ar}, .30) 0 2px, transparent 2px 72px), repeating-linear-gradient(90deg, rgba(${theme.br}, .24) 0 2px, transparent 2px 72px)`,
                      animation: 'mbGridTravel 3.6s linear infinite',
                      maskImage: 'linear-gradient(to top, black 15%, transparent 86%)',
                    }}
                  />
                  {danceStars.map((star, i) => (
                    <span
                      key={i}
                      className="absolute rounded-full"
                      style={{
                        left: `${star.left}%`, top: `${star.top}%`, width: star.size, height: star.size,
                        background: i % 2 ? theme.a : theme.c,
                        boxShadow: `0 0 14px ${i % 2 ? theme.a : theme.c}`,
                        animation: `mbStarPulse ${1.7 + (i % 5) * .24}s ease-in-out ${star.delay}s infinite`,
                      }}
                    />
                  ))}
                </>
              )}

              {sceneIndex === 1 && (
                <div
                  className="absolute inset-0 overflow-hidden opacity-40"
                  style={{ maskImage: 'radial-gradient(ellipse 62% 70% at 50% 60%, transparent 30%, black 78%)' }}
                >
                  {Array.from({ length: 11 }).map((_, i) => {
                    const angle = -48 + i * 9.5;
                    const rgb = i % 3 === 0 ? theme.ar : i % 3 === 1 ? theme.br : theme.cr;
                    return (
                      <div
                        key={i}
                        className="absolute left-1/2 bottom-[-18%] h-[118%] w-[2px] origin-bottom blur-[1px]"
                        style={{
                          '--laser-angle': `${angle}deg`,
                          background: `linear-gradient(to top, rgba(${rgb}, .55), rgba(${rgb}, .06) 72%, transparent)`,
                          boxShadow: `0 0 10px rgba(${rgb}, .35)`,
                          animation: `mbLaserSweep ${3.2 + (i % 4) * .6}s ease-in-out ${-(i * .23)}s infinite`,
                        } as React.CSSProperties}
                      />
                    );
                  })}
                </div>
              )}

              {sceneIndex === 2 && (
                <div className="absolute inset-0">
                  {sceneParticles.map((particle, i) => (
                    <span
                      key={i}
                      className="absolute rounded-full"
                      style={{
                        left: `${particle.left}%`, top: `${particle.top}%`,
                        width: particle.size, height: particle.size,
                        background: particle.color,
                        boxShadow: `0 0 ${10 + particle.size * 2}px ${particle.color}`,
                        animation: `mbParticleFloat ${particle.duration}s ease-in-out ${particle.delay}s infinite`,
                      }}
                    />
                  ))}
                </div>
              )}

              {sceneIndex === 3 && (
                <div className="absolute inset-0 opacity-70 mix-blend-screen">
                  <div className="absolute left-[-12%] top-[10%] w-[125%] h-[22%] rounded-[50%] blur-[38px]" style={{ background: `linear-gradient(90deg, transparent, rgba(${theme.ar}, .52), rgba(${theme.br}, .30), transparent)`, animation: 'mbAuroraOne 11s ease-in-out infinite' }} />
                  <div className="absolute left-[-10%] top-[36%] w-[120%] h-[18%] rounded-[50%] blur-[46px]" style={{ background: `linear-gradient(90deg, transparent, rgba(${theme.cr}, .38), rgba(${theme.ar}, .30), transparent)`, animation: 'mbAuroraTwo 14s ease-in-out infinite' }} />
                  <div className="absolute left-[-15%] top-[62%] w-[130%] h-[16%] rounded-[50%] blur-[54px]" style={{ background: `linear-gradient(90deg, transparent, rgba(${theme.br}, .32), rgba(${theme.cr}, .25), transparent)`, animation: 'mbAuroraOne 17s ease-in-out -6s infinite reverse' }} />
                </div>
              )}

              {sceneIndex === 4 && (
                <div
                  className="absolute left-1/2 top-1/2 w-[150vmax] h-[150vmax] rounded-full opacity-30 mix-blend-screen"
                  style={{
                    background: `repeating-conic-gradient(from 0deg, rgba(${theme.ar}, .52) 0deg 2deg, transparent 2deg 12deg, rgba(${theme.br}, .34) 12deg 14deg, transparent 14deg 25deg)`,
                    animation: 'mbStarburstSpin 24s linear infinite',
                    maskImage: 'radial-gradient(circle, transparent 0 8%, black 27%, transparent 70%)',
                  }}
                />
              )}

              <div className="absolute -inset-[20%] opacity-20" style={{ background: `linear-gradient(115deg, transparent 36%, rgba(${theme.c}, .30) 49%, transparent 62%)`, animation: 'mbPanelShimmer 9s ease-in-out infinite' }} />
            </div>

            {/* A brief bloom announces each new track without adding more text. */}
            {trackBurstKey > 0 && (
              <div key={trackBurstKey} className="absolute inset-0 z-[5] pointer-events-none flex items-center justify-center overflow-hidden">
                <div className="w-[36vmin] h-[36vmin] rounded-full border-[3px]" style={{ borderColor: theme.c, boxShadow: `0 0 80px 26px rgba(${theme.ar}, .48), inset 0 0 70px rgba(${theme.br}, .42)`, animation: 'mbTrackBurst 1.35s cubic-bezier(.16,1,.3,1) forwards' }} />
              </div>
            )}

            {/* Organized stage header */}
            <header className="relative z-30 flex-none flex items-center justify-between gap-3 sm:gap-5 pb-3 sm:pb-4 border-b border-white/10">
              <div className="flex items-center gap-2 sm:gap-3 min-w-0 select-none">
                <div className="relative w-8 h-8 sm:w-10 sm:h-10 flex-none mr-1">
                  <div className="absolute -top-1 -left-1 -rotate-12 z-10">
                    <Music className="w-5 h-5 sm:w-7 sm:h-7 text-[#33d8ff] animate-pulse drop-shadow-[0_0_10px_rgba(51,216,255,0.8)]" />
                  </div>
                  <div className="absolute bottom-0 -right-1 rotate-12 z-10">
                    <Music className="w-5 h-5 sm:w-7 sm:h-7 text-[#ff4fd8] animate-pulse drop-shadow-[0_0_10px_rgba(255,79,216,0.8)]" />
                  </div>
                </div>
                <h1 className="text-lg sm:text-2xl lg:text-3xl font-black tracking-tighter uppercase m-0 leading-none flex items-center gap-1.5 sm:gap-2 whitespace-nowrap">
                  <span className="bg-gradient-to-r from-white via-white to-white/70 bg-clip-text text-transparent drop-shadow-md">Music</span>
                  <span className="bg-gradient-to-r from-[#ffd76a] via-[#ff4fd8] to-[#33d8ff] bg-clip-text text-transparent drop-shadow-[0_0_15px_rgba(255,79,216,0.3)]">Bingo</span>
                </h1>
              </div>

              <div className="flex items-center justify-end gap-2 sm:gap-3 flex-none">
                <div className="hidden sm:flex items-center gap-2 px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-[10px] lg:text-xs font-black tracking-[0.18em] uppercase text-white/65">
                  <Radio className="w-4 h-4 text-[#4ade80] animate-pulse" />
                  Live Stage
                </div>

                {totalClaims > 0 && (
                  <div className="flex items-center gap-2 px-3 sm:px-4 py-2 rounded-xl border border-[var(--scene-c)]/45 bg-black/55 backdrop-blur-md shadow-[0_0_24px_var(--scene-c)]">
                    <Trophy className="w-4 h-4 sm:w-5 sm:h-5 text-[var(--scene-c)]" />
                    <div className="leading-none text-left">
                      <span className="block text-[8px] sm:text-[9px] font-black tracking-widest text-[var(--scene-c)] uppercase">Bingos</span>
                      <strong className="block text-lg sm:text-2xl font-black text-[var(--scene-c)] tabular-nums mt-0.5">{String(totalClaims).padStart(2, '0')}</strong>
                    </div>
                  </div>
                )}

                <div className="relative">
                  <button
                    onClick={() => setShowAudioPanel(!showAudioPanel)}
                    className="p-2.5 sm:p-3 rounded-xl bg-black/50 border border-white/15 text-white hover:bg-white/10 transition-colors shadow-xl cursor-pointer"
                    title="Audio controls"
                  >
                    <Settings className="w-4 h-4 sm:w-5 sm:h-5" />
                  </button>
                  {showAudioPanel && (
                    <div className="absolute top-[calc(100%+10px)] right-0 z-50 bg-[#12182a]/98 backdrop-blur-xl border border-white/20 p-3 sm:p-4 rounded-2xl flex items-center gap-3 shadow-2xl whitespace-nowrap">
                      <button
                        onClick={() => setIsAudioMuted(!isAudioMuted)}
                        className="px-3 sm:px-4 py-2 bg-white/10 hover:bg-white/20 rounded-xl text-[10px] sm:text-xs font-bold uppercase cursor-pointer flex items-center gap-2"
                      >
                        {isAudioMuted ? <VolumeX className="w-4 h-4 text-[#f87171]" /> : <Volume2 className="w-4 h-4 text-[#4ade80]" />}
                        {isAudioMuted ? 'Muted' : 'Audio On'}
                      </button>
                      <div className="flex items-center gap-2 bg-white/5 px-3 py-2 rounded-xl border border-white/10">
                        <input
                          type="range"
                          min="0"
                          max="1"
                          step="0.05"
                          value={volume}
                          onChange={e => setVolume(Number(e.target.value))}
                          className="w-20 sm:w-28 cursor-pointer"
                          aria-label="Stage audio volume"
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </header>

            {/* Main stage content */}
            <div className="relative z-20 flex-1 min-h-0 w-full max-w-[1400px] mx-auto grid grid-cols-1 md:grid-cols-[minmax(300px,0.95fr)_minmax(360px,1.05fr)] items-center gap-[clamp(16px,2.4vw,42px)] py-[clamp(8px,1.4vh,18px)] overflow-y-auto md:overflow-hidden">

              {/* Large audio-reactive album art, vinyl, and timer centerpiece */}
              <div className="flex items-center justify-center min-h-0 min-w-0">
                <div
                  className="mb-album-bass relative max-w-full aspect-square flex items-center justify-center flex-none"
                  style={{
                    width: 'min(480px, 46vh, 100%)',
                    height: 'min(480px, 46vh, 100%)',
                    filter: 'brightness(calc(.92 + var(--bass-glow, .3))) drop-shadow(0 0 42px rgba(var(--scene-a-rgb), var(--bass-glow, .3)))',
                  }}
                >
                  {/* Pulsing timer halos */}
                  <div className="mb-ring-pulse absolute inset-[-2.5%] rounded-full border border-[var(--scene-a)]/35 shadow-[0_0_38px_var(--scene-a)]" />
                  <div className="mb-ring-pulse absolute inset-[1%] rounded-full border border-[var(--scene-b)]/30 shadow-[0_0_28px_var(--scene-b)]" style={{ animationDelay: '-1.2s' }} />

                  {/* Orbiting album lights */}
                  <div className="absolute inset-[-3%] rounded-full" style={{ animation: 'mbOrbit 13s linear infinite' }}>
                    {orbitLights.map((light) => (
                      <span
                        key={light}
                        className="absolute left-1/2 top-1/2 rounded-full"
                        style={{
                          width: light % 2 ? 8 : 11,
                          height: light % 2 ? 8 : 11,
                          background: light % 3 === 0 ? theme.a : light % 3 === 1 ? theme.b : theme.c,
                          boxShadow: `0 0 20px ${light % 3 === 0 ? theme.a : light % 3 === 1 ? theme.b : theme.c}`,
                          transform: `rotate(${light * 60}deg) translateY(max(-232px, -22vh, -40vw))`,
                          transformOrigin: '0 0',
                        }}
                      />
                    ))}
                  </div>
                  <div className="absolute inset-[3%] rounded-full border border-white/10" style={{ animation: 'mbOrbitReverse 19s linear infinite' }} />

                  {/* Thick outer progress timer */}
                  <svg className="absolute inset-0 w-full h-full -rotate-90 drop-shadow-[0_0_34px_rgba(var(--scene-a-rgb),0.42)]" viewBox="0 0 400 400">
                    <circle cx="200" cy="200" r="188" fill="none" stroke="rgba(255,255,255,0.10)" strokeWidth="11" />
                    <circle
                      cx="200" cy="200" r="188" fill="none" stroke="var(--scene-c)" strokeWidth="11" strokeLinecap="round"
                      strokeDasharray="1181" strokeDashoffset={1181 * (1 - progress)}
                      className="transition-all duration-150 ease-linear"
                      style={{ filter: `drop-shadow(0 0 10px ${theme.c})` }}
                    />
                  </svg>

                  {/* Vinyl closer to the timer ring */}
                  <div className={`absolute inset-[3.5%] rounded-full bg-[repeating-radial-gradient(circle_at_center,rgba(255,255,255,0.025)_0,rgba(255,255,255,0.025)_1px,transparent_1px,transparent_4px),radial-gradient(circle_at_center,#21183b_0%,#090814_76%)] shadow-[inset_0_0_72px_rgba(0,0,0,0.9),0_0_50px_rgba(var(--scene-b-rgb),0.35)] ${themeIndex === 1 ? 'animate-[spin_13s_linear_infinite]' : 'animate-[spin_20s_linear_infinite]'} ${themeIndex === 3 ? 'inset-[2%] opacity-90' : ''}`}>
                    <div className="absolute inset-[42%] rounded-full bg-gradient-to-br from-[var(--scene-a)] via-[var(--scene-b)] to-[var(--scene-c)] opacity-90 shadow-[0_0_25px_var(--scene-a)]" />
                  </div>

                  {/* Larger mystery artwork */}
                  <div
                    className="absolute z-10 overflow-hidden bg-gradient-to-br from-[#2a0a1a] to-[#1a0510] border-[3px] border-[var(--scene-c)]/55 flex items-center justify-center shadow-[0_28px_90px_rgba(0,0,0,0.88),0_0_82px_rgba(var(--scene-b-rgb),0.62)] transition-all duration-700 ease-out"
                    style={{
                      width: themeIndex === 3 ? '90%' : (themeIndex === 4 ? '86%' : '84%'),
                      height: themeIndex === 3 ? '76%' : (themeIndex === 4 ? '86%' : '84%'),
                      borderRadius: themeIndex === 0 ? 'clamp(18px, 2.8vh, 34px)' : (themeIndex === 1 ? '50%' : (themeIndex === 2 ? '48px 14px 48px 14px' : (themeIndex === 3 ? '60px' : '32px'))),
                      clipPath: themeIndex === 4 ? 'polygon(50% 0%, 92% 18%, 100% 60%, 72% 100%, 28% 100%, 0% 60%, 8% 18%)' : 'none',
                      transform: themeIndex === 0 ? 'rotate(0deg)' : (themeIndex === 1 ? 'scale(.99)' : (themeIndex === 2 ? 'rotate(-3deg) scale(.97)' : (themeIndex === 3 ? 'translateY(1%)' : 'scale(.99)'))),
                    }}
                  >
                    {previewData?.artworkUrl && (
                      <div className="absolute inset-0 bg-cover bg-center opacity-62 grayscale-[55%] blur-[5px] mix-blend-overlay" style={{ backgroundImage: `url(${previewData.artworkUrl})` }} />
                    )}
                    <div className="absolute inset-0" style={{ background: `radial-gradient(circle at 50% 45%, rgba(${theme.cr}, .08), transparent 52%), linear-gradient(145deg, rgba(${theme.ar}, .14), transparent 48%, rgba(${theme.br}, .12))` }} />
                    <div className="mb-reflect-sweep absolute -top-[20%] -bottom-[20%] left-[-35%] w-[24%] bg-gradient-to-r from-transparent via-white/55 to-transparent blur-[2px] mix-blend-screen" />
                    <div className="relative z-10 text-[clamp(88px,14vh,150px)] font-black text-[var(--scene-c)] animate-[glitch_2.4s_steps(2,end)_infinite] select-none" style={{ textShadow: `0 0 52px rgba(${theme.cr}, .72), 3px 0 0 rgba(${theme.br}, .58), -3px 0 0 rgba(${theme.ar}, .58)` }}>?</div>
                  </div>
                </div>
              </div>

              {/* Track information zone */}
              <div className="relative z-30 min-w-0 min-h-0 flex flex-col justify-center text-center md:text-left">
                <div className="flex flex-wrap items-center justify-center md:justify-start gap-2 mb-2 sm:mb-3">
                  <div className="text-[10px] sm:text-xs font-bold tracking-[0.3em] uppercase text-white/45">Now Playing</div>
                  {gameState.nowPlaying && (
                    <div className="px-2.5 py-1 rounded-full bg-[var(--scene-a)]/10 border border-[var(--scene-a)]/25 text-[9px] sm:text-[10px] font-black tracking-[0.18em] uppercase text-[var(--scene-a)]">
                      Track {String(gameState.history.length + 1).padStart(2, '0')}
                    </div>
                  )}
                </div>

                <h2 className="text-[clamp(2rem,4.6vw,4rem)] font-black leading-[0.98] tracking-tight mb-2 sm:mb-3 text-balance drop-shadow-2xl">
                  {gameState.nowPlaying ? `Mystery Track #${gameState.history.length + 1}` : 'Ready?'}
                </h2>

                <div
                  key={gameState.history.length}
                  className="text-[clamp(0.9rem,1.7vw,1.45rem)] font-medium leading-snug text-white/70 mb-[clamp(10px,2vh,20px)] max-w-3xl animate-[fadeIn_0.45s_ease-out]"
                >
                  {gameState.nowPlaying
                    ? HOOK_PROMPTS[gameState.history.length % HOOK_PROMPTS.length]
                    : 'Next track incoming...'}
                </div>

                {gameState.nowPlaying && (
                  <div className="relative z-30 p-[clamp(12px,1.6vw,22px)] rounded-2xl lg:rounded-3xl bg-black/60 border border-[var(--scene-c)]/50 backdrop-blur-xl max-w-3xl shadow-[0_0_46px_rgba(var(--scene-c-rgb),0.22),0_10px_40px_rgba(0,0,0,0.5)] animate-[fadeIn_0.5s_ease-out] group">
                    <div className="flex flex-wrap items-center justify-between mb-2 border-b border-white/10 pb-2 gap-2">
                      <div className="flex items-center gap-2 text-[var(--scene-c)] font-black text-[10px] sm:text-xs uppercase tracking-widest">
                        <Lightbulb className="w-4 h-4 sm:w-5 sm:h-5 text-[var(--scene-c)] animate-pulse" />
                        <span>Did You Know?</span>
                      </div>
                      <button
                        onClick={() => setTriviaScale(prev => prev === 'normal' ? 'large' : prev === 'large' ? 'huge' : 'normal')}
                        className="opacity-100 lg:opacity-0 group-hover:opacity-100 px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 border border-white/15 text-white text-[10px] font-bold transition-opacity duration-300 cursor-pointer flex items-center gap-1.5"
                        title="Adjust text size for venue TV/projector screens"
                      >
                        <Type className="w-3.5 h-3.5 text-[var(--scene-c)]" />
                        <span className="hidden sm:inline">Text Size</span>
                        <span className="uppercase font-extrabold text-[var(--scene-c)]">{triviaScale}</span>
                      </button>
                    </div>
                    <p className={`text-white/95 leading-relaxed font-bold m-0 transition-all ${
                      triviaScale === 'normal' ? 'text-[clamp(0.78rem,1.2vw,1.05rem)]' :
                      triviaScale === 'large' ? 'text-[clamp(0.95rem,1.65vw,1.45rem)]' :
                      'text-[clamp(1.05rem,2vw,1.8rem)]'
                    }`}>
                      &ldquo;{getSongFact(gameState.nowPlaying)}&rdquo;
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Compact visualizer and countdown zone */}
            <div className="relative z-20 flex-none rounded-2xl lg:rounded-3xl border border-white/10 bg-black/25 px-3 sm:px-5 pt-2 sm:pt-3 pb-3 sm:pb-4">
              <div className="relative w-full h-[clamp(64px,12vh,132px)] mb-2 sm:mb-3 overflow-hidden">
                <div className="mb-visualizer-sweep absolute inset-y-0 left-0 z-20 w-1/4 bg-gradient-to-r from-transparent via-white/20 to-transparent blur-md pointer-events-none" />
                <div className={`absolute inset-0 flex items-end justify-center w-full px-1 gap-1 sm:gap-1.5 transition-opacity ${['bars', 'bars', 'dots', 'ribbon', 'bars'][themeIndex] === 'bars' || !previewData?.previewUrl || remaining <= 0 ? 'opacity-100' : 'opacity-0'}`}>
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
                  height="200"
                  className={`absolute inset-0 w-full h-full transition-opacity ${['bars', 'bars', 'dots', 'ribbon', 'bars'][themeIndex] === 'bars' || !previewData?.previewUrl || remaining <= 0 ? 'opacity-0' : 'opacity-55'}`}
                ></canvas>
              </div>

              <div className="flex items-center gap-3 sm:gap-5">
                <div className="flex-1 min-w-0">
                  <div className="w-full h-1.5 sm:h-2 rounded-full bg-white/10 overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-[var(--scene-a)] via-[var(--scene-b)] to-[var(--scene-c)] transition-all ease-linear shadow-[0_0_20px_var(--scene-a)]" style={{ width: `${progress * 100}%` }}></div>
                  </div>
                  <div className="mt-2 text-[9px] sm:text-[10px] lg:text-xs font-bold tracking-[0.22em] uppercase text-white/40">Track Preview Countdown</div>
                </div>
                <div className={`flex-none text-[clamp(2rem,4.4vw,4rem)] font-black tabular-nums leading-none ${remaining <= 5 && remaining > 0 ? 'text-[#f87171] drop-shadow-[0_0_40px_#f87171] animate-pulse' : 'text-[var(--scene-c)] drop-shadow-[0_0_30px_var(--scene-c)]'}`}>
                  0:{String(remaining).padStart(2, '0')}
                </div>
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
          {(() => {
            const N = reactions.length;
            // Number of vertical "lanes" scales with the crowd so we never cram
            // everyone into the same few columns. Clamped to keep things sane.
            const lanes = Math.min(16, Math.max(6, Math.ceil(Math.sqrt(N) * 2)));
            // Widen the launch window as more people react so per-second density
            // stays roughly constant instead of piling into a fixed ~2s window.
            const launchWindow = Math.max(2.1, N * 0.12);

            return reactions.map((reaction, i) => {
              // Golden-angle horizontal spread (137.5°) — a low-discrepancy
              // sequence, so consecutive items never cluster the way a fixed
              // step (e.g. +13) can. Position depends only on index, not on the
              // reaction id, so it's robust to low-entropy / sequential ids.
              const leftPercent = 5 + ((i * 137.5) % 90);

              // Round-robin lanes: items sharing a lane are spread across
              // different launch times, so same-lane emojis never rise together.
              const lane = i % lanes;
              const row = Math.floor(i / lanes);
              const delay = lane * (launchWindow / lanes) + row * 0.08;

              // Shrink glyphs as the crowd grows — more effective horizontal
              // room, and less visual overlap.
              const scale = N > 25 ? 0.55 : N > 12 ? 0.75 : 1.0;

              // Deterministic tilt for variety.
              const rot = ((i * 47) % 60) - 30; // -30 to 30

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
            });
          })()}
        </div>,
        document.body
      )}


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