import React, { useState } from 'react';
import { useRoutes } from '../hooks/useRoutes';
import { RouteCard } from './RouteCard';
import { useMapStore } from '../../../store/mapStore';
import { Route } from '../../../types';
import { useToast } from '../../../components/ToastProvider';
import { Search, Filter, Loader2, Route as RouteIcon } from 'lucide-react';

export const RouteListContainer: React.FC = () => {
  const { routes, isLoading, isError, recalculateRoute, isRecalculating } = useRoutes();
  const selectedRouteId = useMapStore((s) => s.selectedRouteId);
  const setSelectedRouteId = useMapStore((s) => s.setSelectedRouteId);
  const setSelectedVehicleId = useMapStore((s) => s.setSelectedVehicleId);
  const { addToast } = useToast();

  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'planned' | 'in_progress' | 'completed'>('all');

  const handleSelectRoute = (route: Route) => {
    setSelectedRouteId(route.id);
    setSelectedVehicleId(route.vehicleId);
  };

  const handleRecalculate = (routeId: string) => {
    recalculateRoute(routeId, {
      onSuccess: () => {
        addToast({
          type: 'success',
          title: 'Ruta recalculada',
          description: `Se optimizó la trayectoria Manhattan evitando bloqueos activos.`,
        });
      },
      onError: (err) => {
        addToast({
          type: 'error',
          title: 'Error al recalcular ruta',
          description: (err as Error)?.message || 'No se pudo comunicar con el ruteador.',
        });
      },
    });
  };

  const filteredRoutes = routes.filter((r) => {
    const matchesSearch =
      r.vehicleCode.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.id.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || r.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-slate-400 gap-2">
        <Loader2 className="h-6 w-6 animate-spin text-blue-400" />
        <span className="text-xs">Cargando rutas de despacho...</span>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="p-4 rounded-xl border border-rose-500/30 bg-rose-950/20 text-rose-300 text-xs">
        Ocurrió un problema al obtener las rutas activas del despachador.
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full space-y-3">
      {/* Controles y Búsqueda */}
      <div className="space-y-2">
        <div className="relative">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar por código de unidad (TA01) o ID..."
            className="w-full pl-9 pr-3 py-2 rounded-xl text-xs bg-slate-900 border border-slate-700 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500"
          />
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto text-[11px] pb-1">
          <Filter className="h-3.5 w-3.5 text-slate-400 shrink-0" />
          {(['all', 'in_progress', 'planned', 'completed'] as const).map((filter) => (
            <button
              key={filter}
              type="button"
              onClick={() => setStatusFilter(filter)}
              className={`px-2.5 py-1 rounded-lg font-medium transition-colors cursor-pointer shrink-0 ${
                statusFilter === filter
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              {filter === 'all'
                ? 'Todas'
                : filter === 'in_progress'
                ? 'En tránsito'
                : filter === 'planned'
                ? 'Planificadas'
                : 'Completadas'}
            </button>
          ))}
        </div>
      </div>

      {/* Lista de Rutas */}
      <div className="flex-1 overflow-y-auto space-y-2.5 pr-1">
        {filteredRoutes.length === 0 ? (
          <div className="text-center py-8 text-slate-400 text-xs flex flex-col items-center gap-2">
            <RouteIcon className="h-8 w-8 text-slate-600" />
            <span>No se encontraron rutas con los criterios seleccionados.</span>
          </div>
        ) : (
          filteredRoutes.map((route) => (
            <RouteCard
              key={route.id}
              route={route}
              isSelected={selectedRouteId === route.id}
              onSelectRoute={handleSelectRoute}
              onRecalculate={handleRecalculate}
              isRecalculating={isRecalculating}
            />
          ))
        )}
      </div>
    </div>
  );
};
