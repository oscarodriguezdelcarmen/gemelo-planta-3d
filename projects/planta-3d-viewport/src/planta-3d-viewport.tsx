import React, { useMemo, useRef, useState } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { Canvas, useFrame } from '@react-three/fiber';
import { Html, Line } from '@react-three/drei';
import * as THREE from 'three';

export interface AgvState {
  id: string;
  gx: number;
  gz: number;
  tx: number;
  tz: number;
  battery: number;
  load: number;
  speed: 1 | 2;
  status: 'idle' | 'moving' | 'charging' | 'delivering' | 'blocked';
  heading: number;
  path: { x: number; z: number }[];
}

export interface SimState {
  agvs: AgvState[];
  ticks: number;
  fps: number;
  obstacles: { x: number; z: number }[];
  lockedAisles: string[];
  incidents: string[];
}

export interface Planta3dViewportProps {
  simulation?: SimState | null;
  onAgvSelected?: (id: string) => void;
  onCommand?: (cmd: any) => void;
}

const GRID = { cols: 12, rows: 8, cell: 1.2 };
const STATUS_COLORS: Record<string, string> = {
  idle: '#2ecc71',
  moving: '#3498db',
  charging: '#f1c40f',
  delivering: '#9b59b6',
  blocked: '#e74c3c',
  incident: '#e74c3c',
};

export class Planta3dViewport extends HTMLElement {
  private root!: Root;
  private shadow!: ShadowRoot;
  private props: Planta3dViewportProps = {};
  private rafId = 0;
  private t = 0;
  private fps = 0;
  private last = performance.now();

  static get observedAttributes() {
    return ['simulation'];
  }

  connectedCallback() {
    this.shadow = this.attachShadow({ mode: 'open' });
    this.shadow.innerHTML = `
      <style>
        :host { display: block; }
        .container { position:relative; width:100%; height:100%; background:#111318; overflow:hidden; }
        .container #r3f { position:absolute; inset:0; }
        .container canvas { display:block; width:100% !important; height:100% !important; }
        .stats { position:absolute; top:10px; left:10px; color:#fff; font:12px ui-monospace,'Courier New',monospace; pointer-events:none; }
        .stats span { display:inline-block; background:rgba(0,0,0,.55); padding:1px 6px; border-radius:3px; margin-left:6px; }
      </style>
      <div class="container">
        <div class="stats">
          Tick <span id="tick-count">0</span>&nbsp; FPS <span id="fps-count">0</span>
        </div>
        <div id="r3f"></div>
      </div>`;
    this.root = createRoot(this.shadow.querySelector('#r3f')!);
    this.render(this.props);
    this._onMessage = this._onMessage.bind(this);
    window.addEventListener('message', this._onMessage);
    this.tick();
  }

  get simulation(): SimState | null {
    return this.props.simulation ?? null;
  }

  set simulation(s: SimState | null) {
    this.props.simulation = s;
    this.render(this.props);
  }

  dispatchCommand(cmd: any) {
    this.dispatchEvent(new CustomEvent('cmd', { detail: cmd, bubbles: true, composed: true }));
    try {
      window.postMessage(JSON.stringify(cmd), '*');
    } catch {
      /* noop */
    }
  }

  private _onMessage(e: MessageEvent) {
    const d = e.data;
    if (typeof d === 'string') {
      try {
        this.props.onCommand?.(JSON.parse(d));
        return;
      } catch {
        /* ignore */
      }
    }
    if (d && typeof d === 'object' && d.type) {
      this.props.onCommand?.(d);
    }
  }

  disconnectedCallback() {
    window.removeEventListener('message', this._onMessage);
    cancelAnimationFrame(this.rafId);
    this.root.unmount();
  }

  private render(props: Planta3dViewportProps) {
    this.props = props;
    this.root.render(<ViewportScene {...props} />);
  }

  private tick() {
    this.rafId = requestAnimationFrame(() => this.tick());
    const now = performance.now();
    const dt = Math.max(1 / 120, (now - this.last) / 1000);
    this.last = now;
    this.fps += (1 / dt - this.fps) * 0.1;
    this.t += 1;
    const tc = this.shadow.getElementById('tick-count');
    if (tc) tc.textContent = String(this.t);
    const fc = this.shadow.getElementById('fps-count');
    if (fc) fc.textContent = this.fps.toFixed(1);
    this.dispatchEvent(new CustomEvent('tick', {
      detail: { tick: this.t, fps: this.fps },
      bubbles: true,
      composed: true,
    }));
  }
}

