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
  Truck,
  Package,
  MapPin,
  MinusCircle,
  X,
  SlidersHorizontal,
  Coffee,
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
import {
   getVehicleSemaforoStatus,
  BREAKDOWN_LEVEL_CONFIGS,
  getBreakdownLevelConfig,
  VEHICLE_TYPE_META,
} from '../utils/vehicleStatus';
import { FaMotorcycle } from 'react-icons/fa';
import { useSemaforoStore } from '../store/semaforoStore';
import { getWarehouseStockStatus } from '../utils/warehouseStock';
import {
  classifyWarehouseShipments,
  deliveryMs,
  isDeliveredRecently,
  isDueSoon,
  upcomingDepartureMs,
  WAREHOUSE_WINDOW_HOURS,
} from '../utils/warehouseShipments';
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

/**
 * Rangos del filtro de flota por distancia por recorrer al destino (rúbrica E11), semiabiertos
 * [min, max[ en km. La grilla es de 1 km por celda, así que basta con la distancia Manhattan.
 */
const FLEET_DISTANCE_RANGES = [
  { key: '0-10', label: '0–10', min: 0, max: 10 },
  { key: '10-20', label: '10–20', min: 10, max: 20 },
  { key: '20-40', label: '20–40', min: 20, max: 40 },
  { key: '40-200', label: '40–200', min: 40, max: 200 },
] as const;

type FleetDistanceFilter = 'all' | (typeof FLEET_DISTANCE_RANGES)[number]['key'];

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

/** Criterios de orden de la flota; cada uno tiene su variante _asc y _desc en FleetSortKey. */
const FLEET_SORT_OPTIONS = [
  { base: 'occupancy', label: 'Ocupación' },
  { base: 'departure', label: 'Salida' },
  { base: 'arrival', label: 'Llegada' },
  { base: 'dist_remaining', label: 'Distancia por recorrer' },
  { base: 'dist_traveled', label: 'Distancia recorrida' },
] as const;

const FLEET_STATUS_OPTIONS = [
  { key: 'all', label: 'Todos', dot: undefined },
  { key: 'idle', label: 'Inactivos', dot: '#94A3B8' },
  { key: 'en_route', label: 'En ruta', dot: '#38BDF8' },
  { key: 'delivering', label: 'Entregando', dot: '#34D399' },
  { key: 'on_break', label: 'Refrigerio', dot: '#FBBF24' },
  { key: 'broken', label: 'Averiados', dot: '#F43F5E' },
  { key: 'maintenance', label: 'Mantenimiento', dot: '#A78BFA' },
] as const;

/** Fila de filtro: etiqueta fija a la izquierda y controles a la derecha. */
const FilterRow: React.FC<{ label: string; hint?: React.ReactNode; children: React.ReactNode }> = ({
  label,
  hint,
  children,
}) => (
  <div className="grid grid-cols-[4.5rem_1fr] items-start gap-2">
    <div className="pt-1.5 leading-tight">
      <span className="text-[10px] font-semibold text-slate-400">{label}</span>
      {hint && <span className="block text-[9px] text-slate-500">{hint}</span>}
    </div>
    <div className="min-w-0">{children}</div>
  </div>
);

/**
 * Control segmentado: una sola opción activa. Con `columns` las opciones se reparten en una
 * grilla de varias filas (para etiquetas largas que no entran en una sola línea del panel).
 */
