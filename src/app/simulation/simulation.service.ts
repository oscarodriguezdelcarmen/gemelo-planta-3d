import { Injectable, signal, OnDestroy } from '@angular/core';
import { interval, Subscription, Subject } from 'rxjs';
import { Agv, AgvStatus, Obstacle, SimulationState, SimCmd, AgvSpeed } from './model';
import {
  aStar,
  clamp,
  COLS,
  ROWS,
  DOCKS,
  CHARGING_STATIONS,
  AGV_COUNT,
} from './pathfinder';

@Injectable({ providedIn: 'root' })
export class SimulationService implements OnDestroy {
  private readonly simSubject = new Subject<SimulationState>();
  private state = signal<SimulationState>(this.initialState());
  private timerSubscription: Subscription | null = null;
  private nextAgvId = 0;
  private nextIncId = 0;
  private deliveredThisMinute = 0;

  private initialState(): SimulationState {
    const agvs = this.makeAgvs();
    return {
      ticks: 0,
      agvs,
      obstacles: [],
      lockedAisles: [],
      incidents: [],
      throughput: 0,
      congestion: [],
      status: 'running',
      speed: 2,
      delivered: 0,
    };
  }

  private makeAgvs() {
    const agvs: Agv[] = [];
    for (let i = 0; i < AGV_COUNT; i++) {
      const sx = 0.2 + Math.random() * 1.4;
      const sz = ((i * 3) % ROWS) + 0.2;
      agvs.push({
        id: `agv-${i}`,
        gx: Math.round(sx),
        gz: Math.round(sz),
        tx: 9 + Math.random() * 2,
        tz: sz,
        battery: 85 + Math.random() * 15,
        load: 0,
        speed: 2,
        status: AgvStatus.Moving,
        heading: 0,
        path: [],
      });
    }
    return agvs;
  }

  get sim() {
    return this.state.asReadonly();
  }

  get sim$() {
    return this.simSubject.asObservable();
  }

  start() {
    if (this.timerSubscription) return;
    this.timerSubscription = interval(33).subscribe(() => this.tick());
  }

  get isRunning() {
    return this.state().status === 'running';
  }

  pause() {
    if (this.state().status === 'paused') return;
    this.updateState({ status: 'paused' });
  }

  resume() {
    if (this.state().status === 'running') return;
    this.updateState({ status: 'running' });
  }

  reset() {
    this.cancelTimer();
    this.state.set(this.initialState());
    this.simSubject.next(this.state());
  }

  ngOnDestroy() {
    this.cancelTimer();
  }

  private cancelTimer() {
    if (this.timerSubscription) {
      this.timerSubscription.unsubscribe();
      this.timerSubscription = null;
    }
  }

  private publish() {
    this.simSubject.next(this.state());
  }

  private updateState(mutator: Partial<SimulationState>) {
    const prev = this.state();
    this.state.set({ ...prev, ...mutator });
    this.publish();
  }

  private tick() {
    const prev = this.state();
    const agvs = prev.agvs.map((a) => this.stepAgv(a, prev));
    let delivered = prev.delivered;
    const obstacles = prev.obstacles.slice();
    const lockedAisles = prev.lockedAisles.slice();
    const incidents = prev.incidents.slice();

    // dynamic obstacles
    if (prev.obstacles.length < 40 && prev.ticks % 3 === 0) {
      const o: Obstacle = {
        x: Math.floor(Math.random() * COLS),
        z: Math.floor(Math.random() * ROWS),
      };
      if (!obstacles.some((x) => x.x === o.x && x.z === o.z)) {
        obstacles.push(o);
      }
    }

    // dock arrival & delivery
    const agvs2 = agvs.map((a) => {
      const atDock = DOCKS.some((d) => d.x === a.gx && d.z === a.gz);
      if (a.status === AgvStatus.Delivering && atDock && a.load > 0) {
        delivered += a.load;
        a.load = 0;
        a.battery = Math.min(100, a.battery + 3);
        a.status = AgvStatus.Idle;
        return a;
      }
      if (a.status === AgvStatus.Delivering && atDock && a.load === 0) {
        a.status = AgvStatus.Idle;
        this.assignTarget(a, agvs, obstacles);
        return a;
      }
      if (a.status === AgvStatus.Charging && a.battery >= 100 && a.load > 0) {
        delivered += a.load;
        a.load = 0;
        a.battery = Math.min(100, a.battery + 2);
        a.status = AgvStatus.Idle;
        return a;
      }
      if (a.status === AgvStatus.Charging && a.battery >= 100 && a.load === 0) {
        this.assignTarget(a, agvs, obstacles);
        a.status = AgvStatus.Moving;
        return a;
      }
      if (a.battery <= 8 && a.status !== AgvStatus.Charging && a.status !== AgvStatus.Blocked) {
        this.sendToChargingNow(a);
      }
      return a;
    });

    // congestion detection
    const cellCount = new Map<string, number>();
    agvs2.forEach((a) => {
      const k = `${a.gx},${a.gz}`;
      cellCount.set(k, (cellCount.get(k) || 0) + 1);
    });
    const congestion = [...cellCount.entries()]
      .filter(([, c]) => c >= 3)
      .map(([k]) => `Congestion en pasillo ${k}`);

    const elapsedHours = Math.max(1, prev.ticks * 0.033);
    const throughput = Math.round(delivered / elapsedHours);

    this.state.set({
      ticks: prev.ticks + 1,
      agvs: agvs2,
      obstacles,
      lockedAisles,
      incidents,
      throughput,
      congestion,
      status: prev.status,
      speed: prev.speed,
      delivered,
    });
    this.publish();
  }

