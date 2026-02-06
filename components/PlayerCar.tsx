import React, { useRef, useEffect, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Vector3, Group, MathUtils } from 'three';
import { GameStatus, Lane, LANE_WIDTH, NITRO_SPEED_MULTIPLIER } from '../types';

interface PlayerCarProps {
  gameStatus: GameStatus;
  isInvincible: boolean;
  onNitro: (val: number) => void;
}

// Global variable to share player X position with World/Enemies without complex context
// This is a performance optimization for the animation loop
export const playerPositionRef = { x: 0, z: 0, speedMultiplier: 1.0 };

const PlayerCar: React.FC<PlayerCarProps> = ({ gameStatus, isInvincible, onNitro }) => {
  const group = useRef<Group>(null);
  const { camera } = useThree();
  
  // State
  const [lane, setLane] = useState<Lane>(0);
  const [nitroFuel, setNitroFuel] = useState(100);
  const [isNitroActive, setIsNitroActive] = useState(false);
  
  // Refs for smooth physics
  const xPos = useRef(0);
  const targetX = useRef(0);
  const tilt = useRef(0);

  // Input Handling
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (gameStatus !== GameStatus.PLAYING) return;

      if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
        setLane((l) => Math.max(l - 1, -1) as Lane);
      }
      if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
        setLane((l) => Math.min(l + 1, 1) as Lane);
      }
      if (e.key === ' ') {
        setIsNitroActive(true);
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === ' ') {
        setIsNitroActive(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [gameStatus]);

  // Game Reset Logic
  useEffect(() => {
    if (gameStatus === GameStatus.PLAYING) {
        setLane(0);
        xPos.current = 0;
        targetX.current = 0;
        tilt.current = 0;
        setNitroFuel(100);
        setIsNitroActive(false);
        playerPositionRef.x = 0;
        playerPositionRef.speedMultiplier = 1;
        if (group.current) {
            group.current.position.set(0, 0, 0);
            group.current.rotation.set(0, 0, 0);
        }
    }
  }, [gameStatus]);

  // Game Loop
  useFrame((state, delta) => {
    if (!group.current) return;

    const active = gameStatus === GameStatus.PLAYING;
    // Effectively boosting if key pressed AND fuel exists
    const isBoosting = active && isNitroActive && nitroFuel > 0;

    // Nitro Logic
    let currentNitro = nitroFuel;
    let speedMult = 1.0;

    if (isBoosting) {
      currentNitro = Math.max(0, nitroFuel - delta * 20); // Burn rate
      speedMult = NITRO_SPEED_MULTIPLIER;
      setNitroFuel(currentNitro);
    } else if (active && !isNitroActive && nitroFuel < 100) {
      currentNitro = Math.min(100, nitroFuel + delta * 5); // Recharge rate
      setNitroFuel(currentNitro);
    }
    
    // Update global reference for other components
    playerPositionRef.speedMultiplier = active ? speedMult : 0;
    
    // Sync UI (Throttle this if needed, but for now simple)
    onNitro(currentNitro);

    // Lateral Movement (Lerp)
    targetX.current = lane * LANE_WIDTH;
    const lerpSpeed = active ? 8 * delta : 2 * delta;
    xPos.current = MathUtils.lerp(xPos.current, targetX.current, lerpSpeed);
    
    // Tilt effect when turning
    const xDiff = targetX.current - xPos.current;
    tilt.current = MathUtils.lerp(tilt.current, xDiff * -0.1, delta * 10);

    // Apply transforms
    group.current.position.x = xPos.current;
    group.current.position.y = 0; // Keep on ground
    group.current.rotation.z = tilt.current;
    group.current.rotation.y = tilt.current * 0.2; // Slight turn into the curve

    // Update Global Ref
    playerPositionRef.x = xPos.current;

    // Camera Follow Logic (Subtle)
    // Camera is naturally at [0, 4, 10]
    if (active) {
        // Dynamic FOV for speed sensation (only if actually boosting)
        const targetFov = isBoosting ? 75 : 60;
        camera.fov = MathUtils.lerp(camera.fov, targetFov, delta * 2);
        camera.updateProjectionMatrix();

        // Slight camera sway with car
        const camX = xPos.current * 0.3;
        camera.position.x = MathUtils.lerp(camera.position.x, camX, delta * 2);
        
        // Camera shake on high speed (only if actually boosting)
        if (isBoosting) {
            camera.position.y = 4 + (Math.random() - 0.5) * 0.1;
        } else {
            camera.position.y = MathUtils.lerp(camera.position.y, 4, delta * 5);
        }
    }
  });

  return (
    <group ref={group} position={[0, 0, 0]}>
      {/* Shield Effect */}
      {isInvincible && (
        <mesh position={[0, 0.8, 1.5]}>
           <sphereGeometry args={[1.8, 32, 32]} />
           <meshStandardMaterial color="#60a5fa" transparent opacity={0.3} emissive="#3b82f6" emissiveIntensity={0.5} />
        </mesh>
      )}

      {/* Car Body - Low Poly Style */}
      <group>
        {/* Chassis */}
        <mesh position={[0, 0.5, 0]} castShadow receiveShadow>
          <boxGeometry args={[1.6, 0.8, 3.8]} />
          <meshStandardMaterial color="#0ea5e9" roughness={0.4} metalness={0.6} />
        </mesh>
        
        {/* Cabin */}
        <mesh position={[0, 1.1, -0.4]} castShadow receiveShadow>
          <boxGeometry args={[1.3, 0.7, 2.0]} />
          <meshStandardMaterial color="#1e293b" roughness={0.2} metalness={0.8} />
        </mesh>

        {/* Spoiler */}
        <mesh position={[0, 1.0, 1.7]} castShadow>
          <boxGeometry args={[1.8, 0.1, 0.5]} />
          <meshStandardMaterial color="#0284c7" />
        </mesh>
         <mesh position={[-0.7, 0.8, 1.7]} castShadow>
          <boxGeometry args={[0.1, 0.4, 0.4]} />
          <meshStandardMaterial color="#0284c7" />
        </mesh>
         <mesh position={[0.7, 0.8, 1.7]} castShadow>
          <boxGeometry args={[0.1, 0.4, 0.4]} />
          <meshStandardMaterial color="#0284c7" />
        </mesh>

        {/* Lights - Tail */}
        <mesh position={[-0.5, 0.6, 1.91]}>
          <planeGeometry args={[0.4, 0.2]} />
          <meshStandardMaterial color="#ef4444" emissive="#ef4444" emissiveIntensity={2} />
        </mesh>
        <mesh position={[0.5, 0.6, 1.91]}>
          <planeGeometry args={[0.4, 0.2]} />
          <meshStandardMaterial color="#ef4444" emissive="#ef4444" emissiveIntensity={2} />
        </mesh>
        
        {/* Wheels */}
        <Wheel x={-0.85} z={1.2} />
        <Wheel x={0.85} z={1.2} />
        <Wheel x={-0.85} z={-1.2} />
        <Wheel x={0.85} z={-1.2} />

        {/* Nitro Flame - Only visible if boosting key is held AND fuel > 0 */}
        {isNitroActive && nitroFuel > 0 && (
            <>
            <mesh position={[-0.4, 0.4, 2.2]} rotation={[Math.PI / 2, 0, 0]}>
                <coneGeometry args={[0.15, 1.2, 16]} />
                <meshStandardMaterial color="#00ffff" emissive="#00ffff" emissiveIntensity={3} transparent opacity={0.9} />
            </mesh>
             <mesh position={[0.4, 0.4, 2.2]} rotation={[Math.PI / 2, 0, 0]}>
                <coneGeometry args={[0.15, 1.2, 16]} />
                <meshStandardMaterial color="#00ffff" emissive="#00ffff" emissiveIntensity={3} transparent opacity={0.9} />
            </mesh>
            </>
        )}
      </group>
    </group>
  );
};

const Wheel = ({ x, z }: { x: number, z: number }) => (
  <mesh position={[x, 0.35, z]} rotation={[Math.PI / 2, 0, Math.PI / 2]} castShadow>
    <cylinderGeometry args={[0.35, 0.35, 0.3, 16]} />
    <meshStandardMaterial color="#111" />
  </mesh>
);

export default PlayerCar;