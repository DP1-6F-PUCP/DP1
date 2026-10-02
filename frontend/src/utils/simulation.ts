import {
  Vehicle,
  Order,
  Warehouse,
  BlockedStreet,
  AlertItem,
  SimulationState,
  SystemConfig,
  Point,
  VehicleType,
  BreakdownType,
} from '../types';
import {
  GRID_WIDTH_KM,
  GRID_HEIGHT_KM,
  INITIAL_WAREHOUSES,
  generateManhattanPath,
  manhattanDistance,
} from './manhattan';

export const INITIAL_CONFIG: SystemConfig = {
  theme: 'light',
  routingStrategy: 'anti_collapse',
  fleetCounts: {
    car: 6,
    motorcycle: 10,
    bicycle: 8,
  },
  fleetSpeeds: {
    car: 50,
    motorcycle: 60,
    bicycle: 20,
  },
  warehouseCapacities: {
    central: Infinity,
    northwest: 1000,
    east: 1000,
  },
  orderGenerationRatePerHour: 110,
  slaMinutes: 120, // 2 hours SLA
  riskMarginMinutes: 35, // within 35 mins of deadline = at_risk
  breakdownFrequency: 'medium',
  showProjectedRoutes: true,
  showHistoryTrails: true,
  showBlockedStreets: true,
  showCoverageZones: true,
  showOrderPins: true,
  vehicleThresholds: {
    warningDeviationMinutes: 15,
    dangerDelayMinutes: 30,
  },
};

// Helper to generate a random point on the Manhattan grid
export function getRandomGridPoint(): Point {
  return {
    x: Math.floor(Math.random() * (GRID_WIDTH_KM - 4)) + 2,
    y: Math.floor(Math.random() * (GRID_HEIGHT_KM - 4)) + 2,
  };
}

export function getVehicleTypePrefix(type: VehicleType): 'TA' | 'TB' | 'TM' {
  switch (type) {
    case 'car':
      return 'TA';
    case 'bicycle':
      return 'TB';
    case 'motorcycle':
      return 'TM';
  }
}

export function formatVehicleCode(type: VehicleType, correlative: number): string {
  const prefix = getVehicleTypePrefix(type);
  const nn = String(correlative).padStart(2, '0');
  return `${prefix}${nn}`;
}

export function createInitialFleet(
  counts: { car: number; motorcycle: number; bicycle: number },
  warehouses: Warehouse[],
  blockedStreets: BlockedStreet[],
  speeds: { car: number; motorcycle: number; bicycle: number } = { car: 50, motorcycle: 60, bicycle: 20 }
): Vehicle[] {
  const fleet: Vehicle[] = [];

  // Códigos de unidades TTNN: TA (Autos), TB (Bicicletas), TM (Motos)
  const types: { type: VehicleType; count: number; prefix: 'TA' | 'TB' | 'TM'; speed: number; cap: number }[] = [
    { type: 'car', count: counts.car, prefix: 'TA', speed: speeds.car, cap: 40 },
    { type: 'bicycle', count: counts.bicycle, prefix: 'TB', speed: speeds.bicycle, cap: 6 },
    { type: 'motorcycle', count: counts.motorcycle, prefix: 'TM', speed: speeds.motorcycle, cap: 16 },
  ];

  types.forEach((t) => {
    for (let i = 0; i < t.count; i++) {
      const correlativeStr = String(i + 1).padStart(2, '0');
      const vehicleCode = `${t.prefix}${correlativeStr}`;
      const vehicleId = `veh-${t.prefix.toLowerCase()}${correlativeStr}`;

      const warehouse = warehouses[i % warehouses.length];
      const dest = getRandomGridPoint();
      
      // Bicycles stay closer to warehouse
      const finalDest = t.type === 'bicycle'
        ? {
            x: Math.max(2, Math.min(GRID_WIDTH_KM - 2, warehouse.coords.x + (Math.floor(Math.random() * 16) - 8))),
            y: Math.max(2, Math.min(GRID_HEIGHT_KM - 2, warehouse.coords.y + (Math.floor(Math.random() * 16) - 8))),
          }
        : dest;

      const path = generateManhattanPath(warehouse.coords, finalDest, blockedStreets);
      const p0 = path[0] || warehouse.coords;
      const p1 = path[1] || finalDest;

      // Start on the grid line connecting p0 and p1
      let startX = p0.x;
      let startY = p0.y;
      if (p0.y === p1.y) {
        // Horizontal line
        const fraction = ((i % 4) + 1) / 5;
        startX = Math.round(p0.x + (p1.x - p0.x) * fraction);
        startY = p0.y;
      } else if (p0.x === p1.x) {
        // Vertical line
        const fraction = ((i % 4) + 1) / 5;
        startX = p0.x;
        startY = Math.round(p0.y + (p1.y - p0.y) * fraction);
      }

      fleet.push({
        id: vehicleId,
        code: vehicleCode,
        type: t.type,
        capacity: t.cap,
        currentLoad: Math.floor(t.cap * (0.4 + Math.random() * 0.5)),
        speed: t.speed,
        status: i % 7 === 0 ? 'delivering' : 'en_route',
        position: {
          x: startX,
          y: startY,
        },
        destination: finalDest,
        plannedPath: path.slice(1),
        historyPath: [{ ...warehouse.coords }],
        assignedOrderIds: [`pkg-${vehicleCode}-1`, `pkg-${vehicleCode}-2`],
        batteryFuel: Math.floor(65 + Math.random() * 32),
        totalDelivered: Math.floor(8 + Math.random() * 15),
        homeWarehouseId: warehouse.id,
      });
    }
  });

  return fleet;
}

