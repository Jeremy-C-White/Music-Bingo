/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { HashRouter, Routes, Route, Link } from 'react-router-dom';
import { Sparkles, Radio, Tv, Gamepad2, Music, Volume2, ShieldCheck, Trophy, Flame } from 'lucide-react';
import Board from './components/Board';
import Caller from './components/Caller';
import Visualizer from './components/Visualizer';

function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0a0b1e] via-[#15102e] to-[#0a1326] text-[#f7f8ff] font-sans flex flex-col items-center p-4 md:p-8 relative overflow-hidden selection:bg-[#ff4fd8] selection:text-white">
      {/* Background ambient light show */}
      <div className="fixed inset-0 z-0 bg-[radial-gradient(ellipse_at_18%_22%,rgba(255,79,216,0.16)_0%,transparent_28%),radial-gradient(ellipse_at_82%_20%,rgba(51,216,255,0.16)_0%,transparent_30%),radial-gradient(ellipse_at_50%_85%,rgba(139,92,246,0.16)_0%,transparent_34%),linear-gradient(135deg,#0b1020,#170f2e_55%,#09121f)] opacity-100 transition-all duration-1000"></div>
      
      {/* Floating Blobs */}
      <div className="fixed inset-0 z-[1] pointer-events-none overflow-hidden">
        <div className="absolute rounded-full blur-[14px] opacity-25 animate-[drift_18s_ease-in-out_infinite_alternate] w-[180px] h-[180px] left-[6%] top-[12%] bg-[#ff4fd8]"></div>
        <div className="absolute rounded-full blur-[14px] opacity-25 animate-[drift_24s_ease-in-out_infinite_alternate] w-[220px] h-[220px] right-[8%] top-[18%] bg-[#33d8ff]"></div>
        <div className="absolute rounded-full blur-[14px] opacity-25 animate-[drift_22s_ease-in-out_infinite_alternate] w-[190px] h-[190px] left-[35%] bottom-[4%] bg-[#8b5cf6]"></div>
      </div>
      
      {/* Grid Pattern overlay */}
      <div className="fixed inset-0 z-[2] pointer-events-none opacity-[0.35] bg-[radial-gradient(circle,rgba(255,255,255,0.06)_0_2px,transparent_2px_100%)] bg-[size:130px_130px] animate-[drift_24s_linear_infinite]"></div>

      {/* Header Bar */}
      <header className="w-full max-w-5xl flex items-center justify-between py-4 mb-8 md:mb-12 relative z-10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#ffd76a] via-[#ff4fd8] to-[#33d8ff] flex items-center justify-center shadow-[0_0_20px_rgba(255,79,216,0.4)]">
            <Music className="w-6 h-6 text-[#1a0510]" />
          </div>
          <span className="font-black text-xl md:text-2xl tracking-tighter uppercase text-transparent bg-clip-text bg-gradient-to-r from-white to-white/70">
            Music Bingo
          </span>
        </div>

        <div className="flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/5 border border-white/10 text-xs text-white/80 font-bold backdrop-blur-md">
          <span className="w-2 h-2 rounded-full bg-[#4ade80] animate-pulse shadow-[0_0_10px_#4ade80]"></span>
          Live Sync Active
        </div>
      </header>

      {/* Main Content Area */}
      <main className="w-full max-w-5xl flex flex-col items-center flex-1 relative z-10 text-center">
        {/* Title Tag */}
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-[#ff4fd8]/30 bg-[#ff4fd8]/10 text-xs font-black tracking-[0.2em] text-[#ff4fd8] uppercase mb-8 shadow-[0_0_15px_rgba(255,79,216,0.2)]">
          <Flame className="w-4 h-4 text-[#ffd76a]" />
          The Ultimate Party Game
        </div>

        {/* Hero Headline */}
        <h1 className="text-5xl md:text-8xl font-black tracking-tighter mb-6 leading-[1] max-w-4xl">
          <span className="text-white drop-shadow-md">Guess the Song. </span>
          <span className="bg-gradient-to-r from-[#ffd76a] via-[#ff4fd8] to-[#33d8ff] bg-clip-text text-transparent drop-shadow-[0_0_25px_rgba(255,79,216,0.4)] animate-pulse">Mark your Board.</span>
        </h1>

        <p className="text-lg md:text-xl text-white/70 max-w-2xl mb-12 leading-relaxed font-medium">
          A multiplayer Music Bingo experience. Listen to the tracks, fill out your unique card, and shout BINGO! before anyone else.
        </p>

        {/* Role Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full max-w-5xl">
          {/* Caller / Host Card */}
          <Link 
            to="/caller" 
            className="group flex flex-col items-center text-center p-8 bg-[#131728]/80 backdrop-blur-xl border border-white/10 hover:border-[#ff4fd8]/50 rounded-[32px] transition-all duration-300 hover:shadow-[0_15px_40px_rgba(255,79,216,0.25)] hover:-translate-y-2 relative overflow-hidden"
          >
            <div className="absolute inset-0 bg-gradient-to-b from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#ff4fd8] to-[#8b5cf6] flex items-center justify-center mb-6 shadow-lg shadow-[#ff4fd8]/30">
              <Radio className="w-8 h-8 text-white" />
            </div>
            <h2 className="text-2xl font-black uppercase tracking-tight text-white mb-3">Host & Caller</h2>
            <p className="text-sm text-white/60 leading-relaxed mb-8 font-medium">Control the playlist, verify winning claims, and run the show from the studio console.</p>
            <span className="inline-flex items-center gap-2 text-[#ff4fd8] font-bold text-sm tracking-wider uppercase group-hover:gap-3 transition-all">Launch Console &rarr;</span>
          </Link>

          {/* Player Board Card */}
          <Link 
            to="/board" 
            className="group flex flex-col items-center text-center p-8 bg-[#131728]/80 backdrop-blur-xl border border-white/10 hover:border-[#33d8ff]/50 rounded-[32px] transition-all duration-300 hover:shadow-[0_15px_40px_rgba(51,216,255,0.25)] hover:-translate-y-2 relative overflow-hidden"
          >
            <div className="absolute inset-0 bg-gradient-to-b from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#33d8ff] to-[#3b82f6] flex items-center justify-center mb-6 shadow-lg shadow-[#33d8ff]/30">
              <Gamepad2 className="w-8 h-8 text-white" />
            </div>
            <h2 className="text-2xl font-black uppercase tracking-tight text-white mb-3">Player Card</h2>
            <p className="text-sm text-white/60 leading-relaxed mb-8 font-medium">Grab your unique 5x5 bingo card, mark off tracks as they play, and claim your win!</p>
            <span className="inline-flex items-center gap-2 text-[#33d8ff] font-bold text-sm tracking-wider uppercase group-hover:gap-3 transition-all">Enter Game &rarr;</span>
          </Link>

          {/* Big Screen Visualizer Card */}
          <Link 
            to="/visualizer" 
            className="group flex flex-col items-center text-center p-8 bg-[#131728]/80 backdrop-blur-xl border border-white/10 hover:border-[#ffd76a]/50 rounded-[32px] transition-all duration-300 hover:shadow-[0_15px_40px_rgba(255,215,106,0.25)] hover:-translate-y-2 relative overflow-hidden"
          >
            <div className="absolute inset-0 bg-gradient-to-b from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#ffd76a] to-[#f97316] flex items-center justify-center mb-6 shadow-lg shadow-[#ffd76a]/30">
              <Tv className="w-8 h-8 text-white" />
            </div>
            <h2 className="text-2xl font-black uppercase tracking-tight text-white mb-3">Stage Visuals</h2>
            <p className="text-sm text-white/60 leading-relaxed mb-8 font-medium">Project this animated visualizer on the big screen so the whole room can follow along.</p>
            <span className="inline-flex items-center gap-2 text-[#ffd76a] font-bold text-sm tracking-wider uppercase group-hover:gap-3 transition-all">Open Projector &rarr;</span>
          </Link>
        </div>
      </main>

      {/* Footer */}
      <footer className="w-full max-w-5xl flex justify-center py-6 mt-12 relative z-10 border-t border-white/10 text-xs text-white/40 font-bold uppercase tracking-widest gap-8">
        <span className="flex items-center gap-2"><Volume2 className="w-4 h-4 text-[#33d8ff]" /> Spotify Previews</span>
        <span className="flex items-center gap-2"><Trophy className="w-4 h-4 text-[#ffd76a]" /> Auto-Validation</span>
        <span className="flex items-center gap-2"><ShieldCheck className="w-4 h-4 text-[#ff4fd8]" /> Realtime Sync</span>
      </footer>
    </div>
  );
}

export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/board" element={<Board />} />
        <Route path="/caller" element={<Caller />} />
        <Route path="/visualizer" element={<Visualizer />} />
      </Routes>
    </HashRouter>
  );
}