function Segmented<T extends string | number>({
  options,
  value,
  onChange,
  columns,
}: {
  options: readonly { value: T; label: React.ReactNode; title?: string }[];
  value: T;
  onChange: (value: T) => void;
  columns?: number;
}) {
  return (
    <div
      className={`${columns ? 'grid gap-0.5' : 'flex'} rounded-lg border border-slate-700/70 bg-slate-950/60 p-0.5`}
      style={columns ? { gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` } : undefined}
    >
      {options.map((option) => (
        <button
          key={String(option.value)}
          type="button"
          title={option.title}
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
          className={`flex flex-1 items-center justify-center gap-1 whitespace-nowrap rounded-md px-1.5 py-1 text-[10.5px] font-medium transition-colors cursor-pointer ${
            value === option.value
              ? 'bg-blue-600 text-white shadow-sm'
              : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

const SortButton: React.FC<{
  current: FleetSortKey;
  onChange: (k: FleetSortKey) => void;
}> = ({ current, onChange }) => {
  const base = current.replace(/_(asc|desc)$/, '');
  const isDesc = current.endsWith('_desc');
  return (
    <div className="flex items-center gap-1.5">
      <select
        value={base}
        onChange={(event) => onChange(`${event.target.value}_${isDesc ? 'desc' : 'asc'}` as FleetSortKey)}
        aria-label="Ordenar vehículos por"
        className="min-w-0 flex-1 cursor-pointer rounded-lg border border-slate-700/70 bg-slate-950/60 px-2 py-1.5 text-[11px] text-slate-200 focus:border-blue-500 focus:outline-none"
      >
        {FLEET_SORT_OPTIONS.map((option) => (
          <option key={option.base} value={option.base}>{option.label}</option>
        ))}
      </select>
      <button
        type="button"
        onClick={() => onChange(`${base}_${isDesc ? 'asc' : 'desc'}` as FleetSortKey)}
        title={isDesc ? 'De mayor a menor (clic para invertir)' : 'De menor a mayor (clic para invertir)'}
        aria-label={isDesc ? 'Orden descendente' : 'Orden ascendente'}
        className="flex h-[30px] shrink-0 items-center gap-1 rounded-lg border border-slate-700/70 bg-slate-950/60 px-2 text-[10.5px] font-medium text-slate-300 hover:border-blue-500 hover:text-white cursor-pointer"
      >
        {isDesc ? <ArrowDown className="h-3 w-3" /> : <ArrowUp className="h-3 w-3" />}
        {isDesc ? 'Mayor' : 'Menor'}
      </button>
    </div>
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
  const { warehouses, vehicles, orders, estadoRaw, marcaVisibleMs } = useEstadoVisual();
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
  const [fleetFilterBreakdownType, setFleetFilterBreakdownType] = useState<'all' | BreakdownType>('all');
  const [fleetSortKey, setFleetSortKey] = useState<FleetSortKey>('occupancy_desc');
  const [fleetFilterDistance, setFleetFilterDistance] = useState<FleetDistanceFilter>('all');
  const [isFleetFiltersOpen, setIsFleetFiltersOpen] = useState(true);
  const [distSearchMode, setDistSearchMode] = useState<DistanceSearchMode>('none');
  const [distSearchMinutes, setDistSearchMinutes] = useState('');
  const [expandedVehicleId, setExpandedVehicleId] = useState<string | null>(null);
  const [warehouseInspectorTab, setWarehouseInspectorTab] = useState<'transit' | 'upcoming' | 'delivered'>('transit');
  const [expandedWarehouseId, setExpandedWarehouseId] = useState<string | null>(null);
  const [shipmentSearchTerm, setShipmentSearchTerm] = useState('');
  const [shipmentStatusFilter, setShipmentStatusFilter] = useState<
    'all' | 'on_time' | 'at_risk' | 'delayed' | 'delivered'
  >('all');
  const [shipmentWindowFilter, setShipmentWindowFilter] = useState<'all' | 'delivered' | 'due'>('all');

  const previousSelectedVehicleId = useRef<string | null>(selectedVehicleId);
  const previousSelectedOrderId = useRef<string | null>(selectedOrderId);
  const vehicleCardRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const orderCardRefs = useRef<Map<string, HTMLElement>>(new Map());
  const warehouseCardRefs = useRef<Map<string, HTMLDivElement>>(new Map());
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
    setShipmentWindowFilter('all');
    if (isCollapsed) onToggleCollapse();

    requestAnimationFrame(() => {
      orderCardRefs.current.get(selectedOrderId)?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    });
  }, [selectedOrderId, isCollapsed, onToggleCollapse]);

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
  const previousSelectedWarehouseId = useRef<string | null>(selectedWarehouseId);
  useEffect(() => {
    const warehouseSelectionChanged = previousSelectedWarehouseId.current !== selectedWarehouseId;
    previousSelectedWarehouseId.current = selectedWarehouseId;
    if (!selectedWarehouseId || !warehouseSelectionChanged) return;

    setActiveTab('operation');
    setExpandedWarehouseId(selectedWarehouseId);
    if (isCollapsed) onToggleCollapse();

    requestAnimationFrame(() => {
      warehouseCardRefs.current.get(selectedWarehouseId)?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    });
  }, [selectedWarehouseId, isCollapsed, onToggleCollapse]);

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

  // Rango de distancia por recorrer del vehículo, o null si no tiene destino (inactivo / sin
  // ruta): esos no caen en ningún rango, para no inflar [0–10[ como si estuvieran a 0 km.
  const getVehicleDistanceRange = (vehicle: Vehicle): FleetDistanceFilter | null => {
    if (!getVehicleDestination(vehicle)) return null;
    const km = getVehicleDistanceToDestination(vehicle);
    return FLEET_DISTANCE_RANGES.find((range) => km >= range.min && km < range.max)?.key ?? null;
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

  // Filtrado de vehículos: primero todo menos el rango de distancia (sobre esto se cuentan los
  // chips de distancia), luego el rango y el orden.
  const vehiclesBeforeDistanceFilter = vehicles.filter((v) => {
    const matchesType = fleetFilterType === 'all' || v.type === fleetFilterType;
    const matchesStatus = fleetFilterStatus === 'all' || v.status === fleetFilterStatus;
    const matchesBreakdownType =
      fleetFilterStatus !== 'broken' ||
      fleetFilterBreakdownType === 'all' ||
      v.breakdownType === fleetFilterBreakdownType;
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
    return matchesType && matchesStatus && matchesBreakdownType && matchesSearch && matchesDistance;
  });
  const vehicleDistanceRanges = new Map(
    vehiclesBeforeDistanceFilter.map((v) => [v.id, getVehicleDistanceRange(v)] as const)
  );
  const filteredVehicles = vehiclesBeforeDistanceFilter.filter(
    (v) => fleetFilterDistance === 'all' || vehicleDistanceRanges.get(v.id) === fleetFilterDistance
  ).sort((a, b) => {
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

  // Filtros activos de la flota, como etiquetas que se pueden quitar una a una (visibles aun con
  // el panel de filtros plegado).
  const distSearchMinutesValue = Number(distSearchMinutes);
  const activeFleetFilterPills = [
    fleetFilterType !== 'all' && {
      key: 'type',
      label: VEHICLE_TYPE_META[fleetFilterType].shortLabel,
      onClear: () => setFleetFilterType('all'),
    },
    fleetFilterStatus !== 'all' && {
      key: 'status',
      label: FLEET_STATUS_OPTIONS.find((status) => status.key === fleetFilterStatus)?.label ?? fleetFilterStatus,
      onClear: () => {
        setFleetFilterStatus('all');
        setFleetFilterBreakdownType('all');
      },
    },
    fleetFilterBreakdownType !== 'all' && {
      key: 'breakdown',
      label: `Avería T${fleetFilterBreakdownType}`,
      onClear: () => setFleetFilterBreakdownType('all'),
    },
    fleetFilterDistance !== 'all' && {
      key: 'distance',
      label: `${FLEET_DISTANCE_RANGES.find((range) => range.key === fleetFilterDistance)?.label} km`,
      onClear: () => setFleetFilterDistance('all'),
    },
    distSearchMode !== 'none' && distSearchMinutes.trim() !== '' && Number.isFinite(distSearchMinutesValue) && {
      key: 'time',
      label: `≤ ${distSearchMinutesValue} min ${distSearchMode === 'to_dest' ? 'al destino' : 'al origen'}`,
      onClear: () => {
        setDistSearchMode('none');
        setDistSearchMinutes('');
      },
    },
  ].filter((pill): pill is { key: string; label: string; onClear: () => void } => Boolean(pill));
  const activeFleetFilterCount = activeFleetFilterPills.length;
  const clearFleetFilters = () => activeFleetFilterPills.forEach((pill) => pill.onClear());

  // Ventanas de 4 h de la lista de envíos (rúbrica E32/E33): se combinan con estado y búsqueda.
  const shipmentWindows = {
    delivered: marcaVisibleMs === null ? [] : orders.filter((order) => isDeliveredRecently(order, marcaVisibleMs)),
    due: marcaVisibleMs === null ? [] : orders.filter((order) => isDueSoon(order, marcaVisibleMs)),
  };

  const filteredOrders = orders.filter((order) => {
    const search = shipmentSearchTerm.trim().toLowerCase();
    const statusMatches = shipmentStatusFilter === 'all' || order.status === shipmentStatusFilter;
    const windowMatches = shipmentWindowFilter === 'all' || shipmentWindows[shipmentWindowFilter].includes(order);
    const searchMatches =
      !search ||
      [order.code, order.id, order.clientId, 'pedido de cliente'].some((value) =>
        value?.toLowerCase().includes(search)
      );
    return statusMatches && windowMatches && searchMatches;
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

                  <FilterRow label="Estado">
                    <div className="flex flex-wrap gap-1">
                      {([
                        ['all', 'Todos', null],
                        ['on_time', 'A tiempo', '#34D399'],
                        ['at_risk', 'En riesgo', '#FBBF24'],
                        ['delayed', 'Retrasado', '#FB7185'],
                        ['delivered', 'Entregado', '#60A5FA'],
                      ] as const).map(([key, label, dot]) => (
                        <button
                          key={key}
                          type="button"
                          aria-pressed={shipmentStatusFilter === key}
                          onClick={() => setShipmentStatusFilter(key)}
                          className={`flex items-center gap-1 rounded-md border px-1.5 py-1 text-[10.5px] font-medium transition-colors cursor-pointer ${
                            shipmentStatusFilter === key
                              ? 'border-blue-500 bg-blue-600 text-white'
                              : 'border-slate-700/70 bg-slate-950/60 text-slate-400 hover:text-slate-200'
                          }`}
                        >
                          {dot && <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: dot }} />}
                          {label}
                        </button>
                      ))}
                    </div>
                  </FilterRow>

                  <div className="grid grid-cols-2 gap-1.5">
                    {([
                      ['delivered', `Entregados últimas ${WAREHOUSE_WINDOW_HOURS} h`],
                      ['due', `Por entregar próximas ${WAREHOUSE_WINDOW_HOURS} h`],
                    ] as const).map(([key, label]) => (
                      <button
                        key={key}
                        type="button"
                        aria-pressed={shipmentWindowFilter === key}
                        onClick={() => setShipmentWindowFilter(shipmentWindowFilter === key ? 'all' : key)}
                        className={`rounded-xl px-2 py-1.5 text-left cursor-pointer ${
                          shipmentWindowFilter === key
                            ? 'bg-blue-600/30 border border-blue-500/60'
                            : 'bg-slate-900/90 border border-slate-800 hover:border-slate-600'
                        }`}
                      >
                        <span className="block text-[10px] text-slate-300">{label}</span>
                      </button>
                    ))}
                  </div>

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
                        const delivery = deliveryMs(order);
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
                              <div className="col-span-2">
                                <span className="text-slate-500">Entrega</span>
                                <p className="font-mono-code font-medium text-slate-200">
                                  {delivery === undefined
                                    ? 'Sin estimar'
                                    : `${order.deliveredSimMs === undefined ? '~' : ''}${formatSimClock(delivery)}`}
                                </p>
                              </div>
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

                  {/* Búsqueda por código + botón que pliega el panel de filtros */}
                  <div className="flex items-center gap-1.5">
                    <div className="relative min-w-0 flex-1">
                      <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-slate-500" />
                      <input
                        type="text"
                        value={fleetSearchTerm}
                        onChange={(e) => setFleetSearchTerm(e.target.value)}
                        placeholder="Buscar por código (TA01, TM03…)"
                        className="w-full rounded-lg border border-slate-700/70 bg-slate-950/60 py-1.5 pl-8 pr-7 text-[11px] text-slate-100 placeholder-slate-500 focus:border-blue-500 focus:outline-none"
                      />
                      {fleetSearchTerm && (
                        <button
                          type="button"
                          onClick={() => setFleetSearchTerm('')}
                          className="absolute right-2 top-2 text-slate-400 hover:text-white"
                          title="Limpiar búsqueda"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => setIsFleetFiltersOpen(!isFleetFiltersOpen)}
                      aria-expanded={isFleetFiltersOpen}
                      className={`flex h-[30px] shrink-0 items-center gap-1.5 rounded-lg border px-2.5 text-[11px] font-medium cursor-pointer transition-colors ${
                        isFleetFiltersOpen || activeFleetFilterCount > 0
                          ? 'border-blue-500/60 bg-blue-600/15 text-blue-200'
                          : 'border-slate-700/70 bg-slate-950/60 text-slate-300 hover:text-white'
                      }`}
                    >
                      <SlidersHorizontal className="h-3.5 w-3.5" />
                      Filtros
                      {activeFleetFilterCount > 0 && (
                        <span className="rounded-full bg-blue-600 px-1.5 text-[9.5px] font-bold leading-4 text-white">
                          {activeFleetFilterCount}
                        </span>
                      )}
                    </button>
                  </div>

                  {isFleetFiltersOpen && (
                    <div className="space-y-2.5 rounded-xl border border-slate-800 bg-slate-900/50 p-2.5 fade-in">
                      <FilterRow label="Tipo">
                        <Segmented
                          value={fleetFilterType}
                          onChange={setFleetFilterType}
                          options={[
                            { value: 'all', label: 'Todos' },
                            { value: 'car', label: <><Car className="h-3 w-3" />Autos</>, title: 'Autos / camionetas (TA)' },
                            { value: 'motorcycle', label: <><FaMotorcycle className="h-3 w-3" />Motos</>, title: 'Motocicletas (TM)' },
                            { value: 'bicycle', label: <><Bike className="h-3 w-3" />Bicis</>, title: 'Bicicletas (TB)' },
                          ]}
                        />
                      </FilterRow>

                      <FilterRow label="Estado">
                        <div className="flex flex-wrap gap-1">
                          {FLEET_STATUS_OPTIONS.map((status) => (
                            <button
                              key={status.key}
                              type="button"
                              aria-pressed={fleetFilterStatus === status.key}
                              onClick={() => {
                                setFleetFilterStatus(status.key);
                                if (status.key !== 'broken') setFleetFilterBreakdownType('all');
                              }}
                              className={`flex items-center gap-1 rounded-md border px-1.5 py-1 text-[10.5px] font-medium transition-colors cursor-pointer ${
                                fleetFilterStatus === status.key
                                  ? 'border-blue-500 bg-blue-600 text-white'
                                  : 'border-slate-700/70 bg-slate-950/60 text-slate-400 hover:text-slate-200'
                              }`}
                            >
                              {status.dot && <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: status.dot }} />}
                              {status.label}
                            </button>
                          ))}
                        </div>
                      </FilterRow>

                      {/* Subfiltro por tipo de avería: solo al filtrar Averiados */}
                      {fleetFilterStatus === 'broken' && (
                        <FilterRow label="Avería">
                          <Segmented
                            value={fleetFilterBreakdownType}
                            onChange={setFleetFilterBreakdownType}
                            columns={2}
                            options={[
                              { value: 'all' as const, label: 'Todas' },
                              ...([1, 2, 3] as const).map((lvl) => ({
                                value: lvl,
                                title: BREAKDOWN_LEVEL_CONFIGS[lvl].label,
                                label: (
                                  <>
                                    <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: BREAKDOWN_LEVEL_CONFIGS[lvl].hex }} />
                                    T{lvl} · {BREAKDOWN_LEVEL_CONFIGS[lvl].severityLabel}
                                  </>
                                ),
                              })),
                            ]}
                          />
                        </FilterRow>
                      )}

                      {/* Filtro permanente por distancia por recorrer al destino (rúbrica E11). Se
                          combina con tipo, estado, búsqueda y orden. */}
                      <FilterRow label="Distancia" hint="km al destino">
                        <Segmented
                          value={fleetFilterDistance}
                          onChange={setFleetFilterDistance}
                          options={[
                            { value: 'all' as FleetDistanceFilter, label: 'Todas', title: 'Sin filtro de distancia' },
                            ...FLEET_DISTANCE_RANGES.map((range) => ({
                              value: range.key as FleetDistanceFilter,
                              label: range.label,
                              title: `Desde ${range.min} km hasta menos de ${range.max} km`,
                            })),
                          ]}
                        />
                        <p className="mt-1 text-[9.5px] text-slate-500">
                          {[...vehicleDistanceRanges.values()].filter((range) => range === null).length} sin ruta (no entran en ningún rango)
                        </p>
                      </FilterRow>

                      {/* Búsqueda por tiempo estimado: distinta del filtro por distancia */}
                      <FilterRow label="Tiempo" hint="máx. estimado">
                        <div className="flex items-center gap-1.5">
                          <select
                            value={distSearchMode}
                            onChange={(event) => setDistSearchMode(event.target.value as DistanceSearchMode)}
                            aria-label="Buscar por tiempo estimado hasta"
                            className="min-w-0 flex-1 cursor-pointer rounded-lg border border-slate-700/70 bg-slate-950/60 px-2 py-1.5 text-[11px] text-slate-200 focus:border-blue-500 focus:outline-none"
                          >
                            <option value="none">Sin búsqueda</option>
                            <option value="to_dest">Al destino</option>
                            <option value="to_origin">Al origen</option>
                          </select>
                          <div className="relative w-[5.5rem] shrink-0">
                            <input
                              type="number"
                              min="0"
                              value={distSearchMinutes}
                              onChange={(event) => setDistSearchMinutes(event.target.value)}
                              disabled={distSearchMode === 'none'}
                              placeholder="—"
                              aria-label="Minutos máximos"
                              className="w-full rounded-lg border border-slate-700/70 bg-slate-950/60 py-1.5 pl-2 pr-8 text-[11px] text-slate-100 placeholder-slate-600 focus:border-blue-500 focus:outline-none disabled:opacity-40"
                            />
                            <span className="pointer-events-none absolute right-2 top-1.5 text-[10px] text-slate-500">min</span>
                          </div>
                        </div>
                      </FilterRow>

                      <div className="border-t border-slate-800 pt-2.5">
                        <FilterRow label="Ordenar">
                          <SortButton current={fleetSortKey} onChange={setFleetSortKey} />
                        </FilterRow>
                      </div>
                    </div>
                  )}

                  {/* Resultado + filtros activos (siempre visibles, aun con el panel plegado) */}
                  <div className="flex flex-wrap items-center gap-1.5 text-[10.5px] text-slate-400">
                    <span className="font-mono-code">
                      <span className="font-bold text-slate-200">{filteredVehicles.length}</span> de {vehicles.length} vehículos
                    </span>
                    {activeFleetFilterPills.map((pill) => (
                      <button
                        key={pill.key}
                        type="button"
                        onClick={pill.onClear}
                        title={`Quitar filtro: ${pill.label}`}
                        className="flex items-center gap-1 rounded-full border border-blue-500/40 bg-blue-950/40 px-2 py-0.5 font-medium text-blue-200 hover:border-blue-400 cursor-pointer"
                      >
                        {pill.label}
                        <X className="h-2.5 w-2.5" />
                      </button>
                    ))}
                    {activeFleetFilterPills.length > 1 && (
                      <button
                        type="button"
                        onClick={clearFleetFilters}
                        className="ml-auto text-blue-400 hover:text-blue-300 cursor-pointer"
                      >
                        Limpiar todo
                      </button>
                    )}
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
                                  isReturning ? 'bg-slate-600/30 text-slate-300' : typeMeta.badgeClass
                                }`}>
                                  {v.type === 'car' ? (
                                    <Car className="h-4 w-4" />
                                  ) : v.type === 'motorcycle' ? (
                                    <FaMotorcycle className="h-4 w-4" />
                                  ) : (
                                    <Bike className="h-4 w-4" />
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
