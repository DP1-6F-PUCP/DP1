import React from 'react';
import { useMapStore } from '../../store/mapStore';
import { Vehicle, Warehouse, BlockedStreet, Order } from '../../types';
import { INITIAL_WAREHOUSES, INITIAL_BLOCKED_STREETS } from '../../utils/manhattan';
import { LeafletManhattanMap } from './LeafletManhattanMap';

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
  warehouses = INITIAL_WAREHOUSES,
  vehicles = [],
  blockedStreets = INITIAL_BLOCKED_STREETS,
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
      isDarkTheme={isDarkTheme}
      className="w-full h-full"
    />
  );
};
