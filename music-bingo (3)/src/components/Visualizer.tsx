import React, { useState, useEffect, useRef } from 'react';
import { subscribeToGameState, subscribeToClaims, setVisualizerAudioActive } from '../lib/store';
import { GameState } from '../lib/types';
import { splitSong, getSongFact } from '../lib/data';
import { lookupPreview } from '../lib/itunes';
import { Music, Volume2, VolumeX, Sparkles, Trophy, Disc, Radio, Settings, Lightbulb } from 'lucide-react';

export default function Visualizer() {
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [previewData, setPreviewData] = useState<{previewUrl: string; artworkUrl: string} | null>(null);
  const [totalClaims, setTotalClaims] = useState(0);
  
  const [themeIndex, setThemeIndex] = useState(0);
  const [sceneIndex, setSceneIndex] = useState(0);
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
        const callNumber = Math.max(1, state.history.length || 1);
        const setNumber = Math.floor((callNumber - 1) / 5) + 1;
        setThemeIndex((setNumber - 1) % 5);
        setSceneIndex((callNumber - 1) % 5);
        
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
    
    return () => {
      unsub();
      unsubClaims();
    };
  }, [gameState?.sessionId]);

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
        if (audioRef.current && !audioRef.current.paused) {
          const current = audioRef.current.currentTime;
          const dur = 30; // 30 second tracks typically
          setProgress(Math.min(1, current / dur));
          setRemaining(Math.max(0, Math.ceil(dur - current)));
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

      {!gameState?.started && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center p-5 text-center bg-transparent">
          <div className="w-full max-w-[720px] flex flex-col items-center">
             <div className="relative inline-block mb-6 text-center select-none">
               <h1 className="text-[clamp(50px,10vw,120px)] font-black leading-[0.9] tracking-tighter uppercase m-0 flex flex-col items-center">
                 <span className="bg-gradient-to-r from-white via-[var(--scene-a)] to-white bg-[length:200%_auto] bg-clip-text text-transparent drop-shadow-[0_0_20px_rgba(51,216,255,0.4)] z-20 px-5">MUSIC</span>
                 <span className="bg-gradient-to-r from-[var(--scene-b)] via-[var(--scene-c)] to-[var(--scene-b)] bg-[length:200%_auto] bg-clip-text text-transparent drop-shadow-[0_0_30px_rgba(255,79,216,0.5)] z-20 px-5">BINGO</span>
               </h1>
             </div>
             <div className="text-[var(--scene-a)] text-xs font-bold tracking-[0.32em] uppercase mb-5">Stage Screen Ready</div>
             <h3 className="text-white text-[clamp(28px,4vmin,50px)] leading-[1.1] tracking-tight font-black m-0 mb-4 drop-shadow-lg">
               Waiting for Host to Launch Game...
             </h3>
           </div>
        </div>
      )}

      {gameState?.started && (
        <div className="absolute inset-0 z-10 flex p-6 md:p-10 gap-8 transition-all">
          <div className="flex-1 bg-[#0e1226]/60 backdrop-blur-3xl border border-white/10 rounded-[36px] p-8 md:p-12 flex flex-col shadow-2xl relative overflow-hidden">
            
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
                <strong className="text-3xl font-black text-white tabular-nums leading-none mt-1">{String(Math.max(1, gameState.history.length)).padStart(2, '0')}</strong>
              </div>
            </div>

            <div className="flex-1 flex flex-col lg:flex-row items-center justify-center gap-12 relative z-20">
              
              {/* Album Art Deck */}
              <div className="relative w-[280px] h-[280px] md:w-[380px] md:h-[380px] flex items-center justify-center">
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
              <div className="flex-1 text-center lg:text-left">
                <div className="inline-flex items-center gap-2 px-5 py-2 rounded-full border border-[var(--scene-c)]/40 bg-gradient-to-r from-[var(--scene-b)]/20 to-[var(--scene-c)]/10 text-[var(--scene-c)] text-xs font-black tracking-widest uppercase mb-6 shadow-lg">
                  <Sparkles className="w-4 h-4" /> Mystery Track Live
                </div>
                
                <div className="text-xs font-bold tracking-[0.3em] uppercase text-white/40 mb-3">Now Playing</div>
                <h2 className="text-4xl md:text-7xl font-black leading-[1.1] tracking-tight mb-4 text-balance drop-shadow-2xl">
                  {gameState.nowPlaying ? `Mystery Track #${Math.max(1, gameState.history.length)}` : 'Ready?'}
                </h2>
                <div className="text-lg md:text-2xl font-medium text-white/70 mb-4">
                  {gameState.nowPlaying ? 'Listen closely to the hook! Find this song on your 5x5 board.' : 'Next track incoming...'}
                </div>

                {/* Stage Screen Song Fun Fact Teaser */}
                {gameState.nowPlaying && (
                  <div className="mt-4 p-4 rounded-2xl bg-black/40 border border-[var(--scene-c)]/30 backdrop-blur-md max-w-2xl animate-[fadeIn_0.5s_ease-out]">
                    <div className="flex items-center gap-2 text-[var(--scene-c)] font-black text-xs uppercase tracking-widest mb-1.5">
                      <Lightbulb className="w-4 h-4 text-[var(--scene-c)] animate-pulse" />
                      Did You Know? (Song Trivia)
                    </div>
                    <p className="text-xs md:text-sm text-white/90 leading-relaxed font-medium m-0">
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
                {['bars', 'bars', 'dots', 'ribbon', 'bars'][themeIndex] === 'bars' ? (
                  <div className="flex items-end justify-center h-full w-full px-1 gap-1.5">
                    {Array.from({ length: 32 }).map((_, i) => (
                      <div 
                        key={i} 
                        ref={el => barsRef.current[i] = el}
                        className="flex-1 min-w-[3px] rounded-t-full bg-gradient-to-b from-[var(--scene-a)] via-[var(--scene-b)] to-[var(--scene-c)] transition-[height] duration-75 ease-out h-[10%]"
                      ></div>
                    ))}
                  </div>
                ) : (
                  <canvas ref={canvasRef} width="1000" height="90" className="w-full h-[90px]"></canvas>
                )}
              </div>
            </div>
            
          </div>
        </div>
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
