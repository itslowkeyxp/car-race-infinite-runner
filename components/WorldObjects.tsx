import React, { useRef, useMemo, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Instance, Instances } from '@react-three/drei';
import { Color, Group, MathUtils, Vector3 } from 'three';
import { GameStatus, LANE_WIDTH, BASE_SPEED } from '../types';
import { playerPositionRef } from './PlayerCar';

interface WorldProps {
  gameStatus: GameStatus;
  children?: React.ReactNode;
  onCrash: () => void;
  onScore: (d: number, s: number) => void;
}

// --- Constants ---
const ROAD_SEGMENTS = 20;
const SEGMENT_LENGTH = 10;
const VIEW_DISTANCE = 200; // How far back to spawn
const LANES = [-1, 0, 1];

// Car Dimensions (Visual)
const CAR_WIDTH = 1.6;
const CAR_LENGTH = 3.8;

// Hitbox Thresholds
// We want slightly forgiving hitboxes for arcade feel.
// Contact happens at dx < 1.6 and dz < 3.8.
// We use slightly smaller numbers to require actual mesh intersection.
const HITBOX_DX = CAR_WIDTH * 0.9; // ~1.44 collision width threshold
const HITBOX_DZ = CAR_LENGTH * 0.95; // ~3.61 collision length threshold

// --- Types ---
interface MovingObject {
  id: number;
  z: number;
  lane: number;
  speedOffset: number; // For enemies, relative speed
  type: 'tree' | 'car' | 'sign';
  color?: string;
  active: boolean;
}