  private stepAgv(agv: Agv, st: SimulationState): Agv {
    const agvs = st.agvs;

    // pickup at dock (idle with load 0)
    if (agv.status === AgvStatus.Idle) {
      const atDock = DOCKS.some((d) => d.x === agv.gx && d.z === agv.gz);
      if (atDock && agv.load === 0 && Math.random() < 0.5) {
        agv.load = 1;
        agv.status = AgvStatus.Delivering;
        this.assignTarget(agv, agvs, st.obstacles);
        return agv;
      }
      this.assignTarget(agv, agvs, st.obstacles);
      return agv;
    }

    // charging
    if (agv.status === AgvStatus.Charging) {
      const atCharger = CHARGING_STATIONS.some((c) => c.x === agv.gx && c.z === agv.gz);
      if (atCharger) {
        agv.battery = Math.min(100, agv.battery + 6);
        if (agv.battery >= 100) {
          if (agv.load > 0) {
            agv.status = AgvStatus.Delivering;
            this.assignTarget(agv, agvs, st.obstacles);
          } else {
            this.assignTarget(agv, agvs, st.obstacles);
            agv.status = AgvStatus.Moving;
          }
        }
      }
      return agv;
    }

    // delivering
    if (agv.status === AgvStatus.Delivering) {
      const atDock = DOCKS.some((d) => d.x === agv.gx && d.z === agv.gz);
      if (atDock && agv.load > 0) {
        agv.status = AgvStatus.Idle;
        this.assignTarget(agv, agvs, st.obstacles);
        return agv;
      }
      if (atDock && agv.load === 0) {
        agv.status = AgvStatus.Idle;
        this.assignTarget(agv, agvs, st.obstacles);
        return agv;
      }
      agv.status = AgvStatus.Moving;
      return agv;
    }

    // moving
    if (agv.status !== AgvStatus.Moving) return agv;

    const path = aStar(
      agv.gx,
      agv.gz,
      agv.tx,
      agv.tz,
      st.obstacles,
      st.lockedAisles
    );
    if (!path || path.length < 2) {
      agv.status = AgvStatus.Blocked;
      this.assignTarget(agv, agvs, st.obstacles);
      return agv;
    }

    const next = path[1];
    if (this.occupied(next.x, next.z, agvs, agv)) {
      // evasion: step into a free adjacent cell
      const dirs = [
        { g: -1, h: 0 },
        { g: 1, h: 0 },
        { g: 0, h: -1 },
        { g: 0, h: 1 },
        { g: -1, h: -1 },
        { g: 1, h: -1 },
        { g: -1, h: 1 },
        { g: 1, h: 1 },
      ];
      let stepped = false;
      for (const d of dirs) {
        const ng = agv.gx + d.g;
        const nh = agv.gz + d.h;
        if (ng < 0 || ng >= COLS || nh < 0 || nh >= ROWS) continue;
        if (st.obstacles.some((o) => o.x === ng && o.z === nh)) continue;
        if (this.occupied(ng, nh, agvs, agv)) continue;
        agv.gx = ng;
        agv.gz = nh;
        agv.status = AgvStatus.Moving;
        stepped = true;
        break;
      }
      if (!stepped) {
        agv.status = AgvStatus.Blocked;
      }
      return agv;
    }

    agv.gx = next.x;
    agv.gz = next.z;

    const reached = Math.abs(agv.gx - agv.tx) < 0.3 && Math.abs(agv.gz - agv.tz) < 0.3;
    if (reached) {
      const atCharger = CHARGING_STATIONS.some((c) => c.x === agv.gx && c.z === agv.gz);
      if (atCharger && agv.battery < 100) {
        agv.status = AgvStatus.Charging;
      } else {
        this.assignTarget(agv, agvs, st.obstacles);
        agv.status = AgvStatus.Moving;
      }
    }
    return agv;
  }

  private occupied(g: number, h: number, agvs: Agv[], except: Agv) {
    return agvs.some(
      (a) => a.gx === g && a.gz === h && a.id !== except.id
    );
  }

