import { Point } from '../types';

/**
 * Info de sincronizacion para interpolar suavemente la posicion de un vehiculo entre dos lotes
 * consecutivos -- portado tal cual desde LeafletManhattanMap (ver simulationEngine.ts para el
 * porque del traslado). Un tramo es SIEMPRE el resultado de dos snapshots reales consecutivos del
 * backend; origen/destino nunca son posiciones visuales intermedias.
 */
export interface SincroVehiculo {
  origen: Point;
  /** Instante REAL (performance.now()) en que el lote que reporto `origen` llego al front. */
  origenMs: number;
  destino: Point;
  /** Instante REAL en que el lote que reporto `destino` llego al front -- SIEMPRE posterior a
   * origenMs por construccion (es el lote inmediatamente siguiente). */
  destinoMs: number;
  /** Camino para ANIMAR el tramo origen->destino -- real y a salvo de bloqueos. Vacio cuando no
   * hay con que reconstruirlo -- en ese caso la interpolacion geometrica cae a una linea recta. */
  waypoints: Point[];
  /** Camino real conocido HACIA ADELANTE desde destino -- se guarda para que el PROXIMO tramo
   * pueda reconstruirse recortando este mismo camino. */
  caminoFuturo: Point[];
  /** Identifica la fuente del tramo (ruta activa o "retorno") para detectar un cambio de ruta
   * aunque la posicion reportada coincida. */
  fuenteId: string;
}

/** Snapshot que el motor entrega a cada frame (push, via subscribe) o bajo demanda (pull, via
 * getSnapshotNow) -- es la UNICA fuente de verdad de "donde esta todo ahora mismo" para toda la
 * UI (mapa, reloj, badges de actividad). */
export interface EngineSnapshot {
  /** Posicion interpolada de cada vehiculo en este instante retrasado. Un id ausente del mapa
   * significa "todavia no hay suficiente buffer para este vehiculo" -- el consumidor no debe
   * mover su marcador, no asumir (0,0). */
  vehiclePositions: Map<string, Point>;
  /** true mientras el buffer de interpolacion no tiene su primer tramo completo (ver
   * simulationEngine.ts) -- el consumidor (el mapa) debe tapar su contenido con un loader. */
  buffering: boolean;
  /** Hora simulada actual, extrapolada por `k` desde el ultimo marcaTiempoActual real conocido.
   * null si todavia no llego ningun dato. */
  nowSimMs: number | null;
  /** Segundos reales desde que marcaTiempoActual cambio por ultima vez -- para indicadores de
   * "actualizado hace Xs" / "estancado". */
  segundosDesdeUltimoLote: number;
}
