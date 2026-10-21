import { BlockedStreet, Point, Route, Vehicle } from '../types';
import { EngineSnapshot, SincroVehiculo } from './types';

/**
 * Motor de simulacion del front: singleton fuera del arbol de React, unica fuente de verdad del
 * "ahora" visual (reloj simulado extrapolado + posicion interpolada de cada vehiculo).
 *
 * Por que existe (AS-IS investigado en vivo antes de este cambio): habia 4 mecanismos de tiempo
 * independientes sin ningun estado compartido -- SimClock con su propio setInterval+extrapolacion
 * por `k`, LeafletManhattanMap con su propio requestAnimationFrame+buffer+extrapolacion por `sa`,
 * y los badges de "Entregando/En refrigerio · Xm" leyendo un nowMs congelado por poll. Ademas, el
 * bucle de animacion vivia en un solo requestAnimationFrame sin ningun manejo de
 * `visibilitychange` -- confirmado con la documentacion de Chromium que rAF se DETIENE por
 * completo (no se retrasa, se cancela) en pestañas en segundo plano, lo que explicaba los reportes
 * de "el front se queda pegado por mucho tiempo" aunque el backend seguia mandando lotes normal.
 *
 * Este modulo consolida los primeros dos (reloj + buffer de vehiculos) en un solo lugar, con un
 * solo rAF, que SI maneja visibilitychange. La logica de interpolacion/buffer en si NO cambia --
 * es un traslado literal de lo que ya vivia en LeafletManhattanMap (ver el historial de esa
 * investigacion), no un rediseño del algoritmo.
 */

/** Retraso fijo (ms) con el que se renderiza respecto al reloj real -- ver EngineSnapshot. Debe
 * ser al menos tan grande como el intervalo real entre lotes. Se deriva de `sa` (minutos nominales
 * entre lotes) con este respaldo mientras `sa` todavia no llega. */
const RENDER_DELAY_RESPALDO_MS = 20_000;

function posicionInterpolada(sync: SincroVehiculo, renderTimeMs: number): Point {
  const { origen, destino, waypoints, origenMs, destinoMs } = sync;
  const span = destinoMs - origenMs;
  const fraccion = span > 0 ? Math.min(1, Math.max(0, (renderTimeMs - origenMs) / span)) : 1;

  if (waypoints.length < 2) {
    return { x: origen.x + (destino.x - origen.x) * fraccion, y: origen.y + (destino.y - origen.y) * fraccion };
  }

  let distanciaTotal = 0;
  const segmentos: number[] = [];
  for (let i = 0; i < waypoints.length - 1; i++) {
    const d = Math.abs(waypoints[i + 1].x - waypoints[i].x) + Math.abs(waypoints[i + 1].y - waypoints[i].y);
    segmentos.push(d);
    distanciaTotal += d;
  }
  if (distanciaTotal === 0) {
    return destino;
  }

  let objetivo = fraccion * distanciaTotal;
  for (let i = 0; i < segmentos.length; i++) {
    const largo = segmentos[i];
    if (objetivo <= largo || i === segmentos.length - 1) {
      const t = largo > 0 ? Math.min(1, objetivo / largo) : 1;
      const p0 = waypoints[i];
      const p1 = waypoints[i + 1];
      return { x: p0.x + (p1.x - p0.x) * t, y: p0.y + (p1.y - p0.y) * t };
    }
    objetivo -= largo;
  }
  return waypoints[waypoints.length - 1];
}

/** {@code true} si el segmento axis-aligned p0-p1 se superpone con algun tramo de {@code bloqueos}. */
function segmentoBloqueado(p0: Point, p1: Point, bloqueos: BlockedStreet[]): boolean {
  const horizontal = p0.y === p1.y;
  const vertical = p0.x === p1.x;
  if (!horizontal && !vertical) return false;
  const loX = Math.min(p0.x, p1.x);
  const hiX = Math.max(p0.x, p1.x);
  const loY = Math.min(p0.y, p1.y);
  const hiY = Math.max(p0.y, p1.y);
  return bloqueos.some((b) => {
    if (horizontal && b.start.y === b.end.y && b.start.y === p0.y) {
      const bLo = Math.min(b.start.x, b.end.x);
      const bHi = Math.max(b.start.x, b.end.x);
      return bLo < hiX && bHi > loX;
    }
    if (vertical && b.start.x === b.end.x && b.start.x === p0.x) {
      const bLo = Math.min(b.start.y, b.end.y);
      const bHi = Math.max(b.start.y, b.end.y);
      return bLo < hiY && bHi > loY;
    }
    return false;
  });
}

