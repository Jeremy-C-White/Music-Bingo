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
    <div className="w-screen h-screen overflow-hidden bg-neutral-950 text-neutral-50 font-sans relative selection:bg-white selection:text-black">
      
      {!gameState?.started && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center p-8 text-center">
          <div className="w-full max-w-[720px] flex flex-col items-center">
             <div className="mb-8">
               <h1 className="text-6xl md:text-8xl font-serif font-medium leading-none tracking-tighter m-0 text-white">
                 Music Bingo
               </h1>
             </div>
             <div className="text-neutral-500 text-xs font-semibold tracking-widest uppercase mb-4">Stage Screen Ready</div>
             <h3 className="text-neutral-300 text-2xl md:text-4xl leading-tight font-light m-0">
               Waiting for Host to Launch Game...
             </h3>
           </div>
        </div>
      )}

      {gameState?.started && (
        <div className="absolute inset-0 z-10 flex p-6 md:p-8">
          <div className="flex-1 bg-neutral-900 border border-neutral-800 p-8 md:p-16 flex flex-col shadow-sm relative overflow-hidden">
            
            {/* Round info overlay */}
            <div className="absolute top-8 right-10 flex items-center gap-4 z-30">
              {totalClaims > 0 && (
                <div className="flex flex-col items-center justify-center w-20 h-20 bg-white text-black border border-white animate-bounce">
                  <span className="text-[9px] font-semibold tracking-widest uppercase">Bingos</span>
                  <strong className="text-3xl font-serif tabular-nums leading-none mt-1">{String(totalClaims).padStart(2, '0')}</strong>
                </div>
              )}

              <div className="flex flex-col items-center justify-center w-20 h-20 bg-neutral-950 border border-neutral-800">
                <span className="text-[9px] font-semibold tracking-widest text-neutral-500 uppercase">Track</span>
                <strong className="text-3xl font-serif text-white tabular-nums leading-none mt-1">{String(Math.max(1, gameState.history.length)).padStart(2, '0')}</strong>
              </div>
            </div>

            <div className="flex-1 flex flex-col lg:flex-row items-center justify-center gap-16 relative z-20">
              
              {/* Album Art Deck */}
              <div className="relative w-[300px] h-[300px] md:w-[400px] md:h-[400px] flex items-center justify-center">
                <svg className="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 400 400">
                  <circle cx="200" cy="200" r="190" fill="none" stroke="#262626" strokeWidth="4" />
                  <circle cx="200" cy="200" r="190" fill="none" stroke="#ffffff" strokeWidth="4" strokeDasharray="1194" strokeDashoffset={1194 * (1 - progress)} className="transition-all duration-150 ease-linear" />
                </svg>
                
                <div className="w-[72%] h-[72%] rounded-full bg-neutral-950 border border-neutral-800 relative overflow-hidden flex items-center justify-center">
                  {previewData?.artworkUrl && <div className="absolute inset-0 bg-cover bg-center opacity-40 grayscale mix-blend-overlay" style={{backgroundImage: `url(${previewData.artworkUrl})`}}></div>}
                  <div className="text-8xl md:text-9xl font-serif text-white z-10 opacity-80 animate-pulse">?</div>
                </div>
              </div>

              {/* Mystery Track Header */}
              <div className="flex-1 text-center lg:text-left">
                <div className="inline-flex items-center gap-2 px-4 py-2 border border-neutral-700 bg-neutral-950 text-white text-xs font-semibold tracking-widest uppercase mb-8">
                  <Sparkles className="w-4 h-4 text-neutral-400" /> Mystery Track Live
                </div>
                
                <div className="text-xs font-semibold tracking-[0.2em] uppercase text-neutral-500 mb-3">Now Playing</div>
                <h2 className="text-4xl md:text-6xl font-serif font-medium leading-[1.1] tracking-tight mb-4 text-balance text-white">
                  {gameState.nowPlaying ? `Mystery Track #${Math.max(1, gameState.history.length)}` : 'Ready?'}
                </h2>
                <div className="text-lg md:text-2xl font-light text-neutral-400 mb-6">
                  {gameState.nowPlaying ? 'Listen closely to the hook. Find this song on your 5x5 board.' : 'Next track incoming...'}
                </div>

                {/* Stage Screen Song Fun Fact Teaser */}
                {gameState.nowPlaying && (
                  <div className="mt-8 p-6 bg-neutral-950 border border-neutral-800 max-w-2xl animate-[fadeIn_0.5s_ease-out]">
                    <div className="flex items-center gap-2 text-white font-semibold text-xs uppercase tracking-widest mb-3">
                      <Lightbulb className="w-4 h-4 text-neutral-400" />
                      Did You Know? (Trivia)
                    </div>
                    <p className="text-sm md:text-base text-neutral-400 leading-relaxed font-light m-0">
                      "{getSongFact(gameState.nowPlaying)}"
                    </p>
                  </div>
                )}
              </div>

            </div>

            {/* Footer Audio Vis */}
            <div className="flex-none mt-12">
              <div className="flex justify-between items-end mb-4">
                <div className="text-xs font-semibold tracking-[0.2em] uppercase text-neutral-500">Track Preview Countdown</div>
                <div className={`text-4xl md:text-6xl font-serif font-medium tabular-nums leading-none ${remaining <= 5 && remaining > 0 ? 'text-red-500 animate-pulse' : 'text-white'}`}>
                  0:{String(remaining).padStart(2, '0')}
                </div>
              </div>
              
              <div className="w-full h-1 bg-neutral-800 mb-8 overflow-hidden">
                <div className="h-full bg-white transition-all ease-linear" style={{width: `${progress * 100}%`}}></div>
              </div>
              
              <div className="relative w-full h-[90px]">
                {['bars', 'bars', 'dots', 'ribbon', 'bars'][themeIndex] === 'bars' ? (
                  <div className="flex items-end justify-center h-full w-full gap-1">
                    {Array.from({ length: 32 }).map((_, i) => (
                      <div 
                        key={i} 
                        ref={el => barsRef.current[i] = el}
                        className="flex-1 min-w-[2px] bg-neutral-500 transition-[height] duration-75 ease-out h-[10%]"
                      ></div>
                    ))}
                  </div>
                ) : (
                  <canvas ref={canvasRef} width="1000" height="90" className="w-full h-[90px] opacity-40"></canvas>
                )}
              </div>
            </div>
            
          </div>
        </div>
      )}

      {/* Audio controls popup */}
      <div className="absolute bottom-8 left-8 z-50">
        <button onClick={() => setShowAudioPanel(!showAudioPanel)} className="p-3 bg-neutral-900 border border-neutral-800 text-neutral-400 hover:text-white transition-colors cursor-pointer shadow-sm">
          <Settings className="w-5 h-5" />
        </button>
        {showAudioPanel && (
          <div className="absolute bottom-16 left-0 bg-neutral-900 border border-neutral-800 p-4 flex items-center gap-4 shadow-sm">
            <button onClick={() => setIsAudioMuted(!isAudioMuted)} className="px-4 py-2 bg-neutral-950 hover:bg-neutral-800 border border-neutral-800 text-xs font-semibold uppercase tracking-wide cursor-pointer flex items-center gap-2 transition-colors">
              {isAudioMuted ? <VolumeX className="w-4 h-4 text-red-500" /> : <Volume2 className="w-4 h-4 text-white" />}
              {isAudioMuted ? 'Muted' : 'Audio On'}
            </button>
            <div className="flex items-center gap-2 bg-neutral-950 px-3 py-2 border border-neutral-800">
              <input type="range" min="0" max="1" step="0.05" value={volume} onChange={e => setVolume(Number(e.target.value))} className="w-24 cursor-pointer accent-white" />
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
        <div className="absolute bottom-0 left-0 right-0 bg-neutral-900 border-t border-neutral-800 text-white text-center p-4 text-xs md:text-sm font-semibold uppercase tracking-widest z-[1000]">
          Tap anywhere on screen to activate stage sound system
        </div>
      )}
    </div>
  );
}
