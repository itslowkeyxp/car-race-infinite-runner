import React, { useRef, useMemo, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Instance, Instances } from '@react-three/drei';
import { Color, Group, MathUtils, Vector3 } from 'three';
import { GameStatus, LANE_WIDTH, BASE_SPEED, PowerupType } from '../types';
import { playerPositionRef } from './PlayerCar';

interface WorldProps {
  gameStatus: GameStatus;
  fuel: number;
  stage: number;
  groundColor: string;
  children?: React.ReactNode;
  onCrash: () => void;
  onScore: (d: number, s: number) => void;
  onCollect: (type: PowerupType) => void;
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
const HITBOX_DX = CAR_WIDTH * 0.9;
const HITBOX_DZ = CAR_LENGTH * 0.95; 

// Powerup Hitbox
const POWERUP_DX = 1.5;
const POWERUP_DZ = 1.5;

// --- Types ---
interface MovingObject {
  id: number;
  z: number;
  lane: number;
  speedOffset: number; // For enemies, relative speed
  type: 'tree' | 'car' | 'sign' | 'powerup';
  powerupType?: PowerupType;
  color?: string;
  active: boolean;
}

export default function World({ gameStatus, fuel, stage, groundColor, children, onCrash, onScore, onCollect }: WorldProps) {
  // --- Refs & State ---
  const roadRef = useRef<Group>(null);
  const objectsRef = useRef<MovingObject[]>([]);
  const scoreAccumulator = useRef(0);
  
  // Keep a ref of fuel/stage for the animation loop
  const fuelRef = useRef(fuel);
  fuelRef.current = fuel;
  const stageRef = useRef(stage);
  stageRef.current = stage;

  // Initial Population
  useMemo(() => {
    // Pre-populate some decor
    for (let i = 0; i < 40; i++) {
        const z = -i * 10 + 20;
        objectsRef.current.push({
            id: Math.random(),
            z: z,
            lane: Math.random() > 0.5 ? -(9 + Math.random() * 6) : (9 + Math.random() * 6),
            speedOffset: 0,
            type: 'tree',
            active: true
        });
    }
  }, []);

  // --- Game Loop ---
  useFrame((state, delta) => {
    if (gameStatus !== GameStatus.PLAYING) return;

    // 1. Calculate World Speed
    // Speed slightly increases with stage (5% per stage cap at 50%)
    const stageSpeedMultiplier = 1 + Math.min(0.5, (stageRef.current - 1) * 0.05);
    const currentSpeed = BASE_SPEED * playerPositionRef.speedMultiplier * stageSpeedMultiplier;
    const distanceTraveled = currentSpeed * delta;

    // 2. Move Everything
    objectsRef.current.forEach(obj => {
        if (!obj.active) return;
        
        let moveSpeed = currentSpeed;
        if (obj.type === 'car') {
            moveSpeed = currentSpeed - obj.speedOffset;
        }

        obj.z += moveSpeed * delta;

        // Collision Detection
        if (obj.active) {
            const dx = Math.abs(playerPositionRef.x - (obj.lane * LANE_WIDTH));
            const dz = Math.abs(0 - obj.z); // Player is at z=0

            if (obj.type === 'car') {
                 if (dx < HITBOX_DX && dz < HITBOX_DZ) {
                    onCrash();
                    obj.active = false;
                }
            } else if (obj.type === 'powerup' && obj.powerupType) {
                 if (dx < POWERUP_DX && dz < POWERUP_DZ) {
                     onCollect(obj.powerupType);
                     obj.active = false;
                 }
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
    // Dynamic spawn rate based on speed and STAGE
    // Base probability 0.05. Increases with speed and stage.
    const spawnProb = 0.05 * (currentSpeed / BASE_SPEED) * (1 + (stageRef.current - 1) * 0.1);
    
    if (Math.random() < spawnProb) { 
        spawnObject();
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
        roadRef.current.position.z = (roadRef.current.position.z + distanceTraveled * delta) % SEGMENT_LENGTH;
    }
  });

  const spawnObject = () => {
      // Limit density based on stage (allow more objects at higher stages)
      const maxObjects = 5 + Math.floor(stageRef.current / 2);
      const moving = objectsRef.current.filter(o => (o.type === 'car' || o.type === 'powerup') && o.z < -20);
      if (moving.length > maxObjects) return;

      const lane = LANES[Math.floor(Math.random() * LANES.length)];
      // Check if lane is occupied recently
      // Minimum gap decreases as stage increases (harder!)
      const minGap = Math.max(15, 30 - stageRef.current * 2);
      const tooClose = moving.some(c => c.lane === lane && Math.abs(c.z - (-VIEW_DISTANCE)) < minGap);
      if (tooClose) return;

      // Decide Type: Car or Powerup?
      let powerupChance = 0.2;
      const currentFuel = fuelRef.current;
      
      if (currentFuel < 30) {
          powerupChance = 0.45;
      }

      if (Math.random() < powerupChance) {
          // Determine Powerup Type
          const rand = Math.random();
          let pType = PowerupType.SCORE;
          
          if (currentFuel < 30) {
               if (rand < 0.6) pType = PowerupType.FUEL;
               else if (rand < 0.8) pType = PowerupType.SHIELD;
               else pType = PowerupType.NITRO;
          } else {
               if (rand < 0.25) pType = PowerupType.FUEL;
               else if (rand < 0.5) pType = PowerupType.NITRO;
               else if (rand < 0.75) pType = PowerupType.SHIELD;
          }

          objectsRef.current.push({
              id: Math.random(),
              z: -VIEW_DISTANCE,
              lane: lane,
              speedOffset: 0,
              type: 'powerup',
              powerupType: pType,
              active: true
          });

      } else {
          // Spawn Enemy Car
          // Enemy relative speed variance increases with stage
          const baseEnemySpeed = BASE_SPEED * 0.5;
          const variance = 20 + (stageRef.current * 5);
          const enemySpeed = baseEnemySpeed + Math.random() * variance; 
          
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
      }
  };

  const spawnDecor = (zPos: number) => {
      objectsRef.current.push({
          id: Math.random(),
          z: zPos,
          lane: Math.random() > 0.5 ? -(9 + Math.random() * 6) : (9 + Math.random() * 6), // Outside road
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
        
        {/* Shoulders - dynamic color */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[-LANE_WIDTH * 1.5 - 1.5, 0.01, 0]}>
          <planeGeometry args={[3, 300]} />
          <meshStandardMaterial color={groundColor === '#2e1065' ? '#a21caf' : '#4ade80'} />
        </mesh>
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[LANE_WIDTH * 1.5 + 1.5, 0.01, 0]}>
          <planeGeometry args={[3, 300]} />
          <meshStandardMaterial color={groundColor === '#2e1065' ? '#a21caf' : '#4ade80'} />
        </mesh>

        {/* Moving Markers Group */}
        <group ref={roadRef}>
            {Array.from({length: 30}).map((_, i) => (
                <group key={i} position={[0, 0.02, -100 + i * 10]}>
                    <mesh position={[-LANE_WIDTH/2, 0, 0]} rotation={[-Math.PI/2, 0, 0]}>
                        <planeGeometry args={[0.2, 4]} />
                        <meshBasicMaterial color="#ffffff" opacity={0.5} transparent />
                    </mesh>
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

const RenderObjects = ({ objectsRef }: { objectsRef: React.MutableRefObject<MovingObject[]> }) => {
    const groupRef = useRef<Group>(null);
    const [, forceUpdate] = useState(0);

    useFrame(() => {
        if (groupRef.current) {
            forceUpdate(n => n + 1);
        }
    });

    return (
        <group ref={groupRef}>
            {objectsRef.current.map((obj) => (
                <group key={obj.id} position={[obj.lane * (obj.type === 'tree' ? 1 : LANE_WIDTH), 0, obj.z]}>
                    {obj.type === 'car' && <EnemyCar color={obj.color || 'red'} />}
                    {obj.type === 'tree' && <Tree />}
                    {obj.type === 'powerup' && <PowerupMesh type={obj.powerupType!} />}
                </group>
            ))}
        </group>
    );
};

// --- Meshes ---

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

const PowerupMesh = ({ type }: { type: PowerupType }) => {
    const meshRef = useRef<Group>(null);
    useFrame((state, delta) => {
        if(meshRef.current) {
            meshRef.current.rotation.y += delta * 2;
            meshRef.current.position.y = 1 + Math.sin(state.clock.elapsedTime * 3) * 0.2;
        }
    });

    return (
        <group ref={meshRef}>
            {type === PowerupType.FUEL && (
                // Fuel Canister - Made larger and more distinct
                <group scale={[1.5, 1.5, 1.5]}>
                    <mesh castShadow position={[0, 0.2, 0]}>
                        <boxGeometry args={[0.5, 0.7, 0.3]} />
                        <meshStandardMaterial color="#ef4444" metalness={0.2} roughness={0.5} />
                    </mesh>
                    <mesh position={[0, 0.65, 0]}>
                        <cylinderGeometry args={[0.1, 0.1, 0.2]} />
                        <meshStandardMaterial color="#222" />
                    </mesh>
                     {/* Label */}
                     <mesh position={[0, 0.2, 0.16]}>
                        <planeGeometry args={[0.3, 0.3]} />
                        <meshStandardMaterial color="#fbbf24" />
                    </mesh>
                </group>
            )}
            {type === PowerupType.NITRO && (
                // Nitro Bolt
                <mesh castShadow>
                    <cylinderGeometry args={[0.2, 0.2, 1.2, 6]} />
                    <meshStandardMaterial color="#06b6d4" emissive="#06b6d4" emissiveIntensity={0.5} />
                </mesh>
            )}
            {type === PowerupType.SHIELD && (
                // Shield Sphere
                <group>
                     <mesh>
                        <torusGeometry args={[0.5, 0.1, 16, 32]} />
                        <meshStandardMaterial color="#3b82f6" emissive="#3b82f6" />
                    </mesh>
                    <mesh>
                        <sphereGeometry args={[0.3]} />
                        <meshStandardMaterial color="#60a5fa" />
                    </mesh>
                </group>
            )}
            {type === PowerupType.SCORE && (
                // Gold Coin/Star
                <mesh rotation={[Math.PI/2, 0, 0]}>
                    <cylinderGeometry args={[0.5, 0.5, 0.1, 16]} />
                    <meshStandardMaterial color="#eab308" metalness={1} roughness={0.1} />
                </mesh>
            )}
        </group>
    )
}
