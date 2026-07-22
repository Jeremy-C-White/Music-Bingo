/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';
import Board from './components/Board';
import Caller from './components/Caller';
import Visualizer from './components/Visualizer';

function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0a0b1e] via-[#15102e] to-[#0a1326] text-[#f7f8ff] font-sans flex flex-col items-center justify-center p-6 text-center relative overflow-hidden">
      <div className="fixed inset-0 z-0 bg-[radial-gradient(ellipse_at_18%_22%,rgba(255,79,216,0.16)_0%,transparent_28%),radial-gradient(ellipse_at_82%_20%,rgba(51,216,255,0.16)_0%,transparent_30%),radial-gradient(ellipse_at_50%_85%,rgba(139,92,246,0.16)_0%,transparent_34%),linear-gradient(135deg,#0b1020,#170f2e_55%,#09121f)] opacity-100 transition-all duration-1000"></div>
      
      <div className="fixed inset-0 z-[1] pointer-events-none overflow-hidden">
        <div className="absolute rounded-full blur-[14px] opacity-25 animate-[drift_18s_ease-in-out_infinite_alternate] w-[180px] h-[180px] left-[6%] top-[12%] bg-[#ff4fd8]"></div>
        <div className="absolute rounded-full blur-[14px] opacity-25 animate-[drift_24s_ease-in-out_infinite_alternate] w-[220px] h-[220px] right-[8%] top-[18%] bg-[#33d8ff]"></div>
        <div className="absolute rounded-full blur-[14px] opacity-25 animate-[drift_22s_ease-in-out_infinite_alternate] w-[190px] h-[190px] left-[35%] bottom-[4%] bg-[#8b5cf6]"></div>
      </div>
      
      <div className="fixed inset-0 z-[2] pointer-events-none opacity-[0.35] bg-[radial-gradient(circle,rgba(255,255,255,0.06)_0_2px,transparent_2px_100%)] bg-[size:130px_130px] animate-[drift_24s_linear_infinite]"></div>
      
      <div className="relative z-10 max-w-2xl bg-[#131728]/70 border border-white/10 p-10 rounded-3xl backdrop-blur-md shadow-2xl">
        <h1 className="text-5xl font-black uppercase tracking-tighter mb-4">
          <span className="bg-gradient-to-r from-[#ffd76a] via-[#ff4fd8] to-[#33d8ff] bg-clip-text text-transparent drop-shadow-[0_0_15px_rgba(255,79,216,0.3)]">Music Bingo</span>
        </h1>
        <p className="text-lg text-white/60 mb-10 leading-relaxed text-balance">
          Welcome to the ultimate Music Bingo experience. Choose your role below to enter the game.
        </p>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Link to="/caller" className="flex flex-col items-center p-6 bg-white/5 hover:bg-white/10 border border-white/10 rounded-2xl transition-all hover:-translate-y-1 shadow-lg">
            <span className="text-4xl mb-3">🎙️</span>
            <strong className="text-white font-black mb-1">Host / Caller</strong>
            <span className="text-xs text-white/50">Manage the game</span>
          </Link>
          
          <Link to="/board" className="flex flex-col items-center p-6 bg-white/5 hover:bg-white/10 border border-white/10 rounded-2xl transition-all hover:-translate-y-1 shadow-lg">
            <span className="text-4xl mb-3">🎫</span>
            <strong className="text-white font-black mb-1">Player Board</strong>
            <span className="text-xs text-white/50">Join the game</span>
          </Link>
          
          <Link to="/visualizer" className="flex flex-col items-center p-6 bg-white/5 hover:bg-white/10 border border-white/10 rounded-2xl transition-all hover:-translate-y-1 shadow-lg">
            <span className="text-4xl mb-3">📺</span>
            <strong className="text-white font-black mb-1">Visualizer</strong>
            <span className="text-xs text-white/50">Big screen display</span>
          </Link>
        </div>
      </div>
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
