import React, { useState, useEffect, useCallback, useRef } from 'react';
import { GameStatus, GameState, MAX_LIVES, BASE_SPEED } from './types';
import Game from './components/Game';

// We manage global game state here and pass it down via context or props
// for simplicity in this file structure, we'll use a Context-like pattern via props for the 3D scene
// and local state for the UI.

export default function App() {
  const [status, setStatus] = useState<GameStatus>(GameStatus.IDLE);
  const [score, setScore] = useState(0);
  const [speed, setSpeed] = useState(0);
  const [lives, setLives] = useState(MAX_LIVES);
  const [stage, setStage] = useState(1);
  const [nitro, setNitro] = useState(100);
  const [combo, setCombo] = useState(1.0);

  // High score persistence
  const [highScore, setHighScore] = useState(() => {
    const saved = localStorage.getItem('racer_highscore');
    return saved ? parseInt(saved, 10) : 0;
  });

  useEffect(() => {
    if (score > highScore) {
      setHighScore(score);
      localStorage.setItem('racer_highscore', score.toString());
    }
  }, [score, highScore]);

  const startGame = () => {
    setStatus(GameStatus.PLAYING);
    setScore(0);
    setLives(MAX_LIVES);
    setStage(1);
    setSpeed(BASE_SPEED);
    setNitro(100);
    setCombo(1.0);
  };

  const handleCrash = useCallback(() => {
    setLives(prev => {
      const newLives = prev - 1;
      if (newLives <= 0) {
        setStatus(GameStatus.GAME_OVER);
        return 0;
      }
      // Reset combo on hit
      setCombo(1.0);
      return newLives;
    });
  }, []);

  const handleScoreUpdate = useCallback((deltaScore: number, currentSpeed: number) => {
    setScore(s => Math.floor(s + deltaScore));
    setSpeed(Math.floor(currentSpeed * 2)); // Display speed is purely visual scaling
    
    // Simple stage progression based on score
    setStage(s => 1 + Math.floor(score / 5000));
  }, [score]);

  const handleNitroUpdate = useCallback((amount: number) => {
    setNitro(amount);
  }, []);

  return (
    <div className="relative w-full h-screen bg-slate-900 overflow-hidden">
      
      {/* 3D Game Layer */}
      <div className="absolute inset-0 z-0">
        <Game 
          gameStatus={status}
          onCrash={handleCrash}
          onScore={handleScoreUpdate}
          onNitro={handleNitroUpdate}
        />
      </div>

      {/* UI Overlay Layer */}
      <div className="absolute inset-0 z-10 pointer-events-none flex flex-col justify-between">
        
        {/* Top HUD */}
        <div className="w-full p-4 flex gap-4 text-white uppercase italic tracking-wider">
          <div className="bg-slate-900/80 border-l-4 border-yellow-400 px-4 py-2 rounded-r min-w-[120px]">
            <div className="text-xs text-slate-400">Score</div>
            <div className="text-2xl font-bold">{score.toLocaleString()}</div>
          </div>
          
          <div className="bg-slate-900/80 border-l-4 border-blue-400 px-4 py-2 rounded-r min-w-[120px]">
            <div className="text-xs text-slate-400">Speed</div>
            <div className="text-2xl font-bold">{speed} <span className="text-sm font-normal">km/h</span></div>
          </div>

          <div className="bg-slate-900/80 border-l-4 border-purple-400 px-4 py-2 rounded-r min-w-[100px]">
            <div className="text-xs text-slate-400">Combo</div>
            <div className="text-2xl font-bold">x{combo.toFixed(1)}</div>
          </div>

          <div className="flex-grow"></div>

          <div className="bg-slate-900/80 border-r-4 border-red-500 px-4 py-2 rounded-l min-w-[100px] text-right">
            <div className="text-xs text-slate-400">Lives</div>
            <div className="text-2xl font-bold flex justify-end gap-1">
              {Array.from({ length: Math.max(0, lives) }).map((_, i) => (
                <span key={i} className="text-red-500">♥</span>
              ))}
            </div>
          </div>
           <div className="bg-slate-900/80 border-r-4 border-slate-200 px-4 py-2 rounded-l min-w-[100px] text-right">
            <div className="text-xs text-slate-400">Stage</div>
            <div className="text-2xl font-bold">{stage}</div>
          </div>
        </div>

        {/* Center Messages */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-auto">
          {status === GameStatus.IDLE && (
            <div className="bg-slate-900/90 p-8 rounded-xl border border-blue-500 text-center shadow-2xl backdrop-blur-sm max-w-md animate-fade-in">
              <h1 className="text-5xl font-black text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-cyan-300 mb-2 italic">
                NEON RUNNER
              </h1>
              <p className="text-slate-400 mb-6">Infinite Highway Survival</p>
              
              <div className="text-left bg-slate-800 p-4 rounded mb-6 text-sm text-slate-300 space-y-2">
                <p>Use <kbd className="bg-slate-700 px-2 py-1 rounded text-white">←</kbd> <kbd className="bg-slate-700 px-2 py-1 rounded text-white">→</kbd> to steer.</p>
                <p>Hold <kbd className="bg-slate-700 px-2 py-1 rounded text-white">SPACE</kbd> for NITRO boost.</p>
                <p>Avoid other cars. Don't crash!</p>
              </div>

              <button 
                onClick={startGame}
                className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 px-6 rounded shadow-lg transform transition hover:scale-105 active:scale-95"
              >
                START ENGINE
              </button>
            </div>
          )}

          {status === GameStatus.GAME_OVER && (
             <div className="bg-slate-900/90 p-8 rounded-xl border border-red-500 text-center shadow-2xl backdrop-blur-sm max-w-md animate-bounce-in">
             <h2 className="text-4xl font-black text-red-500 mb-2">CRASHED!</h2>
             <p className="text-xl text-white mb-2">Final Score: {score.toLocaleString()}</p>
             {score >= highScore && score > 0 && (
               <p className="text-yellow-400 text-sm font-bold mb-6">NEW HIGH SCORE!</p>
             )}
             
             <button 
               onClick={startGame}
               className="w-full bg-red-600 hover:bg-red-500 text-white font-bold py-3 px-6 rounded shadow-lg transform transition hover:scale-105 active:scale-95"
             >
               TRY AGAIN
             </button>
           </div>
          )}
        </div>

        {/* Bottom HUD (Nitro) */}
        <div className="w-full p-6 pb-8">
           <div className="text-xs text-cyan-300 font-bold mb-1 ml-1 tracking-widest uppercase">Nitro System</div>
           <div className="w-full h-4 bg-slate-800 rounded-full overflow-hidden border border-slate-700 relative shadow-[0_0_10px_rgba(34,211,238,0.3)]">
              <div 
                className="h-full bg-gradient-to-r from-blue-500 via-cyan-400 to-white transition-all duration-100 ease-linear"
                style={{ width: `${nitro}%` }}
              />
              {/* Scanlines effect on bar */}
              <div className="absolute inset-0 bg-[linear-gradient(90deg,transparent_0%,rgba(0,0,0,0.2)_50%,transparent_100%)] w-full h-full" style={{backgroundSize: '20px 100%'}}></div>
           </div>
        </div>
      </div>
    </div>
  );
}
