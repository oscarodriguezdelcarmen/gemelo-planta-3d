# Arquitectura del Gemelo Digital 3D

Documento técnico para el tutor. Resumen de la arquitectura Angular + React Three Fiber.

## 1. Propósito

Aplicación híbrida donde **Angular** (host) y **React Three Fiber** (motor 3D) convivan
en una sola app y se comuniquen bidireccionalmente en tiempo real.

## 2. Componentes

| Capa | Tecnología | Responsabilidad |
|------|------------|-----------------|
| Host Angular | Angular 19 (standalone, Signals, RxJS) | Motor de simulación determinista (30 tics/s), telemetría, consola de órdenes intuitivas, control de AGVs, Ollama + fallback semántico. |
| Visor 3D | React 19 + three + @react-three/fiber + @react-three/drei | Render 3D WebGL a 60 FPS del suelo, pasillos, estanterías, muelles, estaciones de recarga, obstáculos, AGVs articulados y líneas de ruta. |
| Enlace | Custom Element `<planta-3d-viewport>` | Empaqueta el visor React como elemento web, cargado en la plantilla de Angular. |
| Orquestación | Vite + Angular CLI | Construye el bundle del visor y el build de producción de Angular con `--base-href /gemelo-planta-3d/`. |

## 3. Flujo de comunicación

- **Angular → 3D:** el estado de la simulación se pasa al custom element mediante la propiedad
  `simulation` (Angular `Input()`) y se refleja en el DOM como `CustomEvent('cmd', ...)`.
- **3D → Angular:** al pulsar un AGV o celda, el visor lanza `CustomEvent('agv-selected', { detail: { id } })`
  que el componente Angular `Planta3dViewportComponent` captura y emite como su propio
  `@Output() agvSelected`. También lanza `CustomEvent('tick', { detail: { tick, fps } })` con
  los contadores de FPS/ticks para el test de Playwright.

## 4. Simulación determinista

- Rejilla de pasillos (COLS × ROWS), muelle de carga/descarga (DOCKS), estación de recarga
  (CHARGING_STATIONS), obstáculos dinámicos (añadidos cada ~3 tics) y flag de pasillos bloqueados.
- Cada AGV: posición `(x,z)`, objetivo `(tx,tz)`, batería, carga, velocidad y estado
  (`idle | moving | charging | delivering | blocked`).
- Ruteo **A\*** en la rejilla, evasión de colisiones (paso en celdas libres adyacentes),
  recarga automática al llegar a la estación, entrega al llegar a un muelle.

## 5. Consola de órdenes por IA

- Ollama local en `http://localhost:11434`. Se detecta automáticamente el modelo instalado:
  `qwen3.5:4b` o `qwen2.5` (primero que exista), luego el primer modelo disponible.
- La orden se envía a `/api/chat`; el texto se parsea como JSON command; si falla, se usa el
  motor semántico local (TypeScript) que mapea órdenes en español (`bloquea el pasillo 2`,
  `mándalos a recargar`, `velocidad x2`, `pausa`, `incidencia`, ...) a comandos estructurados
  (`SimCmd`). El motor nunca lanza errores de red y siempre devuelve un comando.
- Indicador visual: `#status-indicator` con `Ollama Local Conectado` o `Modo Simulación Autónoma Web`.

## 6. Despliegue

- Angular CLI `ng build --configuration production --base-href /gemelo-planta-3d/`
- React Three Fiber empaquetado a IIFE por Vite y referenciado en `src/index.html` como
  `planta-3d-viewport.bundle.js`.
- GitHub Actions (`deploy.yml`): `npm ci`, `ng build`, `actions/upload-pages-artifact` +
  `actions/deploy-pages` → Pages con `build_type: workflow`.
