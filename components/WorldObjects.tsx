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
  onConeHit: () => void;
  onScore: (d: number, s: number) => void;
  onCollect: (type: PowerupType) => void;
}

// --- Constants ---
const ROAD_SEGMENTS = 20;
const SEGMENT_LENGTH = 10;
const VIEW_DISTANCE = 200; // How far back to spawn
const LANES = [-1, 0, 1];
const SHOULDER_LANES = [-2, 2]; // Lanes for cones on shoulders

// Car Dimensions (Visual)
const CAR_WIDTH = 1.6;
const CAR_LENGTH = 3.8;

// Hitbox Thresholds
const HITBOX_DX = CAR_WIDTH * 0.9;
const HITBOX_DZ = CAR_LENGTH * 0.95; 

// Powerup Hitbox
const POWERUP_DX = 1.5;
const POWERUP_DZ = 1.5;

// Car Models
type CarModel = 'sedan' | 'truck' | 'sport';

// --- Types ---
interface MovingObject {
  id: number;
  z: number;
  lane: number;
  speedOffset: number; // For enemies, relative speed. 0 = static on road.
  type: 'tree' | 'car' | 'barrier' | 'powerup' | 'cone';
  model?: CarModel; // Model type for cars
  powerupType?: PowerupType;
  color?: string;
  active: boolean;
  // Hit logic for cones
  hit?: boolean;
  velocity?: { x: number, y: number, z: number };
  y?: number; // Y position for flying objects
  x?: number; // X position override
}