/** Puente Manhattan local (L, en cualquiera de sus dos orientaciones) entre dos puntos, para el
 * tramo de transicion cuando NO hay camino real conocido -- prueba ambas orientaciones contra
 * {@code blockedStreets} y usa la primera que no cruce ninguna; null si ambas cruzan. */
function puenteManhattanSeguro(desde: Point, hasta: Point, bloqueos: BlockedStreet[]): Point[] | null {
  if (desde.x === hasta.x && desde.y === hasta.y) {
    return [desde, hasta];
  }
  if (desde.x === hasta.x || desde.y === hasta.y) {
    return segmentoBloqueado(desde, hasta, bloqueos) ? null : [desde, hasta];
  }
  const opciones: Point[][] = [
    [desde, { x: hasta.x, y: desde.y }, hasta],
    [desde, { x: desde.x, y: hasta.y }, hasta],
  ];
  for (const opcion of opciones) {
    const bloqueada = segmentoBloqueado(opcion[0], opcion[1], bloqueos) || segmentoBloqueado(opcion[1], opcion[2], bloqueos);
    if (!bloqueada) return opcion;
  }
  return null;
}

/** Bug real reportado (captura: un vehiculo en refrigerio "no se ve en el mapa"): varios
 * vehiculos pueden terminar en el MISMO punto exacto -- el caso mas comun es el almacen central,
 * cuando mas de uno tiene el refrigerio vencido justo al momento de ser despachado y lo toma ahi
 * mismo antes de salir. Sus marcadores se dibujan unos encima de otros; sin ningun desplazamiento,
 * solo el ultimo pintado queda visible, los demas quedan perfectamente ocultos debajo. Abre un
 * abanico chico y deterministico (mismo orden de ids siempre, sin parpadeo entre frames) alrededor
 * del punto compartido -- es puramente cosmetico, se recalcula fresco cada frame desde las
 * posiciones reales, asi que deja de aplicarse solo en cuanto alguno se mueve de verdad. */
function separarPosicionesSuperpuestas(posiciones: Map<string, Point>): void {
  const grupos = new Map<string, string[]>();
  for (const [id, p] of posiciones) {
    const clave = `${p.x.toFixed(3)},${p.y.toFixed(3)}`;
    let grupo = grupos.get(clave);
    if (!grupo) {
      grupo = [];
      grupos.set(clave, grupo);
    }
    grupo.push(id);
  }

  const RADIO_ABANICO = 0.35;
  for (const ids of grupos.values()) {
    if (ids.length < 2) continue;
    ids.sort();
    const centro = posiciones.get(ids[0])!;
    ids.forEach((id, i) => {
      const angulo = (2 * Math.PI * i) / ids.length;
      posiciones.set(id, {
        x: centro.x + RADIO_ABANICO * Math.cos(angulo),
        y: centro.y + RADIO_ABANICO * Math.sin(angulo),
      });
    });
  }
}

export interface IngestParams {
  vehicles: Vehicle[];
  routes: Route[];
  blockedStreets: BlockedStreet[];
  idEjecucion: string | undefined;
  sa: number | undefined;
  marcaTiempoActual: string | null;
  k: number;
  avanzando: boolean;
}

class SimulationEngine {
  private vehicleBuffers = new Map<string, SincroVehiculo[]>();
  private renderDelayMs = RENDER_DELAY_RESPALDO_MS;
  private idEjecucionAnterior: string | undefined;
  private loteCount = 0;
  private buffering = true;
  private bufferingDesdeMs = performance.now();

