import React from 'react';
import { Vehicle } from '../../../types';
import { getVehicleSemaforoStatus } from '../../../utils/vehicleStatus';

export interface VehicleMarkerProps {
  vehicle: Vehicle;
  isSelected?: boolean;
  onSelect?: (vehicle: Vehicle) => void;
  kmToSvgY: (kmY: number) => number;
  simMinutes?: number;
  isDarkTheme?: boolean;
}

export const VehicleMarker: React.FC<VehicleMarkerProps> = ({
  vehicle,
  isSelected = false,
  onSelect,
  kmToSvgY,
  simMinutes = 0,
  isDarkTheme = true,
}) => {
  const semaforo = getVehicleSemaforoStatus(vehicle, [], simMinutes);
  const svgY = kmToSvgY(vehicle.position.y);

  // Eliminar puntos verdes y amarillos del mapa
  if ((semaforo.state === 'on_time' || semaforo.state === 'at_risk') && !isSelected) {
    return null;
  }

  const isDelayed = semaforo.state === 'delayed';
  const bubbleFill = isDelayed
    ? '#C62828'
    : isSelected
    ? (isDarkTheme ? '#38bdf8' : '#1F3864')
    : semaforo.hex;

  return (
    <g
      id={`marker-vehicle-${vehicle.id}`}
      className="interactive-node cursor-pointer group select-none"
      onClick={(e) => {
        e.stopPropagation();
        onSelect?.(vehicle);
      }}
      transform={`translate(${vehicle.position.x}, ${svgY})`}
      aria-label={`${vehicle.code}: ${semaforo.label}`}
    >
      {/* Halo de selección */}
      {isSelected && (
        <circle
          cx="0"
          cy="0"
          r="1.4"
          fill="none"
          stroke="#38bdf8"
          strokeWidth="0.15"
          className="animate-pulse"
        />
      )}

      {/* Sombra base */}
      <circle cx="0" cy="0.1" r="0.85" fill="#000000" fillOpacity="0.3" />

      {/* Icono de fondo con color de semáforo (sin puntos verdes ni amarillos) */}
      <circle
        cx="0"
        cy="0"
        r="0.8"
        fill={bubbleFill}
        stroke={isSelected ? '#38bdf8' : '#ffffff'}
        strokeWidth={isSelected ? '0.18' : '0.12'}
      />

      {/* Ícono interno geométrico accesible solo para retrasos o inactivos */}
      {isDelayed && (
        <rect x="-0.22" y="-0.22" width="0.44" height="0.44" rx="0.06" fill="#ffffff" />
      )}
      {semaforo.state === 'inactive' && (
        <line x1="-0.25" y1="0" x2="0.25" y2="0" stroke="#ffffff" strokeWidth="0.12" strokeLinecap="round" />
      )}

      {/* Etiqueta TTNN (TA01, etc.) */}
      <text
        x="0"
        y="-1.1"
        textAnchor="middle"
        fontSize="0.55"
        fontWeight="bold"
        fill={isDarkTheme ? '#f8fafc' : '#0f172a'}
        stroke={isDarkTheme ? '#020617' : '#ffffff'}
        strokeWidth="0.1"
        paintOrder="stroke fill"
        className="font-mono-code pointer-events-none"
      >
        {vehicle.code}
      </text>
    </g>
  );
};
