import React, { useEffect } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { VehiclePanelContainer } from '../features/vehiculos/components/VehiclePanelContainer';
import { RouteMap } from '../components/map/RouteMap';
import { MapErrorBoundary } from '../components/map/MapErrorBoundary';
import { useVehicles } from '../features/vehiculos/hooks/useVehicles';
import { useVehicleTracking } from '../features/vehiculos/hooks/useVehicleTracking';
import { useOrders } from '../features/pedidos/hooks/useOrders';
import { useMapStore } from '../store/mapStore';
import { INITIAL_WAREHOUSES, INITIAL_BLOCKED_STREETS } from '../utils/manhattan';

export const SeguimientoPage: React.FC = () => {
  const { vehicleId: pathVehicleId } = useParams<{ vehicleId?: string }>();
  const [searchParams] = useSearchParams();
  const queryVehicleId = searchParams.get('vehicleId');

  const targetVehicleId = pathVehicleId || queryVehicleId;

  const { vehicles } = useVehicles();
  const { orders } = useOrders();
  useVehicleTracking(); // Socket / Realtime listener hook

  const setSelectedVehicleId = useMapStore((s) => s.setSelectedVehicleId);

  useEffect(() => {
    if (targetVehicleId) {
      setSelectedVehicleId(targetVehicleId);
    }
  }, [targetVehicleId, setSelectedVehicleId]);

  return (
    <div className="flex-1 flex h-full overflow-hidden bg-[#0B111E] text-slate-100">
      {/* Panel Izquierdo: Gestión de Flota y Averías */}
      <aside className="w-96 border-r border-slate-800 bg-slate-900/95 flex flex-col p-4 overflow-hidden shrink-0">
        <div className="mb-3">
          <h2 className="text-base font-bold text-white">Seguimiento de Flota</h2>
          <p className="text-xs text-slate-400">
            Monitoreo en tiempo real, semaforización y reporte de incidencias
          </p>
        </div>
        <div className="flex-1 overflow-hidden">
          <VehiclePanelContainer />
        </div>
      </aside>

      {/* Panel Derecho: Mapa en Vivo */}
      <div className="flex-1 relative h-full">
        <MapErrorBoundary fallbackTitle="Error en el Mapa de Seguimiento">
          <RouteMap
            warehouses={INITIAL_WAREHOUSES}
            vehicles={vehicles}
            blockedStreets={INITIAL_BLOCKED_STREETS}
            orders={orders}
            isDarkTheme={true}
          />
        </MapErrorBoundary>
      </div>
    </div>
  );
};
