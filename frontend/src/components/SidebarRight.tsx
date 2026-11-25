import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { rutaPedidos } from '../utils/pedidosUrl';
import { Faltan } from './Faltan';
import {
  ArrowRight,
  ChevronRight,
  Clock,
  AlertTriangle,
  ChevronLeft,
  ChevronDown,
  ChevronUp,
  Car,
  Warehouse as WarehouseIcon,
  Package,
  MapPin,
  MinusCircle,
  X,
  Coffee,
  Timer,
  Navigation,
  Box,
  PackageCheck,
} from 'lucide-react';
import { pedidosEnServicio } from '../utils/estadoPedidos';
import { useEstadoVisual } from '../engine/useEstadoVisual';
import { useEscenario } from '../features/escenario/hooks/useEscenario';
import { useMapStore } from '../store/mapStore';
import { useVehicles } from '../features/vehiculos/hooks/useVehicles';
import { BreakdownType } from '../types';
import { BreakdownModal } from './BreakdownModal';
import { useAveriasProgramadasStore } from '../store/averiasProgramadasStore';
import { averiable } from '../features/flota/flotaUtils';
import {
   getVehicleSemaforoStatus,
  getBreakdownLevelConfig,
  VEHICLE_TYPE_META,
} from '../utils/vehicleStatus';
import { FaBicycle, FaMotorcycle } from 'react-icons/fa';
import { useUmbrales } from '../store/umbralesStore';
import { nivelCargaPct, SEMAFORO_CARGA } from '../utils/filtrosMapa';
import { getWarehouseStockStatus } from '../utils/warehouseStock';
import {
  classifyWarehouseShipments,
  deliveryMs,
  upcomingDepartureMs,
  WAREHOUSE_WINDOW_HOURS,
} from '../utils/warehouseShipments';
import { useScenarioStore } from '../store/scenarioStore';
import { Vehicle } from '../types/vehicle';
import {
  formatBackendSimulatedTime,
  formatFechaHoraCorta,
  formatMinutoSimulado,
  parseBackendSimulatedTime,
} from '../utils/backendTime';

function manhattanDist(ax: number, ay: number, bx: number, by: number): number {
  return Math.abs(ax - bx) + Math.abs(ay - by);
}

function kmToMinutes(km: number, speedKmh: number): number {
  if (speedKmh <= 0) return 0;
  return Math.round((km / speedKmh) * 60);
}

const CollapsibleSection: React.FC<{
  title: string;
  icon: React.ReactNode;
  badge?: string | number;
  badgeColor?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}> = ({ title, icon, badge, badgeColor = 'bg-slate-700 text-slate-300', defaultOpen = false, children }) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900/60 overflow-hidden">
      <button
        type="button"
        onClick={() => setIsOpen((v) => !v)}
        className="w-full flex items-center justify-between px-3 py-2.5 cursor-pointer hover:bg-slate-800/50 transition-colors"
      >
        <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase text-slate-300 tracking-wider">
          {icon}
          {title}
          {badge !== undefined && (
            <span className={`ml-1 rounded-md px-1.5 py-0.5 text-[10px] font-mono-code font-bold ${badgeColor}`}>
              {badge}
            </span>
          )}
        </span>
        {isOpen ? (
          <ChevronUp className="h-3.5 w-3.5 text-slate-500 shrink-0" />
        ) : (
          <ChevronDown className="h-3.5 w-3.5 text-slate-500 shrink-0" />
        )}
      </button>
      {isOpen && <div className="px-3 pb-3 space-y-2">{children}</div>}
    </section>
  );
};

const StaticSection: React.FC<{
  title: string;
  icon: React.ReactNode;
  badge?: string | number;
  badgeColor?: string;
  children: React.ReactNode;
}> = ({ title, icon, badge, badgeColor = 'bg-slate-700 text-slate-300', children }) => (
  <section className="rounded-2xl border border-slate-800 bg-slate-900/60 overflow-hidden">
    <div className="flex items-center justify-between px-3 py-2.5">
      <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase text-slate-300 tracking-wider">
        {icon}
        {title}
        {badge !== undefined && (
          <span className={`ml-1 rounded-md px-1.5 py-0.5 text-[10px] font-mono-code font-bold ${badgeColor}`}>
            {badge}
          </span>
        )}
      </span>
    </div>
    <div className="px-3 pb-3 space-y-2">{children}</div>
  </section>
);

/**
 * Carga a bordo con el semáforo de capacidad (mismo color que el ícono del vehículo en el mapa:
 * verde libre, ámbar media, rojo lleno; ver SEMAFORO_CARGA).
 */
const BarraCargaVehiculo: React.FC<{ load: number; capacity: number }> = ({ load, capacity }) => {
  const pct = capacity > 0 ? Math.min(100, Math.round((load / capacity) * 100)) : 0;
  const semaforo = SEMAFORO_CARGA[nivelCargaPct(pct)];
  return (
    <div className="flex items-center gap-1.5 w-full" title={`Capacidad: ${semaforo.label.toLowerCase()}`}>
      <div className="flex-1 h-1.5 rounded-full bg-slate-800 overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: semaforo.hex }} />
      </div>
      <span className="text-[10px] font-mono-code font-bold shrink-0 text-slate-300">
        {load === 0 ? `Vacío (0/${capacity})` : `${load}/${capacity} (${pct}%)`}
      </span>
    </div>
  );
};

const isVehicleReturning = (vehicle: Vehicle) =>
  vehicle.returningVisible ?? (vehicle.status === 'en_route' && vehicle.returnPath.length > 1);

interface SidebarRightProps {
  isCollapsed: boolean;
  onToggleCollapse: () => void;
}

