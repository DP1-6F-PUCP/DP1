import { Point, Route, TrajectoryPoint, Vehicle, VehicleStatus } from '../types';
import { EngineSnapshot, EstadoVisual, FrameData } from './types';

/**
 * Motor de simulacion del front: singleton fuera del arbol de React, unica fuente de verdad del
 * "ahora" visual (reloj simulado + posicion y estado de cada vehiculo).
 *
 * Como funciona: el backend manda, por cada lote, la TRAYECTORIA REAL de cada vehiculo (cada nodo
 * por el que paso con su instante simulado, y donde empezo/termino cada pausa -- ver
 * VehiculoDTO.trayectoria). El motor:
 *   1. guarda cada lote como un cuadro (estado completo + instante REAL en que llego);
 *   2. renderiza con un retraso fijo (sa + margen) para tener siempre el lote siguiente ya en mano;
 *   3. convierte ese instante real retrasado en un instante SIMULADO interpolando entre las marcas
 *      de los dos lotes que lo encierran (relojEnRender);
 *   4. ubica cada vehiculo en su trayectoria en ese instante simulado -- y su estado visible
 *      (viajando / entregando / refrigerio) sale de la misma trayectoria.
 *
 * Antes el backend solo mandaba la posicion final de cada lote y el motor adivinaba el camino
 * (geometria del lote anterior o una "L" Manhattan) y los tiempos (todo el lote en movimiento).
 * Con la replanificacion por lote esa adivinanza fallaba seguido: diagonales, vehiculos
 * "moviendose" mientras entregaban, paradas intermedias invisibles, saltos al llegar.
 */

/** Respaldo de `renderDelayMs` mientras todavia no se conoce `sa`. */
const RENDER_DELAY_RESPALDO_MS = 20_000;

/**
 * Margen (ms) que se suma a `sa*60000` para formar `renderDelayMs`. El lote nuevo llega por
 * WebSocket (el backend revisa cada 250ms) o, si el socket se cae, por el polling de respaldo
 * (cada 3s): sin margen, ese retraso hacia que el render alcanzara el final del ultimo lote
 * recibido antes de tener el siguiente, y el vehiculo se congelaba y luego saltaba (reporte
 * directo: "se queda parado y luego salta de posicion" en CINCO_DIAS).
 */
const MARGEN_LATENCIA_POLLING_MS = 6_000;

const MAX_CUADROS = 12;
/** Cuanto historial de trayectoria se conserva detras del instante visible (ms simulados). */
const HISTORIAL_TRAYECTORIA_MS = 6 * 3600_000;

/** Un lote tal como llego al front: su estado completo + el instante REAL en que llego. */
interface Cuadro {
  arrivalMs: number;
  marca: string | null;
  marcaMs: number | null;
  data: FrameData;
}

interface PosicionEnLinea {
  punto: Point;
  /** Nodo entero del ultimo punto alcanzado (para mostrar coordenadas en el panel). */
  nodo: Point;
  act: TrajectoryPoint['act'];
  moviendo: boolean;
}

/** Posicion de un vehiculo en su trayectoria en el instante simulado `t`. Los puntos consecutivos
 * son nodos vecinos (tramos rectos) o el mismo nodo (pausa); dos puntos con el mismo instante y
 * distinta posicion son un traslado instantaneo (p. ej. averia tipo 2/3 al almacen central). */
function posicionEn(linea: TrajectoryPoint[], t: number): PosicionEnLinea | null {
  if (linea.length === 0) return null;
  let i = 0;
  // Ultimo punto con instante <= t (ante empates, el ultimo: un traslado instantaneo ya ocurrio).
  for (let j = 0; j < linea.length; j++) {
    if (linea[j].t <= t) i = j;
    else break;
  }
  const a = linea[i];
  const b = linea[i + 1];
  if (!b || t <= a.t || b.t <= a.t) {
    return { punto: { x: a.x, y: a.y }, nodo: { x: a.x, y: a.y }, act: a.act, moviendo: false };
  }
  const f = (t - a.t) / (b.t - a.t);
  const moviendo = a.x !== b.x || a.y !== b.y;
  return {
    punto: { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f },
    nodo: { x: a.x, y: a.y },
    act: a.act,
    moviendo,
  };
}