export function createInitialOrders(fleet: Vehicle[], warehouses: Warehouse[]): Order[] {
  const orders: Order[] = [];
  const count = 48;
  const effectiveWarehouses = warehouses && warehouses.length > 0 ? warehouses : INITIAL_WAREHOUSES;
  const effectiveFleet = fleet && fleet.length > 0 ? fleet : [];

  for (let i = 1; i <= count; i++) {
    const warehouse = effectiveWarehouses[i % effectiveWarehouses.length];
    const destination = getRandomGridPoint();
    const createdMinute = Math.floor(Math.random() * 40);
    const deadlineMinute = createdMinute + 90 + Math.floor(Math.random() * 60);
    
    // Status distribution: All active orders are strictly on_time or at_risk.
    // Delayed/collapsed orders CANNOT exist during active simulation (they represent failure/end of simulation).
    let status: Order['status'] = 'on_time';
    if (i % 6 === 0) status = 'at_risk';
    if (i % 5 === 0) status = 'delivered';

    const assignedVehicle = effectiveFleet.length > 0 ? effectiveFleet[i % effectiveFleet.length] : undefined;

    orders.push({
      id: `pkg-${1000 + i}`,
      code: `PK-${1000 + i}`,
      warehouseOriginId: warehouse ? warehouse.id : 'central',
      destination,
      createdMinute,
      deadlineMinute,
      status,
      assignedVehicleId: status !== 'delivered' && assignedVehicle && Math.random() > 0.15 ? assignedVehicle.id : undefined,
      urgency: status === 'at_risk' ? 'priority' : 'normal',
      deliveredMinute: status === 'delivered' ? createdMinute + 45 : undefined,
    });
  }

  return orders;
}

export function createInitialAlerts(): AlertItem[] {
  return [
    {
      id: 'alt-1',
      type: 'blockage',
      title: 'Bloqueo Crítico: Troncal Av. 45 Este',
      description: 'Corte total en carril troncal. Desvío forzado de rutas con retraso proyectado +24 min.',
      urgency: 'critical',
      timestamp: '08:42:10',
      simMinute: 42,
      location: { x: 45, y: 22 },
    },
    {
      id: 'alt-2',
      type: 'overflow',
      title: 'Almacén Nor-Oeste al 84% de Capacidad',
      description: 'Llegada de paquetes superior a la tasa de despacho. Recomendado rebalancear a Central.',
      urgency: 'high',
      timestamp: '08:35:00',
      simMinute: 35,
      relatedWarehouseId: 'northwest',
    },
    {
      id: 'alt-3',
      type: 'breakdown',
      title: 'Avería Mecánica: TA04 en Cuadrante Central',
      description: 'Fallo en transmisión de embrague. 18 paquetes a bordo reasignados a TM03 y TM05.',
      urgency: 'high',
      timestamp: '08:18:22',
      simMinute: 18,
      relatedVehicleId: 'veh-ta04',
      location: { x: 28, y: 19 },
    },
    {
      id: 'alt-4',
      type: 'blockage',
      title: 'Obras de Pavimentación en Eje 38',
      description: 'Paso restringido a ciclorutas. Autos y motos redirigidos por Av. 42.',
      urgency: 'medium',
      timestamp: '07:50:00',
      simMinute: 0,
      location: { x: 28, y: 38 },
    },
  ];
}

