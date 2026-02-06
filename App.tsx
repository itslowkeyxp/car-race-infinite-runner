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
  const [showLevelUp, setShowLevelUp] = useState(false);
  
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

  // Level Up Listener
  useEffect(() => {
    if (stage > 1 && status === GameStatus.PLAYING) {
        setShowLevelUp(true);
        // Bonus fuel on level up
        setFuel(f => Math.min(MAX_FUEL, f + 25));
        const timer = window.setTimeout(() => setShowLevelUp(false), 3000);
        return () => window.clearTimeout(timer);
    } else {
        setShowLevelUp(false);
    }
  }, [stage, status]);

  // Fuel Drain Logic
  useEffect(() => {
    let interval: number;
    if (status === GameStatus.PLAYING) {
      interval = window.setInterval(() => {
        setFuel(prev => {
          // Fuel drain increases with stage - difficulty scaling
          // Base drain + 15% per stage
          const stageFactor = 1 + (stage * 0.15); 
          const next = prev - (FUEL_DRAIN_RATE * stageFactor * 0.1); // Run every 100ms
          if (next <= 0) {
             setStatus(GameStatus.GAME_OVER);
             return 0;
          }
          return next;
        });
      }, 100);
    }
    return () => clearInterval(interval);
  }, [status, stage]);

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
    setShowLevelUp(false);
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
      setFuel(f => Math.max(0, f - 15)); // Higher penalty for crashing
      return newLives;
    });
  }, [isInvincible]);

  const handleConeHit = useCallback(() => {
      if (isInvincible) return; // Shield protects from cones too

      // Small shake for impact feedback
      setIsShaking(true);
      setTimeout(() => setIsShaking(false), 200);
      
      // Damage Logic: Reduce lives
      setLives(prev => {
        const newLives = prev - 1;
        if (newLives <= 0) {
            setStatus(GameStatus.GAME_OVER);
            return 0;
        }
        return newLives;
      });
      
      // Penalty: Break combo
      setCombo(1.0);
  }, [isInvincible]);

  const handleScoreUpdate = useCallback((deltaScore: number, currentSpeed: number) => {
    setScore(s => {
        const newScore = Math.floor(s + (deltaScore * scoreMultiplier));
        // Calculate stage based on score thresholds (e.g., every 3000 points)
        setStage(currentStage => {
            const calculatedStage = 1 + Math.floor(newScore / 3000);
            return calculatedStage > currentStage ? calculatedStage : currentStage;
        });
        return newScore;
    }); 
    setSpeed(Math.floor(currentSpeed * 2)); 
  }, [scoreMultiplier]);

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
          stage={stage}
          onCrash={handleCrash}
          onConeHit={handleConeHit}
          onScore={handleScoreUpdate}
          onNitro={handleNitroUpdate}
          onCollect={handleCollect}
        />
      </div>

      {/* Red Flash Overlay */}
      {isShaking && (
        <div className="absolute inset-0 z-[100] bg-red-600/30 mix-blend-overlay pointer-events-none animate-pulse" />
      )}

      {/* Level Up Overlay */}
      {showLevelUp && (
         <div className="absolute inset-0 z-50 flex items-center justify-center pointer-events-none">
            <div className="text-center animate-bounce">
                <h2 className="text-6xl font-black text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 to-red-500 drop-shadow-[0_5px_5px_rgba(0,0,0,0.8)] italic transform -skew-x-12">
                    STAGE {stage}
                </h2>
                <p className="text-white text-xl font-bold mt-2 drop-shadow-md">SPEED UP! TRAFFIC INCREASING!</p>
            </div>
         </div>
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
          
           {/* Stage Indicator */}
           <div className="bg-slate-900/80 border-l-4 border-purple-500 px-4 py-2 rounded-r min-w-[100px]">
            <div className="text-xs text-slate-400">Stage</div>
            <div className="text-2xl font-bold">{stage}</div>
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
             <p className="text-lg text-slate-300 mb-4">Reached Stage {stage}</p>
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