export default function World({ gameStatus, fuel, stage, groundColor, children, onCrash, onConeHit, onScore, onCollect }: WorldProps) {
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
    // Speed increases indefinitely with stage, capped at 3x base speed.
    const stageSpeedMultiplier = 1 + Math.min(2.0, (stageRef.current - 1) * 0.08);
    const currentSpeed = BASE_SPEED * playerPositionRef.speedMultiplier * stageSpeedMultiplier;
    const distanceTraveled = currentSpeed * delta;

    // 2. Move Everything
    objectsRef.current.forEach(obj => {
        if (!obj.active) return;
        
        // Physics for hit objects (flying cones)
        if (obj.hit && obj.velocity) {
             obj.y = (obj.y || 0) + obj.velocity.y * delta;
             obj.velocity.y -= 25 * delta; // Gravity
             
             // Drift X
             obj.x = (obj.x ?? (obj.lane * LANE_WIDTH)) + obj.velocity.x * delta;
             
             // Move Z. Relative to camera (0), it should move away rapidly or with road?
             // It moves with road speed + velocity.z
             obj.z += (currentSpeed + obj.velocity.z) * delta;

             // Remove if falls below road
             if ((obj.y || 0) < -5) obj.active = false;
        } else {
            // Normal movement
            let moveSpeed = currentSpeed;
            if (obj.type === 'car') {
                moveSpeed = currentSpeed - obj.speedOffset;
            }
            obj.z += moveSpeed * delta;
        }

        // Collision Detection (Only if not already hit)
        if (obj.active && !obj.hit) {
            // Current X position
            const objX = obj.x ?? (obj.lane * LANE_WIDTH);
            const dx = Math.abs(playerPositionRef.x - objX);
            const dz = Math.abs(0 - obj.z); // Player is at z=0

            if (obj.type === 'car' || obj.type === 'barrier') {
                 if (dx < HITBOX_DX && dz < HITBOX_DZ) {
                    onCrash();
                    obj.active = false;
                }
            } else if (obj.type === 'cone') {
                 // Use HITBOX_DZ to prevent tunneling at high speeds
                 if (dx < 1.0 && dz < HITBOX_DZ) {
                     onConeHit();
                     obj.hit = true;
                     // Give it some velocity for animation
                     obj.velocity = { 
                         x: (Math.random() - 0.5) * 10, 
                         y: 8 + Math.random() * 4, 
                         z: 10 + Math.random() * 5 
                     };
                     // Initialize X/Y
                     obj.x = obj.lane * LANE_WIDTH;
                     obj.y = 0;
                 }
            } else if (obj.type === 'powerup' && obj.powerupType) {
                 if (dx < POWERUP_DX && dz < POWERUP_DZ) {
                     onCollect(obj.powerupType);
                     obj.active = false;
                 }
            }
        }

        // Despawn if behind camera
        if (obj.z > 20 && !obj.hit) {
            obj.active = false;
        }
    });

    // Cleanup inactive objects
    objectsRef.current = objectsRef.current.filter(o => o.active);

    // 3. Spawning Logic
    // Dynamic spawn rate based on speed and STAGE
    // Higher stage = higher spawn prob
    const spawnProb = 0.05 * (currentSpeed / BASE_SPEED) * (1 + (stageRef.current - 1) * 0.15);
    
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
      // Density increases with stage
      const maxObjects = 6 + stageRef.current;
      const moving = objectsRef.current.filter(o => (o.type === 'car' || o.type === 'powerup' || o.type === 'barrier' || o.type === 'cone') && o.z < -20);
      if (moving.length > maxObjects) return;

      const lane = LANES[Math.floor(Math.random() * LANES.length)];
      // Min gap decreases with stage to make it tighter
      const minGap = Math.max(12, 30 - stageRef.current * 1.5);
      const tooClose = moving.some(c => c.lane === lane && Math.abs(c.z - (-VIEW_DISTANCE)) < minGap);
      if (tooClose) return;

      // Decide Type
      const currentFuel = fuelRef.current;
      // Triggers earlier (at 50% fuel) and spawns more frequently (30% base chance)
      let powerupChance = currentFuel < 50 ? 0.5 : 0.3; 
      
      if (Math.random() < powerupChance) {
          // --- Spawn Powerup ---
          const rand = Math.random();
          let pType = PowerupType.SCORE;
          
          if (currentFuel < 50) {
               // High chance of fuel when low
               if (rand < 0.8) pType = PowerupType.FUEL;
               else if (rand < 0.9) pType = PowerupType.SHIELD;
               else pType = PowerupType.NITRO;
          } else {
               // Normal distribution, but with more fuel (45%)
               if (rand < 0.45) pType = PowerupType.FUEL;
               else if (rand < 0.65) pType = PowerupType.NITRO;
               else if (rand < 0.85) pType = PowerupType.SHIELD;
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
          // --- Spawn Obstacle (Car, Barrier, or Cone) ---
          
          const roll = Math.random();

          // 25% Chance for Traffic Cone
          if (roll < 0.25) {
              const useShoulder = Math.random() < 0.4; // 40% Shoulder, 60% Lane (Interactive!)
              const coneLane = useShoulder 
                ? SHOULDER_LANES[Math.floor(Math.random() * SHOULDER_LANES.length)] 
                : lane;

              objectsRef.current.push({
                  id: Math.random(),
                  z: -VIEW_DISTANCE,
                  lane: coneLane,
                  speedOffset: 0, // Static
                  type: 'cone',
                  active: true
              });
          } else {
              // 75% Chance for Dangerous Obstacle
              
              // Barriers appear from stage 4 onwards
              const barrierChance = stageRef.current >= 4 ? 0.25 : 0;
              
              if (Math.random() < barrierChance) {
                  // Spawn Static Barrier
                  objectsRef.current.push({
                      id: Math.random(),
                      z: -VIEW_DISTANCE,
                      lane: lane,
                      speedOffset: 0, 
                      type: 'barrier',
                      active: true
                  });
              } else {
                  // Spawn Enemy Car
                  const baseEnemySpeed = BASE_SPEED * 0.5;
                  const variance = 15 + (stageRef.current * 8); // More chaotic speeds
                  const enemySpeed = baseEnemySpeed + Math.random() * variance; 
                  
                  const colors = ['#ef4444', '#f97316', '#84cc16', '#a855f7', '#ec4899', '#3b82f6', '#eab308'];
                  const models: CarModel[] = ['sedan', 'truck', 'sport'];

                  objectsRef.current.push({
                      id: Math.random(),
                      z: -VIEW_DISTANCE - Math.random() * 50,
                      lane: lane,
                      speedOffset: enemySpeed,
                      type: 'car',
                      model: models[Math.floor(Math.random() * models.length)] as CarModel,
                      color: colors[Math.floor(Math.random() * colors.length)],
                      active: true
                  });
              }
          }
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
                <group key={obj.id} position={[obj.x ?? obj.lane * (obj.type === 'tree' ? 1 : LANE_WIDTH), obj.y ?? 0, obj.z]}>
                    {obj.type === 'car' && <EnemyCar color={obj.color || 'red'} model={obj.model || 'sedan'} />}
                    {obj.type === 'barrier' && <Barrier />}
                    {obj.type === 'cone' && <Cone hit={obj.hit} />}
                    {obj.type === 'tree' && <Tree />}
                    {obj.type === 'powerup' && <PowerupMesh type={obj.powerupType!} />}
                </group>
            ))}
        </group>
    );
};

// --- Meshes ---

