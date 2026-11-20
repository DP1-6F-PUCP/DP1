import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useMapStore } from '../../store/mapStore';
import { Vehicle, Warehouse, BlockedStreet, Order, Route } from '../../types';
import { ApiMapa, LeafletManhattanMap } from './LeafletManhattanMap';
import { ControlesMapa } from './ControlesMapa';
import { useEstadoOperacion } from '../../hooks/useEstadoOperacion';
import { useScenarioStore } from '../../store/scenarioStore';
import { IndicadoresGlobalesMapa } from './IndicadoresGlobalesMapa';
import { MenuAveriaVehiculo } from './MenuAveriaVehiculo';
import { almacenVisible, pedidoVisible, vehiculoVisible } from '../../utils/filtrosMapa';

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
  /** Ejecución ya terminada cuyo cierre aún se muestra: los indicadores siguen a la vista (el
   * "Vencido #…" explica el colapso); el menú de averías no. */
  vistaFinal?: boolean;
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
  vistaFinal = false,
}) => {
  const selectedVehicleId = useMapStore((s) => s.selectedVehicleId);
  const selectedWarehouseId = useMapStore((s) => s.selectedWarehouseId);
  const selectedOrderId = useMapStore((s) => s.selectedOrderId);
  const activeLayers = useMapStore((s) => s.activeLayers);
  const filtros = useMapStore((s) => s.filtros);

  // Filtros de la leyenda. Lo seleccionado se ve siempre (si no, al elegirlo desde la lista o los
  // indicadores "desaparecería"); las rutas siguen a su vehículo.
  const vehiculosVisibles = useMemo(
    () => vehicles.filter((v) => v.id === selectedVehicleId || (activeLayers.vehicles && vehiculoVisible(filtros, v))),
    [vehicles, filtros, selectedVehicleId, activeLayers.vehicles]);
  const idsVisibles = useMemo(() => new Set(vehiculosVisibles.map((v) => v.id)), [vehiculosVisibles]);
  const rutasVisibles = useMemo(
    () => (idsVisibles.size === vehicles.length ? routes : routes.filter((r) => idsVisibles.has(r.vehicleId))),
    [routes, idsVisibles, vehicles.length]);
  const pedidosVisibles = useMemo(
    () => orders.filter((o) => o.id === selectedOrderId || pedidoVisible(filtros, o)),
    [orders, filtros, selectedOrderId]);
  const almacenesVisibles = useMemo(
    () => warehouses.filter((w) => w.id === selectedWarehouseId || (activeLayers.warehouses && almacenVisible(filtros, w))),
    [warehouses, filtros, selectedWarehouseId, activeLayers.warehouses]);
  const setSelectedVehicleId = useMapStore((s) => s.setSelectedVehicleId);
  const setSelectedWarehouseId = useMapStore((s) => s.setSelectedWarehouseId);
  const setSelectedOrderId = useMapStore((s) => s.setSelectedOrderId);
  // Mismo queryKey que el resto de la app (React Query dedupea), no dispara un fetch adicional.
  const { configuracion } = useEstadoOperacion();
  const hasActiveExecution = useScenarioStore((s) =>
    Boolean(s.ejecucion && ['INICIADA', 'EN_CURSO', 'PAUSADA'].includes(s.ejecucion.estado)));

  // Controles del mapa (zoom, ver toda la ciudad, capas): van en esta capa, sobre los paneles.
  const [apiMapa, setApiMapa] = useState<ApiMapa | null>(null);
  // "Ver en el mapa" desde otra página: centra cuando el mapa vuelve a estar a la vista.
  const solicitudCentrado = useMapStore((s) => s.solicitudCentrado);
  useEffect(() => {
    if (apiMapa && solicitudCentrado) apiMapa.centrar(solicitudCentrado.x, solicitudCentrado.y);
  }, [apiMapa, solicitudCentrado]);

  // Clic derecho sobre un vehículo: menú para inducir una avería.
  const [menuAveria, setMenuAveria] = useState<{ vehicleId: string; punto: { x: number; y: number } } | null>(null);
  const cerrarMenuAveria = useCallback(() => setMenuAveria(null), []);
  const vehiculoMenu = menuAveria ? vehicles.find((v) => v.id === menuAveria.vehicleId) : undefined;

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
        warehouses={almacenesVisibles}
        vehicles={vehiculosVisibles}
        blockedStreets={blockedStreets}
        orders={pedidosVisibles}
        routes={rutasVisibles}
        simMinutes={simMinutes}
        selectedVehicleId={selectedVehicleId}
        selectedWarehouseId={selectedWarehouseId}
        selectedOrderId={selectedOrderId}
        onSelectVehicle={handleVehicleClick}
        onSelectWarehouse={handleWarehouseClick}
        onSelectOrder={handleOrderClick}
        onApiMapa={setApiMapa}
        onVehicleContextMenu={hasActiveExecution ? (vehicleId, punto) => setMenuAveria({ vehicleId, punto }) : undefined}
        showBlockedStreets={activeLayers.blockedStreets}
        showProjectedRoutes={activeLayers.projectedRoutes}
        showOrders={activeLayers.orderPins}
        cityWidth={configuracion?.ciudad.ancho}
        cityHeight={configuracion?.ciudad.alto}
        isDarkTheme={isDarkTheme}
        className="w-full h-full"
      />
      {apiMapa && (
        <ControlesMapa onAcercar={apiMapa.acercar} onAlejar={apiMapa.alejar} onEncuadrar={apiMapa.encuadrar} />
      )}
      {hasActiveExecution && menuAveria && vehiculoMenu && (
        <MenuAveriaVehiculo vehiculo={vehiculoMenu} punto={menuAveria.punto} onCerrar={cerrarMenuAveria} />
      )}
      {(hasActiveExecution || vistaFinal) && (
        <IndicadoresGlobalesMapa
          onIrAPedido={(pedido) => apiMapa?.centrar(pedido.destination.x, pedido.destination.y)}
          onIrAPunto={(x, y) => apiMapa?.centrar(x, y)}
        />
      )}
    </div>
  );
};