export const SidebarRight: React.FC<SidebarRightProps> = ({
  isCollapsed,
  onToggleCollapse,
}) => {
  // Estado retrasado al mismo instante que el mapa (ver engine/useEstadoVisual): antes el panel
  // mostraba el dato en vivo, ~sa segundos reales por delante de lo que se veía en el mapa.
  const { warehouses, vehicles, orders, ordersOmitted = 0, estadoRaw, marcaVisibleMs } = useEstadoVisual();
  const { ejecucion } = useEscenario();
  const selectedVehicleId = useMapStore((s) => s.selectedVehicleId);
  const setSelectedVehicleId = useMapStore((s) => s.setSelectedVehicleId);
  const selectedWarehouseId = useMapStore((s) => s.selectedWarehouseId);
  const setSelectedWarehouseId = useMapStore((s) => s.setSelectedWarehouseId);
  const selectedOrderId = useMapStore((s) => s.selectedOrderId);
  const setSelectedOrderId = useMapStore((s) => s.setSelectedOrderId);
  const pedidoOrigenId = useMapStore((s) => s.pedidoOrigenId);
  const irAVehiculoDePedido = useMapStore((s) => s.irAVehiculoDePedido);
  // Pedidos en servicio (su vehículo ya llegó): no pueden vencer; mismo criterio que Pedidos.
  const enServicio = useMemo(() => pedidosEnServicio(orders, vehicles), [orders, vehicles]);
  // Semáforo de vehículos por plazo: misma escala que los pedidos (Configuración → Semáforos):
  // ámbar = en riesgo, rojo = vencido.
  const umbrales = useUmbrales();
  const umbralesSemaforo = useMemo(
    () => ({ riesgoMinutos: umbrales.riesgoMinutos, retrasoMinutos: 0 }),
    [umbrales.riesgoMinutos],
  );
  const scenarioStartMs = useScenarioStore((s) => s.scenarioStartMs());
  const { reportBreakdown, isReportingBreakdown } = useVehicles();
  // Averías pedidas que el backend aplicará al cerrar el siguiente lote (ver averiasProgramadasStore).
  const averiasProgramadas = useAveriasProgramadasStore((s) => s.pendientes);
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState<'operation' | 'fleet' | 'shipments'>('operation');
  const [expandedVehicleId, setExpandedVehicleId] = useState<string | null>(null);
  const [warehouseInspectorTab, setWarehouseInspectorTab] = useState<'transit' | 'upcoming' | 'delivered'>('transit');
  const [expandedWarehouseId, setExpandedWarehouseId] = useState<string | null>(null);
  // Pedido de abrir el panel en una pestaña hecho desde otra página (ver mapStore.abrirPanel).
  const solicitudPanel = useMapStore((s) => s.solicitudPanel);
  const limpiarSolicitudPanel = useMapStore((s) => s.limpiarSolicitudPanel);
  useEffect(() => {
    if (!solicitudPanel) return;
    setActiveTab(solicitudPanel);
    if (isCollapsed) onToggleCollapse();
    limpiarSolicitudPanel();
  }, [solicitudPanel, isCollapsed, onToggleCollapse, limpiarSolicitudPanel]);

  const previousSelectedVehicleId = useRef<string | null>(null); // null: una selección hecha desde otra página (p. ej. Pedidos) abre su ficha al volver
  const previousSelectedOrderId = useRef<string | null>(null); // null: una selección hecha desde otra página (p. ej. Pedidos) abre su ficha al volver
  const vehicleCardRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const orderCardRefs = useRef<Map<string, HTMLElement>>(new Map());
  const warehouseCardRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const [isBreakdownModalOpen, setIsBreakdownModalOpen] = useState(false);

  // Trae a la vista la card de lo seleccionado. Un solo requestAnimationFrame no alcanzaba: al
  // volver de otra página (p. ej. Pedidos) el panel se monta colapsado, el efecto lo expande y
  // cambia de pestaña, y la lista aún no existe en ese frame. Se reintenta frame a frame (hasta
  // ~1 s) hasta que la card esté montada; luego se corrige una vez más al terminar la animación de
  // ancho del panel (300 ms), que cambia los saltos de línea y con ello la altura de las cards.
  const desplazamientoPendiente = useRef(0);
  const llevarALaVista = useCallback((obtener: () => HTMLElement | undefined) => {
    const turno = ++desplazamientoPendiente.current; // una selección nueva cancela la anterior
    let intentos = 0;
    const intentar = () => {
      if (turno !== desplazamientoPendiente.current) return;
      const elemento = obtener();
      if (elemento) {
        elemento.scrollIntoView({ behavior: 'smooth', block: 'center' });
        window.setTimeout(() => {
          if (turno === desplazamientoPendiente.current) obtener()?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 350);
        return;
      }
      if (++intentos < 60) requestAnimationFrame(intentar);
    };
    requestAnimationFrame(intentar);
  }, []);

  useEffect(() => {
    const vehicleSelectionChanged = previousSelectedVehicleId.current !== selectedVehicleId;
    previousSelectedVehicleId.current = selectedVehicleId;

    if (!selectedVehicleId || !vehicleSelectionChanged) return;

    setActiveTab('fleet');
    setExpandedVehicleId(selectedVehicleId);
    if (isCollapsed) onToggleCollapse();

    llevarALaVista(() => vehicleCardRefs.current.get(selectedVehicleId));
  }, [selectedVehicleId, isCollapsed, onToggleCollapse, llevarALaVista]);

  useEffect(() => {
    const orderSelectionChanged = previousSelectedOrderId.current !== selectedOrderId;
    previousSelectedOrderId.current = selectedOrderId;

    if (!selectedOrderId || !orderSelectionChanged) return;

    setActiveTab('shipments');
    if (isCollapsed) onToggleCollapse();

    llevarALaVista(() => orderCardRefs.current.get(selectedOrderId));
  }, [selectedOrderId, isCollapsed, onToggleCollapse, llevarALaVista]);

  const currentSimulationMinute = estadoRaw?.marcaTiempoActual && ejecucion?.fechaInicioSimulada
    ? Math.max(
        0,
        Math.round(
          (parseBackendSimulatedTime(estadoRaw.marcaTiempoActual)
            - parseBackendSimulatedTime(ejecucion.fechaInicioSimulada)) / 60000
        )
      )
    : 0;

  // Seleccionar un almacén en el mapa despliega su propia card en "Almacenes y capacidad" (no se
  // abre una card aparte): cambia a la pestaña Operación, abre el panel y la trae a la vista.
  const previousSelectedWarehouseId = useRef<string | null>(null); // null: una selección hecha desde otra página (p. ej. Pedidos) abre su ficha al volver
  useEffect(() => {
    const warehouseSelectionChanged = previousSelectedWarehouseId.current !== selectedWarehouseId;
    previousSelectedWarehouseId.current = selectedWarehouseId;
    if (!selectedWarehouseId || !warehouseSelectionChanged) return;

    setActiveTab('operation');
    setExpandedWarehouseId(selectedWarehouseId);
    if (isCollapsed) onToggleCollapse();

    llevarALaVista(() => warehouseCardRefs.current.get(selectedWarehouseId));
  }, [selectedWarehouseId, isCollapsed, onToggleCollapse, llevarALaVista]);

  const getWarehouseShipments = (warehouseId: string) =>
    classifyWarehouseShipments(orders, warehouseId, marcaVisibleMs);
  const formatSimClock = (ms: number | undefined) =>
    ms === undefined ? '--:--' : formatBackendSimulatedTime(ms, false);

  const getVehicleOrders = (vehicle: Vehicle) =>
    orders.filter(
      (order) =>
        vehicle.assignedOrderIds.includes(order.id) ||
        order.assignedVehicleId === vehicle.id
    );

  // Destino vigente del vehículo: su parada pendiente; si ya entregó todo y vuelve, el almacén al
  // que regresa (fin de returnPath); si no, ninguno. Antes caía en la dirección de cualquier
  // pedido asignado, aunque ya estuviera entregado, y daba un "destino" a vehículos sin ruta.
  const getVehicleDestination = (vehicle: Vehicle) => {
    const hasPendingStop = getVehicleOrders(vehicle).some((order) => order.status !== 'delivered');
    if (hasPendingStop) {
      return vehicle.destination
        ?? getVehicleOrders(vehicle).find((order) => order.status !== 'delivered')?.destination;
    }
    return vehicle.returnPath.length ? vehicle.returnPath[vehicle.returnPath.length - 1] : undefined;
  };

  const getVehicleDistanceToDestination = (vehicle: Vehicle) => {
    const destination = getVehicleDestination(vehicle);
    return destination ? manhattanDist(vehicle.position.x, vehicle.position.y, destination.x, destination.y) : 0;
  };

  const getVehicleDistanceToOrigin = (vehicle: Vehicle) => {
    const assignedOrder = getVehicleOrders(vehicle)[0];
    const origin = warehouses.find((warehouse) => warehouse.id === vehicle.homeWarehouseId)?.coords
      ?? warehouses.find((warehouse) => warehouse.id === assignedOrder?.warehouseOriginId)?.coords
      ?? warehouses.find((warehouse) => warehouse.id === 'central')?.coords;
    return origin ? manhattanDist(vehicle.position.x, vehicle.position.y, origin.x, origin.y) : 0;
  };

  const handleConfirmBreakdown = (vehicleId: string, type: BreakdownType, reason: string) => {
    // Aviso de "programada" / error: lo da useVehicles (useMutation), igual que el menú del mapa.
    reportBreakdown({ vehicleId, type, reason });
  };

  // Métricas globales de la flota
  const totalFleetCapacity = vehicles.reduce((sum, v) => sum + (v.capacity || 0), 0);
  const totalFleetLoad = vehicles.reduce((sum, v) => sum + (v.currentLoad || 0), 0);
  const fleetFillPercent =
    totalFleetCapacity > 0 ? Math.round((totalFleetLoad / totalFleetCapacity) * 100) : 0;
  const fleetAvailPercent = Math.max(0, 100 - fleetFillPercent);

  const isFleetCritical = fleetFillPercent >= umbrales.flotaSaturada;
  const isFleetWarning = fleetFillPercent >= umbrales.flotaAlta && !isFleetCritical;
  const fleetSemaforoText = isFleetCritical
    ? 'text-rose-400'
    : isFleetWarning
    ? 'text-amber-400'
    : 'text-emerald-400';
  const fleetSemaforoBadge = isFleetCritical
    ? 'bg-rose-950/60 border-rose-500/50 text-rose-300'
    : isFleetWarning
    ? 'bg-amber-950/60 border-amber-500/50 text-amber-300'
    : 'bg-emerald-950/60 border-emerald-500/50 text-emerald-300';
  const fleetSemaforoProgress = isFleetCritical
    ? 'bg-rose-500'
    : isFleetWarning
    ? 'bg-amber-500'
    : 'bg-emerald-500';

  // La lista completa (búsqueda, filtros, orden) vive en la página Flota (/flota); aquí queda la
  // ficha del vehículo seleccionado en el mapa.
  const vehiculoFicha = selectedVehicleId ? vehicles.filter((v) => v.id === selectedVehicleId) : [];

  const pedidoSeleccionado = selectedOrderId ? orders.find((order) => order.id === selectedOrderId) : undefined;
  const totalOrders = orders.length + ordersOmitted;


  const shipmentStatus = {
    on_time: { label: 'A tiempo', className: 'border-emerald-500/50 bg-emerald-950/60 text-emerald-300' },
    at_risk: { label: 'En riesgo', className: 'border-amber-500/50 bg-amber-950/60 text-amber-300' },
    delayed: { label: 'Retrasado', className: 'border-rose-500/50 bg-rose-950/60 text-rose-300' },
    delivered: { label: 'Entregado', className: 'border-blue-500/50 bg-blue-950/60 text-blue-300' },
    collapsed: { label: 'Retrasado', className: 'border-rose-500/50 bg-rose-950/60 text-rose-300' },
  } as const;

  return (
    <>
      {/* Panel de detalle del mapa, a la derecha. Colapsado queda como una franja delgada con su
          botón para abrirlo (también se abre solo al seleccionar algo). La navegación es la barra
          de secciones de la izquierda: esta franja no repite secciones. */}
      {isCollapsed && (
        <aside className="tema-panel flex w-9 shrink-0 flex-col items-center gap-3 border-l border-[var(--color-sidebar-border)] bg-[var(--color-sidebar-background)] py-3">
          <button
            type="button"
            id="btn-toggle-ops-sidebar"
            onClick={onToggleCollapse}
            title="Abrir el panel de detalle"
            aria-label="Abrir el panel de detalle"
            className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-800/60 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-400"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden />
          </button>
          <button
            type="button"
            onClick={onToggleCollapse}
            className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 hover:text-white [writing-mode:vertical-rl]"
            tabIndex={-1}
            aria-hidden
          >
            Detalle
          </button>
        </aside>
      )}
      {!isCollapsed && (
      <aside
        id="sidebar-ops-nav"
        className={`tema-panel relative flex flex-col border-l border-[var(--color-sidebar-border)] transition-all duration-300 select-none z-20 shrink-0 ${
          'w-80 lg:w-96'
        } bg-[var(--color-sidebar-background)] text-slate-100 shadow-xl h-full overflow-hidden`}
      >
        {(
          /* VISTA EXPANDIDA */
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Selector de Pestañas: Operación | Flota | Envíos */}
            <div className="flex items-center px-3 pt-2.5 pb-2 border-b border-[var(--color-sidebar-border)] bg-[var(--color-sidebar-background)] gap-2 shrink-0">
              <button
                type="button"
                id="tab-btn-operation"
                onClick={() => setActiveTab('operation')}
                className={`flex-1 py-1.5 px-2.5 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                  activeTab === 'operation'
                    ? 'bg-blue-600 text-white shadow-md'
                    : 'bg-slate-800/60 text-slate-400 hover:text-slate-200 hover:bg-slate-800 border border-slate-700/50'
                }`}
              >
                <WarehouseIcon className="h-3.5 w-3.5" />
                <span>Almacén</span>
              </button>
              <button
                type="button"
                id="tab-btn-fleet"
                onClick={() => setActiveTab('fleet')}
                className={`flex-1 py-1.5 px-2.5 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                  activeTab === 'fleet'
                    ? 'bg-blue-600 text-white shadow-md'
                    : 'bg-slate-800/60 text-slate-400 hover:text-slate-200 hover:bg-slate-800 border border-slate-700/50'
                }`}
              >
                <Car className="h-3.5 w-3.5" />
                <span>Flota</span>
              </button>
              <button
                type="button"
                id="tab-btn-shipments"
                onClick={() => setActiveTab('shipments')}
                className={`flex-1 py-1.5 px-2.5 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                  activeTab === 'shipments'
                    ? 'bg-blue-600 text-white shadow-md'
                    : 'bg-slate-800/60 text-slate-400 hover:text-slate-200 hover:bg-slate-800 border border-slate-700/50'
                }`}
              >
                <Package className="h-3.5 w-3.5" />
                <span>Envíos</span>
              </button>
              <button
                type="button"
                id="btn-toggle-ops-sidebar"
                onClick={onToggleCollapse}
                title="Colapsar el panel de detalle"
                aria-label="Colapsar el panel de detalle"
                className="shrink-0 rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-800/60 hover:text-white"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>

            {/* CUERPO CONTEXTUAL CON SCROLL */}
            <div className="flex-1 overflow-y-auto p-3 space-y-3.5 text-xs bg-[var(--color-sidebar-background)]">
              {/* PESTAÑA: ENVÍOS */}
              {activeTab === 'shipments' ? (
                <div className="space-y-3 fade-in">
                  {/* La lista completa vive en la página Pedidos (/pedidos); aquí queda la ficha del
                      pedido seleccionado en el mapa. */}
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-bold text-white">Pedido seleccionado</h3>
                      <p className="text-[11px] text-slate-400">{totalOrders} pedidos en total</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => navigate(rutaPedidos())}
                      className="inline-flex items-center gap-1 rounded-lg border border-cyan-500/50 px-2 py-1 text-[11px] font-semibold text-cyan-300 hover:bg-cyan-500/10"
                    >
                      Ver todos los pedidos <ArrowRight className="h-3 w-3" aria-hidden />
                    </button>
                  </div>
                  {!pedidoSeleccionado ? (
                    <div className="rounded-2xl border border-dashed border-slate-800 p-8 text-center text-slate-400">
                      <Package className="mx-auto mb-2 h-7 w-7 text-slate-600" />
                      <p className="font-medium text-slate-300">Ningún pedido seleccionado</p>
                      <p className="mt-1 text-[11px]">Haz click en un destino del mapa o elige uno en Pedidos.</p>
                    </div>
                  ) : (
                    <div className="space-y-2.5">
                      {[pedidoSeleccionado].map((order) => {
                        const status = shipmentStatus[order.status];
                        const warehouse = warehouses.find((item) => item.id === order.warehouseOriginId) ?? warehouses.find((item) => item.id === 'central') ?? warehouses[0];
                        const entregado = order.status === 'delivered';
                        // Entregado: el vehículo que lo entregó (si se vio el evento) o el de su ruta.
                        const vehicleId = entregado ? order.deliveredByVehicleId ?? order.assignedVehicleId : order.assignedVehicleId;
                        const vehicle = vehicleId
                          ? vehicles.find((item) => item.id === vehicleId || item.code === vehicleId)
                          : undefined;
                        const distance = warehouse
                          ? Math.abs(order.destination.x - warehouse.coords.x) + Math.abs(order.destination.y - warehouse.coords.y)
                          : 0;
                        const delivery = deliveryMs(order);
                        return (
                          <article
                            key={order.id}
                            ref={(element) => {
                              if (element) orderCardRefs.current.set(order.id, element);
                              else orderCardRefs.current.delete(order.id);
                            }}
                            // Sin onClick: un click en la ficha (p. ej. al seleccionar texto) ya no la
                            // deselecciona; para cerrarla está la "×".
                            className="rounded-2xl border border-blue-400 bg-blue-950/60 p-3 shadow-md ring-1 ring-blue-400/60"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <span className="font-mono-code text-sm font-bold text-white">{order.code}</span>
                                <p className="mt-0.5 text-[10px] text-slate-400">Cliente: {order.clientId || 'No informado'}</p>
                              </div>
                              <div className="flex shrink-0 items-center gap-1">
                                <span className={`rounded-lg border px-2 py-1 text-[10px] font-semibold ${status.className}`}>{status.label}</span>
                                <button
                                  type="button"
                                  onClick={() => setSelectedOrderId(null)}
                                  title="Cerrar y quitar la selección"
                                  aria-label="Cerrar la ficha del pedido"
                                  className="rounded-md p-1 text-slate-400 hover:bg-slate-800 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-400"
                                >
                                  <X className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            </div>
                            <div className="mt-2 rounded-xl border border-slate-800 bg-slate-950/50 p-2 text-[11px]">
                              <p className="font-medium text-slate-200">Pedido de cliente</p>
                              <p className="mt-1 text-slate-400">Carga: <strong className="text-slate-200">{order.quantity ?? 0} unidades</strong></p>
                            </div>
                            <div className="mt-2 grid grid-cols-2 gap-2 text-[10px]">
                              <div><span className="text-slate-500">Ruta</span><p className="font-medium text-slate-200">{warehouse?.name ?? 'Almacén Central'} → ({Math.round(order.destination.x)}, {Math.round(order.destination.y)}) · {distance} km</p></div>
                              <div><span className="text-slate-500">Destino cartesiano</span><p className="font-mono-code font-medium text-cyan-300">X={order.destination.x}, Y={order.destination.y}</p></div>
                              {/* Mismos rótulos y formato ("d/m HH:mm", 24 h) que la tabla de Pedidos. */}
                              <div><span className="text-slate-500">Ingreso</span><p className="font-mono-code font-medium text-slate-200">{formatMinutoSimulado(scenarioStartMs, order.createdMinute)}</p></div>
                              <div><span className="text-slate-500">Límite</span><p className="font-mono-code font-medium text-slate-200" title={`Plazo de ${order.slaHours ?? 0} h`}>{formatMinutoSimulado(scenarioStartMs, order.deadlineMinute)} <span className="font-sans text-slate-500">({order.slaHours ?? 0} h)</span></p></div>
                              <div>
                                <span className="text-slate-500">Entrega {delivery === undefined ? '' : order.deliveredSimMs === undefined ? '(estimada)' : '(real)'}</span>
                                <p className="font-mono-code font-medium text-slate-200">
                                  {delivery === undefined
                                    ? 'Sin estimar'
                                    : `${order.deliveredSimMs === undefined ? '~' : ''}${formatFechaHoraCorta(delivery)}`}
                                </p>
                              </div>
                              {/* Mismo formato y colores que la columna "Faltan" de Pedidos. */}
                              <div>
                                <span className="text-slate-500">Faltan</span>
                                <p className="font-mono-code font-medium">
                                  {!entregado && enServicio.has(order.id)
                                    ? <span className="inline-flex items-center gap-0.5 font-sans font-semibold text-emerald-300" title="Su vehículo ya llegó: el plazo se cumple con la llegada">
                                      <PackageCheck className="h-3 w-3" aria-hidden />En servicio</span>
                                    : <Faltan variante="panel" status={order.status}
                                      ms={order.deadlineSimMs !== undefined && marcaVisibleMs != null ? order.deadlineSimMs - marcaVisibleMs : undefined} />}
                                </p>
                              </div>
                            </div>
                            <div className="mt-2 flex items-center justify-between border-t border-slate-800 pt-2">
                              <span className="text-[10px] text-slate-400">{entregado ? 'Entregado por' : 'UT asignada'}</span>
                              {vehicle ? (
                                <button
                                  type="button"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    // Recuerda el pedido: la tarjeta del vehículo lo resalta.
                                    irAVehiculoDePedido(vehicle.id, order.id);
                                    setActiveTab('fleet');
                                  }}
                                  className="inline-flex items-center gap-1 rounded-lg border border-blue-500/40 bg-blue-500/10 px-2 py-1 text-[10px] font-semibold text-blue-300 hover:bg-blue-500/20"
                                >
                                  <Car className="h-3 w-3" /> {vehicle.code}
                                </button>
                              ) : vehicleId ? (
                                <span className="font-mono-code text-[10px] text-slate-300">{vehicleId}</span>
                              ) : entregado ? (
                                <span className="cursor-help text-[10px] text-slate-500" title="Vehículo no disponible tras finalizar la ruta">—</span>
                              ) : (
                                <span className="text-[10px] italic text-slate-500">Sin asignar</span>
                              )}
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  )}
                </div>
              ) : activeTab === 'fleet' ? (
                <div className="space-y-3 fade-in">

                  {/* La lista completa vive en la página Flota (/flota); aquí queda la ficha del
                      vehículo seleccionado en el mapa (con su detalle y "Crear avería"). */}
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-bold text-white">Vehículo seleccionado</h3>
                      <p className="text-[11px] text-slate-400">{vehicles.length} vehículos en la flota</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => navigate('/flota')}
                      className="inline-flex items-center gap-1 rounded-lg border border-cyan-500/50 px-2 py-1 text-[11px] font-semibold text-cyan-300 hover:bg-cyan-500/10"
                    >
                      Ver toda la flota <ArrowRight className="h-3 w-3" aria-hidden />
                    </button>
                  </div>

                  <div className="space-y-2.5">
                    {vehiculoFicha.length === 0 ? (
                      <div className="rounded-2xl border border-dashed border-slate-800 p-8 text-center text-slate-400">
                        <Car className="mx-auto mb-2 h-7 w-7 text-slate-600" />
                        <p className="font-medium text-slate-300">Ningún vehículo seleccionado</p>
                        <p className="mt-1 text-[11px]">Haz click en un vehículo del mapa o elige uno en Flota.</p>
                      </div>
                    ) : (
                      vehiculoFicha.map((v) => {
                        const isSelected = selectedVehicleId === v.id;
                        const isBroken = v.status === 'broken';
                        const breakdownCfg = isBroken ? getBreakdownLevelConfig(v.breakdownType) : null;
                        const typeMeta = VEHICLE_TYPE_META[v.type];
                        const centralWarehouse = warehouses.find(
                          (w) => w.id === 'central' || w.name.toLowerCase().includes('central')
                        );
                        const isAtCentralWarehouse = Boolean(
                          centralWarehouse &&
                            Math.round(v.position.x) === Math.round(centralWarehouse.coords.x) &&
                            Math.round(v.position.y) === Math.round(centralWarehouse.coords.y)
                        );
                        const isReturning = isVehicleReturning(v);
                        const vehicleOrders = getVehicleOrders(v);
                        const distanceToDestination = getVehicleDistanceToDestination(v);
                        const distanceToOrigin = getVehicleDistanceToOrigin(v);
                        // Pedidos de la ruta en curso, al instante visible: a bordo (sin entregar, en
                        // orden de entrega) y ya entregados. Lo asignado fuera de la ruta en curso es
                        // de su próxima ruta: aún no va a bordo.
                        const ordenRuta = (id: string) => {
                          const i = v.assignedOrderIds.indexOf(id);
                          return i < 0 ? Number.MAX_SAFE_INTEGER : i;
                        };
                        const enRutaActual = (id: string) => v.assignedOrderIds.includes(id);
                        const aBordo = vehicleOrders
                          .filter((order) => order.status !== 'delivered' && enRutaActual(order.id))
                          .sort((a, b) => ordenRuta(a.id) - ordenRuta(b.id) || (a.deadlineSimMs ?? 0) - (b.deadlineSimMs ?? 0));
                        const entregadosRuta = vehicleOrders
                          .filter((order) => order.status === 'delivered' && enRutaActual(order.id))
                          .sort((a, b) => (b.deliveredSimMs ?? 0) - (a.deliveredSimMs ?? 0));
                        const proximaRuta = vehicleOrders
                          .filter((order) => order.status !== 'delivered' && !enRutaActual(order.id))
                          .sort((a, b) => (a.deadlineSimMs ?? 0) - (b.deadlineSimMs ?? 0));
                        // Entregando: el pedido que está sirviendo (llegó a su destino) manda sobre
                        // "Próximo", que ya no puede vencer (antes mostraba su "faltan" igual).
                        const sirviendo = v.status === 'delivering' ? aBordo.find((order) => enServicio.has(order.id)) : undefined;
                        const proximo = sirviendo ?? aBordo[0];
                        const faltanProximo = proximo?.deadlineSimMs !== undefined && marcaVisibleMs !== null
                          ? proximo.deadlineSimMs - marcaVisibleMs
                          : undefined;
                        const totalRuta = aBordo.length + entregadosRuta.length;
                        // Averiado con carga pero sin pedidos en ruta: la carga espera el trasvase.
                        const porTrasvasar = isBroken && aBordo.length === 0 && v.currentLoad > 0;
                        const corto = (code: string) => (code.length > 8 ? `#${code.slice(-4)}` : code);
                        // Pedido desde el que se llegó (Pedidos o la ficha): resaltado donde esté.
                        const esOrigen = (id: string) => isSelected && pedidoOrigenId === id;
                        const RESALTE_ORIGEN = 'ring-2 ring-cyan-400 border-cyan-400';

                        return (
                          <div
                            key={v.id}
                            ref={(element) => {
                              if (element) {
                                vehicleCardRefs.current.set(v.id, element);
                              } else {
                                vehicleCardRefs.current.delete(v.id);
                              }
                            }}
                            onClick={() => {
                              setSelectedVehicleId(isSelected ? null : v.id);
                              setExpandedVehicleId(isSelected ? null : v.id);
                            }}
                            className={`p-3 rounded-2xl border transition-all cursor-pointer ${
                              isSelected
                                ? 'bg-blue-950/50 border-blue-500 ring-2 ring-blue-500/50 shadow-lg'
                                : 'bg-[#0d1b2e]/90 hover:bg-slate-800/90 border-slate-800 text-slate-200 shadow-md'
                            }`}
                          >
                            {/* Fila Superior */}
                            <div className="flex items-center justify-between gap-2 mb-2">
                              <div className="flex items-center gap-2">
                                <div className={`p-1.5 rounded-lg flex items-center justify-center ${
                                  isReturning ? 'bg-slate-600/30 text-slate-300' : typeMeta.badgeClass
                                }`}>
                                  {v.type === 'car' ? (
                                    <Car className="h-4 w-4" />
                                  ) : v.type === 'motorcycle' ? (
                                    <FaMotorcycle className="h-4 w-4" />
                                  ) : (
                                    <FaBicycle className="h-4 w-4" />
                                  )}
                                </div>
                                <div className="flex items-center gap-1.5">
                                  <span className="font-mono-code font-bold text-sm text-white">{v.code}</span>
                                  <span
                                    className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${typeMeta.badgeClass}`}
                                  >
                                    {typeMeta.shortLabel}
                                  </span>
                                </div>
                              </div>

                              <div className="shrink-0">
                                {isReturning ? (
                                  <span className="border border-slate-500/60 bg-slate-700/70 text-slate-200 text-[11px] px-2 py-0.5 rounded-lg flex items-center gap-1 font-medium">
                                    <Navigation className="h-3 w-3 text-slate-300" /> Regresando
                                  </span>
                                ) : v.status === 'idle' ? (
                                  <span className="border border-slate-700 bg-slate-800 text-slate-300 text-[11px] px-2 py-0.5 rounded-lg flex items-center gap-1 font-medium">
                                    <MinusCircle className="h-3 w-3 text-slate-400" /> Inactivo
                                  </span>
                                ) : v.status === 'en_route' ? (
                                  <span className="border border-sky-500/50 bg-sky-950/60 text-sky-300 text-[11px] px-2 py-0.5 rounded-lg flex items-center gap-1 font-medium">
                                    <span className="h-1.5 w-1.5 rounded-full bg-sky-400 animate-pulse" /> Viajando
                                  </span>
                                ) : v.status === 'delivering' ? (
                                  <span className="border border-emerald-500/50 bg-emerald-950/60 text-emerald-300 text-[11px] px-2 py-0.5 rounded-lg flex items-center gap-1 font-medium">
                                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> Entregando
                                  </span>
                                ) : v.status === 'maintenance' ? (
                                  <span className="border border-amber-500/50 bg-amber-950/60 text-amber-300 text-[11px] px-2 py-0.5 rounded-lg flex items-center gap-1 font-medium">
                                    <Clock className="h-3 w-3 text-amber-400" /> Mantenimiento
                                  </span>
                                ) : v.status === 'on_break' ? (
                                  // Bug real reportado (captura: TA01 "Averiado" sin ninguna avería
                                  // registrada en el backend): 'on_break' (EN_REFRIGERIO) no tenía
                                  // rama propia y caía en el else de abajo -- todo vehículo en
                                  // refrigerio se mostraba como averiado. Mismo teal que su
                                  // marcador en el mapa (ver LeafletManhattanMap, isEnRefrigerio).
                                  <span className="border border-teal-500/50 bg-teal-950/60 text-teal-300 text-[11px] px-2 py-0.5 rounded-lg flex items-center gap-1 font-medium">
                                    <Coffee className="h-3 w-3 text-teal-400" /> Refrigerio
                                  </span>
                                ) : (
                                  <span
                                    className={`border text-[11px] px-2 py-0.5 rounded-lg flex items-center gap-1 font-bold ${
                                      breakdownCfg
                                        ? breakdownCfg.badgeClass
                                        : 'border-rose-500/60 bg-rose-950/70 text-rose-300'
                                    }`}
                                  >
                                    <AlertTriangle className="h-3 w-3 shrink-0" />
                                    {breakdownCfg ? breakdownCfg.shortLabel : 'Averiado'}
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* Avería pedida que aún no se aplica (se aplica al cerrar el siguiente lote). */}
                            {!isBroken && averiasProgramadas[v.id] && (
                              <div
                                className="mb-2 flex items-center gap-1.5 rounded-lg border border-dashed border-rose-500/60 bg-rose-500/10 px-2 py-1 text-[10px] font-semibold text-rose-300"
                                title="Se aplica en unos segundos"
                              >
                                <Clock className="h-3 w-3 shrink-0" aria-hidden />
                                Avería tipo {averiasProgramadas[v.id].tipo} programada · en segundos
                              </div>
                            )}

                            {/* Resumen visible inmediato cuando el vehículo está averiado */}
                            {isBroken && (
                              <div
                                className={`mb-2 rounded-xl border p-2 text-[10px] space-y-0.5 ${
                                  breakdownCfg
                                    ? breakdownCfg.panelClass
                                    : 'border-rose-500/40 bg-rose-950/35 text-rose-100'
                                }`}
                              >
                                <div className="flex items-center justify-between font-bold">
                                  <span>{breakdownCfg ? breakdownCfg.label : 'Avería activa'}</span>
                                  <span className="font-mono-code">
                                    ({Math.round(v.position.x)}, {Math.round(v.position.y)})
                                  </span>
                                </div>
                                <p className="opacity-90">
                                  {breakdownCfg ? breakdownCfg.unavailableText : 'Unidad fuera de servicio temporalmente'}
                                </p>
                                <p className="opacity-80">
                                  {v.breakdownType === 2 || v.breakdownType === 3
                                    ? isAtCentralWarehouse
                                      ? '📍 Trasladada al Almacén Central (tras 4h en sitio)'
                                      : '⏱ En lugar de la avería (permanece 4h antes de traslado a Central)'
                                    : '📍 Permanece en el lugar de la avería (2h)'}
                                </p>
                              </div>
                            )}

                            {/* Métricas: Velocidad, Carga, Entregas de la ruta en curso */}
                            <div className="grid grid-cols-3 gap-2 my-2 text-center">
                              <div className="p-1.5 rounded-lg bg-slate-950/50 border border-slate-800/80">
                                <span className="text-[9px] text-slate-400 block">Velocidad</span>
                                <span className="font-mono-code font-bold text-xs text-white">
                                  {isBroken ? 0 : v.speed} <span className="text-[9px] font-normal text-slate-400">km/h</span>
                                </span>
                              </div>
                              <div className="p-1.5 rounded-lg bg-slate-950/50 border border-slate-800/80">
                                <span className="text-[9px] text-slate-400 block">Carga</span>
                                <span className="font-mono-code font-bold text-xs text-slate-200">
                                  {v.currentLoad}/{v.capacity}
                                </span>
                              </div>
                              {/* Antes "Entregas" mostraba v.totalDelivered, que el backend no expone (siempre 0).
                                  Ahora: entregados / total de la ruta en curso, al reloj del mapa. */}
                              <div className="p-1.5 rounded-lg bg-slate-950/50 border border-slate-800/80"
                                title={totalRuta ? `Ruta en curso: ${entregadosRuta.length} entregados de ${totalRuta}` : 'Sin ruta en curso'}>
                                <span className="text-[9px] text-slate-400 block">Entregas ruta</span>
                                <span className="font-mono-code font-bold text-xs text-emerald-400">
                                  {totalRuta ? <>{entregadosRuta.length}<span className="text-[9px] font-normal text-slate-400">/{totalRuta}</span></> : '—'}
                                </span>
                              </div>
                            </div>
                            {isReturning ? (
                              <div className="flex items-center gap-1.5 w-full">
                                <span className="h-2 w-2 rounded-full shrink-0 bg-slate-400" />
                                <div className="flex-1 h-1.5 rounded-full bg-slate-800 overflow-hidden">
                                  <div className="h-full rounded-full bg-slate-500 transition-all" style={{ width: `${v.capacity > 0 ? Math.min(100, Math.round((v.currentLoad / v.capacity) * 100)) : 0}%` }} />
                                </div>
                                <span className="text-[10px] font-mono-code font-bold text-slate-300 shrink-0">Regreso al almacén</span>
                              </div>
                            ) : (
                              <BarraCargaVehiculo load={v.currentLoad} capacity={v.capacity} />
                            )}
                            <div className="mt-1 flex flex-wrap justify-between gap-x-2 text-[9px] text-slate-500">
                              <span>Destino: {kmToMinutes(distanceToDestination, v.speed)} min</span>
                              <span>Origen: {kmToMinutes(distanceToOrigin, v.speed)} min</span>
                            </div>
                            {/* Próxima entrega y su límite (antes "Salida/Llegada": el ingreso más antiguo y
                                el límite más lejano de sus pedidos, en 12 h sin fecha, se leían como horarios). */}
                            <div className="mt-1 flex items-center justify-between gap-2 text-[10px]">
                              {proximo && sirviendo ? (
                                <>
                                  <span className={`truncate text-emerald-300 ${esOrigen(proximo.id) ? 'rounded px-0.5 ring-1 ring-cyan-400' : ''}`} title={`Entregando ${proximo.code} en (${Math.round(proximo.destination.x)}, ${Math.round(proximo.destination.y)})`}>
                                    <PackageCheck className="mr-0.5 inline h-3 w-3 align-[-2px]" />Entregando <span className="font-mono-code font-semibold">{corto(proximo.code)}</span>
                                  </span>
                                  <span className="shrink-0 text-emerald-300/80" title="Llegó a su destino: el plazo se cumple con la llegada, ya no puede vencer">En servicio</span>
                                </>
                              ) : proximo ? (
                                <>
                                  <span className={`truncate text-slate-400 ${esOrigen(proximo.id) ? 'rounded px-0.5 ring-1 ring-cyan-400' : ''}`} title={`Próxima entrega: ${proximo.code} en (${Math.round(proximo.destination.x)}, ${Math.round(proximo.destination.y)})`}>
                                    <MapPin className="mr-0.5 inline h-3 w-3 align-[-2px]" />Próximo <span className="font-mono-code text-slate-200">{corto(proximo.code)}</span>
                                  </span>
                                  <span className="shrink-0 font-mono-code text-slate-400" title="Límite del próximo pedido · lo que falta al reloj del mapa">
                                    Límite <span className="text-slate-200">{formatFechaHoraCorta(proximo.deadlineSimMs)}</span>
                                    {faltanProximo !== undefined && <span className="ml-1">(<Faltan variante="panel" ms={faltanProximo} status={proximo.status} />)</span>}
                                  </span>
                                </>
                              ) : proximaRuta.length > 0 ? (
                                <span className="truncate text-slate-400" title="Asignados a su próxima ruta (aún no van a bordo)">
                                  <Clock className="mr-0.5 inline h-3 w-3 align-[-2px]" />Próx. ruta{' '}
                                  <span className="font-mono-code text-slate-200">{proximaRuta.slice(0, 3).map((o) => corto(o.code)).join(' · ')}{proximaRuta.length > 3 ? ` +${proximaRuta.length - 3}` : ''}</span>
                                </span>
                              ) : (
                                <span className="text-slate-500">{entregadosRuta.length ? 'Ruta entregada' : 'Sin entregas pendientes'}</span>
                              )}
                            </div>

                            {/* Detalle si está seleccionado */}
                            {expandedVehicleId === v.id && (
                              // El detalle no pliega la tarjeta: solo la cabecera alterna la selección
                              // (antes cualquier click aquí, p. ej. al leer o seleccionar texto, la cerraba).
                              <div className="mt-2 space-y-2 border-t border-[var(--color-sidebar-border)] pt-2 fade-in cursor-default"
                                onClick={(event) => event.stopPropagation()}>
                                <div className="flex items-center justify-between">
                                  <span className="flex items-center gap-1.5 text-[11px] font-bold text-slate-100">
                                    <Package className="h-3.5 w-3.5 text-[var(--color-secondary)]" />
                                    {porTrasvasar ? 'Carga a bordo' : `A bordo (${aBordo.length})`}
                                  </span>
                                  <span className="flex items-center gap-1 text-[10px] text-[var(--color-sidebar-text-muted)]">
                                    <PackageCheck className="h-3 w-3 text-emerald-400" />Entregados {entregadosRuta.length}
                                    {proximaRuta.length > 0 && <span title="Asignados a su próxima ruta (aún no van a bordo)"> · +{proximaRuta.length} próx. ruta</span>}
                                  </span>
                                </div>

                                {porTrasvasar ? (
                                  // Averiado: el backend saca sus pedidos de la ruta (se replanifican en
                                  // otros vehículos) pero la carga sigue a bordo hasta el trasvase.
                                  <p className="flex items-start gap-1.5 rounded-xl border border-amber-500/40 bg-amber-500/10 p-2 text-[10px] text-amber-300"
                                    title="Sus pedidos pasaron a otros vehículos; los paquetes se les entregan en el trasvase">
                                    <Package className="mt-px h-3 w-3 shrink-0" aria-hidden />
                                    <span><span className="font-bold">{v.currentLoad} paquetes por trasvasar</span> · sus pedidos pasan a otro vehículo</span>
                                  </p>
                                ) : aBordo.length === 0 ? (
                                  <p className="rounded-xl border border-[var(--color-sidebar-border)] bg-[var(--color-sidebar-surface)] p-2 text-[10px] italic text-[var(--color-sidebar-text-muted)]">
                                    Sin pedidos a bordo
                                  </p>
                                ) : (
                                  <div className="space-y-1.5">
                                    {aBordo.map((order) => (
                                      <div
                                        key={order.id}
                                        className={`rounded-xl border border-[var(--color-sidebar-border)] bg-[var(--color-sidebar-surface)] p-2 text-slate-100 ${esOrigen(order.id) ? RESALTE_ORIGEN : ''}`}
                                        title={esOrigen(order.id) ? 'Pedido desde el que llegaste' : undefined}
                                      >
                                        <div className="flex items-center justify-between gap-2">
                                          <span className="font-mono-code text-[10px] font-semibold text-blue-300">
                                            {order.code}
                                          </span>
                                          <span className="text-[10px] font-mono-code text-slate-300">
                                            {order.clientId || 'Cliente no informado'}
                                          </span>
                                        </div>
                                        <p className="mt-1 text-[11px] font-semibold">
                                          Productos:{' '}
                                          <span className="font-mono-code text-blue-300">
                                            {order.quantity ?? 0} unidades
                                          </span>
                                        </p>
                                        <div className="mt-1 flex items-center justify-between gap-2 text-[10px] text-slate-300">
                                          <span>
                                            Destino: ({Math.round(order.destination.x)}, {Math.round(order.destination.y)})
                                          </span>
                                          <span className="font-mono-code text-slate-400" title={`Plazo de ${order.slaHours ?? 0} h`}>
                                            Límite: <span className="text-slate-200">{formatFechaHoraCorta(order.deadlineSimMs)}</span>
                                          </span>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                )}
                                {entregadosRuta.length > 0 && (
                                  <div className="flex flex-wrap gap-1" aria-label="Entregados en esta ruta">
                                    {entregadosRuta.map((order) => (
                                      <span key={order.id}
                                        title={`${order.code} entregado ${formatFechaHoraCorta(order.deliveredSimMs)}`}
                                        className={`inline-flex items-center gap-1 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 font-mono-code text-[9px] text-emerald-300 ${esOrigen(order.id) ? RESALTE_ORIGEN : ''}`}>
                                        <PackageCheck className="h-2.5 w-2.5" />
                                        {order.code.length > 8 ? `#${order.code.slice(-4)}` : order.code}
                                        <span className="text-slate-400">{formatFechaHoraCorta(order.deliveredSimMs).split(' ')[1] ?? ''}</span>
                                      </span>
                                    ))}
                                  </div>
                                )}
                                {/* Próxima ruta: asignados que aún no van a bordo, con su código (antes solo
                                    "+N próx. ruta": quien llegaba desde un pedido no lo encontraba). */}
                                {proximaRuta.length > 0 && (
                                  <div className="space-y-1" aria-label="Asignados a su próxima ruta">
                                    <span className="flex items-center gap-1 text-[10px] font-semibold text-slate-300">
                                      <Clock className="h-3 w-3 text-slate-400" />Próxima ruta ({proximaRuta.length})
                                    </span>
                                    <div className="flex flex-wrap gap-1">
                                      {proximaRuta.map((order) => (
                                        <span key={order.id}
                                          title={`${order.code} · límite ${formatFechaHoraCorta(order.deadlineSimMs)}${esOrigen(order.id) ? ' · pedido desde el que llegaste' : ''}`}
                                          className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 font-mono-code text-[9px] ${esOrigen(order.id)
                                            ? `bg-cyan-500/20 font-bold text-cyan-200 ${RESALTE_ORIGEN}`
                                            : 'border-slate-600/60 bg-slate-800/60 text-slate-200'}`}>
                                          {corto(order.code)}
                                          <span className="text-slate-400">{formatFechaHoraCorta(order.deadlineSimMs).split(' ')[1] ?? ''}</span>
                                        </span>
                                      ))}
                                    </div>
                                  </div>
                                )}

                                {isBroken && (
                                  <div className="flex items-center justify-between gap-2 text-[10px]">
                                    <span className="text-slate-400 font-mono-code">
                                      {breakdownCfg ? breakdownCfg.transferText : 'Avería en curso'}
                                    </span>
                                    <span
                                      className={`shrink-0 font-semibold py-0.5 px-2 rounded border ${
                                        breakdownCfg
                                          ? breakdownCfg.badgeClass
                                          : 'bg-[var(--color-danger)]/20 text-[var(--color-danger)] border-[var(--color-danger)]/40'
                                      }`}
                                    >
                                      {breakdownCfg ? breakdownCfg.code : 'Avería'}
                                    </span>
                                  </div>
                                )}
                                {!isBroken && (() => {
                                  const regla = averiable(v, undefined, marcaVisibleMs, Boolean(averiasProgramadas[v.id]));
                                  return (
                                  <div className="flex items-center justify-between gap-2">
                                    <span className="text-[11px] text-blue-300 font-mono-code flex items-center gap-1">
                                      <MapPin className="h-3.5 w-3.5" /> X={Math.round(v.position.x)}, Y={Math.round(v.position.y)}
                                    </span>
                                    <button
                                      type="button"
                                      disabled={isReportingBreakdown}
                                      aria-disabled={!regla.ok}
                                      title={regla.motivo}
                                      aria-label={`Crear avería · ${regla.motivo}`}
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        if (regla.ok) setIsBreakdownModalOpen(true);
                                      }}
                                      className="text-[10px] font-semibold py-1 px-2 rounded-lg bg-rose-500/20 text-rose-300 border border-rose-500/40 hover:bg-rose-500/30 disabled:opacity-50 disabled:cursor-not-allowed aria-disabled:opacity-50 aria-disabled:cursor-not-allowed aria-disabled:hover:bg-rose-500/20 transition-colors inline-flex items-center gap-1"
                                    >
                                      <AlertTriangle className="h-3 w-3 text-rose-400" />
                                      Crear avería
                                    </button>
                                  </div>
                                  );
                                })()}
                              </div>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              ) : (
                /* PESTAÑA: OPERACIÓN */
                <div className="space-y-3.5 fade-in">
                  {/* Las métricas globales de la operación viven en Reportes (aquí solo almacenes). */}
                  {/* CAPACIDAD DE ALMACENES */}
                  <StaticSection
                    title="Almacenes y capacidad"
                    icon={<WarehouseIcon className="h-3.5 w-3.5 text-blue-400" />}
                    badge={warehouses.length}
                  >
                    <div className="space-y-2.5">

                      {warehouses.map((w) => {
                        const isInfinite = !Number.isFinite(w.capacity);
                        // Mismo semáforo (+ vacío) que el ícono del almacén en el mapa.
                        const stock = getWarehouseStockStatus(w);
                        const pct = stock.pct;

                        const colorClass = {
                          central: 'text-emerald-400',
                          high: 'text-emerald-400',
                          medium: 'text-amber-400',
                          low: 'text-rose-400',
                          empty: 'text-slate-400',
                        }[stock.level];

                        const bgBar = {
                          central: 'bg-emerald-500',
                          high: 'bg-emerald-500',
                          medium: 'bg-amber-500',
                          low: 'bg-rose-500',
                          empty: 'bg-slate-500',
                        }[stock.level];

                        const isExpanded = expandedWarehouseId === w.id;
                        const shipments = isExpanded ? getWarehouseShipments(w.id) : null;

                        return (
                          <div
                            key={w.id}
                            ref={(el) => {
                              if (el) warehouseCardRefs.current.set(w.id, el);
                              else warehouseCardRefs.current.delete(w.id);
                            }}
                            className={`rounded-xl bg-slate-950/50 border transition-colors ${
                              isExpanded ? 'border-blue-500/60' : 'border-slate-800/80 hover:border-blue-500/40'
                            }`}
                          >
                          <div
                            onClick={() => {
                              // Plegar la card también suelta la selección del almacén en el mapa.
                              if (isExpanded) {
                                setExpandedWarehouseId(null);
                                if (selectedWarehouseId === w.id) setSelectedWarehouseId(null);
                              } else {
                                setExpandedWarehouseId(w.id);
                              }
                            }}
                            className="p-2 cursor-pointer space-y-1"
                          >
                            <div className="flex justify-between text-[11px]">
                              <span className="font-medium text-slate-100 flex items-center gap-1.5">
                                <span className={`h-1.5 w-1.5 rounded-full ${bgBar}`} />
                                {w.name}
                                {isExpanded
                                  ? <ChevronUp className="h-3 w-3 text-slate-500" />
                                  : <ChevronDown className="h-3 w-3 text-slate-500" />}
                              </span>
                              <span className={`font-mono-code font-bold ${colorClass}`}>
                                {isInfinite ? 'Infinita (∞)' : `${pct}% (${w.currentStock}/${w.capacity})`}
                              </span>
                            </div>

                            {!isInfinite && (
                              <div className="h-1.5 rounded-full overflow-hidden bg-slate-800">
                                <div
                                  className={`h-full rounded-full transition-all ${bgBar}`}
                                  style={{ width: `${Math.min(100, pct)}%` }}
                                />
                              </div>
                            )}

                            <div className="text-[9px] font-mono-code text-slate-500 flex justify-between items-center pt-0.5">
                              <span>{w.code}</span>
                              <span className={colorClass}>
                                {stock.level === 'high' && pct >= 90 ? 'Lleno' : stock.label}
                              </span>
                            </div>
                          </div>

                          {/* Envíos del almacén: en tránsito / por salir en x h / entregados en las últimas x h */}
                          {shipments && (
                            <div className="space-y-2 border-t border-slate-800/80 p-2">
                              <div className="grid grid-cols-3 gap-1">
                                {([
                                  ['transit', 'En tránsito', shipments.transit, Navigation, 'text-sky-400'],
                                  ['upcoming', 'Por salir', shipments.upcoming, Clock, 'text-amber-400'],
                                  ['delivered', 'Entregados', shipments.delivered, Package, 'text-emerald-400'],
                                ] as const).map(([key, label, items, Icon, iconColor]) => (
                                  <button
                                    key={key}
                                    type="button"
                                    onClick={() => setWarehouseInspectorTab(key)}
                                    className={`rounded-xl px-1.5 py-1.5 text-center cursor-pointer ${
                                      warehouseInspectorTab === key
                                        ? 'bg-blue-600/30 border border-blue-500/60'
                                        : 'bg-slate-900/90 border border-slate-800 hover:border-slate-600'
                                    }`}
                                  >
                                    <span className="flex items-center justify-center gap-1 text-[10px] text-slate-300">
                                      <Icon className={`h-3 w-3 ${iconColor}`} />
                                      {label}
                                    </span>
                                    <span className="block font-mono-code text-sm font-bold text-white">{items.length}</span>
                                    <span className="block text-[9px] text-slate-500">
                                      {items.reduce((sum, order) => sum + (order.quantity ?? 0), 0)} paq.
                                    </span>
                                  </button>
                                ))}
                              </div>

                              {warehouseInspectorTab !== 'transit' && (
                                <p className="text-[10px] text-slate-400">
                                  {warehouseInspectorTab === 'upcoming'
                                    ? `Salen en las próximas ${WAREHOUSE_WINDOW_HOURS} horas (~ estimado, aún sin UT)`
                                    : `Entregados en las últimas ${WAREHOUSE_WINDOW_HOURS} horas`}
                                </p>
                              )}

                              {shipments[warehouseInspectorTab].length ? (
                                <div className="max-h-56 space-y-1 overflow-y-auto pr-0.5">
                                  {shipments[warehouseInspectorTab].map((order) => (
                                    <div
                                      key={order.id}
                                      onClick={() => setSelectedOrderId(order.id)}
                                      className="cursor-pointer rounded-lg border border-slate-800 bg-slate-950/60 p-2 text-[10px] hover:border-blue-500/40"
                                    >
                                      <div className="flex items-center justify-between gap-2">
                                        <span className="font-mono-code font-semibold text-blue-300">{order.code}</span>
                                        <span className="text-slate-400">{order.quantity ?? 0} paq.</span>
                                      </div>
                                      <div className="mt-1 flex justify-between text-slate-500">
                                        <span>Destino X={Math.round(order.destination.x)}, Y={Math.round(order.destination.y)}</span>
                                        <span>
                                          {warehouseInspectorTab === 'delivered'
                                            ? `Entregado ${formatSimClock(order.deliveredSimMs)}`
                                            : order.assignedVehicleId ?? 'Sin UT'}
                                          {warehouseInspectorTab === 'upcoming' && ` · sale ${order.departureSimMs === undefined ? '~' : ''}${formatSimClock(upcomingDepartureMs(order))}`}
                                        </span>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <p className="text-[10px] italic text-slate-500">Sin envíos en este periodo.</p>
                              )}
                            </div>
                          )}
                          </div>
                        );
                      })}
                    </div>
                  </StaticSection>

                  {/* SEMÁFORO DE FLOTA */}
                  {false && <StaticSection title="Semáforo de flota" icon={<Car className="h-3.5 w-3.5 text-blue-400" />} badge={vehicles.length}>
                    {(() => {
                      const currentTimestamp = estadoRaw?.marcaTiempoActual;
                      const executionStart = ejecucion?.fechaInicioSimulada;
                      const nowMs = typeof currentTimestamp === 'string'
                        ? parseBackendSimulatedTime(currentTimestamp)
                        : null;
                      const startMs = typeof executionStart === 'string'
                        ? parseBackendSimulatedTime(executionStart)
                        : null;
                      const simMin = nowMs !== null && startMs !== null
                        ? Math.round(((nowMs ?? 0) - (startMs ?? 0)) / 60000)
                        : 0;

                      const semaforos = vehicles.map((v) => getVehicleSemaforoStatus(v, orders, simMin, umbralesSemaforo));
                      const onTimeCount = semaforos.filter((s) => s.state === 'on_time').length;
                      const atRiskCount = semaforos.filter((s) => s.state === 'at_risk').length;
                      const delayedCount = semaforos.filter((s) => s.state === 'delayed').length;
                      const inactiveCount = semaforos.filter((s) => s.state === 'inactive').length;

                      const cars = vehicles.filter((v) => v.type === 'car');
                      const operatingCars = cars.filter((v) => v.status !== 'broken' && v.status !== 'maintenance');
                      const motorcycles = vehicles.filter((v) => v.type === 'motorcycle');
                      const operatingMotorcycles = motorcycles.filter((v) => v.status !== 'broken' && v.status !== 'maintenance');
                      const bicycles = vehicles.filter((v) => v.type === 'bicycle');
                      const operatingBicycles = bicycles.filter((v) => v.status !== 'broken' && v.status !== 'maintenance');

                      return (
                        <>
                          <div className="flex justify-between items-center mb-1">
                            <span className="text-[10px] font-bold uppercase flex items-center gap-1.5 text-white">
                              <Car className="h-3.5 w-3.5 text-blue-400" /> Estado de la Flota
                            </span>
                            <span className="text-[10px] font-mono-code text-slate-400">
                              <span className="text-emerald-400 font-bold">{onTimeCount + atRiskCount}</span>/{vehicles.length} activos
                            </span>
                          </div>

                          {/* 4 Estados de Semáforo */}
                          <div className="grid grid-cols-4 gap-1 text-center font-mono-code text-[9px] mb-2">
                            <div className="p-1.5 rounded-lg border border-emerald-500/40 bg-emerald-950/40 text-emerald-200">
                              <span className="text-[8px] block uppercase font-bold text-emerald-400">A tiempo</span>
                              <span className="font-bold text-emerald-300 text-xs">{onTimeCount}</span>
                            </div>
                            <div className="p-1.5 rounded-lg border border-amber-500/40 bg-amber-950/40 text-amber-200">
                              <span className="text-[8px] block uppercase font-bold text-amber-400">En riesgo</span>
                              <span className="font-bold text-amber-300 text-xs">{atRiskCount}</span>
                            </div>
                            <div className="p-1.5 rounded-lg border border-rose-500/40 bg-rose-950/40 text-rose-200">
                              <span className="text-[8px] block uppercase font-bold text-rose-400">Retraso</span>
                              <span className="font-bold text-rose-300 text-xs">{delayedCount}</span>
                            </div>
                            <div className="p-1.5 rounded-lg border border-slate-700 bg-slate-800/80 text-slate-300">
                              <span className="text-[8px] block uppercase font-bold text-slate-400">Inactivo</span>
                              <span className="font-bold text-slate-200 text-xs">{inactiveCount}</span>
                            </div>
                          </div>

                          {/* Conteo por Tipo de Flota */}
                          <div className="space-y-1.5 text-xs">
                            <div className="flex items-center justify-between px-2.5 py-1.5 rounded-xl border border-slate-800 bg-slate-950/50">
                              <span className="text-[11px] font-medium flex items-center gap-1.5 text-slate-200">
                                <Car className="h-3.5 w-3.5 text-blue-400" /> Autos (TA)
                              </span>
                              <span className="font-mono-code text-xs">
                                <span className="font-bold text-emerald-400">{operatingCars.length}</span>
                                <span className="text-slate-500">/{cars.length}</span>
                              </span>
                            </div>

                            <div className="flex items-center justify-between px-2.5 py-1.5 rounded-xl border border-slate-800 bg-slate-950/50">
                              <span className="text-[11px] font-medium flex items-center gap-1.5 text-slate-200">
                                <FaMotorcycle className="h-3.5 w-3.5 text-purple-400" /> Motos (TM)
                              </span>
                              <span className="font-mono-code text-xs">
                                <span className="font-bold text-emerald-400">{operatingMotorcycles.length}</span>
                                <span className="text-slate-500">/{motorcycles.length}</span>
                              </span>
                            </div>

                            <div className="flex items-center justify-between px-2.5 py-1.5 rounded-xl border border-slate-800 bg-slate-950/50">
                              <span className="text-[11px] font-medium flex items-center gap-1.5 text-slate-200">
                                <FaBicycle className="h-3.5 w-3.5 text-emerald-400" /> Bicis (TB)
                              </span>
                              <span className="font-mono-code text-xs">
                                <span className="font-bold text-emerald-400">{operatingBicycles.length}</span>
                                <span className="text-slate-500">/{bicycles.length}</span>
                              </span>
                            </div>
                          </div>
                        </>
                      );
                    })()}
                  </StaticSection>}

                </div>
              )}
            </div>
            {/* Configuración ya no se repite aquí: está en la barra de secciones (☰). */}
          </div>
        )}
      </aside>
      )}

      {/* Modales Compartidos */}
      <BreakdownModal
        isOpen={isBreakdownModalOpen && Boolean(selectedVehicleId)}
        onClose={() => setIsBreakdownModalOpen(false)}
        vehicles={selectedVehicleId ? vehicles.filter((v) => v.id === selectedVehicleId) : []}
        onConfirmBreakdown={handleConfirmBreakdown}
        isDarkTheme
      />
    </>
  );
};