const Cone = ({ hit }: { hit?: boolean }) => {
    // If hit, we could rotate it wildly in local space, but parent handles trajectory
    const ref = useRef<Group>(null);
    useFrame((state, delta) => {
        if (hit && ref.current) {
            ref.current.rotation.x += delta * 10;
            ref.current.rotation.z += delta * 5;
        }
    });

    return (
        <group ref={ref}>
            <mesh position={[0, 0.3, 0]} castShadow>
                <cylinderGeometry args={[0.05, 0.25, 0.6, 16]} />
                <meshStandardMaterial color="#f97316" />
            </mesh>
            <mesh position={[0, 0.05, 0]}>
                 <boxGeometry args={[0.5, 0.1, 0.5]} />
                 <meshStandardMaterial color="#f97316" />
            </mesh>
            <mesh position={[0, 0.2, 0]}>
                 <cylinderGeometry args={[0.1, 0.15, 0.15, 16]} />
                 <meshStandardMaterial color="white" />
            </mesh>
             <mesh position={[0, 0.45, 0]}>
                 <cylinderGeometry args={[0.06, 0.08, 0.1, 16]} />
                 <meshStandardMaterial color="white" />
            </mesh>
        </group>
    );
}

const Barrier = () => (
    <group>
        <mesh position={[0, 0.5, 0]} castShadow>
            <boxGeometry args={[2.0, 1.0, 1.0]} />
            <meshStandardMaterial color="#fbbf24" roughness={0.5} />
        </mesh>
        {/* Stripes */}
        <mesh position={[-0.6, 0.51, 0]}>
            <boxGeometry args={[0.2, 1.01, 1.05]} />
            <meshStandardMaterial color="#000" />
        </mesh>
        <mesh position={[0.6, 0.51, 0]}>
            <boxGeometry args={[0.2, 1.01, 1.05]} />
            <meshStandardMaterial color="#000" />
        </mesh>
        <mesh position={[0, 0.51, 0]}>
            <boxGeometry args={[0.2, 1.01, 1.05]} />
            <meshStandardMaterial color="#000" />
        </mesh>
    </group>
);

const EnemyCar = ({ color, model }: { color: string, model: CarModel }) => {
    if (model === 'truck') {
        return (
            <group>
                {/* Truck Body */}
                <mesh position={[0, 0.6, 0]} castShadow>
                    <boxGeometry args={[1.8, 1.0, 4.2]} />
                    <meshStandardMaterial color={color} />
                </mesh>
                {/* Truck Cabin */}
                <mesh position={[0, 1.4, -0.8]} castShadow>
                    <boxGeometry args={[1.6, 0.8, 1.8]} />
                    <meshStandardMaterial color="#333" />
                </mesh>
                {/* Truck Bed Area */}
                <mesh position={[0, 1.15, 1.2]} castShadow>
                     <boxGeometry args={[1.4, 0.1, 1.8]} />
                     <meshStandardMaterial color="#111" />
                </mesh>
                {/* Taillights */}
                <mesh position={[-0.7, 0.8, 2.11]}>
                    <planeGeometry args={[0.3, 0.2]} />
                    <meshStandardMaterial color="#550000" />
                </mesh>
                <mesh position={[0.7, 0.8, 2.11]}>
                    <planeGeometry args={[0.3, 0.2]} />
                    <meshStandardMaterial color="#550000" />
                </mesh>
            </group>
        );
    }
    
    if (model === 'sport') {
        return (
            <group>
                {/* Low Body */}
                <mesh position={[0, 0.4, 0]} castShadow>
                    <boxGeometry args={[1.7, 0.6, 3.8]} />
                    <meshStandardMaterial color={color} />
                </mesh>
                {/* Streamlined Cabin */}
                <mesh position={[0, 0.8, 0.1]} castShadow>
                    <boxGeometry args={[1.4, 0.5, 2.0]} />
                    <meshStandardMaterial color="#222" />
                </mesh>
                 {/* Spoiler */}
                <mesh position={[0, 0.8, 1.6]} castShadow>
                    <boxGeometry args={[1.6, 0.1, 0.4]} />
                    <meshStandardMaterial color={color} />
                </mesh>
                 <mesh position={[-0.6, 0.6, 1.6]}>
                    <boxGeometry args={[0.1, 0.3, 0.2]} />
                    <meshStandardMaterial color={color} />
                </mesh>
                 <mesh position={[0.6, 0.6, 1.6]}>
                    <boxGeometry args={[0.1, 0.3, 0.2]} />
                    <meshStandardMaterial color={color} />
                </mesh>
                {/* Lights */}
                <mesh position={[-0.6, 0.5, 1.91]}>
                    <planeGeometry args={[0.4, 0.1]} />
                    <meshStandardMaterial color="#ff0000" emissive="#ff0000" emissiveIntensity={0.5} />
                </mesh>
                <mesh position={[0.6, 0.5, 1.91]}>
                    <planeGeometry args={[0.4, 0.1]} />
                    <meshStandardMaterial color="#ff0000" emissive="#ff0000" emissiveIntensity={0.5} />
                </mesh>
            </group>
        );
    }

    // Default Sedan
    return (
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
};

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