export function createInitialSimState(): SimulationState {
  const startDate = new Date();
  startDate.setHours(7, 0, 0, 0); // Empieza a las 07:00 al inicio de la 1ª Jornada

  return {
    scenario: 'realtime',
    isRunning: false,
    speedMultiplier: 1,
    simMinutes: 0,
    startDate,
    day: 1,
    shift: 'Primera Jornada',
    collapseScore: 28,
    timeToCollapseEstHours: 19.5,
    isCollapsed: false,
    dayMetrics: [
      {
        day: 1,
        deliveredOrders: 142,
        atRiskOrders: 12,
        delayedOrders: 0,
        collapsedOrders: 0,
        fleetUtilizationPct: 82,
        avgWarehouseCapacityPct: 62,
      },
      {
        day: 2,
        deliveredOrders: 158,
        atRiskOrders: 18,
        delayedOrders: 0,
        collapsedOrders: 0,
        fleetUtilizationPct: 88,
        avgWarehouseCapacityPct: 68,
      },
      {
        day: 3,
        deliveredOrders: 139,
        atRiskOrders: 27,
        delayedOrders: 0,
        collapsedOrders: 0,
        fleetUtilizationPct: 93,
        avgWarehouseCapacityPct: 79,
      },
      {
        day: 4,
        deliveredOrders: 124,
        atRiskOrders: 38,
        delayedOrders: 0,
        collapsedOrders: 0,
        fleetUtilizationPct: 96,
        avgWarehouseCapacityPct: 88,
      },
      {
        day: 5,
        deliveredOrders: 98,
        atRiskOrders: 54,
        delayedOrders: 0,
        collapsedOrders: 0,
        fleetUtilizationPct: 99,
        avgWarehouseCapacityPct: 94,
      },
    ],
  };
}

/**
 * Determina la jornada laboral de 8 horas según la hora simulada:
 * - 07:00 a 14:59 -> Primera Jornada (07:00 - 15:00)
 * - 15:00 a 22:59 -> Segunda Jornada (15:00 - 23:00)
 * - 23:00 a 06:59 -> Tercera Jornada (23:00 - 07:00)
 */
export function getShiftFromDate(date: Date): {
  shift: 'Primera Jornada' | 'Segunda Jornada' | 'Tercera Jornada';
  schedule: string;
} {
  const hours = date.getHours();
  if (hours >= 7 && hours < 15) {
    return { shift: 'Primera Jornada', schedule: '07:00 - 15:00' };
  } else if (hours >= 15 && hours < 23) {
    return { shift: 'Segunda Jornada', schedule: '15:00 - 23:00' };
  } else {
    return { shift: 'Tercera Jornada', schedule: '23:00 - 07:00' };
  }
}

/**
 * Format simulated time string (HH:MM:SS)
 */
