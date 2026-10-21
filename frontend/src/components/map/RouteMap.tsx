import React from 'react';
import { useMapStore } from '../../store/mapStore';
import { Vehicle, Warehouse, BlockedStreet, Order } from '../../types';
import { LeafletManhattanMap } from './LeafletManhattanMap';
import { MapLegend } from './MapLegend';
import { MapLayersControl } from './MapLayersControl';
import { useEstadoOperacion } from '../../hooks/useEstadoOperacion';

export interface RouteMapProps {
  warehouses?: Warehouse[];
  vehicles?: Vehicle[];
  blockedStreets?: BlockedStreet[];
  orders?: Order[];
  onSelectVehicle?: (vehicle: Vehicle) => void;
  onSelectWarehouse?: (warehouse: Warehouse) => void;
  isDarkTheme?: boolean;
}

export const RouteMap: React.FC<RouteMapProps> = ({
  warehouses = [],
  vehicles = [],
  blockedStreets = [],
  orders = [],
  onSelectVehicle,
  onSelectWarehouse,
  isDarkTheme = true,
}) => {
  const selectedVehicleId = useMapStore((s) => s.selectedVehicleId);
  const selectedWarehouseId = useMapStore((s) => s.selectedWarehouseId);
  const activeLayers = useMapStore((s) => s.activeLayers);
  const setSelectedVehicleId = useMapStore((s) => s.setSelectedVehicleId);
  const setSelectedWarehouseId = useMapStore((s) => s.setSelectedWarehouseId);
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

  return (
    <div className="relative w-full h-full">
      <LeafletManhattanMap
        warehouses={warehouses}
        vehicles={vehicles}
        blockedStreets={blockedStreets}
        orders={orders}
        selectedVehicleId={selectedVehicleId}
        selectedWarehouseId={selectedWarehouseId}
        onSelectVehicle={handleVehicleClick}
        onSelectWarehouse={handleWarehouseClick}
        showBlockedStreets={activeLayers.blockedStreets}
        showProjectedRoutes={activeLayers.projectedRoutes}
        showOrders={activeLayers.orderPins}
        cityWidth={configuracion?.ciudad.ancho}
        cityHeight={configuracion?.ciudad.alto}
        isDarkTheme={isDarkTheme}
        className="w-full h-full"
      />
      <MapLayersControl />
      <MapLegend />
    </div>
  );
};
