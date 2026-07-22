/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';
import { Sparkles, Radio, Tv, Gamepad2, Music, Volume2, ShieldCheck, Trophy, Flame } from 'lucide-react';
import Board from './components/Board';
import Caller from './components/Caller';
import Visualizer from './components/Visualizer';

function Home() {
  return (
    <div className="min-h-screen bg-[#070913] text-[#f7f8ff] font-sans flex flex-col items-center justify-between p-4 md:p-8 relative overflow-hidden selection:bg-[#ff4fd8] selection:text-white">
      {/* Dynamic Ambient Background Glows */}
      <div className="fixed inset-0 z-0 bg-[radial-gradient(ellipse_at_15%_15%,rgba(255,79,216,0.22)_0%,transparent_35%),radial-gradient(ellipse_at_85%_15%,rgba(51,216,255,0.22)_0%,transparent_35%),radial-gradient(ellipse_at_50%_80%,rgba(139,92,246,0.25)_0%,transparent_40%),linear-gradient(180deg,#060812_0%,#0e0b21_60%,#070a18_100%)]"></div>
      
      {/* Floating Animated Vinyl Orbs */}
      <div className="fixed inset-0 z-[1] pointer-events-none overflow-hidden">
        <div className="absolute rounded-full blur-[35px] opacity-30 animate-[drift_18s_ease-in-out_infinite_alternate] w-[280px] h-[280px] -left-[5%] top-[10%] bg-[#ff4fd8]"></div>
        <div className="absolute rounded-full blur-[35px] opacity-30 animate-[drift_24s_ease-in-out_infinite_alternate] w-[320px] h-[320px] -right-[5%] top-[15%] bg-[#33d8ff]"></div>
        <div className="absolute rounded-full blur-[40px] opacity-25 animate-[drift_22s_ease-in-out_infinite_alternate] w-[350px] h-[350px] left-[30%] bottom-[0%] bg-[#8b5cf6]"></div>
      </div>
      
      {/* Grid Pattern Overlay */}
      <div className="fixed inset-0 z-[2] pointer-events-none opacity-[0.25] bg-[radial-gradient(circle,rgba(255,255,255,0.12)_1px,transparent_1px)] bg-[size:32px_32px]"></div>

      {/* Header Bar */}
      <header className="relative z-10 w-full max-w-6xl flex items-center justify-between py-2 mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#ff4fd8] via-[#8b5cf6] to-[#33d8ff] p-[2px] shadow-[0_0_20px_rgba(255,79,216,0.5)]">
            <div className="w-full h-full bg-[#0d0f1d] rounded-[10px] flex items-center justify-center text-xl">
              🎵
            </div>
          </div>
          <span className="font-black text-xl tracking-tight bg-gradient-to-r from-white via-white/90 to-white/60 bg-clip-text text-transparent">
            MUSIC BINGO <span className="text-xs px-2 py-0.5 rounded-full bg-[#ff4fd8]/20 border border-[#ff4fd8]/40 text-[#ff4fd8] uppercase tracking-wider ml-1">LIVE</span>
          </span>
        </div>

        <div className="flex items-center gap-2 bg-white/5 border border-white/10 px-3.5 py-1.5 rounded-full backdrop-blur-md text-xs text-white/80 font-medium">
          <span className="w-2 h-2 rounded-full bg-[#4ade80] animate-pulse"></span>
          Realtime Synchronization Active
        </div>
      </header>

      {/* Main Content Area */}
      <main className="relative z-10 w-full max-w-5xl flex flex-col items-center text-center my-auto py-6">
        {/* Title Pill */}
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-gradient-to-r from-[#ff4fd8]/15 via-[#8b5cf6]/15 to-[#33d8ff]/15 border border-white/15 text-xs font-semibold tracking-wider text-[#ffd76a] mb-6 backdrop-blur-md shadow-lg">
          <Sparkles className="w-3.5 h-3.5 text-[#ffd76a] animate-spin" style={{ animationDuration: '6s' }} />
          THE ULTIMATE PARTY & EVENT MUSIC GAME
        </div>

        {/* Hero Headline */}
        <h1 className="text-5xl md:text-7xl font-black uppercase tracking-tight mb-4 leading-none">
          <span className="bg-gradient-to-r from-[#ffd76a] via-[#ff4fd8] to-[#33d8ff] bg-clip-text text-transparent drop-shadow-[0_0_35px_rgba(255,79,216,0.4)]">
            Music Bingo
          </span>
        </h1>

        <p className="text-base md:text-xl text-white/70 max-w-2xl mb-10 leading-relaxed font-normal text-balance">
          Combine classic bingo with legendary hit tracks! Listen to called clips, mark your board, and shout BINGO to win.
        </p>

        {/* Role Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full max-w-4xl">
          {/* Caller / Host Card */}
          <Link 
            to="/caller" 
            className="group relative flex flex-col items-center p-8 bg-gradient-to-b from-white/10 to-white/5 hover:from-[#ff4fd8]/20 hover:to-white/10 border border-white/10 hover:border-[#ff4fd8]/50 rounded-3xl transition-all duration-300 hover:-translate-y-2 shadow-2xl backdrop-blur-xl text-center overflow-hidden"
          >
            <div className="absolute top-0 right-0 w-28 h-28 bg-[#ff4fd8]/10 rounded-full blur-2xl group-hover:bg-[#ff4fd8]/30 transition-all"></div>
            
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#ff4fd8] to-[#8b5cf6] flex items-center justify-center text-3xl mb-5 shadow-[0_0_25px_rgba(255,79,216,0.4)] group-hover:scale-110 transition-transform">
              🎙️
            </div>
            
            <h2 className="text-xl font-black text-white mb-2 group-hover:text-[#ff4fd8] transition-colors flex items-center gap-2">
              Host / Caller
            </h2>
            <p className="text-xs text-white/60 leading-relaxed mb-6">
              Control song playback, auto-spin tracks, inspect live player claims, and run the show.
            </p>

            <span className="mt-auto inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white/10 group-hover:bg-[#ff4fd8] text-white text-xs font-bold transition-all shadow-md">
              <Radio className="w-3.5 h-3.5" /> Launch Studio Deck
            </span>
          </Link>

          {/* Player Board Card */}
          <Link 
            to="/board" 
            className="group relative flex flex-col items-center p-8 bg-gradient-to-b from-white/10 to-white/5 hover:from-[#33d8ff]/20 hover:to-white/10 border border-white/10 hover:border-[#33d8ff]/50 rounded-3xl transition-all duration-300 hover:-translate-y-2 shadow-2xl backdrop-blur-xl text-center overflow-hidden"
          >
            <div className="absolute top-0 right-0 w-28 h-28 bg-[#33d8ff]/10 rounded-full blur-2xl group-hover:bg-[#33d8ff]/30 transition-all"></div>
            
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#33d8ff] to-[#8b5cf6] flex items-center justify-center text-3xl mb-5 shadow-[0_0_25px_rgba(51,216,255,0.4)] group-hover:scale-110 transition-transform">
              🎫
            </div>
            
            <h2 className="text-xl font-black text-white mb-2 group-hover:text-[#33d8ff] transition-colors flex items-center gap-2">
              Player Card
            </h2>
            <p className="text-xs text-white/60 leading-relaxed mb-6">
              Get your unique 5x5 song board, mark called tracks, track near-wins, and claim BINGO!
            </p>

            <span className="mt-auto inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white/10 group-hover:bg-[#33d8ff] group-hover:text-black text-white text-xs font-bold transition-all shadow-md">
              <Gamepad2 className="w-3.5 h-3.5" /> Enter Game Board
            </span>
          </Link>

          {/* Big Screen Visualizer Card */}
          <Link 
            to="/visualizer" 
            className="group relative flex flex-col items-center p-8 bg-gradient-to-b from-white/10 to-white/5 hover:from-[#ffd76a]/20 hover:to-white/10 border border-white/10 hover:border-[#ffd76a]/50 rounded-3xl transition-all duration-300 hover:-translate-y-2 shadow-2xl backdrop-blur-xl text-center overflow-hidden"
          >
            <div className="absolute top-0 right-0 w-28 h-28 bg-[#ffd76a]/10 rounded-full blur-2xl group-hover:bg-[#ffd76a]/30 transition-all"></div>
            
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#ffd76a] to-[#ff4fd8] flex items-center justify-center text-3xl mb-5 shadow-[0_0_25px_rgba(255,215,106,0.4)] group-hover:scale-110 transition-transform">
              📺
            </div>
            
            <h2 className="text-xl font-black text-white mb-2 group-hover:text-[#ffd76a] transition-colors flex items-center gap-2">
              Party Visualizer
            </h2>
            <p className="text-xs text-white/60 leading-relaxed mb-6">
              Project beat-reactive audio visualizers, full-screen stage lights, and live now-playing graphics.
            </p>

            <span className="mt-auto inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white/10 group-hover:bg-[#ffd76a] group-hover:text-black text-white text-xs font-bold transition-all shadow-md">
              <Tv className="w-3.5 h-3.5" /> Project Big Screen
            </span>
          </Link>
        </div>

        {/* Highlight Features Row */}
        <div className="mt-12 flex flex-wrap justify-center gap-6 text-xs text-white/50 font-medium">
          <div className="flex items-center gap-2 bg-white/5 border border-white/10 px-4 py-2 rounded-full">
            <Volume2 className="w-4 h-4 text-[#ff4fd8]" /> Live iTunes Audio Snippets
          </div>
          <div className="flex items-center gap-2 bg-white/5 border border-white/10 px-4 py-2 rounded-full">
            <Trophy className="w-4 h-4 text-[#ffd76a]" /> Instant Auto-Win Verification
          </div>
          <div className="flex items-center gap-2 bg-white/5 border border-white/10 px-4 py-2 rounded-full">
            <ShieldCheck className="w-4 h-4 text-[#33d8ff]" /> Realtime Sync via Firebase
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 text-center py-4 text-xs text-white/40 font-medium">
        Music Bingo Live • Built for Parties, Venues, & Events
      </footer>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/board" element={<Board />} />
        <Route path="/caller" element={<Caller />} />
        <Route path="/visualizer" element={<Visualizer />} />
      </Routes>
    </BrowserRouter>
  );
}

