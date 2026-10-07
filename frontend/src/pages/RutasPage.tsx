import React from 'react';
import { RouteListContainer } from '../features/rutas/components/RouteListContainer';
import { MapSlot } from '../components/map/MapSlot';

export const RutasPage: React.FC = () => {
  return (
    <div className="flex-1 flex h-full overflow-hidden bg-[#0B111E] text-slate-100">
      {/* Panel Izquierdo: Lista de Rutas y Operaciones */}
      <aside className="w-96 border-r border-slate-800 bg-slate-900/95 flex flex-col p-4 overflow-hidden shrink-0">
        <div className="mb-3">
          <h2 className="text-base font-bold text-white">Planificación de Rutas</h2>
          <p className="text-xs text-slate-400">
            Enrutamiento Manhattan con evasión dinámica de bloqueos viales
          </p>
        </div>
        <div className="flex-1 overflow-hidden">
          <RouteListContainer />
        </div>
      </aside>

      {/* Panel Derecho: Mapa en Vivo (persistente, ver router/index.tsx + MapSlot) */}
      <MapSlot className="flex-1 relative h-full" />
    </div>
  );
};