  private assignTarget(agv: Agv, agvs: Agv[], obstacles: Obstacle[]) {
    let ok = false;
    for (let i = 0; i < 60; i++) {
      const gx = Math.floor(Math.random() * COLS);
      const gz = Math.floor(Math.random() * ROWS);
      if (obstacles.some((o) => o.x === gx && o.z === gz)) continue;
      if (agvs.some((a) => a.id !== agv.id && a.gx === gx && a.gz === gz)) continue;
      agv.tx = gx;
      agv.tz = gz;
      agv.path = [];
      ok = true;
      break;
    }
    if (!ok) {
      agv.tx = Math.max(0, agv.gx - 1);
      agv.tz = agv.gz;
    }
  }

  private sendToChargingNow(agv: Agv) {
    const c = CHARGING_STATIONS[0];
    agv.tx = c.x;
    agv.tz = c.z;
    agv.status = AgvStatus.Charging;
  }

  addAgv(gx?: number, gz?: number): Agv {
    const id = `agv-${this.nextAgvId++}`;
    const sx = gx ?? 0;
    const sz = gz ?? Math.floor(Math.random() * ROWS);
    const agv: Agv = {
      id,
      gx: sx,
      gz: sz,
      tx: 9 + Math.random() * 2,
      tz: sz,
      battery: 90 + Math.random() * 10,
      load: 0,
      speed: 2,
      status: AgvStatus.Moving,
      heading: 0,
      path: [],
    };
    this.state.update((s) => ({ ...s, agvs: [...s.agvs, agv] }));
    this.publish();
    return agv;
  }

  removeAgv(id: string): Agv | null {
    const prev = this.state();
    const idx = prev.agvs.findIndex((a) => a.id === id);
    if (idx === -1) return null;
    const agvs = prev.agvs.filter((a) => a.id !== id);
    this.state.set({ ...prev, agvs });
    this.publish();
    return prev.agvs[idx];
  }

  toggleAisle(gx: number, gz: number): string[] {
    const locked = this.state().lockedAisles.includes(`${gx},${gz}`)
      ? this.state().lockedAisles.filter((k) => k !== `${gx},${gz}`)
      : [...this.state().lockedAisles, `${gx},${gz}`];
    this.updateState({ lockedAisles: locked });
    return locked;
  }

  unlockAisle(gx: number, gz: number) {
    this.updateState({
      lockedAisles: this.state().lockedAisles.filter((k) => k !== `${gx},${gz}`),
    });
  }

  unlockAllAisles() {
    this.updateState({ lockedAisles: [] });
  }

  raiseIncident(text: string, x?: number, z?: number) {
    const inc = {
      id: `inc-${this.nextIncId++}`,
      text,
      x: typeof x === 'number' ? x : undefined,
      z: typeof z === 'number' ? z : undefined,
    };
    this.updateState({ incidents: [...this.state().incidents, inc] });
    if (typeof x === 'number' && typeof z === 'number') {
      this.updateState({
        obstacles: [...this.state().obstacles, { x, z }],
      });
    }
  }

  setSpeed(id: string, speed: AgvSpeed) {
    this.state.update((s) => ({
      ...s,
      agvs: s.agvs.map((a) => (a.id === id ? { ...a, speed } : a)),
    }));
    this.publish();
  }

  setGlobalSpeed(speed: AgvSpeed) {
    this.state.update((s) => ({
      ...s,
      speed,
      agvs: s.agvs.map((a) => ({ ...a, speed })),
    }));
    this.publish();
  }

  sendToCharging(id: string) {
    const agv = this.state().agvs.find((a) => a.id === id);
    if (!agv) return;
    this.sendToChargingNow(agv);
    this.publish();
  }

  applyCommand(cmd: SimCmd): SimulationState {
    switch (cmd.type) {
      case 'addAgv': {
        this.addAgv(cmd.gx ?? undefined, cmd.gz ?? undefined);
        this.raiseIncident('Nuevo AGV añadido', cmd.gx ?? 0, cmd.gz ?? 0);
        break;
      }
      case 'removeAgv':
        this.removeAgv(cmd.id);
        break;
      case 'lockAisle':
        this.toggleAisle(cmd.gx, cmd.gz);
        break;
      case 'unlockAisle':
        this.unlockAisle(cmd.gx, cmd.gz);
        break;
      case 'unlockAllAisles':
        this.unlockAllAisles();
        break;
      case 'setSpeed':
        this.setSpeed(cmd.id, cmd.speed);
        break;
      case 'sendToCharging':
        this.sendToCharging(cmd.id);
        break;
      case 'pause':
        this.pause();
        break;
      case 'resume':
        this.resume();
        break;
      case 'reset':
        this.reset();
        break;
      case 'raiseIncident':
        this.raiseIncident(cmd.text ?? 'Incidencia sin descripción', cmd.x, cmd.z);
        break;
      case 'sendAllToCharging':
      case 'toCharging': {
        this.state().agvs.forEach((a) => {
          if (a.battery < 30 || cmd.type === 'sendAllToCharging') {
            this.sendToCharging(a.id);
          }
        });
        break;
      }
      case 'prioritizeUrgent': {
        // Campos prioridad: sin cambio de estado (demostración determinista).
        break;
      }
      default:
        break;
    }
    this.publish();
    return this.state();
  }
}
