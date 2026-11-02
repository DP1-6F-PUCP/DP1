import { Vehicle, Order, BreakdownType, VehicleType } from '../types';
import { UMBRALES_SEMAFORO_DEFAULT, UmbralesSemaforo } from '../store/semaforoStore';

export type VehicleSemaforoState = 'on_time' | 'at_risk' | 'delayed' | 'inactive';

export interface VehicleSemaforoConfig {
  state: VehicleSemaforoState;
  hex: string;
  label: string;
  shortLabel: string;
  description: string;
  iconName: 'circle' | 'triangle' | 'warning' | 'inactive';
}

export interface BreakdownLevelConfig {
  type: BreakdownType;
  code: 'A1' | 'A2' | 'A3';
  shortLabel: string;
  label: string;
  severityLabel: string;
  unavailableText: string;
  siteStayText: string;
  transferText: string;
  exampleText: string;
  hex: string;
  badgeClass: string;
  activeFilterClass: string;
  panelClass: string;
}

export const BREAKDOWN_LEVEL_CONFIGS: Record<BreakdownType, BreakdownLevelConfig> = {
  1: {
    type: 1,
    code: 'A1',
    shortLabel: 'Avería T1 · Menor',
    label: 'Avería Tipo 1 (Menor)',
    severityLabel: 'Menor',
    unavailableText: 'No disponible por 2 horas',
    siteStayText: 'Permanece en el lugar de la avería por 2 horas',
    transferText: 'Se soluciona en el sitio (sin traslado al Almacén Central)',
    exampleText: 'Ej. Llanta desinflada que se soluciona pronto',
    hex: '#8B5CF6',
    badgeClass: 'border-violet-500/60 bg-violet-950/80 text-violet-200',
    activeFilterClass: 'bg-violet-600 text-white border-violet-400 shadow-sm font-semibold',
    panelClass: 'border-violet-500/40 bg-violet-950/35 text-violet-100',
  },
  2: {
    type: 2,
    code: 'A2',
    shortLabel: 'Avería T2 · Intermedia',
    label: 'Avería Tipo 2 (Intermedia)',
    severityLabel: 'Intermedia',
    unavailableText: 'No disponible hasta el final del siguiente turno',
    siteStayText: 'Permanece en el lugar por 4 horas como máximo',
    transferText: 'Tras 4h en sitio, traslado instantáneo al Almacén Central con paquetes no trasvasados',
    exampleText: 'Ej. El sistema de transmisión (faja/cadena) se rompe',
    hex: '#EC4899',
    badgeClass: 'border-pink-500/60 bg-pink-950/80 text-pink-200',
    activeFilterClass: 'bg-pink-600 text-white border-pink-400 shadow-sm font-semibold',
    panelClass: 'border-pink-500/40 bg-pink-950/35 text-pink-100',
  },
  3: {
    type: 3,
    code: 'A3',
    shortLabel: 'Avería T3 · Mayor',
    label: 'Avería Tipo 3 (Mayor)',
    severityLabel: 'Mayor',
    unavailableText: 'No disponible por al menos 2 días · Retorna en turno 15:00 a 23:00',
    siteStayText: 'Permanece en el lugar de la avería por 4 horas',
    transferText: 'Tras 4h en sitio, traslado instantáneo al Almacén Central con paquetes no trasvasados',
    exampleText: 'Ej. Mantenimiento mayor prolongado',
    hex: '#14B8A6',
    badgeClass: 'border-teal-500/60 bg-teal-950/80 text-teal-200',
    activeFilterClass: 'bg-teal-600 text-white border-teal-400 shadow-sm font-semibold',
    panelClass: 'border-teal-500/40 bg-teal-950/35 text-teal-100',
  },
};

export function getBreakdownLevelConfig(type?: BreakdownType): BreakdownLevelConfig | null {
  return type ? BREAKDOWN_LEVEL_CONFIGS[type] ?? null : null;
}

export const VEHICLE_TYPE_META: Record<
  VehicleType,
  { codePrefix: 'TA' | 'TM' | 'TB'; shortLabel: string; label: string; badgeClass: string }
> = {
  car: {
    codePrefix: 'TA',
    shortLabel: 'Auto · TA',
    label: 'Auto / Camioneta (TA)',
    badgeClass: 'border-blue-500/40 bg-blue-500/15 text-blue-300',
  },
  motorcycle: {
    codePrefix: 'TM',
    shortLabel: 'Moto · TM',
    label: 'Motocicleta (TM)',
    badgeClass: 'border-purple-500/40 bg-purple-500/15 text-purple-300',
  },
  bicycle: {
    codePrefix: 'TB',
    shortLabel: 'Bici · TB',
    label: 'Bicicleta (TB)',
    badgeClass: 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300',
  },
};