/** Bug real reportado (captura: un vehiculo en refrigerio "no se ve en el mapa"): varios
 * vehiculos DETENIDOS en el mismo punto exacto (tipicamente el almacen central) se dibujan uno
 * encima de otro. Se abren en un abanico chico y deterministico. Los que solo estan pasando por
 * encima no se agrupan (antes saltaban al abanico en plena animacion). */
function separarPosicionesSuperpuestas(posiciones: Map<string, Point>, enMovimiento: Set<string>): void {
  const grupos = new Map<string, string[]>();
  for (const [id, p] of posiciones) {
    if (enMovimiento.has(id)) continue;
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

/** Estado visible de un vehiculo segun lo que hace en su trayectoria en este instante. Averia y
 * mantenimiento mandan sobre la trayectoria (el vehiculo no opera). */
function statusVisible(base: VehicleStatus, act: TrajectoryPoint['act'] | undefined): VehicleStatus {
  if (base === 'broken' || base === 'maintenance' || !act) return base;
  switch (act) {
    case 'ENTREGANDO':
      return 'delivering';
    case 'EN_REFRIGERIO':
      return 'on_break';
    case 'VIAJANDO':
      return 'en_route';
    default:
      return 'idle';
  }
}

export interface IngestParams {
  vehicles: Vehicle[];
  routes: Route[];
  /** Estado completo del lote (para los cuadros que alimentan getEstadoVisual). */
  frame: FrameData;
  idEjecucion: string | undefined;
  sa: number | undefined;
  marcaTiempoActual: string | null;
  k: number;
  avanzando: boolean;
}

class SimulationEngine {
  private renderDelayMs = RENDER_DELAY_RESPALDO_MS;
  private idEjecucionAnterior: string | undefined;
  private buffering = true;
  private bufferingDesdeMs = performance.now();

  /** Trayectoria acumulada de cada vehiculo (lotes consecutivos encadenados). */
  private lineas = new Map<string, TrajectoryPoint[]>();
  /** Camino planificado mas reciente (geometria de su ruta, o de regreso) -- para la linea de ruta. */
  private futuros = new Map<string, Point[]>();

  private relojMarcaConocidaValor: string | null = null;
  private relojMarcaConocidaMs: number | null = null;
  private relojInstanteConocidoMs = performance.now();
  private k = 0;
  private avanzando = false;

  private listeners = new Set<(snap: EngineSnapshot) => void>();
  private rafId: number | null = null;

  private cuadros: Cuadro[] = [];
  private estadoVisual: EstadoVisual | null = null;
  private claveVisual = '';
  private visualListeners = new Set<() => void>();
  private ultimoSimNow: number | null = null;

  /** Llamado cada vez que cambian los datos en vivo (push WS o poll) -- NUNCA desde el render. */
  ingest(params: IngestParams): void {
    const { vehicles, routes, frame, idEjecucion, sa, marcaTiempoActual, k, avanzando } = params;

    this.renderDelayMs = sa && sa > 0 ? sa * 60_000 + MARGEN_LATENCIA_POLLING_MS : RENDER_DELAY_RESPALDO_MS;
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
    if (idEjecucion) {
      this.idEjecucionAnterior = idEjecucion;
    }
    if (huboResetDeEjecucion) {
      this.lineas.clear();
      this.futuros.clear();
      this.cuadros = [];
      this.estadoVisual = null;
      this.claveVisual = '';
      this.bufferingDesdeMs = performance.now();
      this.buffering = true;
      // Se espera a que `vehicles` refleje la ejecucion nueva (el refetch/WS lo trae en breve).
      return;
    }

    const loteNuevo = this.registrarCuadro(frame, marcaTiempoActual);

    const idsActuales = new Set(vehicles.map((v) => v.id));
    for (const id of this.lineas.keys()) {
      if (!idsActuales.has(id)) {
        this.lineas.delete(id);
        this.futuros.delete(id);
      }
    }

    for (const v of vehicles) {
      const rutaActiva = routes.find((r) => r.vehicleId === v.id && r.status === 'in_progress');
      this.futuros.set(v.id, rutaActiva?.waypoints ?? v.returnPath ?? []);
      if (loteNuevo) {
        this.agregarTrayectoria(v);
      }
    }

    if (this.cuadros.length >= 2) {
      this.buffering = false;
    }
  }

  /** Encadena la trayectoria del lote recien llegado a la acumulada del vehiculo. */
  private agregarTrayectoria(v: Vehicle): void {
    let linea = this.lineas.get(v.id);
    if (!linea) {
      linea = [];
      this.lineas.set(v.id, linea);
    }
    const nuevos = v.trajectory.length > 0
      ? v.trajectory
      : this.relojMarcaConocidaMs != null
        ? [{ x: v.position.x, y: v.position.y, t: this.relojMarcaConocidaMs, act: 'INACTIVO' as const }]
        : [];
    for (const p of nuevos) {
      const ultimo = linea[linea.length - 1];
      if (ultimo && p.t < ultimo.t) continue; // nunca hacia atras
      if (ultimo && p.t === ultimo.t && p.x === ultimo.x && p.y === ultimo.y && p.act === ultimo.act) continue;
      linea.push(p);
    }
  }

  /** Agrega el cuadro de un lote nuevo (true) o actualiza el ultimo si es el MISMO lote, p. ej.
   * porque llego despues la lista de pedidos (false). */
  private registrarCuadro(data: FrameData, marca: string | null): boolean {
    const ultimo = this.cuadros[this.cuadros.length - 1];
    if (ultimo && ultimo.marca === marca) {
      ultimo.data = data;
      this.claveVisual = '';
      return false;
    }
    this.cuadros.push({ arrivalMs: performance.now(), marca, marcaMs: marca ? Date.parse(marca) : null, data });
    if (this.cuadros.length > MAX_CUADROS) {
      this.cuadros.splice(0, this.cuadros.length - MAX_CUADROS);
    }
    return true;
  }

  /** Indice del ultimo cuadro que ya habia llegado en el instante de render (o el primero). */
  private indiceCuadro(renderTimeMs: number): number {
    let idx = 0;
    for (let i = 0; i < this.cuadros.length; i++) {
      if (this.cuadros[i].arrivalMs <= renderTimeMs) idx = i;
      else break;
    }
    return idx;
  }

  /** Instante simulado que corresponde al instante real de render: interpolado entre las marcas
   * de los dos lotes que lo encierran; si el siguiente todavia no llego, extrapolado por k (solo
   * si la ejecucion avanza). */
  private relojEnRender(renderTimeMs: number): number | null {
    if (this.cuadros.length === 0) return this.relojMarcaConocidaMs;
    const i = this.indiceCuadro(renderTimeMs);
    const actual = this.cuadros[i];
    if (actual.marcaMs == null) return null;
    if (renderTimeMs < actual.arrivalMs) return actual.marcaMs;
    const siguiente = this.cuadros[i + 1];
    if (siguiente && siguiente.marcaMs != null && siguiente.arrivalMs > actual.arrivalMs) {
      const f = Math.min(1, (renderTimeMs - actual.arrivalMs) / (siguiente.arrivalMs - actual.arrivalMs));
      return actual.marcaMs + f * (siguiente.marcaMs - actual.marcaMs);
    }
    return this.avanzando && this.k > 0 ? actual.marcaMs + this.k * (renderTimeMs - actual.arrivalMs) : actual.marcaMs;
  }

  /** Snapshot "ahora mismo" -- se llama desde el bucle de render (push) o bajo demanda (pull). */
  private computeSnapshot(): EngineSnapshot {
    const ahoraReal = performance.now();
    const renderTimeMs = ahoraReal - this.renderDelayMs;

    if (ahoraReal - this.bufferingDesdeMs > this.renderDelayMs * 2) {
      this.buffering = false;
    }

    const simNow = this.relojEnRender(renderTimeMs);
    this.ultimoSimNow = simNow;

    const vehiclePositions = new Map<string, Point>();
    const enMovimiento = new Set<string>();
    const estados = new Map<string, PosicionEnLinea>();
    if (simNow != null) {
      for (const [id, linea] of this.lineas) {
        // Poda: conserva poco historial detras del instante visible.
        while (linea.length > 2 && linea[1].t < simNow - HISTORIAL_TRAYECTORIA_MS) linea.shift();
        const pos = posicionEn(linea, simNow);
        if (!pos) continue;
        vehiclePositions.set(id, pos.punto);
        estados.set(id, pos);
        if (pos.moviendo) enMovimiento.add(id);
      }
    }

    separarPosicionesSuperpuestas(vehiclePositions, enMovimiento);
    this.actualizarEstadoVisual(renderTimeMs, simNow, estados);

    const segundosDesdeUltimoLote = Math.round((ahoraReal - this.relojInstanteConocidoMs) / 1000);
    return { vehiclePositions, buffering: this.buffering, nowSimMs: simNow, segundosDesdeUltimoLote };
  }

  /**
   * Recalcula el estado visible y avisa a sus suscriptores solo si cambio. Base: el cuadro del
   * lote que se esta reproduciendo (el primero cuya marca alcanza el instante visible). El estado
   * de cada vehiculo (viajando / entregando / refrigerio / inactivo) sale de su trayectoria en
   * ese instante -- el mismo dato que mueve su marcador, asi que nunca se contradicen.
   */
  private actualizarEstadoVisual(renderTimeMs: number, simNow: number | null, estados: Map<string, PosicionEnLinea>): void {
    if (this.cuadros.length === 0) return;
    let base = this.cuadros[this.indiceCuadro(renderTimeMs)];
    if (simNow != null) {
      const enReproduccion = this.cuadros.find((c) => c.marcaMs != null && c.marcaMs >= simNow);
      if (enReproduccion) base = enReproduccion;
    }

    let firma = '';
    for (const v of base.data.vehicles) {
      const e = estados.get(v.id);
      firma += `${v.id}:${e?.act ?? '-'}:${e?.nodo.x ?? ''},${e?.nodo.y ?? ''};`;
    }
    const clave = `${base.arrivalMs}|${firma}`;
    if (clave === this.claveVisual) return;
    this.claveVisual = clave;

    const vehicles = base.data.vehicles.map((v) => {
      const e = estados.get(v.id);
      if (!e) return v;
      return { ...v, status: statusVisible(v.status, e.act), position: e.nodo };
    });
    this.estadoVisual = { ...base.data, vehicles, marcaVisibleMs: simNow ?? base.marcaMs };
    for (const fn of this.visualListeners) fn();
  }

  /** Estado que la UI debe mostrar ahora (mismo instante que el mapa). Referencia estable
   * mientras no cambie -- apta para useSyncExternalStore. null si aun no hay datos. */
  getEstadoVisual = (): EstadoVisual | null => this.estadoVisual;

  subscribeVisual = (fn: () => void): (() => void) => {
    this.visualListeners.add(fn);
    return () => {
      this.visualListeners.delete(fn);
    };
  };

  getSnapshotNow(): EngineSnapshot {
    return this.computeSnapshot();
  }

  /**
   * Linea de ruta de UN vehiculo, continua y en el mismo instante que su marcador: desde su
   * posicion actual, por lo que le falta recorrer de la trayectoria ya recibida, y luego por su
   * camino planificado (geometria del ultimo lote) hasta el destino. null si no hay datos.
   */
  getRutaVisible(vehicleId: string): Point[] | null {
    const linea = this.lineas.get(vehicleId);
    const simNow = this.ultimoSimNow;
    if (!linea || linea.length === 0 || simNow == null) return null;
    const actual = posicionEn(linea, simNow);
    if (!actual) return null;
    const camino: Point[] = [actual.punto];
    for (const p of linea) {
      if (p.t > simNow) {
        const ultimo = camino[camino.length - 1];
        if (ultimo.x !== p.x || ultimo.y !== p.y) camino.push({ x: p.x, y: p.y });
      }
    }
    const futuro = this.futuros.get(vehicleId) ?? [];
    const fin = camino[camino.length - 1];
    const idx = futuro.findIndex((p) => p.x === fin.x && p.y === fin.y);
    camino.push(...(idx >= 0 ? futuro.slice(idx + 1) : []));
    return camino;
  }

  /** Suscripcion de alta frecuencia (un callback por frame) -- para el mapa. */
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

// requestAnimationFrame se DETIENE por completo en pestañas en segundo plano (documentacion de
// Chromium) -- sin esto, el bucle de render se congelaba en silencio al perder foco. Como todo se
// calcula contra el reloj real (no deltas acumulados), basta con reanudar el rAF al volver.
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
