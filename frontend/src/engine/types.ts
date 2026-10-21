import { BlockedStreet, Order, Point, Route, Vehicle, Warehouse } from '../types';
import type { EstadoOperacionDTO } from '../types/backend';

/** Estado completo de la operación tal como lo reportó UN lote (ya adaptado para la UI). */
export interface FrameData {
  vehicles: Vehicle[];
  routes: Route[];
  orders: Order[];
  warehouses: Warehouse[];
  blockedStreets: BlockedStreet[];
  estadoRaw: EstadoOperacionDTO | undefined;
}

/**
 * Lo que la UI debe mostrar AHORA, en el mismo instante retrasado en que el mapa dibuja las
 * posiciones -- ver simulationEngine.getEstadoVisual. Antes solo la posición iba retrasada; el
 * reloj, los badges, el semáforo, la línea de ruta y el panel usaban el dato en vivo, ~sa+margen
 * segundos reales por delante del mapa (con k=150, casi una hora simulada).
 */
export interface EstadoVisual extends FrameData {
  /** Instante simulado visible (ms, misma convención que Date.parse de marcaTiempoActual). */
  marcaVisibleMs: number | null;
}

/** Vehiculos detenidos en el mismo punto; `clave` identifica el punto entre frames. */
export interface GrupoDetenido {
  clave: string;
  punto: Point;
  ids: string[];
}

/** Snapshot que el motor entrega a cada frame (push, via subscribe) o bajo demanda (pull, via
 * getSnapshotNow). */
export interface EngineSnapshot {
  /** Posicion de cada vehiculo en el instante visible, sobre su trayectoria real. Un id ausente
   * significa "todavia no hay datos para este vehiculo" -- el consumidor no debe mover su
   * marcador. */
  vehiclePositions: Map<string, Point>;
  /** Vehiculos detenidos en un mismo punto (2 o mas), p. ej. en un almacen: el mapa los dibuja
   * como un solo marcador con contador. */
  gruposDetenidos: GrupoDetenido[];
  /** true mientras no hay al menos dos lotes en el buffer -- el mapa tapa su contenido con un
   * loader. */
  buffering: boolean;
  /** Hora simulada en el MISMO instante que las posiciones: interpolada entre las marcas de los
   * dos lotes que encierran el render (o extrapolada por `k` si todavia no llego el siguiente).
   * null si todavia no llego ningun dato. */
  nowSimMs: number | null;
  /** Segundos reales desde que llego el ultimo lote -- para "actualizado hace Xs" / "estancado". */
  segundosDesdeUltimoLote: number;
}
