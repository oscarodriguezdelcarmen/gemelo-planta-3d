import { Component, OnInit } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { SimulationService } from './simulation/simulation.service';
import { SimulationState } from './simulation/model';
import { OllamaService } from './ollama/ollama.service';
import { Planta3dViewportComponent } from './viewport/planta-3d-viewport.component';
import { TelemetryPanelComponent } from './telemetry/telemetry-panel.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    Planta3dViewportComponent,
    TelemetryPanelComponent,
  ],
  template: `
    <div class="app">
      <header class="topbar">
        <h1>🇪🇸 Gemelo Digital 3D</h1>
        <span class="tagline">Planta Logística · Angular + React Three Fiber</span>
      </header>
      <main class="layout">
        <section class="panel">
          <telemetry-panel
            [simulation]="sim()"
            [selectedAgvId]="selectedAgvId"
            (agvSelected)="onAgvSelected($event)"
            (orderSubmitted)="ollamaSvc.sendOrder($event)"
          ></telemetry-panel>
        </section>
        <section class="panel">
          <app-planta-3d-viewport
            [simulation]="sim()"
            (agvSelected)="onAgvSelected($event)"
          ></app-planta-3d-viewport>
        </section>
      </main>
      <footer class="statusbar">
        <span id="status-indicator">{{ ollamaSvc.statusText }}</span>
        <span id="tick-counter">TICK {{ sim().ticks }}</span>
      </footer>
    </div>
  `,
  styles: [
    `
      .app {
        display: flex;
        flex-direction: column;
        min-height: 100vh;
        font-family: 'Segoe UI', system-ui, sans-serif;
        color: #fff;
        background: #0f0f14;
      }
      .topbar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 10px 16px;
        background: #1a1a24;
        border-bottom: 1px solid #2a2a38;
      }
      .topbar h1 {
        margin: 0;
        font-size: 18px;
        letter-spacing: .5px;
      }
      .topbar .tagline {
        font-size: 12px;
        color: #888;
      }
      .layout {
        display: flex;
        gap: 16px;
        padding: 16px;
        flex: 1;
        overflow: auto;
      }
      .panel {
        flex: 1 1 46%;
        min-width: 320px;
        border-radius: 10px;
        border: 1px solid #2a2a38;
        background: #17171f;
        overflow: auto;
      }
      .statusbar {
        display: flex;
        justify-content: space-between;
        padding: 8px 16px;
        background: #1a1a24;
        font: 12px ui-monospace, monospace;
        border-top: 1px solid #2a2a38;
      }
    `,
  ],
})
export class AppComponent implements OnInit {
  selectedAgvId = '';
  constructor(
    public simSvc: SimulationService,
    public ollamaSvc: OllamaService,
  ) {}

  ngOnInit() {
    this.simSvc.start();
  }

  sim(): SimulationState {
    return this.simSvc.sim();
  }

  onAgvSelected(id: string) {
    this.selectedAgvId = id;
  }
}