export const SEMAFORO_CONFIGS: Record<VehicleSemaforoState, VehicleSemaforoConfig> = {
  on_time: {
    state: 'on_time',
    hex: '#2E7D32',
    label: 'En ruta / a tiempo',
    shortLabel: 'A tiempo',
    description: 'El vehículo avanza dentro del tiempo estimado de la ruta',
    iconName: 'circle',
  },
  at_risk: {
    state: 'at_risk',
    hex: '#F9A825',
    label: 'En riesgo de retraso',
    shortLabel: 'En riesgo',
    description: 'El vehículo presenta una desviación que pone en riesgo el ETA',
    iconName: 'triangle',
  },
  delayed: {
    state: 'delayed',
    hex: '#C62828',
    label: 'Retrasado / incidencia',
    shortLabel: 'Retrasado',
    description: 'El vehículo está retrasado, detenido o presenta una avería',
    iconName: 'warning',
  },
  inactive: {
    state: 'inactive',
    hex: '#9E9E9E',
    label: 'Sin asignar / inactivo',
    shortLabel: 'Inactivo',
    description: 'El vehículo no tiene una ruta activa asignada',
    iconName: 'inactive',
  },
};

export function getVehicleSemaforoStatus(
  vehicle: Vehicle,
  orders: Order[],
  simMinutes: number,
  umbrales: UmbralesSemaforo = UMBRALES_SEMAFORO_DEFAULT
): VehicleSemaforoConfig {
  // 1. Una avería es una incidencia crítica inmediata -> Retrasado / incidencia (#C62828),
  //    diferenciando visualmente el nivel de avería (Tipo 1, Tipo 2 o Tipo 3) si está presente.
  if (vehicle.status === 'broken') {
    const breakdownCfg = getBreakdownLevelConfig(vehicle.breakdownType);
    if (breakdownCfg) {
      return {
        ...SEMAFORO_CONFIGS.delayed,
        hex: breakdownCfg.hex,
        label: breakdownCfg.shortLabel,
        shortLabel: breakdownCfg.code,
        description: `${breakdownCfg.label}: ${breakdownCfg.unavailableText}. ${breakdownCfg.siteStayText}.`,
      };
    }
    return SEMAFORO_CONFIGS.delayed;
  }
  // El mantenimiento preventivo es PROGRAMADO, no un retraso: la unidad queda fuera de servicio sin
  // pedidos -> Sin asignar / inactivo (#9E9E9E). Antes contaba como "Retraso" en el semáforo de flota
  // sin que hubiera ningún pedido atrasado (reportado: "veo uno en retraso pero no en la pantalla").
  if (vehicle.status === 'maintenance') {
    return SEMAFORO_CONFIGS.inactive;
  }

  // 2. Si no tiene pedidos asignados o estado inactivo -> Sin asignar / inactivo (#9E9E9E)
  if (
    vehicle.status === 'idle' ||
    !vehicle.assignedOrderIds ||
    vehicle.assignedOrderIds.length === 0
  ) {
    return SEMAFORO_CONFIGS.inactive;
  }

  // 3. Revisar pedidos asignados activos
  const activeOrders = orders.filter(
    (o) =>
      (vehicle.assignedOrderIds.includes(o.id) || o.assignedVehicleId === vehicle.id) &&
      o.status !== 'delivered'
  );

  if (activeOrders.length === 0) {
    return SEMAFORO_CONFIGS.inactive;
  }

  // 4. Evaluar la holgura frente al plazo contra los rangos configurados (store/semaforoStore).
  //    Superar el plazo detiene la simulación, así que el rojo tiene que avisar ANTES de que ocurra.
  let hasDanger = false;
  let hasWarning = false;

  for (const order of activeOrders) {
    const marginMinutes = order.deadlineMinute - simMinutes;

    if (order.status === 'delayed' || order.status === 'collapsed' || marginMinutes <= umbrales.retrasoMinutos) {
      hasDanger = true;
      break;
    }

    if (order.status === 'at_risk' || marginMinutes <= umbrales.riesgoMinutos) {
      hasWarning = true;
    }
  }

  if (hasDanger) {
    return SEMAFORO_CONFIGS.delayed;
  }

  if (hasWarning) {
    return SEMAFORO_CONFIGS.at_risk;
  }

  return SEMAFORO_CONFIGS.on_time;
}
