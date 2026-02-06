import React, { useState, useEffect, useCallback, useRef } from 'react';
import { GameStatus, GameState, MAX_LIVES, BASE_SPEED, MAX_FUEL, PowerupType, FUEL_DRAIN_RATE } from './types';
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
  const [fuel, setFuel] = useState(MAX_FUEL);
  const [combo, setCombo] = useState(1.0);
  
  // Powerup active states
  const [isInvincible, setIsInvincible] = useState(false);
  const [scoreMultiplier, setScoreMultiplier] = useState(1);
  
  // Visual Effects State
  const [isShaking, setIsShaking] = useState(false);
  
  // Timers refs to clear them if needed
  const shieldTimer = useRef<number | null>(null);
  const multiplierTimer = useRef<number | null>(null);

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

  // Fuel Drain Logic
  useEffect(() => {
    let interval: number;
    if (status === GameStatus.PLAYING) {
      interval = window.setInterval(() => {
        setFuel(prev => {
          const next = prev - (FUEL_DRAIN_RATE * 0.1); // Run every 100ms
          if (next <= 0) {
             setStatus(GameStatus.GAME_OVER);
             return 0;
          }
          return next;
        });
      }, 100);
    }
    return () => clearInterval(interval);
  }, [status]);

  const startGame = () => {
    setStatus(GameStatus.PLAYING);
    setScore(0);
    setLives(MAX_LIVES);
    setStage(1);
    setSpeed(BASE_SPEED);
    setNitro(100);
    setFuel(MAX_FUEL);
    setCombo(1.0);
    setIsInvincible(false);
    setScoreMultiplier(1);
    setIsShaking(false);
  };

  const handleCrash = useCallback(() => {
    if (isInvincible) return; // Ignore crash if shielded

    // Trigger visual effects
    setIsShaking(true);
    // Reset shake after animation duration
    window.setTimeout(() => setIsShaking(false), 500);

    setLives(prev => {
      const newLives = prev - 1;
      if (newLives <= 0) {
        setStatus(GameStatus.GAME_OVER);
        return 0;
      }
      // Reset combo on hit
      setCombo(1.0);
      // Also lose a chunk of fuel on crash penalty
      setFuel(f => Math.max(0, f - 10));
      return newLives;
    });
  }, [isInvincible]);

  const handleScoreUpdate = useCallback((deltaScore: number, currentSpeed: number) => {
    setScore(s => Math.floor(s + (deltaScore * scoreMultiplier))); // Apply multiplier
    setSpeed(Math.floor(currentSpeed * 2)); 
    setStage(s => 1 + Math.floor(score / 5000));
  }, [score, scoreMultiplier]);

  const handleNitroUpdate = useCallback((amount: number) => {
    setNitro(amount);
  }, []);

  const handleCollect = useCallback((type: PowerupType) => {
    switch (type) {
      case PowerupType.FUEL:
        setFuel(f => Math.min(MAX_FUEL, f + 30)); // Increased fuel gain
        break;
      case PowerupType.NITRO:
        setNitro(n => Math.min(100, n + 50));
        break;
      case PowerupType.SHIELD:
        setIsInvincible(true);
        if (shieldTimer.current) clearTimeout(shieldTimer.current);
        shieldTimer.current = window.setTimeout(() => setIsInvincible(false), 5000);
        break;
      case PowerupType.SCORE:
        setScoreMultiplier(2);
        if (multiplierTimer.current) clearTimeout(multiplierTimer.current);
        multiplierTimer.current = window.setTimeout(() => setScoreMultiplier(1), 10000);
        break;
    }
    // Small score bonus for collecting anything
    setScore(s => s + 100);
  }, []);

  return (
    <div className={`relative w-full h-screen bg-slate-900 overflow-hidden ${isShaking ? 'animate-shake' : ''}`}>
      
      {/* 3D Game Layer */}
      <div className="absolute inset-0 z-0">
        <Game 
          gameStatus={status}
          isInvincible={isInvincible}
          fuel={fuel}
          onCrash={handleCrash}
          onScore={handleScoreUpdate}
          onNitro={handleNitroUpdate}
          onCollect={handleCollect}
        />
      </div>

      {/* Red Flash Overlay */}
      {isShaking && (
        <div className="absolute inset-0 z-[100] bg-red-600/30 mix-blend-overlay pointer-events-none animate-pulse" />
      )}

      {/* UI Overlay Layer */}
      <div className="absolute inset-0 z-10 pointer-events-none flex flex-col justify-between">
        
        {/* Top HUD */}
        <div className="w-full p-4 flex gap-4 text-white uppercase italic tracking-wider">
          <div className="bg-slate-900/80 border-l-4 border-yellow-400 px-4 py-2 rounded-r min-w-[120px]">
            <div className="text-xs text-slate-400">Score</div>
            <div className="text-2xl font-bold flex items-center gap-2">
              {score.toLocaleString()}
              {scoreMultiplier > 1 && <span className="text-sm text-yellow-400 animate-pulse">x{scoreMultiplier}</span>}
            </div>
          </div>
          
          <div className="bg-slate-900/80 border-l-4 border-blue-400 px-4 py-2 rounded-r min-w-[120px]">
            <div className="text-xs text-slate-400">Speed</div>
            <div className="text-2xl font-bold">{speed} <span className="text-sm font-normal">km/h</span></div>
          </div>

          <div className="flex-grow"></div>

           {/* Active Powerups Indicators */}
           <div className="flex gap-2 items-center">
            {isInvincible && (
              <div className="bg-blue-500/80 px-3 py-1 rounded text-white font-bold animate-pulse shadow-[0_0_10px_#3b82f6]">
                SHIELD ACTIVE
              </div>
            )}
             {scoreMultiplier > 1 && (
              <div className="bg-yellow-500/80 px-3 py-1 rounded text-white font-bold animate-pulse shadow-[0_0_10px_#eab308]">
                2X SCORE
              </div>
            )}
          </div>

          <div className="bg-slate-900/80 border-r-4 border-red-500 px-4 py-2 rounded-l min-w-[100px] text-right">
            <div className="text-xs text-slate-400">Lives</div>
            <div className="text-2xl font-bold flex justify-end gap-1">
              {Array.from({ length: Math.max(0, lives) }).map((_, i) => (
                <span key={i} className="text-red-500">♥</span>
              ))}
            </div>
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
                <p><span className="text-red-400 font-bold">WARNING:</span> Watch your FUEL level!</p>
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
             <h2 className="text-4xl font-black text-red-500 mb-2">
                {fuel <= 0 ? "OUT OF FUEL!" : "CRASHED!"}
             </h2>
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

        {/* Bottom HUD (Nitro & Fuel) */}
        <div className="w-full p-6 pb-8 flex gap-8">
           {/* Nitro Bar */}
           <div className="flex-1">
              <div className="text-xs text-cyan-300 font-bold mb-1 ml-1 tracking-widest uppercase">Nitro System</div>
              <div className="w-full h-4 bg-slate-800 rounded-full overflow-hidden border border-slate-700 relative shadow-[0_0_10px_rgba(34,211,238,0.3)]">
                  <div 
                    className="h-full bg-gradient-to-r from-blue-500 via-cyan-400 to-white transition-all duration-100 ease-linear"
                    style={{ width: `${nitro}%` }}
                  />
                  <div className="absolute inset-0 bg-[linear-gradient(90deg,transparent_0%,rgba(0,0,0,0.2)_50%,transparent_100%)] w-full h-full" style={{backgroundSize: '20px 100%'}}></div>
              </div>
           </div>

           {/* Fuel Bar */}
           <div className="flex-1">
              <div className={`text-xs font-bold mb-1 ml-1 tracking-widest uppercase ${fuel < 20 ? 'text-red-500 animate-pulse' : 'text-orange-400'}`}>Fuel Tank</div>
              <div className="w-full h-4 bg-slate-800 rounded-full overflow-hidden border border-slate-700 relative shadow-[0_0_10px_rgba(249,115,22,0.3)]">
                  <div 
                    className={`h-full transition-all duration-100 ease-linear ${fuel < 20 ? 'bg-red-600' : 'bg-gradient-to-r from-orange-600 via-orange-400 to-yellow-200'}`}
                    style={{ width: `${fuel}%` }}
                  />
                  <div className="absolute inset-0 bg-[linear-gradient(90deg,transparent_0%,rgba(0,0,0,0.2)_50%,transparent_100%)] w-full h-full" style={{backgroundSize: '20px 100%'}}></div>
              </div>
           </div>
        </div>
      </div>
    </div>
  );
}