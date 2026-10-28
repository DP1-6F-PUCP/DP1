import React from 'react';
import { useMapStore } from '../../store/mapStore';
import { Vehicle, Warehouse, BlockedStreet, Order, Route } from '../../types';
import { LeafletManhattanMap } from './LeafletManhattanMap';
import { useEstadoOperacion } from '../../hooks/useEstadoOperacion';

export interface RouteMapProps {
  warehouses?: Warehouse[];
  vehicles?: Vehicle[];
  blockedStreets?: BlockedStreet[];
  orders?: Order[];
  /** Geometria real de cada ruta -- usada por la linea de ruta del vehiculo seleccionado (ver
   * LeafletManhattanMap), no por la animacion (eso vive en el motor de simulacion). */
  routes?: Route[];
  /** Minutos simulados desde el inicio, en el instante visible -- para el semáforo de los
   * marcadores (antes nunca se pasaba y el mapa evaluaba todo contra el minuto 0). */
  simMinutes?: number;
  onSelectVehicle?: (vehicle: Vehicle) => void;
  onSelectWarehouse?: (warehouse: Warehouse) => void;
  onSelectOrder?: (order: Order) => void;
  isDarkTheme?: boolean;
}

export const RouteMap: React.FC<RouteMapProps> = ({
  warehouses = [],
  vehicles = [],
  blockedStreets = [],
  orders = [],
  routes = [],
  simMinutes = 0,
  onSelectVehicle,
  onSelectWarehouse,
  onSelectOrder,
  isDarkTheme = true,
}) => {
  const selectedVehicleId = useMapStore((s) => s.selectedVehicleId);
  const selectedWarehouseId = useMapStore((s) => s.selectedWarehouseId);
  const selectedOrderId = useMapStore((s) => s.selectedOrderId);
  const activeLayers = useMapStore((s) => s.activeLayers);
  const setSelectedVehicleId = useMapStore((s) => s.setSelectedVehicleId);
  const setSelectedWarehouseId = useMapStore((s) => s.setSelectedWarehouseId);
  const setSelectedOrderId = useMapStore((s) => s.setSelectedOrderId);
  // Mismo queryKey que el resto de la app (React Query dedupea), no dispara un fetch adicional.
  const { configuracion } = useEstadoOperacion();

  const handleVehicleClick = (vehicle: Vehicle | null) => {
    if (vehicle) {
      setSelectedVehicleId(vehicle.id);
      onSelectVehicle?.(vehicle);
    } else {
      setSelectedVehicleId(null);
    }
  };

  const handleWarehouseClick = (warehouse: Warehouse | null) => {
    if (warehouse) {
      setSelectedWarehouseId(warehouse.id);
      onSelectWarehouse?.(warehouse);
    } else {
      setSelectedWarehouseId(null);
    }
  };

  const handleOrderClick = (order: Order | null) => {
    if (order) {
      setSelectedOrderId(order.id);
      onSelectOrder?.(order);
    } else {
      setSelectedOrderId(null);
    }
  };

  return (
    <div className="relative w-full h-full">
      <LeafletManhattanMap
        warehouses={warehouses}
        vehicles={vehicles}
        blockedStreets={blockedStreets}
        orders={orders}
        routes={routes}
        simMinutes={simMinutes}
        selectedVehicleId={selectedVehicleId}
        selectedWarehouseId={selectedWarehouseId}
        selectedOrderId={selectedOrderId}
        onSelectVehicle={handleVehicleClick}
        onSelectWarehouse={handleWarehouseClick}
        onSelectOrder={handleOrderClick}
        showBlockedStreets={activeLayers.blockedStreets}
        showProjectedRoutes={activeLayers.projectedRoutes}
        showOrders={activeLayers.orderPins}
        cityWidth={configuracion?.ciudad.ancho}
        cityHeight={configuracion?.ciudad.alto}
        isDarkTheme={isDarkTheme}
        className="w-full h-full"
      />
    </div>
  );
};
