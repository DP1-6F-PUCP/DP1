import React from 'react';
import { Circle, AlertTriangle, AlertOctagon, MinusCircle } from 'lucide-react';
import { Vehicle, Order, SystemConfig } from '../types';

export type VehicleSemaforoState = 'on_time' | 'at_risk' | 'delayed' | 'inactive';

export interface VehicleSemaforoConfig {
  state: VehicleSemaforoState;
  hex: string;
  label: string;
  shortLabel: string;
  description: string;
  iconName: 'circle' | 'triangle' | 'warning' | 'inactive';
}

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
  config?: SystemConfig
): VehicleSemaforoConfig {
  const warningThreshold = config?.vehicleThresholds?.warningDeviationMinutes ?? 15;
  const dangerThreshold = config?.vehicleThresholds?.dangerDelayMinutes ?? 30;

  // 1. Averías o mantenimientos son incidencias críticas inmediatas -> Retrasado / incidencia (#C62828)
  if (vehicle.status === 'broken' || vehicle.status === 'maintenance') {
    return SEMAFORO_CONFIGS.delayed;
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

  // 4. Evaluar retrasos y riesgos contra umbrales configurables
  let hasDanger = false;
  let hasWarning = false;

  for (const order of activeOrders) {
    const delayMinutes = simMinutes - order.deadlineMinute;

    if (order.status === 'delayed' || order.status === 'collapsed' || delayMinutes > dangerThreshold) {
      hasDanger = true;
      break;
    }

    const marginMinutes = order.deadlineMinute - simMinutes;
    if (order.status === 'at_risk' || marginMinutes <= warningThreshold) {
      hasWarning = true;
    }
  }

  if (hasDanger) {
    return SEMAFORO_CONFIGS.delayed;
  }

  if (hasWarning) {
    return SEMAFORO_CONFIGS.at_risk;
  }

  // 5. En ruta a tiempo dentro del ETA -> Verde (#2E7D32)
  return SEMAFORO_CONFIGS.on_time;
}

interface SemaforoBadgeProps {
  status: VehicleSemaforoConfig;
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
  className?: string;
}

/**
 * Componente accesible para mostrar el estado de semaforización.
 * Cumple con accesibilidad para daltonismo: color + ícono geométrico distintivo + etiqueta textual.
 */
export const SemaforoBadge: React.FC<SemaforoBadgeProps> = ({
  status,
  size = 'md',
  showLabel = true,
  className = '',
}) => {
  const iconSize = size === 'sm' ? 14 : size === 'lg' ? 20 : 16;
  const iconClass = size === 'sm' ? 'h-3.5 w-3.5' : size === 'lg' ? 'h-5 w-5' : 'h-4 w-4';

  const renderIcon = () => {
    switch (status.iconName) {
      case 'circle':
        // Círculo relleno para 'en ruta'
        return (
          <svg
            width={iconSize}
            height={iconSize}
            viewBox="0 0 16 16"
            fill="currentColor"
            aria-label="Círculo de estado en ruta a tiempo"
            className="shrink-0"
          >
            <circle cx="8" cy="8" r="6" />
          </svg>
        );
      case 'triangle':
        // Triángulo para 'en riesgo'
        return (
          <svg
            width={iconSize}
            height={iconSize}
            viewBox="0 0 16 16"
            fill="currentColor"
            aria-label="Triángulo de estado en riesgo de retraso"
            className="shrink-0"
          >
            <path d="M8 2 L15 14 L1 14 Z" />
          </svg>
        );
      case 'warning':
        // Ícono de advertencia para 'retrasado'
        return (
          <AlertOctagon
            className={`${iconClass} shrink-0`}
            aria-label="Octágono de advertencia de estado retrasado"
          />
        );
      case 'inactive':
      default:
        // Círculo con guión / neutro para inactivo
        return (
          <MinusCircle
            className={`${iconClass} shrink-0`}
            aria-label="Círculo de estado sin asignar o inactivo"
          />
        );
    }
  };

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded font-medium text-xs border ${className}`}
      style={{
        backgroundColor: `${status.hex}18`,
        borderColor: `${status.hex}40`,
        color: status.hex,
      }}
      title={`${status.label}: ${status.description}`}
      aria-label={`Estado operativo: ${status.label}`}
    >
      {renderIcon()}
      {showLabel && <span className="font-semibold">{status.label}</span>}
    </span>
  );
};