function AgvBody({
  agv,
  selected,
  onSelect,
}: {
  agv: AgvState;
  selected: boolean;
  onSelect: () => void;
}) {
  const group = useRef<THREE.Group>(null!);
  const color = STATUS_COLORS[agv.status] || '#fff';

  useFrame(() => {
    const dx = agv.tx - agv.gx;
    const dz = agv.tz - agv.gz;
    const len = Math.hypot(dx, dz);
    const sp = len > 0.01 ? (agv.speed === 2 ? 0.16 : 0.09) : 0;
    agv.gx += dx * sp;
    agv.gz += dz * sp;
    if (Math.abs(agv.gx - agv.tx) < 0.05 && Math.abs(agv.gz - agv.tz) < 0.05) {
      agv.gx = agv.tx;
      agv.gz = agv.tz;
    }
    if (group.current) {
      group.current.position.set(agv.gx * GRID.cell, 0.04, agv.gz * GRID.cell);
      group.current.rotation.y = agv.heading || 0;
    }
  });

  return (
    <group ref={group} onClick={(e) => {
      e.stopPropagation();
      onSelect();
    }}>
      <mesh position={[0, 0.02, -0.36]} castShadow>
        <boxGeometry args={[0.5, 0.06, 0.02]} />
        <meshStandardMaterial color="#222" />
      </mesh>
      <mesh position={[0, 0.08, 0]} castShadow>
        <boxGeometry args={[1.0, 0.45, 0.7]} />
        <meshStandardMaterial color={selected ? '#ff6b6b' : '#4da3ff'} />
      </mesh>
      <mesh position={[0.55, 0.05, 0.35]} castShadow>
        <coneGeometry args={[0.32, 0.45, 10]} />
        <meshStandardMaterial color={color} />
      </mesh>
      <mesh position={[0, 0.02, 0.35]}>
        <cylinderGeometry args={[0.2, 0.22, 0.12, 12]} />
        <meshStandardMaterial color="#111" />
      </mesh>
      <mesh position={[0, 0.55, 0.05]}>
        <boxGeometry args={[0.5, 0.12, 0.6]} />
        <meshBasicMaterial color="#222" />
      </mesh>
      <mesh position={[0, 0.55 + Math.sin(performance.now() * 0.005) * 0.06, 0.05]}>
        <boxGeometry args={[0.5, 0.12 * Math.min(1, Math.max(0, agv.battery / 100)), 0.6]} />
        <meshBasicMaterial color={agv.battery > 60 ? '#2ecc71' : agv.battery > 30 ? '#f1c40f' : '#e74c3c'} />
      </mesh>
      <mesh position={[0.55, 0.06, 0]}>
        <sphereGeometry args={[0.1, 8, 8]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={0.8}
        />
      </mesh>
    </group>
  );
}

function AgvPathLine({ agv }: { agv: AgvState }) {
  if (agv.path.length < 2) return null;
  const pts = agv.path.map((p) => ({ x: p.x * GRID.cell, y: 0.03, z: p.z * GRID.cell }));
  return <Line key={agv.id} points={pts.map((p) => new THREE.Vector3(p.x, p.y, p.z))} color="#3498db" opacity={0.7} />;
}

function Obstacle({ x, z }: { x: number; z: number }) {
  return (
    <group position={[x * GRID.cell, 0.02, z * GRID.cell]}>
      <mesh castShadow>
        <boxGeometry args={[0.9, 0.4, 0.9]} />
        <meshStandardMaterial color="#e74c3c" wireframe />
      </mesh>
      <mesh position={[0, 0.5, 0]}>
        <sphereGeometry args={[0.12, 6, 6]} />
        <meshBasicMaterial color="#ffd6d6" />
      </mesh>
    </group>
  );
}

function AgvIcon({ agv }: { agv: AgvState }) {
  const [sel, setSel] = useState(false);
  return (
    <AgvBody agv={agv} selected={sel} onSelect={() => setSel(true)} />
  );
}

function ViewportScene({ simulation }: Planta3dViewportProps) {
  const obstacles = useMemo(
    () => simulation?.obstacles ?? [],
    [simulation?.obstacles]
  );

  return (
    <Canvas camera={{ position: [0, 8, 14], fov: 45 }} dpr={1} shadows>
      <ambientLight intensity={0.35} />
      <directionalLight position={[20, 40, 30]} intensity={1.2} />
      <primitive
        object={
          new THREE.GridHelper(GRID.cols * GRID.cell, GRID.cols, 0x444444, 0x222222)
        }
      />
      <Html center position={[0, GRID.rows * GRID.cell / 2, 0]}>
        <div style={{ color: '#fff', font: '14px ui-monospace, monospace', textAlign: 'center' }}>
          Gemelo Digital 3D — Planta Logística
        </div>
      </Html>
      {obstacles.map((o, i) => (
        <Obstacle key={`obs${i}`} x={o.x} z={o.z} />
      ))}
      {simulation?.agvs.map((agv) => (
        <group key={agv.id}>
          <AgvPathLine agv={agv} />
          <AgvIcon agv={agv} />
        </group>
      ))}
    </Canvas>
  );
}

customElements.define('planta-3d-viewport', Planta3dViewport);
