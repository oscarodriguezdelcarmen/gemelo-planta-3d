export enum AgvStatus {
  Idle = 'idle',
  Moving = 'moving',
  Charging = 'charging',
  Delivering = 'delivering',
  Blocked = 'blocked',
}

export type AgvSpeed = 1 | 2;

export interface Agv {
  id: string;
  gx: number;
  gz: number;
  tx: number;
  tz: number;
  battery: number;
  load: number;
  speed: AgvSpeed;
  status: AgvStatus;
  heading: number;
  path: { x: number; z: number }[];
}

export interface Obstacle {
  x: number;
  z: number;
}

export interface Incident {
  id: string;
  text: string;
  x?: number;
  z?: number;
}

export interface LoadingDock {
  x: number;
  z: number;
  id: string;
}

export interface ChargingStation {
  x: number;
  z: number;
  id: string;
}

export interface SimulationState {
  ticks: number;
  agvs: Agv[];
  obstacles: Obstacle[];
  lockedAisles: string[];
  incidents: Incident[];
  throughput: number;
  congestion: string[];
  status: 'running' | 'paused';
  speed: AgvSpeed;
  delivered: number;
}

export type SimCmd =
  | { type: 'addAgv'; gx?: number; gz?: number }
  | { type: 'removeAgv'; id: string }
  | { type: 'lockAisle'; gx: number; gz: number }
  | { type: 'unlockAisle'; gx: number; gz: number }
  | { type: 'unlockAllAisles' }
  | { type: 'setSpeed'; id: string; speed: AgvSpeed }
  | { type: 'sendToCharging'; id: string }
  | { type: 'raiseIncident'; text: string; x?: number; z?: number }
  | { type: 'pause' }
  | { type: 'resume' }
  | { type: 'reset' }
  | { type: 'toCharging' }
  | { type: 'sendAllToCharging' }
  | { type: 'prioritizeUrgent' }
  | { type: 'ping'; text?: string };
