import {
  CUSTOM_ELEMENTS_SCHEMA,
  Component,
  AfterViewInit,
  ElementRef,
  Input,
  ViewChild,
  Output,
  EventEmitter,
} from '@angular/core';
import { SimulationState } from '../simulation/model';
import { SimulationService } from '../simulation/simulation.service';

@Component({
  selector: 'app-planta-3d-viewport',
  standalone: true,
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  template: `
    <div class="viewport-wrap">
      <planta-3d-viewport
        #vp
        id="planta-3d-viewport"
        class="vp-canvas"
      ></planta-3d-viewport>
      <div class="viewport-meta">
        <span id="agv-count">AGV {{ sim().agvs.length }}</span>
        <span id="sim-status">{{ sim().status === 'running' ? 'en linea' : 'pausa' }}</span>
      </div>
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
        width: 100%;
        height: 100%;
      }
      .viewport-wrap {
        position: relative;
        width: 100%;
        height: 100%;
      }
      .vp-canvas {
        display: block;
        width: 100% !important;
        height: 100% !important;
      }
      .viewport-meta {
        position: absolute;
        right: 12px;
        top: 12px;
        display: flex;
        gap: 12px;
        font: 13px ui-monospace, 'Courier New', monospace;
        color: #fff;
        background: rgba(0, 0, 0, 0.55);
        padding: 8px 12px;
        border-radius: 6px;
      }
    `,
  ],
})
export class Planta3dViewportComponent implements AfterViewInit {
  @Input() simulation: SimulationState | null = null;
  @Output() agvSelected = new EventEmitter<string>();
  @ViewChild('vp') vpRef!: ElementRef<HTMLElement>;
  private el!: HTMLElement;

  constructor(private simSvc: SimulationService) {}

  sim(): SimulationState {
    return this.simulation ?? this.simSvc.sim();
  }

  ngAfterViewInit() {
    this.el = this.vpRef.nativeElement;
    this.wire();
  }

  private wire() {
    if (!this.el) return;
    this.el.addEventListener('agv-selected', (e: Event) => {
      const id = (e as CustomEvent).detail?.id;
      if (id) this.agvSelected.emit(id);
    });
  }

  ngOnChanges() {
    const el = this.el! as HTMLElement & { simulation: SimulationState | null };
    if (this.el) el.simulation = this.simulation ?? null;
  }
}