export function formatSimulatedTime(startDate: Date, simMinutes: number): string {
  const d = new Date(startDate.getTime() + simMinutes * 60 * 1000);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

/**
 * Format simulated date string (DD Mon YYYY)
 */
export function formatSimulatedDate(startDate: Date, dayOffset: number): string {
  const d = new Date(startDate.getTime() + (dayOffset - 1) * 24 * 60 * 60 * 1000);
  const day = String(d.getDate()).padStart(2, '0');
  const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
  const mon = months[d.getMonth()];
  const year = d.getFullYear();
  return `${day} ${mon} ${year}`;
}

/**
 * Format exact simulated date given elapsed minutes
 */
export function formatExactSimulatedDate(startDate: Date, simMinutes: number): string {
  const d = new Date(startDate.getTime() + simMinutes * 60 * 1000);
  const day = String(d.getDate()).padStart(2, '0');
  const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
  const mon = months[d.getMonth()];
  const year = d.getFullYear();
  return `${day} ${mon} ${year}`;
}

/**
 * Format date for HTML5 <input type="date"> (YYYY-MM-DD)
 */
export function formatDateForInput(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Format simulation end date (exact +5 days from startDate)
 */
export function formatSimulatedEndDate(startDate: Date): string {
  const end = new Date(startDate.getTime() + 5 * 24 * 60 * 60 * 1000);
  const day = String(end.getDate()).padStart(2, '0');
  const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
  const mon = months[end.getMonth()];
  const year = end.getFullYear();
  const hh = String(end.getHours()).padStart(2, '0');
  const mm = String(end.getMinutes()).padStart(2, '0');
  return `${day} ${mon} ${year}, ${hh}:${mm}`;
}

/**
 * Retorna el final del siguiente turno respecto a la fecha simulada dada.
 * Jornadas:
 * - Primera Jornada: 07:00 a 15:00
 * - Segunda Jornada: 15:00 a 23:00
 * - Tercera Jornada: 23:00 a 07:00
 */
export function getNextShiftEnd(date: Date): Date {
  const h = date.getHours();
  const nextEnd = new Date(date);
  nextEnd.setMinutes(0, 0, 0);

  if (h >= 7 && h < 15) {
    // Primera Jornada (07:00 - 15:00).
    // Siguiente turno: Segunda Jornada (15:00 - 23:00). Termina a las 23:00 del mismo día.
    nextEnd.setHours(23);
    return nextEnd;
  } else if (h >= 15 && h < 23) {
    // Segunda Jornada (15:00 - 23:00).
    // Siguiente turno: Tercera Jornada (23:00 - 07:00). Termina a las 07:00 del día siguiente.
    nextEnd.setDate(nextEnd.getDate() + 1);
    nextEnd.setHours(7);
    return nextEnd;
  } else {
    // Tercera Jornada (23:00 - 07:00).
    // Siguiente turno: Primera Jornada (07:00 - 15:00). Termina a las 15:00.
    if (h >= 23) {
      nextEnd.setDate(nextEnd.getDate() + 1);
      nextEnd.setHours(15);
    } else {
      nextEnd.setHours(15);
    }
    return nextEnd;
  }
}

/**
 * Calcula los parámetros operativos de una avería según su tipo (1, 2 o 3)
 * - Tipo 1: No disponible por 2 horas. Solución rápida en sitio (llanta desinflada).
 * - Tipo 2: No disponible hasta final del siguiente turno. Permanece máx 4h en sitio y se traslada al Almacén Central.
 * - Tipo 3: No disponible por al menos 2 días por mantenimiento y retorna en turno 15:00 a 23:00. Permanece máx 4h en sitio y se traslada al Almacén Central.
 */
export function calculateBreakdownParameters(
  type: BreakdownType,
  startMinute: number,
  startDate: Date,
  customReason?: string
): {
  type: BreakdownType;
  typeName: string;
  reason: string;
  maxSiteStayMinutes: number;
  returnToOperationMinute: number;
  returnShiftDescription: string;
} {
  const curSimDate = new Date(startDate.getTime() + startMinute * 60 * 1000);

  if (type === 1) {
    const returnMinute = startMinute + 120; // 2 horas de no disponibilidad
    return {
      type: 1,
      typeName: 'Avería Tipo 1 (Menor)',
      reason: customReason || 'Neumático desinflado (solución en sitio en 2h)',
      maxSiteStayMinutes: 120,
      returnToOperationMinute: returnMinute,
      returnShiftDescription: 'Retorno en sitio tras 2 horas',
    };
  } else if (type === 2) {
    const nextShiftEndDate = getNextShiftEnd(curSimDate);
    const returnMinute = Math.round(
      (nextShiftEndDate.getTime() - startDate.getTime()) / (60 * 1000)
    );

    return {
      type: 2,
      typeName: 'Avería Tipo 2 (Intermedia)',
      reason: customReason || 'Rotura de faja/cadena del sistema de transmisión',
      maxSiteStayMinutes: 240, // Permanece máx 4 horas en el lugar
      returnToOperationMinute: Math.max(startMinute + 240, returnMinute),
      returnShiftDescription: `Retorno en Almacén Central al fin del siguiente turno (${formatExactSimulatedDate(startDate, returnMinute)} ${formatSimulatedTime(startDate, returnMinute)})`,
    };
  } else {
    // Tipo 3: no disponible por al menos 2 días (48 horas) y retorna en turno 15:00 a 23:00
    const minMaintenanceDate = new Date(curSimDate.getTime() + 48 * 60 * 60 * 1000);
    const returnDate = new Date(minMaintenanceDate);
    const h = returnDate.getHours();

    if (h < 15) {
      returnDate.setHours(15, 0, 0, 0);
    } else if (h >= 23) {
      returnDate.setDate(returnDate.getDate() + 1);
      returnDate.setHours(15, 0, 0, 0);
    } else {
      // Ya cae dentro de la franja 15:00-23:00
      returnDate.setMinutes(0, 0, 0);
    }

    const returnMinute = Math.round(
      (returnDate.getTime() - startDate.getTime()) / (60 * 1000)
    );

    return {
      type: 3,
      typeName: 'Avería Tipo 3 (Mayor)',
      reason: customReason || 'Falla mayor en motor / mantenimiento general (≥ 2 días)',
      maxSiteStayMinutes: 240, // Permanece máx 4 horas en el lugar
      returnToOperationMinute: Math.max(startMinute + 240, returnMinute),
      returnShiftDescription: `Retorno en Almacén Central en turno 15:00-23:00 (${formatExactSimulatedDate(startDate, returnMinute)} ${formatSimulatedTime(startDate, returnMinute)})`,
    };
  }
}

