import { Point } from './route';

export type VehicleType = 'car' | 'motorcycle' | 'bicycle';

export type VehicleStatus = 'en_route' | 'delivering' | 'on_break' | 'broken' | 'idle' | 'maintenance';

export type BreakdownType = 1 | 2 | 3;

export interface BreakdownInfo {
  type: BreakdownType;
  typeName: string; // 'Avería Tipo 1 (Menor)' | 'Avería Tipo 2 (Intermedia)' | 'Avería Tipo 3 (Mayor)'
  reason: string;
  startMinute: number;
  locationAtBreakdown: Point;
  maxSiteStayMinutes: number; // 120 para T1, 240 (4h) para T2 & T3
  towedToCentral: boolean; // trasladado a Almacén Central
  towedMinute?: number;
  returnToOperationMinute: number;
  returnShiftDescription: string;
  untransferredPackagesToCentral?: number;
}

/** Desde `t` y hasta el punto siguiente, el vehiculo hace `act` (ActividadVehiculo). */
export interface TrajectoryPoint {
  x: number;
  y: number;
  t: number;
  act: 'INACTIVO' | 'VIAJANDO' | 'ENTREGANDO' | 'EN_REFRIGERIO';
}

export interface Vehicle {
  id: string;
  code: string; // Formato TTNN (ej. TA01, TB03, TM02)
  type: VehicleType;
  capacity: number;
  currentLoad: number;
  speed: number; // km/h
  status: VehicleStatus;
  position: Point;
  destination?: Point;
  /** VehiculoDTO.geometriaRetorno (camino real al almacén más cercano) cuando la unidad ya
   * entregó todo pero aún no llega de vuelta -- vacío en cualquier otro caso. */
  returnPath: Point[];
  /** Minutos simulados que faltan para que termine la fase actual (entrega/refrigerio) --
   * derivado de VehiculoDTO.actividadDesde + la duración configurada (tiempoServicioClienteHoras /
   * duracionRefrigerioHoras). undefined cuando status no es 'delivering'/'on_break'. */
  activityRemainingMinutes?: number;
  /** VehiculoDTO.actividadDesde tal cual (instante simulado ISO) -- se usa para pautar la
   * animacion del tramo de llegada (ver LeafletManhattanMap): si el vehiculo viajo Y empezo a
   * entregar dentro del MISMO lote, esto permite saber que fraccion de ese lote fue viaje real
   * vs. espera ya detenido, en vez de estirar la animacion de viaje a lo largo de todo el lote. */
  activitySince?: string;
  /** VehiculoDTO.trayectoria con el instante ya convertido a ms (misma convención que
   * Date.parse(marcaTiempoActual)) -- la reproduce engine/simulationEngine. */
  trajectory: TrajectoryPoint[];
  historyPath: Point[];
  assignedOrderIds: string[];
  batteryFuel?: number; // 0 - 100%
  breakdownType?: BreakdownType;
  breakdownInfo?: BreakdownInfo;
  breakdownReason?: string;
  maintenanceReason?: string;
  totalDelivered: number;
  homeWarehouseId: string;
  driverId?: string;
}

export type VehicleSemaforoState = 'on_time' | 'at_risk' | 'delayed' | 'inactive';

export interface VehicleSemaforoConfig {
  state: VehicleSemaforoState;
  hex: string;
  label: string;
  shortLabel: string;
  description: string;
  iconName: 'circle' | 'triangle' | 'warning' | 'inactive';
}

export interface PreventiveMaintenanceRecord {
  id: string;
  year: number;
  month: number;
  day: number;
  dateKey: string; // YYYYMMDD
  dateFormatted: string; // YYYY-MM-DD
  vehicleCode: string; // TTNN
  sourceFileName?: string;
}

export interface MaintenanceFileResult {
  fileName: string;
  records: PreventiveMaintenanceRecord[];
  rawContent: string;
}
