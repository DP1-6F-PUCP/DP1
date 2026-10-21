import React, { useEffect, useRef, useState } from 'react';
import {
  Clock,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Car,
  Bike,
  Warehouse as WarehouseIcon,
  Activity,
  Search,
  MapPin,
  MinusCircle,
  X,
  Layers,
  ShieldAlert,
  SlidersHorizontal,
  Coffee,
} from 'lucide-react';
import { useEstadoVisual } from '../engine/useEstadoVisual';
import { useEscenario } from '../features/escenario/hooks/useEscenario';
import { useMapStore } from '../store/mapStore';
import { useAlertas } from '../features/alertas/hooks/useAlertas';
import { useVehicles } from '../features/vehiculos/hooks/useVehicles';
import { BreakdownType } from '../types';
import { BreakdownModal } from './BreakdownModal';
import { ConfigModal } from './ConfigModal';
import { DelayAlertModal } from './DelayAlertModal';
import { useToast } from './ToastProvider';
import { getVehicleSemaforoStatus } from '../utils/vehicleStatus';
import { useSemaforoStore } from '../store/semaforoStore';
import { useScenarioStore } from '../store/scenarioStore';
import { MetricasStrip } from '../features/metricas/components/MetricasStrip';
import type { EventoDTO } from '../types/backend';

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
  const { alertas } = useAlertas();
  const umbralesSemaforo = useSemaforoStore((s) => s.umbrales);
  const scenarioStartMs = useScenarioStore((s) => s.scenarioStartMs());
  const [alertaDetalle, setAlertaDetalle] = useState<EventoDTO | null>(null);
  const { reportBreakdown, isReportingBreakdown } = useVehicles();
  const { addToast, notifications } = useToast();
  const alertasVistasRef = useRef<Set<string> | null>(null);

  const [activeTab, setActiveTab] = useState<'operation' | 'fleet'>('operation');
  const [isAlertsCollapsed, setIsAlertsCollapsed] = useState(false);
  const [isConfigModalOpen, setIsConfigModalOpen] = useState(false);
  const [fleetSearchTerm, setFleetSearchTerm] = useState('');
  const [fleetFilterType, setFleetFilterType] = useState<'all' | 'car' | 'motorcycle' | 'bicycle'>('all');
  const [fleetFilterStatus, setFleetFilterStatus] = useState<
    'all' | 'idle' | 'en_route' | 'delivering' | 'on_break' | 'broken' | 'maintenance'
  >('all');

  const previousSelectedVehicleId = useRef<string | null>(selectedVehicleId);
  const vehicleCardRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const [isBreakdownModalOpen, setIsBreakdownModalOpen] = useState(false);

  // Para el detalle de una alerta de riesgo SLA (DelayAlertModal) -- mismo cálculo que usaba
  // AlertasBell (ahora sin montar, ver alertaDetalle más abajo: se reusa solo el modal, no la
  // lista, para no duplicar la lista de alertas que esta barra ya muestra).
  const nowMsGlobal = estadoRaw?.marcaTiempoActual ? Date.parse(estadoRaw.marcaTiempoActual) : null;
  const simMinuteGlobal =
    nowMsGlobal != null && scenarioStartMs != null ? Math.round((nowMsGlobal - scenarioStartMs) / 60000) : 0;
  const simTimeGlobal =
    nowMsGlobal != null
      ? new Date(nowMsGlobal).toLocaleString('es-PE', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })
      : '--:--';
  const ordenDetalle = alertaDetalle?.pedidoId ? orders.find((o) => o.id === alertaDetalle.pedidoId) ?? null : null;

  useEffect(() => {
    const bloqueos = alertas.filter((alerta) => alerta.tipo === 'INCIDENCIA_BLOQUEO');
    const clavesActuales = new Set(
      bloqueos.map((alerta) => `${alerta.instante}-${alerta.descripcion}`)
    );

    if (alertasVistasRef.current === null) {
      alertasVistasRef.current = clavesActuales;
      return;
    }

    bloqueos
      .filter((alerta) => !alertasVistasRef.current?.has(`${alerta.instante}-${alerta.descripcion}`))
      .forEach((alerta) => {
        addToast({
          type: 'warning',
          title: 'Nuevo bloqueo vial',
          description: alerta.descripcion,
        });
      });

    alertasVistasRef.current = clavesActuales;
  }, [alertas, addToast]);

  useEffect(() => {
    const vehicleSelectionChanged = previousSelectedVehicleId.current !== selectedVehicleId;
    previousSelectedVehicleId.current = selectedVehicleId;

    if (!selectedVehicleId || !vehicleSelectionChanged) return;

    setActiveTab('fleet');
    if (isCollapsed) onToggleCollapse();

    requestAnimationFrame(() => {
      vehicleCardRefs.current.get(selectedVehicleId)?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    });
  }, [selectedVehicleId, isCollapsed, onToggleCollapse]);

  const targetWarehouse = warehouses.find((w) => w && w.id === selectedWarehouseId);

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
    return matchesType && matchesStatus && matchesSearch;
  });

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
            {/* Selector de Pestañas: Operación | Seguimiento de Flota */}
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

              {/* PESTAÑA: SEGUIMIENTO DE FLOTA */}
              {activeTab === 'fleet' ? (
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
                            onClick={() => setSelectedVehicleId(isSelected ? null : v.id)}
                            className={`p-3 rounded-2xl border transition-all cursor-pointer ${
                              isSelected
                                ? 'bg-blue-950/50 border-blue-500 ring-2 ring-blue-500/50 shadow-lg'
                                : 'bg-[#0d1b2e]/90 hover:bg-slate-800/90 border-slate-800 text-slate-200 shadow-md'
                            }`}
                          >
                            {/* Fila Superior */}
                            <div className="flex items-center justify-between gap-2 mb-2">
                              <div className="flex items-center gap-2">
                                <div className="p-1.5 rounded-lg bg-blue-600/20 text-blue-400 flex items-center justify-center">
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
                                {v.status === 'idle' ? (
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

                            {/* Detalle si está seleccionado */}
                            {isSelected && (
                              <div className="pt-2 mt-1 border-t border-slate-800 flex items-center justify-between gap-2 fade-in">
                                <span className="text-[11px] text-cyan-400 font-mono-code flex items-center gap-1">
                                  <MapPin className="h-3.5 w-3.5" /> X={Math.round(v.position.x)}, Y={Math.round(v.position.y)}
                                </span>

                                {isBroken && (
                                  <span className="text-[10px] font-semibold py-0.5 px-2 rounded bg-rose-950/60 text-rose-400 border border-rose-500/30">
                                    Avería en curso
                                  </span>
                                )}
                                {!isBroken && (
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
                    <section className="space-y-2 p-3 rounded-2xl border border-slate-800 bg-slate-900/60">
                      <span className="text-[10px] font-bold uppercase flex items-center gap-1.5 text-slate-300">
                        <Activity className="h-3.5 w-3.5 text-cyan-400" /> Métricas de la Operación
                      </span>
                      <MetricasStrip metricas={estadoRaw.metricas} />
                    </section>
                  )}

                  {/* CAPACIDAD DE ALMACENES */}
                  <section className="space-y-2 p-3 rounded-2xl border border-slate-800 bg-slate-900/60">
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] font-bold uppercase flex items-center gap-1.5 text-slate-300">
                        <WarehouseIcon className="h-3.5 w-3.5 text-blue-400" /> Capacidad de Almacenes
                      </span>
                      <span className="text-[10px] font-mono-code text-slate-400">
                        {warehouses.length} almacenes
                      </span>
                    </div>

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
                  </section>

                  {/* SEMÁFORO DE FLOTA */}
                  <section className="space-y-2 p-3 rounded-2xl border border-slate-800 bg-slate-900/60">
                    {(() => {
                      const nowMs = estadoRaw?.marcaTiempoActual ? Date.parse(estadoRaw.marcaTiempoActual) : null;
                      const startMs = ejecucion?.fechaInicioSimulada ? Date.parse(ejecucion.fechaInicioSimulada) : null;
                      const simMin = nowMs && startMs ? Math.round((nowMs - startMs) / 60000) : 0;

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
                  </section>

                  {/* ALERTAS Y FALLOS */}
                  <section className="p-3 rounded-2xl border border-slate-800 bg-slate-900/60 space-y-2">
                    <button
                      type="button"
                      id="btn-toggle-alerts-section"
                      onClick={() => setIsAlertsCollapsed(!isAlertsCollapsed)}
                      className="w-full flex justify-between items-center transition-colors text-left cursor-pointer"
                    >
                      <span className="text-[10px] font-bold uppercase flex items-center gap-1.5 text-slate-300">
                        <ShieldAlert className="h-3.5 w-3.5 text-rose-400" /> Alertas y Fallos
                      </span>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[9px] font-mono-code px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/40">
                          {alertas.length + notifications.length} registros
                        </span>
                        {isAlertsCollapsed ? (
                          <ChevronRight className="h-3.5 w-3.5 text-slate-400" />
                        ) : (
                          <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
                        )}
                      </div>
                    </button>

                    {!isAlertsCollapsed && (
                      <div className="space-y-1.5 max-h-48 overflow-y-auto pr-0.5">
                        {alertas.length === 0 && notifications.length === 0 ? (
                          <div className="text-[11px] italic p-2.5 text-center rounded-xl border border-slate-800 bg-slate-950/40 text-slate-500">
                            No hay alertas activas en el sistema
                          </div>
                        ) : (
                          <>
                            {notifications.map((notification) => (
                              <div
                                key={notification.id}
                                className={`p-2 rounded-xl text-[10px] border ${
                                  notification.type === 'error'
                                    ? 'bg-rose-950/40 border-rose-500/40 text-rose-100'
                                    : notification.type === 'warning'
                                    ? 'bg-amber-950/40 border-amber-500/40 text-amber-100'
                                    : 'bg-slate-800/60 border-slate-700 text-slate-200'
                                }`}
                              >
                                <div className="flex justify-between items-center mb-0.5">
                                  <span className="font-bold">{notification.title}</span>
                                  <span className="text-[9px] font-mono-code text-slate-400">
                                    {new Date(notification.createdAt).toLocaleTimeString('es-PE', {
                                      hour: '2-digit',
                                      minute: '2-digit',
                                    })}
                                  </span>
                                </div>
                                {notification.description && (
                                  <p className="leading-tight text-slate-300">{notification.description}</p>
                                )}
                              </div>
                            ))}
                            {alertas.map((alt, idx) => {
                              const isCritical = alt.tipo.includes('AVERIA') || alt.tipo.includes('INCUMPLIDO');
                              const timeStr = Number.isFinite(Date.parse(alt.instante))
                                ? new Date(Date.parse(alt.instante)).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })
                                : alt.instante;
                              return (
                                <div
                                  key={`${alt.instante}-${alt.tipo}-${idx}`}
                                  onClick={() => {
                                    if (alt.vehiculoId) {
                                      setSelectedVehicleId(alt.vehiculoId);
                                      setActiveTab('fleet');
                                    }
                                  }}
                                  className={`p-2 rounded-xl text-[10px] transition-colors cursor-pointer border ${
                                    isCritical
                                      ? 'bg-rose-950/40 border-rose-500/40 text-rose-100'
                                      : 'bg-amber-950/40 border-amber-500/40 text-amber-100'
                                  }`}
                                >
                                  <div className="flex justify-between items-center mb-0.5">
                                    <span className="font-bold">{alt.tipo.replace(/_/g, ' ')}</span>
                                    <span className="text-[9px] font-mono-code text-slate-400">{timeStr}</span>
                                  </div>
                                  <p className="leading-tight text-slate-300">{alt.descripcion}</p>
                                  <div className="mt-1 flex items-center gap-3">
                                    {alt.vehiculoId && (
                                      <span className="text-[9px] text-cyan-400 font-mono-code inline-block">
                                        Ver vehículo {alt.vehiculoId} →
                                      </span>
                                    )}
                                    {alt.pedidoId && (
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setAlertaDetalle(alt);
                                        }}
                                        className="text-[9px] text-slate-300 font-mono-code underline-offset-2 hover:underline inline-block"
                                      >
                                        Ver detalle / PDF →
                                      </button>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </>
                        )}
                      </div>
                    )}
                  </section>
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
      <DelayAlertModal
        isOpen={Boolean(alertaDetalle)}
        onClose={() => setAlertaDetalle(null)}
        order={ordenDetalle}
        simTime={simTimeGlobal}
        simMinute={simMinuteGlobal}
        warehouses={warehouses}
        vehicles={vehicles}
        isDarkTheme
      />

    </>
  );
};
