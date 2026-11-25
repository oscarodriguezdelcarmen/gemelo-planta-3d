import { SimCmd } from '../simulation/model';

export class SemanticEngine {
  private tokens(order: string) {
    return order
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(Boolean);
  }

  private has(words: string[]) {
    return (t: string[]) => t.some((x) => words.includes(x));
  }

  private num(word: string) {
    const m = word.match(/\d+/);
    return m ? parseInt(m[0], 10) : NaN;
  }

  interpret(order: string): SimCmd {
    const t = this.tokens(order);
    const any = this.has(t);
    const all = this.has(order.toLowerCase().split(/\s+/).filter(Boolean));

    if (any(['bloquea', 'bloquear', 'pendiente', 'obstaculo', 'averia', 'incidencia', 'averia', 'congestion']) && any(['pasillo'])) {
      const n = this.num(order);
      return { type: 'lockAisle', gx: Number.isFinite(n) ? n : 5, gz: 2 };
    }

    if (any(['recargar', 'cargar', 'bateria', 'baterias', 'autos', 'agvs', 'robots']) && any(['menos', '30', '50', 'bajo'])) {
      return { type: 'toCharging' };
    }

    if (any(['recarga', 'estacion']) && any(['carga'])) {
      return { type: 'sendAllToCharging' };
    }

    if (any(['mas', 'añade', 'nuevo', 'extra', 'genera', 'crea', 'mas']) && any(['agv', 'auto', 'rob', 'vehi', 'robot'])) {
      return { type: 'addAgv' };
    }

    if (any(['quita', 'suelta', 'libera', 'elimina', 'cierra', 'apaga', 'cancela']) && any(['agv', 'auto', 'robot'])) {
      return { type: 'removeAgv', id: 'agv-0' };
    }

    const up = any(['velocidad', 'x2', 'doble', 'acelera', 'rapid', 'rapido', '++', 'x1', 'normal']);
    if (up) {
      const isX2 = order.toLowerCase().includes('x2') || order.toLowerCase().includes('doble') || order.toLowerCase().includes('acelera') || order.toLowerCase().includes('rapid');
      return { type: 'setSpeed', id: 'all', speed: isX2 ? 2 : 1 };
    }

    if (any(['pausa', 'parar', 'detener', 'stop', 'suspender', 'congelar']) && !any(['reanuda', 'continuar', 'play', 'reanudar', 'resumen'])) {
      return { type: 'pause' };
    }

    if (any(['reanuda', 'reanudar', 'continuar', 'play', 'resumen']) || any(['reanudar', 'continuar'])) {
      return { type: 'resume' };
    }

    if (any(['incidencia', 'avaria', 'avari', 'falla', 'fallar', 'fallo', 'desconecta', 'frenada'])) {
      return { type: 'raiseIncident', text: order };
    }

    if (any(['desbloquea', 'desbloquear', 'liberta', 'liberar', 'todo'])) {
      return { type: 'unlockAllAisles' };
    }

    if (any(['reset', 'reiniciar', 'nuevo', 'limpiar', 'vaciar', 'cero']) || any(['reiniciar', 'borrar'])) {
      return { type: 'reset' };
    }

    if (any(['prioritiza', 'urgente', 'urgentes', 'prioridad', 'prioritario'])) {
      return { type: 'prioritizeUrgent' };
    }

    return { type: 'ping', text: order };
  }
}
