import React from 'react';
import { Route } from '../../../types';
import { StatusBadge } from '../../../components/StatusBadge';
import { Navigation, Clock, Package, RotateCcw } from 'lucide-react';

export interface RouteCardProps {
  route: Route;
  isSelected?: boolean;
  onSelectRoute?: (route: Route) => void;
  onRecalculate?: (routeId: string) => void;
  isRecalculating?: boolean;
}

export const RouteCard: React.FC<RouteCardProps> = ({
  route,
  isSelected = false,
  onSelectRoute,
  onRecalculate,
  isRecalculating = false,
}) => {
  return (
    <div
      onClick={() => onSelectRoute?.(route)}
      className={`p-3.5 rounded-xl border transition-all cursor-pointer select-none ${
        isSelected
          ? 'bg-blue-900/30 border-blue-500 ring-1 ring-blue-500/50 shadow-md'
          : 'bg-slate-900/60 hover:bg-slate-800/80 border-slate-700/60 text-slate-200'
      }`}
    >
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-blue-500/20 text-blue-400 border border-blue-500/30">
            <Navigation className="h-4 w-4" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-mono-code font-bold text-sm text-white">
                {route.vehicleCode}
              </span>
              <span className="text-[10px] text-slate-400">({route.id})</span>
            </div>
            <div className="text-[10px] text-slate-400">
              Origen ({route.origin.x}, {route.origin.y}) ➔ Destino ({route.destination.x},{' '}
              {route.destination.y})
            </div>
          </div>
        </div>
        <StatusBadge status={route.status} type="route" size="sm" />
      </div>

      <div className="grid grid-cols-3 gap-2 my-2 text-xs">
        <div className="p-1.5 rounded-lg bg-slate-950/50 border border-slate-800">
          <span className="text-[10px] text-slate-400 block">Distancia</span>
          <span className="font-mono-code font-semibold text-slate-100">{route.distanceKm} km</span>
        </div>
        <div className="p-1.5 rounded-lg bg-slate-950/50 border border-slate-800">
          <span className="text-[10px] text-slate-400 block flex items-center gap-0.5">
            <Clock className="h-3 w-3" /> Tiempo
          </span>
          <span className="font-mono-code font-semibold text-slate-100">
            ~{route.estimatedDurationMinutes} min
          </span>
        </div>
        <div className="p-1.5 rounded-lg bg-slate-950/50 border border-slate-800">
          <span className="text-[10px] text-slate-400 block flex items-center gap-0.5">
            <Package className="h-3 w-3" /> Pedidos
          </span>
          <span className="font-mono-code font-semibold text-slate-100">
            {route.assignedOrderCount}
          </span>
        </div>
      </div>

      {onRecalculate && (
        <div className="pt-2 border-t border-slate-800 flex justify-end">
          <button
            type="button"
            disabled={isRecalculating}
            onClick={(e) => {
              e.stopPropagation();
              onRecalculate(route.id);
            }}
            className="text-[11px] font-medium py-1 px-2.5 rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-200 inline-flex items-center gap-1.5 transition-colors disabled:opacity-50"
          >
            <RotateCcw className={`h-3 w-3 ${isRecalculating ? 'animate-spin' : ''}`} />
            Recalcular Ruta Manhattan
          </button>
        </div>
      )}
    </div>
  );
};
