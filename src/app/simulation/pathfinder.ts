import { Agv, Obstacle, SimulationState } from './model';

export const COLS = 12;
export const ROWS = 8;
export const CELL = 1.2;
export const AGV_COUNT = 5;
export const CHARGING_STATIONS: { x: number; z: number }[] = [
  { x: 5, z: 3 },
  { x: 7, z: 4 },
];
export const DOCKS: { x: number; z: number }[] = [
  { x: 2, z: 0 }, { x: 10, z: 0 }, { x: 2, z: 7 }, { x: 10, z: 7 },
];

export function gridToWorld(gx: number, gz: number) {
  return { x: gx * CELL, z: gz * CELL };
}

export function worldToGrid(x: number, z: number) {
  return { g: Math.round(x / CELL), h: Math.round(z / CELL) };
}

export function clamp(v: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, v));
}

export function aStar(
  startG: number,
  startH: number,
  endG: number,
  endH: number,
  obstacles: Obstacle[],
  lockedAisles: string[]
): { x: number; z: number }[] | null {
  if (
    startG < 0 || startG >= COLS || startH < 0 || startH >= ROWS ||
    endG < 0 || endG >= COLS || endH < 0 || endH >= ROWS
  ) return null;

  const blocked = (g: number, h: number) => {
    if (g < 0 || g >= COLS || h < 0 || h >= ROWS) return true;
    if (obstacles.some((o) => o.x === g && o.z === h)) return true;
    if (lockedAisles.includes(`${g},${h}`)) return true;
    return false;
  };

  if (blocked(startG, startH) || blocked(endG, endH)) return null;

  type Item = { g: number; h: number; f: number; parent: Item | null };
  const open: Item[] = [{ g: startG, h: startH, f: 0, parent: null }];
  const closed = new Set<string>();

  while (open.length) {
    open.sort((a, b) => a.f - b.f);
    const cur = open.shift()!;
    const key = `${cur.g},${cur.h}`;
    if (closed.has(key)) continue;
    closed.add(key);

    if (cur.g === endG && cur.h === endH) {
      const path = [{ x: cur.g, z: cur.h }];
      let node: Item = cur;
      while (node.parent !== null) {
        node = node.parent;
        path.push({ x: node.g, z: node.h });
      }
      return path.reverse();
    }

    const dirs = [
      { g: -1, h: 0 }, { g: 1, h: 0 }, { g: 0, h: -1 }, { g: 0, h: 1 },
      { g: -1, h: -1 }, { g: 1, h: -1 }, { g: -1, h: 1 }, { g: 1, h: 1 },
    ];
    for (const d of dirs) {
      const ng = cur.g + d.g;
      const nh = cur.h + d.h;
      if (blocked(ng, nh) || closed.has(`${ng},${nh}`)) continue;
      const f = ng + nh + Math.abs(ng - endG) + Math.abs(nh - endH);
      open.push({ g: ng, h: nh, f, parent: cur });
    }
  }
  return null;
}

export function pickTarget(count: number): { x: number; z: number } {
  return { x: Math.floor(Math.random() * (COLS - 2)) + 1, z: Math.floor(Math.random() * ROWS) };
}
