export enum GameStatus {
  IDLE = 'IDLE',
  PLAYING = 'PLAYING',
  GAME_OVER = 'GAME_OVER'
}

export type Lane = -1 | 0 | 1; // Left, Center, Right

export interface GameState {
  status: GameStatus;
  score: number;
  speed: number;
  highScore: number;
  stage: number;
  lives: number;
  nitro: number;
  distance: number;
}

export interface GameActions {
  startGame: () => void;
  endGame: () => void;
  addScore: (amount: number) => void;
  setSpeed: (speed: number) => void;
  crash: () => void;
  setNitro: (amount: number) => void;
  reset: () => void;
}

export const LANE_WIDTH = 3.5;
export const MAX_LIVES = 3;
export const BASE_SPEED = 40;
export const MAX_SPEED = 120; // Visual speed units
export const NITRO_SPEED_MULTIPLIER = 1.8;
