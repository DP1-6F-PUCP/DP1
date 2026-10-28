import React, { useEffect, useRef, useState } from 'react';
import {
  Clock,
  AlertTriangle,
  ChevronLeft,
  ChevronDown,
  ChevronUp,
  Car,
  Bike,
  Warehouse as WarehouseIcon,
  Activity,
  Search,
  Filter,
  Truck,
  Package,
  MapPin,
  MinusCircle,
  X,
  SlidersHorizontal,
  Coffee,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Timer,
  Navigation,
  Box,
} from 'lucide-react';
import { useEstadoVisual } from '../engine/useEstadoVisual';
import { useEscenario } from '../features/escenario/hooks/useEscenario';
import { useMapStore } from '../store/mapStore';
import { useVehicles } from '../features/vehiculos/hooks/useVehicles';
import { BreakdownType } from '../types';
import { BreakdownModal } from './BreakdownModal';
import { ConfigModal } from './ConfigModal';
import { useToast } from './ToastProvider';
import { getVehicleSemaforoStatus } from '../utils/vehicleStatus';
import { useSemaforoStore } from '../store/semaforoStore';
import { useScenarioStore } from '../store/scenarioStore';
import { MetricasStrip } from '../features/metricas/components/MetricasStrip';
import { Vehicle } from '../types/vehicle';
import { formatBackendSimulatedTime, parseBackendSimulatedTime } from '../utils/backendTime';

type FleetSortKey =
  | 'occupancy_asc'
  | 'occupancy_desc'
  | 'departure_asc'
  | 'departure_desc'
  | 'arrival_asc'
  | 'arrival_desc'
  | 'dist_remaining_asc'
  | 'dist_remaining_desc'
  | 'dist_traveled_asc'
  | 'dist_traveled_desc';

type DistanceSearchMode = 'none' | 'to_dest' | 'to_origin';

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

