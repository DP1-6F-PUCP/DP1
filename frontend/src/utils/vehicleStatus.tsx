import React from 'react';
import { AlertOctagon, MinusCircle } from 'lucide-react';
import {
  VehicleSemaforoConfig,
  VehicleSemaforoState,
  BreakdownLevelConfig,
  BREAKDOWN_LEVEL_CONFIGS,
  getBreakdownLevelConfig,
  VEHICLE_TYPE_META,
  SEMAFORO_CONFIGS,
  getVehicleSemaforoStatus,
} from './vehicleBreakdown';

export {
  type VehicleSemaforoConfig,
  type VehicleSemaforoState,
  type BreakdownLevelConfig,
  BREAKDOWN_LEVEL_CONFIGS,
  getBreakdownLevelConfig,
  VEHICLE_TYPE_META,
  SEMAFORO_CONFIGS,
  getVehicleSemaforoStatus,
};

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
