import React from 'react';
import { SEMAFORO_CONFIGS } from '../../utils/vehicleStatus';

/**
 * Leyenda fija del mapa -- antes no existia ninguna en ningun lado (el usuario tenia que recordar
 * que significa cada color, o pasar el mouse sobre un marcador para descubrirlo via tooltip).
 * Puramente informativa, no cambia ningun comportamiento del mapa.
 */
export const MapLegend: React.FC = () => {
  const estadosVehiculo = [
    SEMAFORO_CONFIGS.on_time,
    SEMAFORO_CONFIGS.at_risk,
    SEMAFORO_CONFIGS.delayed,
    SEMAFORO_CONFIGS.inactive,
  ];

  return (
    <div className="absolute bottom-3 left-3 z-20 rounded-lg border border-slate-700/80 bg-slate-900/90 backdrop-blur-sm px-3 py-2 text-[10px] text-slate-300 space-y-1.5 pointer-events-none select-none">
      <div className="font-semibold text-slate-200 uppercase tracking-wide text-[9px]">Leyenda</div>
      <div className="flex flex-wrap gap-x-3 gap-y-1">
        {estadosVehiculo.map((s) => (
          <div key={s.state} className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: s.hex }} />
            <span>{s.shortLabel}</span>
          </div>
        ))}
        {/* Color propio (no es parte del semaforo oficial de riesgo SLA) -- ver
            LeafletManhattanMap: VehiculoDTO.actividad=EN_REFRIGERIO. */}
        <div className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: '#0D9488' }} />
          <span>En refrigerio</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="h-0.5 w-3 rounded-full bg-[#C62828] shrink-0" />
          <span>Bloqueo vial</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm border border-slate-400 bg-slate-700 shrink-0" />
          <span>Almacén</span>
        </div>
      </div>
    </div>
  );
};
