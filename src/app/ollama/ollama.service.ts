import { Injectable, signal } from '@angular/core';
import { SimulationService } from '../simulation/simulation.service';
import { SimCmd } from '../simulation/model';
import { SemanticEngine } from './semantic-engine';

export type OllamaStatus = 'checking' | 'connected' | 'fallback' | 'offline';

@Injectable({ providedIn: 'root' })
export class OllamaService {
  private readonly semantic = new SemanticEngine();
  private pingTimer = 0;
  status = signal<OllamaStatus>('checking');

  constructor(private sim: SimulationService) {}

  async checkModels(): Promise<string[]> {
    try {
      const res = await fetch('http://localhost:11434/api/tags');
      if (!res.ok) return [];
      const json = await res.json();
      return (json?.models ?? []).map((m: any) => m.name);
    } catch {
      return [];
    }
  }

  async probe() {
    const models = await this.checkModels();
    this.status.set(models.length > 0 ? 'connected' : 'fallback');
  }

  get statusText(): string {
    if (this.status() === 'connected') return 'Ollama Local Conectado';
    if (this.status() === 'fallback') return 'Modo Simulación Autónoma Web';
    return 'Ollama Intentando conexión...';
  }

  async sendOrder(order: string): Promise<SimCmd> {
    const models = await this.checkModels();
    const target = this.pickModel(models);
    if (target) {
      try {
        const res = await fetch('http://localhost:11434/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: target,
            messages: [{ role: 'user', content: order }],
            stream: false,
          }),
        });
        if (res.ok) {
          const json = await res.json();
          const text = json?.message?.content ?? '';
          const cmd = this.parseCommand(text);
          if (cmd) return cmd;
        }
      } catch {
        /* fall through to semantic engine */
      }
    }
    this.status.set('fallback');
    return this.semantic.interpret(order);
  }

  private pickModel(models: string[]): string | null {
    if (models.includes('qwen3.5:4b')) return 'qwen3.5:4b';
    if (models.includes('qwen2.5')) return 'qwen2.5';
    const have = models.filter((m) => m && m.length > 0);
    return have[0] ?? null;
  }

  private parseCommand(text: string): SimCmd | null {
    try {
      const j = JSON.parse(text.trim());
      if (j && typeof j === 'object' && typeof j.type === 'string') return j as SimCmd;
    } catch {
      /* ignore invalid JSON */
    }
    return null;
  }
}
