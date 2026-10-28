import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertOctagon,
  Bike,
  Car,
  ChevronDown,
  MapPin,
  Package,
  Search,
  Truck,
  Wrench,
  X,
} from 'lucide-react';
import { Order, Vehicle, VehicleStatus, VehicleType, Warehouse } from '../../../types';
import { getVehicleSemaforoStatus, SemaforoBadge } from '../../../utils/vehicleStatus';
import { UmbralesSemaforo } from '../../../store/semaforoStore';

type TypeFilter = 'all' | VehicleType;
type LoadFilter = 'all' | 'optimal' | 'medium' | 'critical';
type TimeFilter = 'all' | 15 | 30 | 45 | 60;
type SortOption = 'load-desc' | 'load-asc' | 'departure' | 'eta';

interface FleetPanelProps {
  vehicles: Vehicle[];
  warehouses: Warehouse[];
  orders: Order[];
  selectedVehicleId: string | null;
  onSelectVehicle: (vehicleId: string) => void;
  simMinutes: number;
  umbralesSemaforo: UmbralesSemaforo;
  onReportBreakdown?: (vehicleId: string) => void;
}

const statusOptions: Array<{ value: VehicleStatus | 'all'; label: string }> = [
  { value: 'all', label: 'Todos' },
  { value: 'en_route', label: 'En ruta' },
  { value: 'delivering', label: 'En entrega' },
  { value: 'idle', label: 'Inactivo / base' },
  { value: 'broken', label: 'Averiado' },
  { value: 'maintenance', label: 'Mantenimiento' },
];

const typeOptions: Array<{ value: TypeFilter; label: string }> = [
  { value: 'all', label: 'Todos' },
  { value: 'car', label: 'Autos / camionetas (TA)' },
  { value: 'motorcycle', label: 'Motos (TM)' },
  { value: 'bicycle', label: 'Bicicletas (TB)' },
];

function getLoadPercent(vehicle: Vehicle): number {
  return vehicle.capacity > 0 ? Math.min(100, Math.max(0, (vehicle.currentLoad / vehicle.capacity) * 100)) : 0;
}

function getLoadColor(percent: number): string {
  if (percent >= 90) return 'bg-rose-500';
  if (percent >= 70) return 'bg-amber-400';
  return 'bg-emerald-500';
}

function formatMinutes(minutes: number): string {
  if (!Number.isFinite(minutes)) return '—';
  return `${Math.max(0, Math.round(minutes))} min`;
}

function SelectField({ label, value, onChange, children }: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
}) {
  return (
    <label className="min-w-0 flex-1 space-y-1">
      <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</span>
      <span className="relative block">
        <select
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="w-full appearance-none rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-2 pr-7 text-[11px] text-slate-200 outline-none transition focus:border-blue-500"
        >
          {children}
        </select>
        <ChevronDown className="pointer-events-none absolute right-2 top-2.5 h-3.5 w-3.5 text-slate-500" />
      </span>
    </label>
  );
}