const SemaforoBarra: React.FC<{ load: number; capacity: number }> = ({ load, capacity }) => {
  const pct = capacity > 0 ? Math.min(100, Math.round((load / capacity) * 100)) : 0;
  const barColor = pct >= 66 ? 'bg-emerald-500' : pct >= 33 ? 'bg-amber-500' : 'bg-rose-500';
  const dotColor = pct >= 66 ? 'bg-emerald-400' : pct >= 33 ? 'bg-amber-400' : 'bg-rose-400';
  const textColor = pct >= 66 ? 'text-emerald-300' : pct >= 33 ? 'text-amber-300' : 'text-rose-300';
  return (
    <div className="flex items-center gap-1.5 w-full">
      <span className={`h-2 w-2 rounded-full shrink-0 ${dotColor}`} />
      <div className="flex-1 h-1.5 rounded-full bg-slate-800 overflow-hidden">
        <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${pct}%` }} />
      </div>
      <span className={`text-[10px] font-mono-code font-bold shrink-0 ${textColor}`}>
        {load === 0 ? `Vacío (0/${capacity})` : `${load}/${capacity} (${pct}%)`}
      </span>
    </div>
  );
};

const isVehicleReturning = (vehicle: Vehicle) =>
  vehicle.status === 'en_route' && vehicle.returnPath.length > 1;

const SortButton: React.FC<{
  label: string;
  ascKey: FleetSortKey;
  descKey: FleetSortKey;
  current: FleetSortKey;
  onChange: (k: FleetSortKey) => void;
}> = ({ label, ascKey, descKey, current, onChange }) => {
  const isAsc = current === ascKey;
  const isDesc = current === descKey;
  const isActive = isAsc || isDesc;
  return (
    <button
      type="button"
      onClick={() => {
        if (!isActive || isDesc) onChange(ascKey);
        else onChange(descKey);
      }}
      className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-medium shrink-0 transition-all cursor-pointer ${
        isActive
          ? 'bg-blue-600 text-white'
          : 'bg-slate-800/80 border border-slate-700/50 text-slate-400 hover:text-slate-200'
      }`}
    >
      <span>{label}</span>
      {isAsc ? (
        <ArrowUp className="h-2.5 w-2.5" />
      ) : isDesc ? (
        <ArrowDown className="h-2.5 w-2.5" />
      ) : (
        <ArrowUpDown className="h-2.5 w-2.5 opacity-50" />
      )}
    </button>
  );
};

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
  const { warehouses, vehicles, orders, estadoRaw } = useEstadoVisual();
  const { ejecucion } = useEscenario();
  const selectedVehicleId = useMapStore((s) => s.selectedVehicleId);
  const setSelectedVehicleId = useMapStore((s) => s.setSelectedVehicleId);
  const selectedWarehouseId = useMapStore((s) => s.selectedWarehouseId);
  const setSelectedWarehouseId = useMapStore((s) => s.setSelectedWarehouseId);
  const selectedOrderId = useMapStore((s) => s.selectedOrderId);
  const setSelectedOrderId = useMapStore((s) => s.setSelectedOrderId);
  const umbralesSemaforo = useSemaforoStore((s) => s.umbrales);
  const scenarioStartMs = useScenarioStore((s) => s.scenarioStartMs());
  const { reportBreakdown, isReportingBreakdown } = useVehicles();
  const { addToast } = useToast();

  const [activeTab, setActiveTab] = useState<'operation' | 'fleet' | 'shipments'>('operation');
  const [isConfigModalOpen, setIsConfigModalOpen] = useState(false);
  const [fleetSearchTerm, setFleetSearchTerm] = useState('');
  const [fleetFilterType, setFleetFilterType] = useState<'all' | 'car' | 'motorcycle' | 'bicycle'>('all');
  const [fleetFilterStatus, setFleetFilterStatus] = useState<
    'all' | 'idle' | 'en_route' | 'delivering' | 'on_break' | 'broken' | 'maintenance'
  >('all');
  const [fleetSortKey, setFleetSortKey] = useState<FleetSortKey>('occupancy_desc');
  const [distSearchMode, setDistSearchMode] = useState<DistanceSearchMode>('none');
  const [distSearchMinutes, setDistSearchMinutes] = useState('');
  const [expandedVehicleId, setExpandedVehicleId] = useState<string | null>(null);
  const [warehouseUpcomingHours, setWarehouseUpcomingHours] = useState(3);
  const [warehouseDeliveredHours, setWarehouseDeliveredHours] = useState(6);
  const [shipmentSearchTerm, setShipmentSearchTerm] = useState('');
  const [shipmentStatusFilter, setShipmentStatusFilter] = useState<
    'all' | 'on_time' | 'at_risk' | 'delayed' | 'delivered'
  >('all');
  const [shipmentWarehouseFilter, setShipmentWarehouseFilter] = useState('all');

  const previousSelectedVehicleId = useRef<string | null>(selectedVehicleId);
  const previousSelectedOrderId = useRef<string | null>(selectedOrderId);
  const vehicleCardRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const orderCardRefs = useRef<Map<string, HTMLElement>>(new Map());
  const [isBreakdownModalOpen, setIsBreakdownModalOpen] = useState(false);

  useEffect(() => {
    const vehicleSelectionChanged = previousSelectedVehicleId.current !== selectedVehicleId;
    previousSelectedVehicleId.current = selectedVehicleId;

    if (!selectedVehicleId || !vehicleSelectionChanged) return;

    setActiveTab('fleet');
    setExpandedVehicleId(selectedVehicleId);
    if (isCollapsed) onToggleCollapse();

    requestAnimationFrame(() => {
      vehicleCardRefs.current.get(selectedVehicleId)?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    });
  }, [selectedVehicleId, isCollapsed, onToggleCollapse]);

  useEffect(() => {
    const orderSelectionChanged = previousSelectedOrderId.current !== selectedOrderId;
    previousSelectedOrderId.current = selectedOrderId;

    if (!selectedOrderId || !orderSelectionChanged) return;

    setActiveTab('shipments');
    setShipmentSearchTerm('');
    setShipmentStatusFilter('all');
    setShipmentWarehouseFilter('all');
    if (isCollapsed) onToggleCollapse();

    requestAnimationFrame(() => {
      orderCardRefs.current.get(selectedOrderId)?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    });
  }, [selectedOrderId, isCollapsed, onToggleCollapse]);

  const targetWarehouse = warehouses.find((w) => w && w.id === selectedWarehouseId);
  const currentSimulationMinute = estadoRaw?.marcaTiempoActual && ejecucion?.fechaInicioSimulada
    ? Math.max(
        0,
        Math.round(
          (parseBackendSimulatedTime(estadoRaw.marcaTiempoActual)
            - parseBackendSimulatedTime(ejecucion.fechaInicioSimulada)) / 60000
        )
      )
    : 0;

  const getVehicleOrders = (vehicle: Vehicle) =>
    orders.filter(
      (order) =>
        vehicle.assignedOrderIds.includes(order.id) ||
        order.assignedVehicleId === vehicle.id
    );

  const getVehicleDistanceToDestination = (vehicle: Vehicle) => {
    const destination = vehicle.destination ?? getVehicleOrders(vehicle)[0]?.destination;
    return destination ? manhattanDist(vehicle.position.x, vehicle.position.y, destination.x, destination.y) : 0;
  };

  const getVehicleDistanceToOrigin = (vehicle: Vehicle) => {
    const assignedOrder = getVehicleOrders(vehicle)[0];
    const origin = warehouses.find((warehouse) => warehouse.id === vehicle.homeWarehouseId)?.coords
      ?? warehouses.find((warehouse) => warehouse.id === assignedOrder?.warehouseOriginId)?.coords
      ?? warehouses.find((warehouse) => warehouse.id === 'central')?.coords;
    return origin ? manhattanDist(vehicle.position.x, vehicle.position.y, origin.x, origin.y) : 0;
  };

  const getVehicleDistanceTraveled = (vehicle: Vehicle) => {
    const path = vehicle.historyPath.length > 1
      ? vehicle.historyPath
      : vehicle.trajectory.map((point) => ({ x: point.x, y: point.y }));
    return path.reduce(
      (total, point, index, path) =>
        index === 0 ? total : total + manhattanDist(path[index - 1].x, path[index - 1].y, point.x, point.y),
      0
    );
  };

  const handleConfirmBreakdown = (vehicleId: string, type: BreakdownType, reason: string) => {
    reportBreakdown(
      { vehicleId, type, reason },
      {
        onSuccess: () => {
          addToast({
            type: 'warning',
            title: `Avería Tipo ${type} programada`,
            description: `El vehículo ${vehicleId} se averiará en el próximo lote de planificación.`,
          });
        },
        onError: (error) => {
          addToast({
            type: 'error',
            title: `Error al averiar ${vehicleId}`,
            description: error instanceof Error ? error.message : 'No se pudo programar la avería.',
          });
        },
      }
    );
  };

  // Métricas globales de la flota
  const totalFleetCapacity = vehicles.reduce((sum, v) => sum + (v.capacity || 0), 0);
  const totalFleetLoad = vehicles.reduce((sum, v) => sum + (v.currentLoad || 0), 0);
  const fleetFillPercent =
    totalFleetCapacity > 0 ? Math.round((totalFleetLoad / totalFleetCapacity) * 100) : 0;
  const fleetAvailPercent = Math.max(0, 100 - fleetFillPercent);

  const isFleetCritical = fleetFillPercent >= 85;
  const isFleetWarning = fleetFillPercent >= 65 && fleetFillPercent < 85;
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

  // Filtrado de vehículos
  const filteredVehicles = vehicles.filter((v) => {
    const matchesType = fleetFilterType === 'all' || v.type === fleetFilterType;
    const matchesStatus = fleetFilterStatus === 'all' || v.status === fleetFilterStatus;
    const matchesSearch =
      v.code.toLowerCase().includes(fleetSearchTerm.toLowerCase()) ||
      v.id.toLowerCase().includes(fleetSearchTerm.toLowerCase());
    const distance = distSearchMode === 'to_origin'
      ? getVehicleDistanceToOrigin(v)
      : getVehicleDistanceToDestination(v);
    const maxMinutes = Number(distSearchMinutes);
    const matchesDistance =
      distSearchMode === 'none' ||
      !distSearchMinutes.trim() ||
      (Number.isFinite(maxMinutes) && kmToMinutes(distance, v.speed) <= maxMinutes);
    return matchesType && matchesStatus && matchesSearch && matchesDistance;
  }).sort((a, b) => {
    const value = (vehicle: Vehicle) => {
      const assignedOrders = getVehicleOrders(vehicle);
      switch (fleetSortKey) {
        case 'occupancy_asc':
        case 'occupancy_desc':
          return vehicle.capacity > 0 ? vehicle.currentLoad / vehicle.capacity : 0;
        case 'departure_asc':
        case 'departure_desc':
          return assignedOrders.length ? Math.min(...assignedOrders.map((order) => order.createdMinute)) : Infinity;
        case 'arrival_asc':
        case 'arrival_desc':
          return assignedOrders.length ? Math.max(...assignedOrders.map((order) => order.deadlineMinute)) : Infinity;
        case 'dist_remaining_asc':
        case 'dist_remaining_desc':
          return kmToMinutes(getVehicleDistanceToDestination(vehicle), vehicle.speed);
        case 'dist_traveled_asc':
        case 'dist_traveled_desc':
          return getVehicleDistanceTraveled(vehicle);
      }
    };
    const difference = value(a) - value(b);
    return fleetSortKey.endsWith('_desc') ? -difference : difference;
  });

  const filteredOrders = orders.filter((order) => {
    const search = shipmentSearchTerm.trim().toLowerCase();
    const warehouseMatches =
      shipmentWarehouseFilter === 'all' ||
      order.warehouseOriginId === shipmentWarehouseFilter ||
      (shipmentWarehouseFilter === 'central' && !order.warehouseOriginId);
    const statusMatches = shipmentStatusFilter === 'all' || order.status === shipmentStatusFilter;
    const searchMatches =
      !search ||
      [order.code, order.id, order.clientId, 'pedido de cliente'].some((value) =>
        value?.toLowerCase().includes(search)
      );
    return warehouseMatches && statusMatches && searchMatches;
  });

  const formatShipmentTime = (minute: number) => {
    if (scenarioStartMs == null) return '--:--';
    return formatBackendSimulatedTime(scenarioStartMs + minute * 60_000, false);
  };

  const shipmentStatus = {
    on_time: { label: 'A tiempo', className: 'border-emerald-500/50 bg-emerald-950/60 text-emerald-300' },
    at_risk: { label: 'En riesgo', className: 'border-amber-500/50 bg-amber-950/60 text-amber-300' },
    delayed: { label: 'Retrasado', className: 'border-rose-500/50 bg-rose-950/60 text-rose-300' },
    delivered: { label: 'Entregado', className: 'border-blue-500/50 bg-blue-950/60 text-blue-300' },
    collapsed: { label: 'Retrasado', className: 'border-rose-500/50 bg-rose-950/60 text-rose-300' },
  } as const;

  return (
    <>
      <aside
        id="sidebar-ops-nav"
        className={`relative flex flex-col border-r border-[var(--color-sidebar-border)] transition-all duration-300 select-none z-20 shrink-0 ${
          isCollapsed ? 'w-16' : 'w-80 lg:w-96'
        } bg-[var(--color-sidebar-background)] text-slate-100 shadow-xl h-full overflow-hidden`}
      >
        {/* Header con logo y botón collapse */}
        <div className="flex h-14 items-center justify-between px-3.5 border-b border-[var(--color-sidebar-border)]/70 shrink-0">
          {!isCollapsed ? (
            <>
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#2E5B9A] text-white font-bold text-xs shadow-sm tracking-wide">
                  SM
                </div>
                <div className="text-sm font-bold tracking-wider font-mono-code">
                  <span className="text-white">SYS</span>
                  <span className="text-[var(--color-sidebar-icon-muted)] font-medium">MILE</span>
                </div>
              </div>
              <button
                type="button"
                id="btn-toggle-ops-sidebar"
                onClick={onToggleCollapse}
                title="Colapsar menú"
                className="text-[var(--color-sidebar-icon-muted)] hover:text-white p-1 rounded-lg hover:bg-slate-800/60 transition-colors cursor-pointer"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
            </>
          ) : (
            <div className="w-full flex items-center justify-center">
              <button
                type="button"
                id="btn-toggle-ops-sidebar"
                onClick={onToggleCollapse}
                title="Expandir menú"
                className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#2E5B9A] text-white font-bold text-xs shadow-sm cursor-pointer hover:opacity-90"
              >
                SM
              </button>
            </div>
          )}
        </div>

        {/* VISTA COLAPSADA */}
        {isCollapsed ? (
          <div className="flex-1 flex flex-col items-center py-5 gap-4 overflow-y-auto">
            {/* Tab Operación */}
            <button
              type="button"
              onClick={() => {
                setActiveTab('operation');
                onToggleCollapse();
              }}
              className={`p-2.5 rounded-xl text-white shadow transition-all cursor-pointer ${
                activeTab === 'operation'
                  ? 'bg-blue-600 border border-blue-400'
                  : 'bg-[var(--color-sidebar-surface)] hover:bg-[var(--color-sidebar-border)]'
              }`}
              title="Panel de Operación"
            >
              <Activity className="h-4 w-4" />
            </button>

            {/* Tab Flota */}
            <button
              type="button"
              onClick={() => {
                setActiveTab('fleet');
                onToggleCollapse();
              }}
              className={`p-2.5 rounded-xl text-white shadow transition-all cursor-pointer ${
                activeTab === 'fleet'
                  ? 'bg-blue-600 border border-blue-400'
                  : 'bg-[var(--color-sidebar-surface)] hover:bg-[var(--color-sidebar-border)]'
              }`}
              title="Seguimiento de Flota"
            >
              <Car className="h-4 w-4" />
            </button>

            {/* Tab Envíos */}
            <button
              type="button"
              onClick={() => {
                setActiveTab('shipments');
                onToggleCollapse();
              }}
              className={`p-2.5 rounded-xl text-white shadow transition-all cursor-pointer ${
                activeTab === 'shipments'
                  ? 'bg-blue-600 border border-blue-400'
                  : 'bg-[var(--color-sidebar-surface)] hover:bg-[var(--color-sidebar-border)]'
              }`}
              title="Seguimiento de Envíos"
            >
              <Truck className="h-4 w-4" />
            </button>

            <div className="mt-auto flex flex-col gap-3 pb-2">
              <button
                type="button"
                onClick={() => setIsConfigModalOpen(true)}
                className="w-full flex items-center justify-center p-2.5 rounded-xl text-slate-300 hover:text-white bg-[var(--color-sidebar-surface)] hover:bg-[var(--color-sidebar-border)] transition-colors cursor-pointer"
                title="Configuración"
              >
                <SlidersHorizontal className="h-4 w-4" />
              </button>
            </div>
          </div>
        ) : (
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
                <Activity className="h-3.5 w-3.5" />
                <span>Operación</span>
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
                <Truck className="h-3.5 w-3.5" />
                <span>Envíos</span>
              </button>
            </div>

            {/* CUERPO CONTEXTUAL CON SCROLL */}
            <div className="flex-1 overflow-y-auto p-3 space-y-3.5 text-xs bg-[var(--color-sidebar-background)]">
              {/* Panel de Inspección de Almacén Seleccionado en el Mapa */}
              {targetWarehouse && (
                <div
                  id="sidebar-warehouse-inspector"
                  className="p-3.5 rounded-2xl border border-blue-500/60 bg-blue-950/40 shadow-xl space-y-2.5 fade-in"
                >
                  <div className="flex items-start justify-between gap-2 border-b border-blue-800/40 pb-2">
                    <div className="flex items-center gap-2.5">
                      <div
                        className="p-2 rounded-xl text-white shadow-md shrink-0"
                        style={{ backgroundColor: targetWarehouse.color || '#2E5B9A' }}
                      >
                        <WarehouseIcon className="h-4 w-4" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="font-bold text-sm text-white">{targetWarehouse.name}</h4>
                          <span className="text-[10px] font-mono-code px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300 border border-blue-500/30">
                            {targetWarehouse.code}
                          </span>
                        </div>
                        <span className="text-[11px] font-medium text-slate-300">
                          {targetWarehouse.id === 'central'
                            ? '🏢 Almacén Central'
                            : '🏬 Almacén Intermedio'}
                        </span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSelectedWarehouseId(null)}
                      className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 text-xs cursor-pointer"
                      title="Cerrar inspección"
                    >
                      ✕
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="p-2 rounded-xl bg-slate-900/90 border border-slate-800">
                      <span className="text-[10px] text-slate-400 block mb-0.5">Capacidad y Stock</span>
                      <span
                        className={`font-mono-code font-bold ${
                          !Number.isFinite(targetWarehouse.capacity)
                            ? 'text-emerald-400'
                            : targetWarehouse.currentStock / targetWarehouse.capacity >= 0.65
                            ? 'text-emerald-400'
                            : targetWarehouse.currentStock / targetWarehouse.capacity >= 0.3
                            ? 'text-amber-400'
                            : 'text-rose-400'
                        }`}
                      >
                        {!Number.isFinite(targetWarehouse.capacity)
                          ? 'Infinita (∞)'
                          : `${targetWarehouse.currentStock}/${targetWarehouse.capacity} (${Math.round(
                              (targetWarehouse.currentStock / targetWarehouse.capacity) * 100
                            )}%)`}
                      </span>
                    </div>
                    <div className="p-2 rounded-xl bg-slate-900/90 border border-slate-800">
                      <span className="text-[10px] text-slate-400 block mb-0.5">Ubicación</span>
                      <span className="font-mono-code font-bold text-cyan-300">
                        X={targetWarehouse.coords.x}, Y={targetWarehouse.coords.y}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* PESTAÑA: ENVÍOS */}
              {activeTab === 'shipments' ? (
                <div className="space-y-3 fade-in">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-bold text-white">Gestión de Envíos</h3>
                      <p className="text-[11px] text-slate-400">Pedidos activos y seguimiento de SLA</p>
                    </div>
                    <span className="rounded-lg bg-blue-500/15 px-2 py-1 text-[11px] font-mono-code text-blue-300">
                      {filteredOrders.length}/{orders.length}
                    </span>
                  </div>

                  <div className="relative">
                    <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                    <input
                      type="text"
                      value={shipmentSearchTerm}
                      onChange={(event) => setShipmentSearchTerm(event.target.value)}
                      placeholder="Código, cliente o producto..."
                      className="w-full rounded-xl border border-slate-700/80 bg-slate-900 py-2 pl-9 pr-8 text-xs text-slate-100 placeholder-slate-500 focus:border-blue-500 focus:outline-none"
                    />
                    {shipmentSearchTerm && (
                      <button type="button" onClick={() => setShipmentSearchTerm('')} className="absolute right-2.5 top-2.5 text-slate-400 hover:text-white" title="Limpiar búsqueda">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
                    <Filter className="h-3.5 w-3.5 shrink-0 text-slate-500" />
                    {([
                      ['all', 'Todos'],
                      ['on_time', 'A tiempo'],
                      ['at_risk', 'En riesgo'],
                      ['delayed', 'Retrasado'],
                      ['delivered', 'Entregado'],
                    ] as const).map(([key, label]) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setShipmentStatusFilter(key)}
                        className={`shrink-0 rounded-xl px-2.5 py-1.5 text-[11px] font-medium ${
                          shipmentStatusFilter === key ? 'bg-blue-600 text-white' : 'border border-slate-700/50 bg-slate-800/80 text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>

                  <select
                    value={shipmentWarehouseFilter}
                    onChange={(event) => setShipmentWarehouseFilter(event.target.value)}
                    className="w-full rounded-xl border border-slate-700/80 bg-slate-900 px-3 py-2 text-xs text-slate-200 focus:border-blue-500 focus:outline-none"
                  >
                    <option value="all">Todos los almacenes</option>
                    {warehouses.map((warehouse) => (
                      <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>
                    ))}
                  </select>

                  {filteredOrders.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-slate-800 p-8 text-center text-slate-400">
                      <Package className="mx-auto mb-2 h-7 w-7 text-slate-600" />
                      <p className="font-medium text-slate-300">Sin coincidencias</p>
                      <p className="mt-1 text-[11px]">Prueba con otro código o filtro.</p>
                    </div>
                  ) : (
                    <div className="space-y-2.5">
                      {filteredOrders.map((order) => {
                        const status = shipmentStatus[order.status];
                        const warehouse = warehouses.find((item) => item.id === order.warehouseOriginId) ?? warehouses.find((item) => item.id === 'central') ?? warehouses[0];
                        const vehicle = order.assignedVehicleId
                          ? vehicles.find((item) => item.id === order.assignedVehicleId || item.code === order.assignedVehicleId)
                          : undefined;
                        const distance = warehouse
                          ? Math.abs(order.destination.x - warehouse.coords.x) + Math.abs(order.destination.y - warehouse.coords.y)
                          : 0;
                        return (
                          <article
                            key={order.id}
                            ref={(element) => {
                              if (element) orderCardRefs.current.set(order.id, element);
                              else orderCardRefs.current.delete(order.id);
                            }}
                            onClick={() => setSelectedOrderId(selectedOrderId === order.id ? null : order.id)}
                            className={`rounded-2xl p-3 shadow-md cursor-pointer transition-colors ${
                              selectedOrderId === order.id
                                ? 'border-blue-400 bg-blue-950/60 ring-1 ring-blue-400/60'
                                : 'border-slate-800 bg-[#0d1b2e]/90 hover:border-blue-500/40'
                            }`}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <span className="font-mono-code text-sm font-bold text-white">{order.code}</span>
                                <p className="mt-0.5 text-[10px] text-slate-400">Cliente: {order.clientId || 'No informado'}</p>
                              </div>
                              <span className={`shrink-0 rounded-lg border px-2 py-1 text-[10px] font-semibold ${status.className}`}>{status.label}</span>
                            </div>
                            <div className="mt-2 rounded-xl border border-slate-800 bg-slate-950/50 p-2 text-[11px]">
                              <p className="font-medium text-slate-200">Pedido de cliente</p>
                              <p className="mt-1 text-slate-400">Carga: <strong className="text-slate-200">{order.quantity ?? 0} unidades</strong></p>
                            </div>
                            <div className="mt-2 grid grid-cols-2 gap-2 text-[10px]">
                              <div><span className="text-slate-500">Ruta</span><p className="font-medium text-slate-200">{warehouse?.name ?? 'Almacén Central'} → ({Math.round(order.destination.x)}, {Math.round(order.destination.y)}) · {distance} km</p></div>
                              <div><span className="text-slate-500">Destino cartesiano</span><p className="font-mono-code font-medium text-cyan-300">X={order.destination.x}, Y={order.destination.y}</p></div>
                              <div><span className="text-slate-500">Salida / ETA</span><p className="font-mono-code font-medium text-slate-200">{formatShipmentTime(order.createdMinute)} / {formatShipmentTime(order.deadlineMinute)}</p></div>
                              <div><span className="text-slate-500">Tiempo máximo</span><p className="font-medium text-slate-200">{order.slaHours ?? 0} h</p></div>
                            </div>
                            <div className="mt-2 flex items-center justify-between border-t border-slate-800 pt-2">
                              <span className="text-[10px] text-slate-400">UT asignada</span>
                              {vehicle ? (
                                <button
                                  type="button"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    setSelectedVehicleId(vehicle.id);
                                    setActiveTab('fleet');
                                  }}
                                  className="inline-flex items-center gap-1 rounded-lg border border-blue-500/40 bg-blue-500/10 px-2 py-1 text-[10px] font-semibold text-blue-300 hover:bg-blue-500/20"
                                >
                                  <Car className="h-3 w-3" /> {vehicle.code}
                                </button>
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

                  {/* Input de Búsqueda */}
                  <div className="relative">
                    <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                    <input
                      type="text"
                      value={fleetSearchTerm}
                      onChange={(e) => setFleetSearchTerm(e.target.value)}
                      placeholder="Buscar por código (TA01, TM03, TB02)..."
                      className="w-full pl-9 pr-8 py-2 rounded-xl text-xs bg-slate-900 border border-slate-700/80 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500"
                    />
                    {fleetSearchTerm && (
                      <button
                        type="button"
                        onClick={() => setFleetSearchTerm('')}
                        className="absolute right-2.5 top-2.5 text-slate-400 hover:text-white"
                        title="Limpiar"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>

                  {/* Filtros por tipo de vehículo */}
                  <div className="space-y-1">
                    <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                      Tipo de Vehículo
                    </div>
                    <div className="flex items-center gap-1.5 overflow-x-auto text-[11px] pb-1 scrollbar-none">
                      {(['all', 'car', 'motorcycle', 'bicycle'] as const).map((type) => {
                        const count =
                          type === 'all'
                            ? vehicles.length
                            : vehicles.filter((v) => v.type === type).length;
                        const label =
                          type === 'all'
                            ? 'Todos'
                            : type === 'car'
                            ? 'Autos (TA)'
                            : type === 'motorcycle'
                            ? 'Motos (TM)'
                            : 'Bicis (TB)';
                        return (
                          <button
                            key={type}
                            type="button"
                            onClick={() => setFleetFilterType(type)}
                            className={`px-2.5 py-1.5 rounded-xl font-medium transition-all cursor-pointer shrink-0 flex items-center gap-1 ${
                              fleetFilterType === type
                                ? 'bg-blue-600 text-white shadow-sm font-semibold'
                                : 'bg-slate-800/80 text-slate-400 hover:text-slate-200 hover:bg-slate-700 border border-slate-700/50'
                            }`}
                          >
                            <span>{label}</span>
                            <span className="text-[10px] opacity-80 font-mono">({count})</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Filtros por Estado */}
                  <div className="space-y-1">
                    <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider flex items-center justify-between">
                      <span>Filtrar por Estado</span>
                      {fleetFilterStatus !== 'all' && (
                        <button
                          type="button"
                          onClick={() => setFleetFilterStatus('all')}
                          className="text-[10px] text-blue-400 hover:text-blue-300 normal-case font-medium cursor-pointer"
                        >
                          Limpiar filtro
                        </button>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 overflow-x-auto text-[11px] pb-1 scrollbar-none">
                      {[
                        { key: 'all' as const, label: 'Todos', count: vehicles.filter((v) => fleetFilterType === 'all' || v.type === fleetFilterType).length },
                        { key: 'idle' as const, label: 'Inactivos', count: vehicles.filter((v) => v.status === 'idle' && (fleetFilterType === 'all' || v.type === fleetFilterType)).length },
                        { key: 'en_route' as const, label: 'En ruta', count: vehicles.filter((v) => v.status === 'en_route' && (fleetFilterType === 'all' || v.type === fleetFilterType)).length },
                        { key: 'delivering' as const, label: 'Entregando', count: vehicles.filter((v) => v.status === 'delivering' && (fleetFilterType === 'all' || v.type === fleetFilterType)).length },
                        { key: 'on_break' as const, label: 'Refrigerio', count: vehicles.filter((v) => v.status === 'on_break' && (fleetFilterType === 'all' || v.type === fleetFilterType)).length },
                        { key: 'broken' as const, label: 'Averiados', count: vehicles.filter((v) => v.status === 'broken' && (fleetFilterType === 'all' || v.type === fleetFilterType)).length },
                        { key: 'maintenance' as const, label: 'Mantenimiento', count: vehicles.filter((v) => v.status === 'maintenance' && (fleetFilterType === 'all' || v.type === fleetFilterType)).length },
                      ].map((st) => (
                        <button
                          key={st.key}
                          type="button"
                          onClick={() => setFleetFilterStatus(st.key)}
                          className={`px-2.5 py-1 rounded-xl font-medium transition-all cursor-pointer shrink-0 flex items-center gap-1 ${
                            fleetFilterStatus === st.key
                              ? st.key === 'broken'
                                ? 'bg-rose-600 text-white shadow-sm font-semibold'
                                : st.key === 'delivering'
                                ? 'bg-emerald-600 text-white shadow-sm font-semibold'
                                : st.key === 'en_route'
                                ? 'bg-sky-600 text-white shadow-sm font-semibold'
                                : 'bg-blue-600 text-white shadow-sm font-semibold'
                              : 'bg-slate-800/80 text-slate-400 hover:text-slate-200 border border-slate-700/50'
                          }`}
                        >
                          <span>{st.label}</span>
                          <span className="text-[10px] opacity-80 font-mono">({st.count})</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-2 rounded-xl border border-slate-800 bg-slate-900/50 p-2.5">
                    <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      <Navigation className="h-3.5 w-3.5 text-cyan-400" />
                      Distancia por recorrer
                    </div>
                    <div className="flex gap-1.5">
                      {([
                        ['none', 'Sin filtro'],
                        ['to_dest', 'Al destino'],
                        ['to_origin', 'Al origen'],
                      ] as const).map(([mode, label]) => (
                        <button
                          key={mode}
                          type="button"
                          onClick={() => setDistSearchMode(mode)}
                          className={`rounded-lg px-2 py-1 text-[10px] font-medium ${
                            distSearchMode === mode ? 'bg-cyan-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                    {distSearchMode !== 'none' && (
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min="0"
                          value={distSearchMinutes}
                          onChange={(event) => setDistSearchMinutes(event.target.value)}
                          placeholder="Máx. minutos"
                          className="min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-[11px] text-slate-100 focus:border-cyan-500 focus:outline-none"
                        />
                        <span className="text-[10px] text-slate-500">estimados</span>
                      </div>
                    )}
                  </div>

                  <div className="space-y-1.5">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Ordenar lista</div>
                    <div className="flex flex-wrap gap-1.5">
                      <SortButton label="Ocupación" ascKey="occupancy_asc" descKey="occupancy_desc" current={fleetSortKey} onChange={setFleetSortKey} />
                      <SortButton label="Salida" ascKey="departure_asc" descKey="departure_desc" current={fleetSortKey} onChange={setFleetSortKey} />
                      <SortButton label="Llegada" ascKey="arrival_asc" descKey="arrival_desc" current={fleetSortKey} onChange={setFleetSortKey} />
                      <SortButton label="Por recorrer" ascKey="dist_remaining_asc" descKey="dist_remaining_desc" current={fleetSortKey} onChange={setFleetSortKey} />
                      <SortButton label="Recorrida" ascKey="dist_traveled_asc" descKey="dist_traveled_desc" current={fleetSortKey} onChange={setFleetSortKey} />
                    </div>
                  </div>

                  {/* Lista de Vehículos */}
                  <div className="space-y-2.5 pt-1">
                    {filteredVehicles.length === 0 ? (
                      <div className="p-6 rounded-2xl border border-dashed border-slate-800 text-center text-slate-400 space-y-1">
                        <p className="font-medium text-slate-300">No se encontraron vehículos</p>
                        <p className="text-[11px]">Intente con otro filtro o término.</p>
                      </div>
                    ) : (
                      filteredVehicles.map((v) => {
                        const isSelected = selectedVehicleId === v.id;
                        const isBroken = v.status === 'broken';
                        const isReturning = isVehicleReturning(v);
                        const vehicleOrders = getVehicleOrders(v);
                        const distanceToDestination = getVehicleDistanceToDestination(v);
                        const distanceToOrigin = getVehicleDistanceToOrigin(v);
                        const departureMinute = vehicleOrders.length
                          ? Math.min(...vehicleOrders.map((order) => order.createdMinute))
                          : undefined;
                        const arrivalMinute = vehicleOrders.length
                          ? Math.max(...vehicleOrders.map((order) => order.deadlineMinute))
                          : undefined;

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
                                  isReturning ? 'bg-slate-600/30 text-slate-300' : 'bg-blue-600/20 text-blue-400'
                                }`}>
                                  {v.type === 'car' ? <Car className="h-4 w-4" /> : <Bike className="h-4 w-4" />}
                                </div>
                                <div className="flex items-baseline gap-1.5">
                                  <span className="font-mono-code font-bold text-sm text-white">{v.code}</span>
                                  <span className="text-[10px] text-slate-400 font-semibold uppercase">
                                    {v.type === 'car' ? 'CAR' : v.type === 'motorcycle' ? 'MOTO' : 'BICI'}
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
                                    <span className="h-1.5 w-1.5 rounded-full bg-sky-400 animate-pulse" /> En ruta
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
                                  <span className="border border-rose-500/60 bg-rose-950/70 text-rose-300 text-[11px] px-2 py-0.5 rounded-lg flex items-center gap-1 font-bold animate-pulse">
                                    <AlertTriangle className="h-3 w-3 text-rose-400" /> Averiado
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* Métricas: Velocidad, Carga, Entregas */}
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
                              <div className="p-1.5 rounded-lg bg-slate-950/50 border border-slate-800/80">
                                <span className="text-[9px] text-slate-400 block">Entregas</span>
                                <span className="font-mono-code font-bold text-xs text-emerald-400">
                                  {v.totalDelivered}
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
                              <SemaforoBarra load={v.currentLoad} capacity={v.capacity} />
                            )}
                            <div className="mt-1 flex flex-wrap justify-between gap-x-2 text-[9px] text-slate-500">
                              <span>Destino: {kmToMinutes(distanceToDestination, v.speed)} min</span>
                              <span>Origen: {kmToMinutes(distanceToOrigin, v.speed)} min</span>
                              <span>Salida: {departureMinute === undefined ? '--:--' : formatShipmentTime(departureMinute)}</span>
                              <span>Llegada: {arrivalMinute === undefined ? '--:--' : formatShipmentTime(arrivalMinute)}</span>
                            </div>

                            {/* Detalle si está seleccionado */}
                            {expandedVehicleId === v.id && (
                              <div className="mt-2 space-y-2 border-t border-[var(--color-sidebar-border)] pt-2 fade-in">
                                <div className="flex items-center justify-between">
                                  <span className="flex items-center gap-1.5 text-[11px] font-bold text-slate-100">
                                    <Package className="h-3.5 w-3.5 text-[var(--color-secondary)]" />
                                    Envíos a Bordo ({vehicleOrders.length})
                                  </span>
                                  <span className="text-[10px] text-[var(--color-sidebar-text-muted)]">Pedidos asignados</span>
                                </div>

                                {vehicleOrders.length === 0 ? (
                                  <p className="rounded-xl border border-[var(--color-sidebar-border)] bg-[var(--color-sidebar-surface)] p-2 text-[10px] italic text-[var(--color-sidebar-text-muted)]">
                                    Sin pedidos asignados
                                  </p>
                                ) : (
                                  <div className="space-y-1.5">
                                    {vehicleOrders.map((order) => (
                                      <div
                                        key={order.id}
                                        className="rounded-xl border border-[var(--color-sidebar-border)] bg-[var(--color-sidebar-surface)] p-2 text-slate-100"
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
                                          <span className="font-mono-code text-slate-400">
                                            Tiempo máximo: {order.slaHours ?? 0} h
                                          </span>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                )}

                                {isBroken && (
                                  <div className="text-right">
                                    <span className="text-[10px] font-semibold py-0.5 px-2 rounded bg-[var(--color-danger)]/20 text-[var(--color-danger)] border border-[var(--color-danger)]/40">
                                      Avería en curso
                                    </span>
                                  </div>
                                )}
                                {!isBroken && (
                                  <div className="flex items-center justify-between gap-2">
                                    <span className="text-[11px] text-blue-300 font-mono-code flex items-center gap-1">
                                      <MapPin className="h-3.5 w-3.5" /> X={Math.round(v.position.x)}, Y={Math.round(v.position.y)}
                                    </span>
                                    <button
                                      type="button"
                                      disabled={isReportingBreakdown}
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        setIsBreakdownModalOpen(true);
                                      }}
                                      className="text-[10px] font-semibold py-1 px-2 rounded-lg bg-rose-500/20 text-rose-300 border border-rose-500/40 hover:bg-rose-500/30 disabled:opacity-50 disabled:cursor-not-allowed transition-colors inline-flex items-center gap-1"
                                    >
                                      <AlertTriangle className="h-3 w-3 text-rose-400" />
                                      Crear avería
                                    </button>
                                  </div>
                                )}
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
                  {/* MÉTRICAS DE DESEMPEÑO (MetricasOperacionDTO completo -- antes solo se leía
                      contadorIncumplidos para el banner de ejecución detenida, el resto se
                      descartaba sin mostrarse en ningún lado) */}
                  {estadoRaw?.metricas && (
                    <StaticSection title="Métricas de la operación" icon={<Activity className="h-3.5 w-3.5 text-cyan-400" />}>
                      <MetricasStrip metricas={estadoRaw.metricas} />
                    </StaticSection>
                  )}

                  {/* CAPACIDAD DE ALMACENES */}
                  <StaticSection
                    title="Almacenes y capacidad"
                    icon={<WarehouseIcon className="h-3.5 w-3.5 text-blue-400" />}
                    badge={warehouses.length}
                  >
                    <div className="space-y-2.5">

                      {warehouses.map((w) => {
                        const isInfinite = !Number.isFinite(w.capacity);
                        const pct = isInfinite ? 100 : Math.round((w.currentStock / w.capacity) * 100);

                        const colorClass = isInfinite
                          ? 'text-emerald-400'
                          : pct >= 65
                          ? 'text-emerald-400'
                          : pct >= 30
                          ? 'text-amber-400'
                          : 'text-rose-400';

                        const bgBar = isInfinite
                          ? 'bg-emerald-500'
                          : pct >= 65
                          ? 'bg-emerald-500'
                          : pct >= 30
                          ? 'bg-amber-500'
                          : 'bg-rose-500';

                        return (
                          <div
                            key={w.id}
                            onClick={() => setSelectedWarehouseId(selectedWarehouseId === w.id ? null : w.id)}
                            className="p-2 rounded-xl bg-slate-950/50 border border-slate-800/80 hover:border-blue-500/40 transition-colors cursor-pointer space-y-1"
                          >
                            <div className="flex justify-between text-[11px]">
                              <span className="font-medium text-slate-100 flex items-center gap-1.5">
                                <span className={`h-1.5 w-1.5 rounded-full ${bgBar}`} />
                                {w.name}
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
                                {isInfinite
                                  ? 'Oficina Principal'
                                  : pct >= 90
                                  ? 'Lleno'
                                  : pct >= 65
                                  ? 'Abastecido'
                                  : pct >= 30
                                  ? 'Nivel medio'
                                  : 'Por agotarse'}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </StaticSection>

                  {false && warehouses.map((warehouse) => {
                    const warehouseOrders = orders.filter(
                      (order) => order.warehouseOriginId === warehouse.id || (!order.warehouseOriginId && warehouse.id === 'central')
                    );
                    const inTransitOrders = warehouseOrders.filter(
                      (order) => order.status !== 'delivered' && order.assignedVehicleId
                    );
                    const upcomingOrders = warehouseOrders.filter(
                      (order) =>
                        order.status !== 'delivered' &&
                        order.createdMinute >= currentSimulationMinute &&
                        order.createdMinute <= currentSimulationMinute + warehouseUpcomingHours * 60
                    );
                    const deliveredOrders = warehouseOrders.filter(
                      (order) =>
                        order.status === 'delivered' &&
                        order.deliveredMinute !== undefined &&
                        currentSimulationMinute - order.deliveredMinute <= warehouseDeliveredHours * 60
                    );
                    const renderWarehouseOrders = (items: typeof orders) =>
                      items.length ? (
                        <div className="space-y-1">
                          {items.map((order) => (
                            <div key={order.id} className="rounded-lg border border-slate-800 bg-slate-950/60 p-2 text-[10px]">
                              <div className="flex items-center justify-between gap-2">
                                <span className="font-mono-code font-semibold text-blue-300">{order.code}</span>
                                <span className="text-slate-400">{order.quantity ?? 0} productos</span>
                              </div>
                              <div className="mt-1 flex justify-between text-slate-500">
                                <span>Destino X={Math.round(order.destination.x)}, Y={Math.round(order.destination.y)}</span>
                                <span>{order.assignedVehicleId ?? 'Sin UT'}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-[10px] italic text-slate-500">Sin registros para este periodo.</p>
                      );

                    return (
                      <React.Fragment key={warehouse.id}>
                        <StaticSection
                          title={`${warehouse.name}: en tránsito`}
                          icon={<Navigation className="h-3.5 w-3.5 text-sky-400" />}
                          badge={inTransitOrders.length}
                        >
                          {renderWarehouseOrders(inTransitOrders)}
                        </StaticSection>
                        <StaticSection
                          title={`${warehouse.name}: próximos a salir`}
                          icon={<Clock className="h-3.5 w-3.5 text-amber-400" />}
                          badge={upcomingOrders.length}
                        >
                          <label className="flex items-center gap-2 text-[10px] text-slate-400">
                            Próximas
                            <input
                              type="number"
                              min="1"
                              max="48"
                              value={warehouseUpcomingHours}
                              onChange={(event) => setWarehouseUpcomingHours(Math.max(1, Number(event.target.value) || 1))}
                              className="w-14 rounded border border-slate-700 bg-slate-950 px-1.5 py-1 text-slate-100"
                            />
                            horas
                          </label>
                          {renderWarehouseOrders(upcomingOrders)}
                        </StaticSection>
                        <StaticSection
                          title={`${warehouse.name}: entregados recientemente`}
                          icon={<Package className="h-3.5 w-3.5 text-emerald-400" />}
                          badge={deliveredOrders.length}
                        >
                          <label className="flex items-center gap-2 text-[10px] text-slate-400">
                            Últimas
                            <input
                              type="number"
                              min="1"
                              max="168"
                              value={warehouseDeliveredHours}
                              onChange={(event) => setWarehouseDeliveredHours(Math.max(1, Number(event.target.value) || 1))}
                              className="w-14 rounded border border-slate-700 bg-slate-950 px-1.5 py-1 text-slate-100"
                            />
                            horas
                          </label>
                          {renderWarehouseOrders(deliveredOrders)}
                        </StaticSection>
                      </React.Fragment>
                    );
                  })}

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
                                <Bike className="h-3.5 w-3.5 text-purple-400" /> Motos (TM)
                              </span>
                              <span className="font-mono-code text-xs">
                                <span className="font-bold text-emerald-400">{operatingMotorcycles.length}</span>
                                <span className="text-slate-500">/{motorcycles.length}</span>
                              </span>
                            </div>

                            <div className="flex items-center justify-between px-2.5 py-1.5 rounded-xl border border-slate-800 bg-slate-950/50">
                              <span className="text-[11px] font-medium flex items-center gap-1.5 text-slate-200">
                                <Bike className="h-3.5 w-3.5 text-emerald-400" /> Bicis (TB)
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

            {/* Footer de configuración */}
            <div className="p-3 border-t border-[var(--color-sidebar-border)] bg-[var(--color-sidebar-background)] shrink-0">
              <button
                type="button"
                onClick={() => setIsConfigModalOpen(true)}
                className="w-full flex items-center justify-center rounded-xl py-2.5 px-3 transition-colors cursor-pointer text-slate-100 hover:text-white hover:bg-[var(--color-sidebar-surface)] gap-3"
                title="Configuración"
              >
                <SlidersHorizontal className="h-5 w-5 text-white shrink-0" />
                <span className="text-sm font-medium">Configuración</span>
              </button>
            </div>
          </div>
        )}
      </aside>

      {/* Modales Compartidos */}
      <ConfigModal
        isOpen={isConfigModalOpen}
        onClose={() => setIsConfigModalOpen(false)}
      />
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
