import React, { Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import { Sky, Stars } from '@react-three/drei';
import { GameStatus, PowerupType } from '../types';
import World from './WorldObjects';
import PlayerCar from './PlayerCar';

interface GameProps {
  gameStatus: GameStatus;
  isInvincible: boolean;
  fuel: number;
  onCrash: () => void;
  onScore: (delta: number, speed: number) => void;
  onNitro: (val: number) => void;
  onCollect: (type: PowerupType) => void;
}

const FogController = () => {
  return <fog attach="fog" args={['#64748b', 20, 90]} />;
};

const Lighting = () => (
  <>
    <ambientLight intensity={0.5} color="#ffffff" />
    <directionalLight 
      position={[50, 50, 20]} 
      intensity={1.2} 
      castShadow 
      shadow-mapSize-width={1024} 
      shadow-mapSize-height={1024}
    />
    <hemisphereLight intensity={0.4} groundColor="#1a202c" color="#87ceeb" />
  </>
);

export default function Game({ gameStatus, isInvincible, fuel, onCrash, onScore, onNitro, onCollect }: GameProps) {
  return (
    <Canvas shadows camera={{ position: [0, 4, 10], fov: 60 }}>
      <Suspense fallback={null}>
        <color attach="background" args={['#64748b']} />
        <FogController />
        
        <Lighting />
        
        <Sky 
            sunPosition={[100, 20, 100]} 
            turbidity={0.5} 
            rayleigh={0.5} 
            mieCoefficient={0.005} 
            mieDirectionalG={0.8} 
        />
        <Stars radius={100} depth={50} count={5000} factor={4} saturation={0} fade speed={1} />

        {/* The World Manager handles the road, enemies, and environment scrolling */}
        <World 
          gameStatus={gameStatus} 
          fuel={fuel}
          onCrash={onCrash} 
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
          <meshStandardMaterial color="#354a21" />
        </mesh>
      </Suspense>
    </Canvas>
  );
}