export default function World({ gameStatus, children, onCrash, onScore }: WorldProps) {
  // --- Refs & State ---
  const roadRef = useRef<Group>(null);
  const objectsRef = useRef<MovingObject[]>([]);
  const lastSpawnZ = useRef(-50);
  const frameCount = useRef(0);
  
  // To avoid constant state updates, we track score locally and flush periodically
  const scoreAccumulator = useRef(0);
  
  // Initial Population
  useMemo(() => {
    // Pre-populate some decor
    for (let i = 0; i < 40; i++) {
        const z = -i * 10 + 20;
        // Trees
        objectsRef.current.push({
            id: Math.random(),
            z: z,
            lane: Math.random() > 0.5 ? -3 : 3, // Far left or right
            speedOffset: 0,
            type: 'tree',
            active: true
        });
    }
  }, []);

  // --- Game Loop ---
  useFrame((state, delta) => {
    if (gameStatus !== GameStatus.PLAYING) return;

    // 1. Calculate World Speed based on base speed + nitro multiplier
    const currentSpeed = BASE_SPEED * playerPositionRef.speedMultiplier;
    const distanceTraveled = currentSpeed * delta;

    // 2. Move Everything Positive Z (towards camera)
    // We don't move the camera/player forward, we move the world backward.
    
    // Move Road Texture/Stripes (Simulated by offsetting a texture or moving a group)
    // Actually, simpler for low poly: Move the stripes.
    // Let's implement moving objects logic.

    // Update all objects
    objectsRef.current.forEach(obj => {
        if (!obj.active) return;
        
        // Relative speed. Trees move at full world speed. Cars move at (WorldSpeed - CarSpeed).
        // If speedOffset is positive, the object is moving AWAY from camera (faster than player? no usually slower).
        // Let's say speedOffset is the speed of the enemy car.
        // Player speed is `currentSpeed`. Enemy speed is `obj.speedOffset`.
        // Relative speed towards camera = `currentSpeed - obj.speedOffset`.
        
        let moveSpeed = currentSpeed;
        if (obj.type === 'car') {
            moveSpeed = currentSpeed - obj.speedOffset;
        }

        obj.z += moveSpeed * delta;

        // Collision Detection for Cars
        if (obj.type === 'car' && obj.active) {
            // Box collision approximation
            // Player is at x: playerPositionRef.x, z: 0.
            // Enemy is at x: obj.lane * LANE_WIDTH, z: obj.z.
            
            const dx = Math.abs(playerPositionRef.x - (obj.lane * LANE_WIDTH));
            const dz = Math.abs(0 - obj.z); // Player is at z=0

            // Check if within hitbox bounds
            if (dx < HITBOX_DX && dz < HITBOX_DZ) {
                // Crash!
                onCrash();
                obj.active = false; // Disable to prevent double hits
            }
        }

        // Despawn if behind camera
        if (obj.z > 20) {
            obj.active = false;
        }
    });

    // Cleanup inactive objects
    objectsRef.current = objectsRef.current.filter(o => o.active);

    // 3. Spawning Logic
    // We spawn based on distance logic or simple random chance per frame?
    // Distance logic is better.
    // "Virtual" position of the spawn horizon.
    // Since objects move +Z, we spawn at large -Z.
    
    // Move the "spawn cursor" based on speed
    // This isn't quite right for infinite runner fixed camera. 
    // We just check if the furthest object is too close, if so, add more?
    // Or just simple timer.
    
    if (Math.random() < 0.05 * (currentSpeed / BASE_SPEED)) { // Spawn rate increases with speed
        spawnObject(currentSpeed);
    }
    
    // Always keep trees populated
    const furthestTree = Math.min(...objectsRef.current.filter(o => o.type === 'tree').map(o => o.z), -50);
    if (furthestTree > -VIEW_DISTANCE + 20) {
         spawnDecor(furthestTree - 10);
    }

    // 4. Scoring
    scoreAccumulator.current += distanceTraveled * 0.1;
    if (scoreAccumulator.current > 10) {
        onScore(scoreAccumulator.current, Math.floor(currentSpeed * 2));
        scoreAccumulator.current = 0;
    }

    // 5. Move Road Markers
    if (roadRef.current) {
        // Simple modulo for infinite scrolling effect on static geometry
        // The texture offset approach is better, but let's just loop the group z position
        roadRef.current.position.z = (roadRef.current.position.z + distanceTraveled * delta) % SEGMENT_LENGTH;
    }
  });

  const spawnObject = (playerSpeed: number) => {
      // Don't spawn if too dense
      const cars = objectsRef.current.filter(o => o.type === 'car' && o.z < -20);
      if (cars.length > 5) return;

      const lane = LANES[Math.floor(Math.random() * LANES.length)];
      // Check if lane is occupied recently
      const tooClose = cars.some(c => c.lane === lane && Math.abs(c.z - (-VIEW_DISTANCE)) < 30);
      if (tooClose) return;

      const enemySpeed = BASE_SPEED * 0.5 + Math.random() * 20; // Slower than player usually

      const colors = ['#ef4444', '#f97316', '#84cc16', '#a855f7', '#ec4899'];

      objectsRef.current.push({
          id: Math.random(),
          z: -VIEW_DISTANCE - Math.random() * 50,
          lane: lane,
          speedOffset: enemySpeed,
          type: 'car',
          color: colors[Math.floor(Math.random() * colors.length)],
          active: true
      });
  };

  const spawnDecor = (zPos: number) => {
      objectsRef.current.push({
          id: Math.random(),
          z: zPos,
          lane: Math.random() > 0.5 ? -3.5 - Math.random() * 2 : 3.5 + Math.random() * 2, // Outside road
          speedOffset: 0,
          type: 'tree',
          active: true
      });
  };

  return (
    <group>
      {children}

      {/* The Road Surface */}
      <group position={[0, 0, -50]}>
         {/* Asphalt */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
          <planeGeometry args={[LANE_WIDTH * 3 + 2, 300]} />
          <meshStandardMaterial color="#334155" roughness={0.8} />
        </mesh>
        
        {/* Shoulders */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[-LANE_WIDTH * 1.5 - 1.5, 0.01, 0]}>
          <planeGeometry args={[3, 300]} />
          <meshStandardMaterial color="#4ade80" />
        </mesh>
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[LANE_WIDTH * 1.5 + 1.5, 0.01, 0]}>
          <planeGeometry args={[3, 300]} />
          <meshStandardMaterial color="#4ade80" />
        </mesh>

        {/* Moving Markers Group */}
        <group ref={roadRef}>
            {Array.from({length: 30}).map((_, i) => (
                <group key={i} position={[0, 0.02, -100 + i * 10]}>
                    {/* Left Lane Line */}
                    <mesh position={[-LANE_WIDTH/2, 0, 0]} rotation={[-Math.PI/2, 0, 0]}>
                        <planeGeometry args={[0.2, 4]} />
                        <meshBasicMaterial color="#ffffff" opacity={0.5} transparent />
                    </mesh>
                     {/* Right Lane Line */}
                    <mesh position={[LANE_WIDTH/2, 0, 0]} rotation={[-Math.PI/2, 0, 0]}>
                        <planeGeometry args={[0.2, 4]} />
                         <meshBasicMaterial color="#ffffff" opacity={0.5} transparent />
                    </mesh>
                </group>
            ))}
        </group>
      </group>

      {/* Render Dynamic Objects */}
      <RenderObjects objectsRef={objectsRef} />
    </group>
  );
}

