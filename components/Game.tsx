import React, { Suspense, useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { Sky, Stars } from '@react-three/drei';
import { GameStatus, PowerupType } from '../types';
import World from './WorldObjects';
import PlayerCar from './PlayerCar';

interface GameProps {
  gameStatus: GameStatus;
  isInvincible: boolean;
  fuel: number;
  stage: number;
  onCrash: () => void;
  onConeHit: () => void;
  onScore: (delta: number, speed: number) => void;
  onNitro: (val: number) => void;
  onCollect: (type: PowerupType) => void;
}

// Stage Themes
const THEMES = [
  { name: 'Day', sky: '#87ceeb', fog: '#64748b', ground: '#354a21', light: '#ffffff' }, 
  { name: 'Sunset', sky: '#fdba74', fog: '#7c2d12', ground: '#451a03', light: '#ffedd5' }, 
  { name: 'Night', sky: '#0f172a', fog: '#020617', ground: '#1e1b4b', light: '#38bdf8' }, 
  { name: 'Neon', sky: '#c026d3', fog: '#4c1d95', ground: '#2e1065', light: '#e879f9' }, 
];

const FogController = ({ color }: { color: string }) => {
  return <fog attach="fog" args={[color, 20, 90]} />;
};

const Lighting = ({ color }: { color: string }) => (
  <>
    <ambientLight intensity={0.5} color={color} />
    <directionalLight 
      position={[50, 50, 20]} 
      intensity={1.2} 
      castShadow 
      shadow-mapSize-width={1024} 
      shadow-mapSize-height={1024}
    />
    <hemisphereLight intensity={0.4} groundColor="#1a202c" color={color} />
  </>
);

export default function Game({ gameStatus, isInvincible, fuel, stage, onCrash, onConeHit, onScore, onNitro, onCollect }: GameProps) {
  
  // Select theme based on stage (cycle through 4 themes)
  const themeIndex = (stage - 1) % THEMES.length;
  const currentTheme = THEMES[themeIndex];

  return (
    <Canvas shadows camera={{ position: [0, 4, 10], fov: 60 }}>
      <Suspense fallback={null}>
        <color attach="background" args={[currentTheme.fog]} />
        <FogController color={currentTheme.fog} />
        
        <Lighting color={currentTheme.light} />
        
        {/* Sky changes based on theme, simplified by just mounting new one or updating props */}
        {themeIndex === 2 || themeIndex === 3 ? (
             <Stars radius={100} depth={50} count={5000} factor={4} saturation={0} fade speed={1} />
        ) : (
            <Sky 
                sunPosition={[100, 20, 100]} 
                turbidity={themeIndex === 1 ? 5 : 0.5} 
                rayleigh={themeIndex === 1 ? 2 : 0.5} 
                mieCoefficient={0.005} 
                mieDirectionalG={0.8} 
            />
        )}

        {/* The World Manager handles the road, enemies, and environment scrolling */}
        <World 
          gameStatus={gameStatus} 
          fuel={fuel}
          stage={stage}
          groundColor={currentTheme.ground}
          onCrash={onCrash}
          onConeHit={onConeHit} 
          onScore={onScore}
          onCollect={onCollect}
        >
          {/* We pass the Player as a child or sibling depending on architecture, 
              but here the World needs to know player position for collision, 
              so we might keep them separate and share refs, or put Player inside World.
              
              Better: World manages "scrolling" environment. Player is static in Z.
          */}
           <PlayerCar gameStatus={gameStatus} onNitro={onNitro} isInvincible={isInvincible} />
        </World>

        {/* Floor Plane for infinite illusion far background */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.1, -50]}>
          <planeGeometry args={[500, 500]} />
          <meshStandardMaterial color={currentTheme.ground} />
        </mesh>
      </Suspense>
    </Canvas>
  );
}