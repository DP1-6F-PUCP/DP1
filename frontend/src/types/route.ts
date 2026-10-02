export interface Point {
  x: number;
  y: number;
}

export type ScenarioType = 'realtime' | 'five_days' | 'collapse';

export interface Route {
  id: string;
  vehicleId: string;
  vehicleCode: string;
  origin: Point;
  destination: Point;
  waypoints: Point[];
  distanceKm: number;
  estimatedDurationMinutes: number;
  status: 'planned' | 'in_progress' | 'completed' | 'blocked';
  assignedOrderCount: number;
}

export interface Warehouse {
  id: string;
  name: string;
  shortName: string;
  code: string;
  coords: Point;
  capacity: number; // max packages (Infinity para central)
  currentStock: number;
  inTransit: number;
  dispatchRatePerHour: number;
  color: string;
}

export interface BlockedStreet {
  id: string;
  name: string;
  start: Point;
  end: Point;
  orientation: 'horizontal' | 'vertical';
  severity: 'critical' | 'high' | 'medium';
  reason: string;
  reportedTime: string;
  clearingEtaMinutes?: number;
}

export interface AlertItem {
  id: string;
  type: 'breakdown' | 'blockage' | 'overflow' | 'collapse_warning' | 'sla_risk' | 'sla_warning' | 'delay';
  title: string;
  description: string;
  urgency: 'critical' | 'high' | 'medium' | 'low';
  timestamp: string;
  simMinute: number;
  location?: Point;
  relatedVehicleId?: string;
  relatedWarehouseId?: string;
  breakdownType?: number;
}

export interface DayMetrics {
  day: number;
  deliveredOrders: number;
  atRiskOrders: number;
  delayedOrders: number;
  collapsedOrders?: number;
  fleetUtilizationPct: number;
  avgWarehouseCapacityPct: number;
}

export interface SimulationState {
  scenario: ScenarioType;
  isRunning: boolean;
  speedMultiplier: number;
  simMinutes: number;
  startDate: Date | string; // Date o ISO 8601
  day: number;
  shift: string;
  collapseScore: number;
  timeToCollapseEstHours: number;
  isCollapsed: boolean;
  collapseTimestamp?: string;
  collapseCause?: string;
  dayMetrics: DayMetrics[];
}

export interface SystemConfig {
  theme: 'dark' | 'light';
  routingStrategy?: 'anti_collapse' | 'min_cost' | 'balanced';
  fleetCounts: {
    car: number;
    motorcycle: number;
    bicycle: number;
  };
  fleetSpeeds: {
    car: number;
    motorcycle: number;
    bicycle: number;
  };
  warehouseCapacities: {
    central: number;
    northwest: number;
    east: number;
  };
  orderGenerationRatePerHour: number;
  slaMinutes: number;
  riskMarginMinutes: number;
  breakdownFrequency: 'low' | 'medium' | 'high';
  showProjectedRoutes: boolean;
  showHistoryTrails: boolean;
  showBlockedStreets: boolean;
  showCoverageZones: boolean;
  showOrderPins: boolean;
  vehicleThresholds?: {
    warningDeviationMinutes: number;
    dangerDelayMinutes: number;
  };
}
