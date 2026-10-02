import { Point } from './route';

export type VehicleType = 'car' | 'motorcycle' | 'bicycle';

export type VehicleStatus = 'en_route' | 'delivering' | 'broken' | 'idle' | 'maintenance';

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
  plannedPath: Point[]; // Waypoints Manhattan
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