  // Reloj simulado: mismo mecanismo que antes tenia SimClock (extrapolar por k desde el ultimo
  // marcaTiempoActual real), ahora centralizado aca.
  private relojMarcaConocidaValor: string | null = null;
  private relojMarcaConocidaMs: number | null = null;
  private relojInstanteConocidoMs = performance.now();
  private k = 0;
  private avanzando = false;

  private listeners = new Set<(snap: EngineSnapshot) => void>();
  private rafId: number | null = null;

  /** Llamado cada vez que llega un lote nuevo (push WS o poll) -- NUNCA desde el bucle de render.
   * Logica identica a la que antes vivia en el efecto de sincronizacion de LeafletManhattanMap. */
  ingest(params: IngestParams): void {
    const { vehicles, routes, blockedStreets, idEjecucion, sa, marcaTiempoActual, k, avanzando } = params;

    this.renderDelayMs = sa && sa > 0 ? sa * 60_000 : RENDER_DELAY_RESPALDO_MS;
    this.k = k;
    this.avanzando = avanzando;

    if (marcaTiempoActual !== this.relojMarcaConocidaValor) {
      this.relojMarcaConocidaValor = marcaTiempoActual;
      this.relojMarcaConocidaMs = marcaTiempoActual ? Date.parse(marcaTiempoActual) : null;
      this.relojInstanteConocidoMs = performance.now();
    }

    const huboResetDeEjecucion = Boolean(idEjecucion)
      && this.idEjecucionAnterior != null
      && this.idEjecucionAnterior !== idEjecucion;
    if (huboResetDeEjecucion) {
      this.vehicleBuffers.clear();
      this.loteCount = 0;
      this.bufferingDesdeMs = performance.now();
      this.buffering = true;
    }
    if (idEjecucion) {
      this.idEjecucionAnterior = idEjecucion;
    }
    if (huboResetDeEjecucion) {
      // Igual que antes: se espera a que `vehicles` refleje la ejecucion nueva de verdad (el
      // refetch/WS lo trae en breve) en vez de reconstruir con datos que podrian ser viejos.
      return;
    }

    const idsActuales = new Set(vehicles.map((v) => v.id));
    for (const id of this.vehicleBuffers.keys()) {
      if (!idsActuales.has(id)) {
        this.vehicleBuffers.delete(id);
      }
    }

    let huboLoteNuevo = false;

    for (const v of vehicles) {
      let cola = this.vehicleBuffers.get(v.id);
      if (!cola) {
        cola = [];
        this.vehicleBuffers.set(v.id, cola);
      }
      const ultimoBracket = cola[cola.length - 1];

      const rutaActiva = routes.find((r) => r.vehicleId === v.id && r.status === 'in_progress');
      const fuenteId = rutaActiva ? rutaActiva.id : 'retorno';

      const sinCambios = ultimoBracket && ultimoBracket.destino.x === v.position.x
        && ultimoBracket.destino.y === v.position.y && ultimoBracket.fuenteId === fuenteId;
      if (sinCambios) {
        continue;
      }

      const ahora = performance.now();
      const origen = ultimoBracket ? ultimoBracket.destino : v.position;
      const origenMs = ultimoBracket ? ultimoBracket.destinoMs : ahora - this.renderDelayMs;

      const caminoFuturoAnterior = ultimoBracket?.caminoFuturo ?? [];
      const idxDestino = caminoFuturoAnterior.findIndex((p) => p.x === v.position.x && p.y === v.position.y);
      const hayCaminoReal = idxDestino > 0;
      const puenteSeguro = hayCaminoReal ? null : puenteManhattanSeguro(origen, v.position, blockedStreets);
      const waypoints = hayCaminoReal ? caminoFuturoAnterior.slice(0, idxDestino + 1) : puenteSeguro ?? [];
      const origenSeguro = hayCaminoReal || puenteSeguro ? origen : v.position;

      const caminoFuturo = rutaActiva?.waypoints ?? v.returnPath;

      cola.push({
        origen: origenSeguro,
        origenMs,
        destino: v.position,
        destinoMs: ahora,
        waypoints,
        caminoFuturo,
        fuenteId,
      });
      huboLoteNuevo = true;
      if (cola.length > 8) {
        cola.splice(0, cola.length - 8);
      }
    }

    if (huboLoteNuevo) {
      this.loteCount += 1;
      if (this.loteCount >= 2) {
        this.buffering = false;
      }
    }
  }

