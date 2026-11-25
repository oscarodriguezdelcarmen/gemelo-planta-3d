import {
  Component,
  Input,
  Output,
  EventEmitter,
  OnInit,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Agv, SimulationState } from '../simulation/model';
import { SimulationService } from '../simulation/simulation.service';
import { OllamaService } from '../ollama/ollama.service';

@Component({
  selector: 'telemetry-panel',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="tlm-head">
      <h2>🧊 Telemetría en vivo</h2>
      <span class="badge" [class.ok]="sim().status === 'running'">{{ sim().status === 'running' ? 'ACTIVO' : 'PAUSA' }}</span>
    </div>

    <div class="two">
      <div class="card">
        <h3>AGVs</h3>
        <div class="row">
          <button (click)="simSvc.addAgv()">+ Añadir AGV</button>
          <button (click)="simSvc.removeAgv(selectedAgvId ? selectedAgvId : (sim().agvs[0]?.id ?? ''))">- Quitar AGV</button>
          <button (click)="simSvc.setGlobalSpeed(2)">⚡ x2</button>
          <button (click)="simSvc.setGlobalSpeed(1)">🔋 x1</button>
        </div>
        <div class="row">
          <button (click)="simSvc.pause()">⏸ Pausa</button>
          <button (click)="simSvc.resume()">▶ Reanudar</button>
          <button (click)="simSvc.reset()">↺ Reset</button>
        </div>
        <div class="big">{{ sim().agvs.length }} robots · throughput {{ sim().throughput | number }} palets/h</div>
        <div class="big" id="agv-count">AGVs: {{ sim().agvs.length }} · TICK {{ sim().ticks }}</div>
        <ul class="list">
          <li
            *ngFor="let a of sim().agvs"
            [class.selected]="a.id === selectedAgvId"
            [class.blocked]="a.status === 'blocked'"
            (click)="selectAgv(a.id)"
          >
            <span class="bullet" [style.background]="bul(a.status)"></span>
            {{ a.id }} · b{{ a.battery | number }}% · c{{ a.load }} · {{ a.status }}
          </li>
        </ul>
      </div>

      <div class="card">
        <h3>Comando intuitivo</h3>
        <div class="row">
          <input
            #orderEl
            [(ngModel)]="order"
            id="order-input"
            placeholder='Ej: "Bloquea el pasillo 2" o "Mándalos a recargar"'
          />
          <button (click)="submitOrder()">Enviar</button>
        </div>
        <div class="row">
          <span class="lbl">Estado:</span>
          <span id="status-indicator" class="stat">{{ orderStatus }}</span>
        </div>
        <div class="row">
          <button (click)="simSvc.toggleAisle(2,2)">🚧 Bloquear pasillo 2</button>
          <button (click)="simSvc.unlockAllAisles()">🔓 Desbloquear todo</button>
          <button (click)="simSvc.raiseIncident('Avería hub')">⚠ Incidencia</button>
          <button (click)="simSvc.reset()">↺ Reset</button>
        </div>
        <div class="big">{{ batteryLowCount() }} a la bateria</div>
        <ul class="list">
          <li *ngFor="let c of sim().congestion" class="congestion">⚠ {{ c }}</li>
          <li *ngFor="let i of sim().incidents" class="incident">⚠ {{ i.text }}</li>
        </ul>
        <div class="row" style="margin-top:8px">
          <span class="lbl">Ollama:</span>
          <span id="ollama-status" class="stat">{{ ollamaSvc.statusText }}</span>
        </div>
      </div>
    </div>
  `,
  styles: [
    `
      :host { display: block; padding: 12px; }
      .tlm-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 10px;
      }
      h3 { margin: 12px 0 8px; font-size: 14px; color: #cdd6e2; }
      .badge {
        font: 11px ui-monospace, monospace;
        padding: 2px 8px;
        border-radius: 4px;
        background: #374151;
      }
      .badge.ok { background: #1f8a4c; color: #bbf7d0; }
      .two { display: flex; gap: 12px; }
      .card {
        flex: 1;
        border: 1px solid #2a2a38;
        border-radius: 8px;
        background: #17171f;
        padding: 12px;
      }
      .row {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin-bottom: 8px;
      }
      .row button {
        flex: 1 1 120px;
        padding: 6px 8px;
        border: 1px solid #374151;
        border-radius: 6px;
        background: #23232f;
        color: #fff;
        cursor: pointer;
        font: 12px ui-monospace, monospace;
      }
      .row button:hover { background: #2f2f3f; }
      input {
        flex: 1;
        min-width: 200px;
        padding: 8px;
        border-radius: 6px;
        border: 1px solid #374151;
        background: #0f0f14;
        color: #fff;
        font: 13px ui-monospace, monospace;
      }
      .big { font: 14px ui-monospace, monospace; margin: 8px 0; }
      .list {
        list-style: none;
        margin: 0;
        padding: 0;
        font: 12px ui-monospace, monospace;
        max-height: 320px;
        overflow: auto;
      }
      .list li {
        padding: 3px 0;
        border-bottom: 1px solid #1b1b26;
        cursor: pointer;
        display: flex;
        gap: 8px;
        align-items: center;
      }
      .list li:hover { background: #1b1b26; }
      .list li.selected { background: #2a2a38; }
      .list li.blocked { color: #f87171; }
      .congestion { color: #fbbf24; }
      .incident { color: #f87171; }
      .stat { color: #9ca3af; }
      .lbl { color: #6b6b7b; }
      .bullet {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        flex-shrink: 0;
      }
      .bullet.moving { background: #3b82f6; }
      .bullet.charging { background: #facc15; }
      .bullet.idle { background: #22c55e; }
      .bullet.delivering { background: #a855f7; }
      .bullet.blocked { background: #ef4444; }
    `,
  ],
})
export class TelemetryPanelComponent implements OnInit {
  @Input() simulation: SimulationState | null = null;
  @Input() selectedAgvId = '';
  @Output() agvSelected = new EventEmitter<string>();
  @Output() orderSubmitted = new EventEmitter<string>();
  order = '';
  orderStatus = '';

  constructor(public simSvc: SimulationService, public ollamaSvc: OllamaService) {}

  ngOnInit() {
    this.order = 'Bloquea el pasillo central y prioriza los pedidos urgentes';
    this.order = 'Mándalos a recargar';
  }

  sim(): SimulationState {
    return this.simulation ?? this.simSvc.sim();
  }

  bul(status: string) {
    const map: Record<string, string> = {
      idle: '#22c55e', moving: '#3b82f6', charging: '#facc15',
      delivering: '#a855f7', blocked: '#ef4444', incident: '#ef4444',
    };
    return map[status] || '#9ca3af';
  }

  batteryLowCount(): number {
    return this.sim().agvs.filter((a: Agv) => a.battery < 30).length;
  }

  selectAgv(id: string) {
    this.agvSelected.emit(id);
  }

  submitOrder() {
    const val = this.order.trim();
    if (!val) return;
    this.orderSubmitted.emit(val);
    this.orderStatus = '✅ Orden recibida — simulando';
    this.order = '';
  }
}