export const FleetPanel: React.FC<FleetPanelProps> = ({
  vehicles,
  warehouses,
  orders,
  selectedVehicleId,
  onSelectVehicle,
  simMinutes,
  umbralesSemaforo,
  onReportBreakdown,
}) => {
  const [search, setSearch] = useState('');
  const [type, setType] = useState<TypeFilter>('all');
  const [status, setStatus] = useState<VehicleStatus | 'all'>('all');
  const [load, setLoad] = useState<LoadFilter>('all');
  const [warehouse, setWarehouse] = useState('all');
  const [eta, setEta] = useState<TimeFilter>('all');
  const [departure, setDeparture] = useState<TimeFilter | 45>('all');
  const [sort, setSort] = useState<SortOption>('load-desc');

  const vehicleData = useMemo(() => vehicles.map((vehicle) => {
    const assignedOrders = orders.filter(
      (order) => vehicle.assignedOrderIds.includes(order.id) || order.assignedVehicleId === vehicle.id,
    );
    const activeOrders = assignedOrders.filter((order) => order.status !== 'delivered');
    const etaMinutes = activeOrders.length
      ? Math.max(0, Math.min(...activeOrders.map((order) => order.deadlineMinute)) - simMinutes)
      : Number.POSITIVE_INFINITY;
    const departureMinutes = assignedOrders.length
      ? Math.max(0, simMinutes - Math.min(...assignedOrders.map((order) => order.createdMinute)))
      : Number.POSITIVE_INFINITY;
    return {
      vehicle,
      assignedOrders,
      loadPercent: getLoadPercent(vehicle),
      etaMinutes,
      departureMinutes,
      semaforo: getVehicleSemaforoStatus(vehicle, orders, simMinutes, umbralesSemaforo),
    };
  }), [vehicles, orders, simMinutes, umbralesSemaforo]);

  const filteredVehicles = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    return vehicleData
      .filter(({ vehicle, loadPercent, etaMinutes, departureMinutes }) => {
        const matchesSearch = !normalizedSearch
          || vehicle.code.toLowerCase().includes(normalizedSearch)
          || vehicle.id.toLowerCase().includes(normalizedSearch)
          || vehicle.driverId?.toLowerCase().includes(normalizedSearch);
        const matchesType = type === 'all' || vehicle.type === type;
        const matchesStatus = status === 'all' || vehicle.status === status;
        const matchesWarehouse = warehouse === 'all' || vehicle.homeWarehouseId === warehouse;
        const matchesLoad = load === 'all'
          || (load === 'optimal' && loadPercent < 70)
          || (load === 'medium' && loadPercent >= 70 && loadPercent < 90)
          || (load === 'critical' && loadPercent >= 90);
        const matchesEta = eta === 'all' || etaMinutes <= eta;
        const matchesDeparture = departure === 'all' || departureMinutes <= departure;
        return matchesSearch && matchesType && matchesStatus && matchesWarehouse
          && matchesLoad && matchesEta && matchesDeparture;
      })
      .sort((left, right) => {
        if (sort === 'load-desc') return right.loadPercent - left.loadPercent;
        if (sort === 'load-asc') return left.loadPercent - right.loadPercent;
        if (sort === 'departure') return left.departureMinutes - right.departureMinutes;
        return left.etaMinutes - right.etaMinutes;
      });
  }, [vehicleData, search, type, status, warehouse, load, eta, departure, sort]);

  const totalCapacity = vehicles.reduce((sum, vehicle) => sum + vehicle.capacity, 0);
  const totalLoad = vehicles.reduce((sum, vehicle) => sum + vehicle.currentLoad, 0);
  const occupancy = totalCapacity ? Math.round((totalLoad / totalCapacity) * 100) : 0;
  const activeVehicles = vehicles.filter((vehicle) => !['idle', 'broken', 'maintenance'].includes(vehicle.status)).length;
  const hasFilters = Boolean(search || type !== 'all' || status !== 'all' || load !== 'all'
    || warehouse !== 'all' || eta !== 'all' || departure !== 'all');
  const occupancyTone = occupancy >= 90
    ? { text: 'text-rose-300', bar: 'bg-rose-500', label: 'Crítica', dot: 'bg-rose-500' }
    : occupancy >= 70
      ? { text: 'text-amber-300', bar: 'bg-amber-400', label: 'Media', dot: 'bg-amber-400' }
      : { text: 'text-emerald-300', bar: 'bg-emerald-500', label: 'Óptima', dot: 'bg-emerald-500' };

  const clearFilters = () => {
    setSearch('');
    setType('all');
    setStatus('all');
    setLoad('all');
    setWarehouse('all');
    setEta('all');
    setDeparture('all');
  };

  useEffect(() => {
    if (!selectedVehicleId) return;

    // Si el vehículo seleccionado está oculto por los filtros actuales, limpiarlos para que se muestre
    const targetVehicle = vehicles.find((v) => v.id === selectedVehicleId);
    if (targetVehicle) {
      const isVisible = filteredVehicles.some((item) => item.vehicle.id === selectedVehicleId);
      if (!isVisible) {
        clearFilters();
      }
    }

    const scrollToVehicle = () => {
      const el = document.getElementById(`vehicle-card-${selectedVehicleId}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    };

    requestAnimationFrame(scrollToVehicle);
    const timer = setTimeout(scrollToVehicle, 160);
    return () => clearTimeout(timer);
  }, [selectedVehicleId, vehicles]);

  return (
    <section className="space-y-3 fade-in" aria-label="Panel de unidades de transporte">
      <div className="rounded-2xl border border-slate-700/80 bg-slate-900/80 p-3 shadow-lg">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Ocupación total de flota</p>
            <p className={`mt-0.5 text-2xl font-bold ${occupancyTone.text}`}>{occupancy}% <span className="text-xs font-medium text-slate-500">· {occupancyTone.label}</span></p>
          </div>
          <div className="text-right text-[11px] text-slate-400">
            <p><span className="font-semibold text-emerald-300">{activeVehicles}</span> disponibles</p>
            <p><span className="font-semibold text-slate-200">{vehicles.length - activeVehicles}</span> inactivas / averiadas</p>
          </div>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-slate-800" role="progressbar" aria-valuenow={occupancy} aria-valuemin={0} aria-valuemax={100} aria-label={`Ocupación ${occupancy}%`}>
          <div className={`h-full rounded-full transition-all ${occupancyTone.bar}`} style={{ width: `${occupancy}%` }} />
        </div>
        <div className="mt-2 flex items-center gap-1.5 text-[10px] text-slate-400">
          <span className={`h-2 w-2 rounded-full ${occupancyTone.dot}`} aria-hidden="true" />
          {totalLoad} / {totalCapacity} paquetes · semáforo de ocupación
        </div>
      </div>

      <div className="space-y-2 rounded-2xl border border-slate-700/80 bg-slate-900/50 p-3">
        <div className="relative">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Código, ID del conductor o unidad..."
            aria-label="Buscar unidad de transporte"
            className="w-full rounded-xl border border-slate-700 bg-slate-950 px-9 py-2 text-xs text-slate-100 outline-none placeholder:text-slate-500 focus:border-blue-500"
          />
          {search && <button type="button" onClick={() => setSearch('')} className="absolute right-2.5 top-2.5 text-slate-400 hover:text-white" aria-label="Limpiar búsqueda"><X className="h-3.5 w-3.5" /></button>}
        </div>
        <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
          {typeOptions.map((option) => (
            <button key={option.value} type="button" onClick={() => setType(option.value)} className={`shrink-0 rounded-lg px-2.5 py-1.5 text-[10px] font-semibold transition ${type === option.value ? 'bg-blue-600 text-white' : 'border border-slate-700 bg-slate-800 text-slate-400 hover:text-slate-200'}`}>
              {option.label}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <SelectField label="Estado operativo" value={status} onChange={(value) => setStatus(value as VehicleStatus | 'all')}>
            {statusOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </SelectField>
          <SelectField label="Semáforo de carga" value={load} onChange={(value) => setLoad(value as LoadFilter)}>
            <option value="all">Cualquier color</option><option value="optimal">🟢 Óptimo (&lt; 70%)</option><option value="medium">🟡 Medio (70-90%)</option><option value="critical">🔴 Saturado (≥ 90%)</option>
          </SelectField>
          <SelectField label="Almacén base" value={warehouse} onChange={setWarehouse}>
            <option value="all">Todos</option>
            {warehouses.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </SelectField>
          <SelectField label="ETA al destino" value={String(eta)} onChange={(value) => setEta(value === 'all' ? 'all' : Number(value) as TimeFilter)}>
            <option value="all">Todos</option><option value="15">≤ 15 min</option><option value="30">≤ 30 min</option><option value="45">≤ 45 min</option><option value="60">≤ 60 min</option>
          </SelectField>
          <SelectField label="Tiempo desde salida" value={String(departure)} onChange={(value) => setDeparture(value === 'all' ? 'all' : Number(value) as 45)}>
            <option value="all">Todos</option><option value="15">≤ 15 min</option><option value="30">≤ 30 min</option><option value="45">≤ 45 min</option>
          </SelectField>
          <SelectField label="Ordenar por" value={sort} onChange={(value) => setSort(value as SortOption)}>
            <option value="load-desc">Ocupación: mayor a menor</option><option value="load-asc">Ocupación: menor a mayor</option><option value="departure">Salida: más temprano</option><option value="eta">ETA: más próximo</option>
          </SelectField>
        </div>
        {hasFilters && <button type="button" onClick={clearFilters} className="text-left text-[11px] font-semibold text-blue-400 hover:text-blue-300">Limpiar filtros</button>}
      </div>

      <p className="px-1 text-[11px] text-slate-400">{filteredVehicles.length} de {vehicles.length} unidades</p>
      {filteredVehicles.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-700 p-6 text-center">
          <Truck className="mx-auto mb-2 h-7 w-7 text-slate-600" />
          <p className="text-sm font-semibold text-slate-300">No se encontraron unidades con los filtros seleccionados</p>
          {hasFilters && <button type="button" onClick={clearFilters} className="mt-2 text-xs font-semibold text-blue-400 hover:text-blue-300">Limpiar filtros</button>}
        </div>
      ) : filteredVehicles.map(({ vehicle, assignedOrders, loadPercent, etaMinutes, departureMinutes, semaforo }) => {
        const isSelected = selectedVehicleId === vehicle.id;
        const isBroken = vehicle.status === 'broken';
        const Icon = vehicle.type === 'car' ? Car : Bike;
        const warehouseName = warehouses.find((item) => item.id === vehicle.homeWarehouseId)?.name;
        return (
          <article
            key={vehicle.id}
            id={`vehicle-card-${vehicle.id}`}
            onClick={() => onSelectVehicle(vehicle.id)}
            className={`cursor-pointer rounded-2xl border p-3 transition-all ${
              isSelected
                ? 'border-blue-500 bg-blue-950/60 ring-2 ring-blue-500/50 shadow-lg shadow-blue-900/30'
                : 'border-slate-800 bg-[#0d1b2e]/90 hover:border-slate-600'
            }`}
            aria-selected={isSelected}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="rounded-lg bg-blue-500/15 p-1.5 text-blue-300"><Icon className="h-4 w-4" /></span>
                <div><p className="font-mono text-sm font-bold text-white">{vehicle.code}</p><p className="text-[10px] text-slate-500">{vehicle.type === 'car' ? 'Auto / camioneta' : vehicle.type === 'motorcycle' ? 'Moto' : 'Bicicleta'}</p></div>
              </div>
              <SemaforoBadge status={semaforo} size="sm" />
            </div>
            <div className="mt-2 grid grid-cols-3 gap-1.5 text-center">
              <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-1.5"><span className="block text-[9px] text-slate-500">Velocidad</span><strong className="text-xs text-slate-100">{isBroken ? 0 : vehicle.speed} <small className="font-normal text-slate-500">km/h</small></strong></div>
              <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-1.5"><span className="block text-[9px] text-slate-500">Carga</span><strong className="text-xs text-slate-100">{vehicle.currentLoad}/{vehicle.capacity} <small className="font-normal text-slate-500">paq</small></strong></div>
              <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-1.5"><span className="block text-[9px] text-slate-500">Entregados</span><strong className="text-xs text-emerald-300">{vehicle.totalDelivered}</strong></div>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-800"><div className={`h-full rounded-full ${getLoadColor(loadPercent)}`} style={{ width: `${loadPercent}%` }} /></div>
            <div className="mt-2 flex flex-wrap items-center justify-between gap-1 text-[10px] text-slate-400">
              <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3 text-blue-400" /> X={Math.round(vehicle.position.x)}, Y={Math.round(vehicle.position.y)}</span>
              <span>{warehouseName ?? 'Base no informada'}</span>
            </div>
            <div className="mt-1 flex flex-wrap gap-2 text-[10px] text-slate-500"><span>ETA: {formatMinutes(etaMinutes)}</span><span>Salida: {formatMinutes(departureMinutes)}</span><span>Conductor: {vehicle.driverId ?? '—'}</span></div>
            {isBroken && <div className="mt-2 rounded-lg border border-rose-500/30 bg-rose-950/40 p-2 text-[10px] text-rose-200"><span className="inline-flex items-center gap-1 font-bold"><AlertOctagon className="h-3.5 w-3.5" /> Avería Tipo {vehicle.breakdownType ?? vehicle.breakdownInfo?.type ?? '—'}</span><p className="mt-0.5">{vehicle.breakdownReason ?? vehicle.breakdownInfo?.reason ?? 'Motivo no informado'}</p></div>}
            {isSelected && <div className="mt-2 flex items-center justify-between border-t border-slate-800 pt-2 text-[10px]"><span className="inline-flex items-center gap-1 text-slate-300"><Package className="h-3.5 w-3.5" /> {assignedOrders.length} pedidos asignados</span>{!isBroken && onReportBreakdown && <button type="button" onClick={(event) => { event.stopPropagation(); onReportBreakdown(vehicle.id); }} className="inline-flex items-center gap-1 rounded-lg border border-rose-500/40 px-2 py-1 font-semibold text-rose-300 hover:bg-rose-950/50"><Wrench className="h-3 w-3" /> Crear avería</button>}</div>}
          </article>
        );
      })}
    </section>
  );
};