  /** Calcula el snapshot "ahora mismo" -- puro respecto al estado interno, se puede llamar tanto
   * desde el bucle de render (push a suscriptores) como bajo demanda (pull, ver getSnapshotNow).
   * Efecto colateral intencional: consume (shift) tramos ya reproducidos del todo -- es seguro
   * llamarlo mas de una vez por frame desde distintos lugares, siempre converge al mismo tramo
   * vigente para el renderTimeMs de ese instante. */
  private computeSnapshot(): EngineSnapshot {
    const ahoraReal = performance.now();
    const renderTimeMs = ahoraReal - this.renderDelayMs;

    if (ahoraReal - this.bufferingDesdeMs > this.renderDelayMs * 2) {
      this.buffering = false;
    }

    const vehiclePositions = new Map<string, Point>();
    for (const [id, cola] of this.vehicleBuffers) {
      while (cola.length > 1 && renderTimeMs >= cola[0].destinoMs) {
        cola.shift();
      }
      const bracket = cola[0];
      if (!bracket) continue;
      const punto = renderTimeMs < bracket.origenMs ? bracket.origen : posicionInterpolada(bracket, renderTimeMs);
      vehiclePositions.set(id, punto);
    }

    separarPosicionesSuperpuestas(vehiclePositions);

    const segundosDesdeUltimoLote = Math.round((ahoraReal - this.relojInstanteConocidoMs) / 1000);
    const nowSimMs = this.avanzando && this.relojMarcaConocidaMs != null && this.k > 0
      ? this.relojMarcaConocidaMs + this.k * segundosDesdeUltimoLote * 1000
      : this.relojMarcaConocidaMs;

    return { vehiclePositions, buffering: this.buffering, nowSimMs, segundosDesdeUltimoLote };
  }

  /** Lectura bajo demanda (pull) sin suscribirse -- para consumidores de baja frecuencia como
   * SimClock, que no necesitan re-renderizar 60 veces por segundo. */
  getSnapshotNow(): EngineSnapshot {
    return this.computeSnapshot();
  }

  /** Suscripcion de alta frecuencia (push, un callback por frame) -- para el mapa, que muta
   * marcadores de Leaflet directamente sin pasar por el ciclo de render de React. */
  subscribe(fn: (snap: EngineSnapshot) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private tick = (): void => {
    const snap = this.computeSnapshot();
    for (const fn of this.listeners) {
      fn(snap);
    }
    this.rafId = requestAnimationFrame(this.tick);
  };

  start(): void {
    if (this.rafId == null) {
      this.rafId = requestAnimationFrame(this.tick);
    }
  }

  stop(): void {
    if (this.rafId != null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }
}

export const simulationEngine = new SimulationEngine();

// Bug real corregido (AS-IS investigado en vivo: "el front se queda pegado por mucho tiempo" en
// pruebas live, pese a que el backend seguia mandando lotes normalmente): confirmado con la
// documentacion oficial de Chromium que requestAnimationFrame se DETIENE por completo (no se
// retrasa) en pestañas en segundo plano -- sin este manejo, el bucle de render del motor se
// congelaba en silencio al perder foco y nunca se reanudaba solo. Como cada tramo guarda
// timestamps REALES (no deltas acumulados), simplemente reanudar el rAF al volver es suficiente:
// no hace falta ninguna logica de "recuperar el tiempo perdido", el primer frame post-regreso ya
// calcula renderTimeMs fresco contra el reloj real y cae en el lugar correcto de la cola (que
// siguio llenandose via WebSocket mientras la pestaña estaba oculta, porque solo el rAF se pausa).
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      simulationEngine.stop();
    } else {
      simulationEngine.start();
    }
  });
  if (!document.hidden) {
    simulationEngine.start();
  }
}
