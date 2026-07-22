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
    <div className="min-h-screen bg-neutral-950 text-neutral-50 font-sans flex flex-col items-center p-6 md:p-12 relative selection:bg-white selection:text-black">
      
      {/* Header Bar */}
      <header className="w-full max-w-6xl flex items-center justify-between py-6 mb-16 border-b border-neutral-800">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded bg-white flex items-center justify-center text-black text-lg">
            🎵
          </div>
          <span className="font-serif font-semibold text-xl tracking-wide">
            Music Bingo
          </span>
        </div>

        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-neutral-800 text-xs text-neutral-400 font-medium">
          <span className="w-2 h-2 rounded-full bg-neutral-400"></span>
          Live Sync Active
        </div>
      </header>

      {/* Main Content Area */}
      <main className="w-full max-w-6xl flex flex-col items-start flex-1">
        {/* Title Tag */}
        <div className="inline-flex items-center gap-2 text-xs font-semibold tracking-[0.2em] text-neutral-400 uppercase mb-8">
          <Sparkles className="w-3.5 h-3.5" />
          The Modern Party Experience
        </div>

        {/* Hero Headline */}
        <h1 className="text-5xl md:text-8xl font-serif font-medium tracking-tight mb-8 leading-[1.1] max-w-4xl text-neutral-100">
          Combine classic bingo with legendary hit tracks.
        </h1>

        <p className="text-lg md:text-2xl text-neutral-400 max-w-2xl mb-16 leading-relaxed font-light text-balance">
          Listen to called clips, mark your unique board, and claim victory. A refined multiplayer experience designed for modern events.
        </p>

        {/* Role Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full">
          {/* Caller / Host Card */}
          <Link 
            to="/caller" 
            className="group flex flex-col items-start p-8 bg-neutral-900 border border-neutral-800 hover:bg-neutral-800 transition-colors duration-200"
          >
            <div className="w-12 h-12 bg-neutral-950 border border-neutral-800 flex items-center justify-center mb-10 group-hover:border-neutral-700 transition-colors">
              <Radio className="w-5 h-5 text-neutral-400 group-hover:text-white transition-colors" />
            </div>
            
            <h2 className="text-xl font-serif font-medium text-neutral-100 mb-3">
              Host / Caller
            </h2>
            <p className="text-sm text-neutral-400 leading-relaxed mb-10 flex-1">
              Control playback, inspect live claims, and run the show from the studio deck.
            </p>

            <span className="inline-flex items-center gap-2 text-white text-sm font-medium tracking-wide">
              Launch Deck &rarr;
            </span>
          </Link>

          {/* Player Board Card */}
          <Link 
            to="/board" 
            className="group flex flex-col items-start p-8 bg-neutral-900 border border-neutral-800 hover:bg-neutral-800 transition-colors duration-200"
          >
            <div className="w-12 h-12 bg-neutral-950 border border-neutral-800 flex items-center justify-center mb-10 group-hover:border-neutral-700 transition-colors">
              <Gamepad2 className="w-5 h-5 text-neutral-400 group-hover:text-white transition-colors" />
            </div>
            
            <h2 className="text-xl font-serif font-medium text-neutral-100 mb-3">
              Player Board
            </h2>
            <p className="text-sm text-neutral-400 leading-relaxed mb-10 flex-1">
              Get your unique 5x5 board, mark tracks, and claim your win in real-time.
            </p>

            <span className="inline-flex items-center gap-2 text-white text-sm font-medium tracking-wide">
              Enter Game &rarr;
            </span>
          </Link>

          {/* Big Screen Visualizer Card */}
          <Link 
            to="/visualizer" 
            className="group flex flex-col items-start p-8 bg-neutral-900 border border-neutral-800 hover:bg-neutral-800 transition-colors duration-200"
          >
            <div className="w-12 h-12 bg-neutral-950 border border-neutral-800 flex items-center justify-center mb-10 group-hover:border-neutral-700 transition-colors">
              <Tv className="w-5 h-5 text-neutral-400 group-hover:text-white transition-colors" />
            </div>
            
            <h2 className="text-xl font-serif font-medium text-neutral-100 mb-3">
              Stage Visualizer
            </h2>
            <p className="text-sm text-neutral-400 leading-relaxed mb-10 flex-1">
              Project beat-reactive graphics and live track information on the big screen.
            </p>

            <span className="inline-flex items-center gap-2 text-white text-sm font-medium tracking-wide">
              Project Screen &rarr;
            </span>
          </Link>
        </div>
      </main>

      {/* Footer */}
      <footer className="w-full max-w-6xl flex justify-between items-center py-8 mt-12 border-t border-neutral-800 text-xs text-neutral-500 font-medium uppercase tracking-widest">
        <div>Built for Modern Events</div>
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1.5"><Volume2 className="w-3.5 h-3.5" /> Audio</span>
          <span className="flex items-center gap-1.5"><Trophy className="w-3.5 h-3.5" /> Auto-Win</span>
          <span className="flex items-center gap-1.5"><ShieldCheck className="w-3.5 h-3.5" /> Firebase Sync</span>
        </div>
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