// Separate component to handle the instanced or individual rendering of objects
// For max performance, Instances would be best, but for low poly simplicity and diverse colors, individual meshes are fine for < 100 objects.
const RenderObjects = ({ objectsRef }: { objectsRef: React.MutableRefObject<MovingObject[]> }) => {
    // Force re-render on every frame to update positions? 
    // No, standard React won't re-render fast enough for 60fps smooth movement if we rely on state.
    // We need to use refs for the mesh positions.
    // However, since we are adding/removing objects, we need React to know about the list structure.
    // Hybrid approach: The list is stateful (slow updates), the positions are refs (fast updates).
    // OR: We map over a fixed pool of objects. 
    
    // Simplest working solution for "Game Jam" style:
    // Use a component that uses `useFrame` to update its own children based on the Ref data.
    
    const groupRef = useRef<Group>(null);
    const [, forceUpdate] = useState(0);

    useFrame(() => {
        // This is a bit of a hack to force React to reconcile the list if it changes size
        // But doing it every frame is bad.
        // Better: Just manipulate the THREE.Group children directly.
        
        if (groupRef.current) {
            // Re-sync three.js scene graph with data
            // This is manual scene management.
            
            // Actually, let's just make a component for each object type that tracks a specific ID in the ref?
            // Too complex.
            
            // Let's rely on React to render the list, but use a ticker to force update?
            // No, the ticker works.
            
            // Correct R3F way for dynamic high-freq lists:
            // 1. Data in Ref.
            // 2. Component renders `instances` or meshes.
            // 3. `useFrame` updates the meshes imperatively.
            
            // For this specific request, let's keep it simple:
            // Render the meshes based on a state that updates LESS frequently (e.g. only when spawning),
            // but use useFrame inside the individual Enemy component to interpolate?
            // No, the World moves them.
            
            // Let's use the `forceUpdate` pattern inside useFrame strictly for position updates of known children.
            
            const children = groupRef.current.children;
            const objects = objectsRef.current;
            
            // We need to match objects to meshes.
            // Since we destroy/create, this is tricky without React.
            // Okay, we will trigger a React render only when count changes?
            // Let's just update the React state for the list of objects every frame? 
            // It might be performant enough for < 50 items on modern React 18.
            forceUpdate(n => n + 1);
        }
    });

    return (
        <group ref={groupRef}>
            {objectsRef.current.map((obj) => (
                <group key={obj.id} position={[obj.lane * (obj.type === 'tree' ? 1 : LANE_WIDTH), 0, obj.z]}>
                    {obj.type === 'car' ? (
                        <EnemyCar color={obj.color || 'red'} />
                    ) : (
                        <Tree />
                    )}
                </group>
            ))}
        </group>
    );
};

const EnemyCar = ({ color }: { color: string }) => (
    <group>
        <mesh position={[0, 0.5, 0]} castShadow>
            <boxGeometry args={[1.6, 0.8, 3.8]} />
            <meshStandardMaterial color={color} />
        </mesh>
        <mesh position={[0, 1.1, 0.2]} castShadow>
            <boxGeometry args={[1.4, 0.6, 1.8]} />
            <meshStandardMaterial color="#333" />
        </mesh>
         {/* Tail lights */}
         <mesh position={[-0.6, 0.6, 1.91]}>
          <planeGeometry args={[0.3, 0.15]} />
          <meshStandardMaterial color="#550000" />
        </mesh>
        <mesh position={[0.6, 0.6, 1.91]}>
          <planeGeometry args={[0.3, 0.15]} />
          <meshStandardMaterial color="#550000" />
        </mesh>
    </group>
);

const Tree = () => (
    <group>
        <mesh position={[0, 0.5, 0]} castShadow>
            <cylinderGeometry args={[0.2, 0.3, 1, 8]} />
            <meshStandardMaterial color="#78350f" />
        </mesh>
        <mesh position={[0, 2, 0]} castShadow>
            <coneGeometry args={[1.5, 3, 8]} />
            <meshStandardMaterial color="#15803d" flatShading />
        </mesh>
    </group>
);
