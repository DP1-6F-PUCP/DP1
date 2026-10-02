import React from 'react';
import { Circle, AlertTriangle, AlertOctagon, MinusCircle, CheckCircle2, Clock } from 'lucide-react';
import { VehicleSemaforoState } from '../types';

export interface StatusBadgeProps {
  status: string;
  type?: 'semaforo' | 'order' | 'route' | 'vehicle';
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
  className?: string;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({
  status,
  type = 'semaforo',
  size = 'md',
  showLabel = true,
  className = '',
}) => {
  const iconSize = size === 'sm' ? 12 : size === 'lg' ? 18 : 14;

  // Semaforo / Vehicle state mapping
  if (type === 'semaforo' || type === 'vehicle') {
    const semaforoState = (status as VehicleSemaforoState) || 'inactive';
    let hex = '#9E9E9E';
    let label = 'Inactivo';
    let Icon = MinusCircle;

    if (semaforoState === 'on_time' || status === 'en_route') {
      hex = '#2E7D32';
      label = 'A tiempo';
      Icon = Circle;
    } else if (semaforoState === 'at_risk') {
      hex = '#F9A825';
      label = 'En riesgo';
      Icon = AlertTriangle;
    } else if (semaforoState === 'delayed' || status === 'broken') {
      hex = '#C62828';
      label = status === 'broken' ? 'Averiado' : 'Retrasado';
      Icon = AlertOctagon;
    } else if (status === 'maintenance') {
      hex = '#7E22CE';
      label = 'Mantenimiento';
      Icon = Clock;
    }

    return (
      <span
        className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded font-medium text-xs border ${className}`}
        style={{
          backgroundColor: `${hex}18`,
          borderColor: `${hex}40`,
          color: hex,
        }}
        title={label}
        aria-label={`Estado: ${label}`}
      >
        <Icon size={iconSize} className="shrink-0" />
        {showLabel && <span className="font-semibold">{label}</span>}
      </span>
    );
  }

  // Order status
  if (type === 'order') {
    let hex = '#2E7D32';
    let label = 'A tiempo';
    let Icon = CheckCircle2;

    if (status === 'at_risk') {
      hex = '#F9A825';
      label = 'En riesgo';
      Icon = AlertTriangle;
    } else if (status === 'delayed' || status === 'collapsed') {
      hex = '#C62828';
      label = 'Retrasado';
      Icon = AlertOctagon;
    } else if (status === 'delivered') {
      hex = '#0284C7';
      label = 'Entregado';
      Icon = CheckCircle2;
    }

    return (
      <span
        className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded font-medium text-xs border ${className}`}
        style={{
          backgroundColor: `${hex}18`,
          borderColor: `${hex}40`,
          color: hex,
        }}
      >
        <Icon size={iconSize} className="shrink-0" />
        {showLabel && <span className="font-semibold">{label}</span>}
      </span>
    );
  }

  // Default Route status
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded font-medium text-xs border bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700 ${className}`}
    >
      <Circle size={iconSize} className="shrink-0 fill-current" />
      {showLabel && <span className="font-semibold capitalize">{status}</span>}
    </span>
  );
};
