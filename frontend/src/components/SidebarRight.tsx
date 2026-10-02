import React, { useState } from 'react';
import {
  ScenarioType,
  Warehouse,
  Vehicle,
  Order,
  AlertItem,
  SimulationState,
  SystemConfig,
} from '../types';
import {
  formatSimulatedTime,
  formatExactSimulatedDate,
} from '../utils/simulation';
import {
  Clock,
  Play,
  Pause,
  RotateCcw,
  AlertTriangle,
  Flame,
  ShieldAlert,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Car,
  Bike,
  Warehouse as WarehouseIcon,
  TrendingUp,
  FileText,
  Activity,
} from 'lucide-react';
import { Button } from './ui/Button';
import { ConfirmModal } from './ui/ConfirmModal';
import { getVehicleSemaforoStatus, SemaforoBadge } from '../utils/vehicleStatus';
import { BlockedStreet, PreventiveMaintenanceRecord } from '../types';

interface SidebarRightProps {
  scenario: ScenarioType;
  simState: SimulationState;
  onTogglePlayPause: () => void;
  onResetSimulation: () => void;
  onChangeSpeed: (speed: number) => void;
  onStartDateChange?: (dateStr: string) => void;
  onSeekSimMinutes?: (minutes: number) => void;
  warehouses: Warehouse[];
  vehicles: Vehicle[];
  orders: Order[];
  alerts: AlertItem[];
  onOpenCreateBreakdown: () => void;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  config: SystemConfig;
  onChangeConfig?: (newConfig: Partial<SystemConfig>) => void;
  onOpenFullConfigModal?: () => void;
  onSelectVehicleById: (vehicleId: string) => void;
  isDarkTheme?: boolean;
  onOpenDataFilesModal?: () => void;
  blockedStreetsCount?: number;
  totalOrdersCount?: number;
  onApplyBlockages?: (blockages: BlockedStreet[], fileNames: string) => void;
  onApplyOrders?: (orders: Order[], fileNames: string) => void;
  onApplyMaintenance?: (records: PreventiveMaintenanceRecord[], summaryText: string) => void;
  activeSidebarTab?: 'operation' | 'files';
  onTabChange?: (tab: 'operation' | 'files') => void;
}

export const SidebarRight: React.FC<SidebarRightProps> = ({
  scenario,
  simState,
  onTogglePlayPause,
  onResetSimulation,
  onChangeSpeed,
  onStartDateChange,
  onSeekSimMinutes,
  warehouses,
  vehicles,
  orders,
  alerts,
  onOpenCreateBreakdown,
  isCollapsed,
  onToggleCollapse,
  config,
  onOpenFullConfigModal,
  onSelectVehicleById,
  isDarkTheme = true,
  onOpenDataFilesModal,
  blockedStreetsCount = 0,
  totalOrdersCount = 0,
  onApplyBlockages,
  onApplyOrders,
  onApplyMaintenance,
  activeSidebarTab,
  onTabChange,
}) => {
  const [internalTab, setInternalTab] = useState<'operation' | 'files'>('operation');
  const currentTab = activeSidebarTab !== undefined ? activeSidebarTab : internalTab;
  const handleTabChange = (tab: 'operation' | 'files') => {
    if (onTabChange) onTabChange(tab);
    else setInternalTab(tab);
  };
  // Compute metrics
  const activeVehicles = vehicles.filter((v) => v.status !== 'broken');
  const brokenVehicles = vehicles.filter((v) => v.status === 'broken');
  const deliveringVehicles = vehicles.filter((v) => v.status === 'delivering');
  const enRouteVehicles = vehicles.filter((v) => v.status === 'en_route');

  const speeds = [1, 2, 5, 10, 30];
  const [isAlertsCollapsed, setIsAlertsCollapsed] = useState(false);
  const [isResetModalOpen, setIsResetModalOpen] = useState(false);

  return (
    <aside
      id="sidebar-right-ops"
      className={`relative flex flex-col border-l border-[var(--color-sidebar-border)] transition-all duration-300 select-none z-20 shrink-0 ${
        isCollapsed ? 'w-14' : 'w-80 lg:w-96'
      } bg-[var(--color-sidebar-background)] text-slate-100 shadow-xl`}
    >
      {/* Collapse Toggle Button */}
      <button
        id="btn-toggle-right-sidebar"
        onClick={onToggleCollapse}
        title={isCollapsed ? 'Expandir panel de control' : 'Colapsar panel de control'}
        className="absolute -left-3.5 top-6 z-30 flex h-7 w-7 items-center justify-center rounded-full border border-[var(--color-sidebar-border)] bg-[var(--color-sidebar-surface)] text-[var(--color-sidebar-icon-muted)] hover:text-white shadow-md hover:bg-[var(--color-sidebar-border)] transition-colors"
      >
        {isCollapsed ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
      </button>

      {/* Collapsed view quick icon column */}
      {isCollapsed ? (
        <div className="flex flex-col items-center py-6 gap-6 bg-[var(--color-sidebar-background)]">
          <button
            onClick={onTogglePlayPause}
            className={`p-2.5 rounded-xl text-white shadow ${
              simState.isRunning ? 'bg-[var(--color-secondary)] hover:opacity-90' : 'bg-[var(--color-success)] hover:opacity-90'
            }`}
            title={simState.isRunning ? 'Pausar' : 'Reanudar'}
          >
            {simState.isRunning ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          </button>
          <button
            onClick={onOpenCreateBreakdown}
            className="p-2.5 rounded-xl bg-[var(--color-danger)] text-white shadow animate-pulse"
            title="Crear Avería"
          >
            <AlertTriangle className="h-4 w-4" />
          </button>
          <button
            onClick={() => {
              handleTabChange('operation');
              if (isCollapsed) onToggleCollapse();
            }}
            className={`p-2.5 rounded-xl text-white shadow transition-all ${
              currentTab === 'operation'
                ? 'bg-[var(--color-secondary)] border border-[var(--color-sidebar-accent)]'
                : 'bg-[var(--color-sidebar-surface)] hover:bg-[var(--color-sidebar-border)]'
            }`}
            title="Panel de Operación"
          >
            <Activity className="h-4 w-4" />
          </button>
          {scenario === 'five_days' && (
            <div className="flex flex-col items-center text-[10px] font-mono-code text-[var(--color-sidebar-icon-muted)]">
              <Clock className="h-4 w-4 mb-1 text-[var(--color-secondary)]" />
              <span>{simState.speedMultiplier}x</span>
            </div>
          )}
          <div className="flex flex-col items-center text-[10px] font-mono-code text-[var(--color-sidebar-icon-muted)]">
            <Flame className="h-4 w-4 mb-1 text-[var(--color-warning)]" />
            <span>{simState.collapseScore}%</span>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col overflow-hidden bg-[var(--color-sidebar-background)]">
          {/* Section 1: Reloj de Operación (Hora y Fecha como estaba antes) */}
          <div className="p-3.5 border-b border-[var(--color-sidebar-border)] bg-[var(--color-sidebar-background)]">
            <div className="text-[10px] uppercase font-bold mb-1 text-[var(--color-sidebar-text-muted)] tracking-wider">
              Reloj de Operación
            </div>
            <div className="text-2xl font-mono-code font-bold text-white flex items-baseline gap-2">
              {formatSimulatedTime(new Date(simState.startDate), simState.simMinutes)}
              <span className="text-xs font-normal font-sans text-[var(--color-sidebar-icon-muted)]">
                {formatExactSimulatedDate(new Date(simState.startDate), simState.simMinutes)}
              </span>
            </div>
            {/* Play/Pause Controls */}
            <div className="pt-2 mt-2 border-t border-[var(--color-sidebar-border)]/70 flex gap-2">
              <Button
                id="btn-sim-play-pause"
                variant={simState.isRunning ? 'secondary' : 'outline'}
                size="sm"
                onClick={onTogglePlayPause}
                className={`w-full inline-flex items-center justify-center gap-1.5 transition-all shadow-sm ${
                  simState.isRunning
                    ? 'bg-sky-950/40 border border-sky-500/40 hover:bg-sky-900/50 text-sky-200'
                    : 'bg-emerald-950/60 border border-emerald-500/70 hover:bg-emerald-900/70 text-emerald-400 font-bold shadow-emerald-950/50'
                }`}
                leftIcon={
                  simState.isRunning ? (
                    <Pause className="h-4 w-4 text-sky-300" />
                  ) : (
                    <Play className="h-4 w-4 text-emerald-400 fill-emerald-400" />
                  )
                }
              >
                <span className={simState.isRunning ? 'text-sky-200 font-semibold' : 'text-emerald-400 font-bold tracking-wide'}>
                  {simState.isRunning ? 'Pausar' : 'Reanudar'}
                </span>
              </Button>
            </div>
          </div>

          {/* SCROLLABLE CONTEXTUAL BODY */}
          <div className="flex-1 overflow-y-auto p-3 space-y-3.5 text-xs bg-[var(--color-sidebar-background)]">
            {/* SCENARIO 2: SIMULACIÓN 5 DÍAS */}
            {scenario === 'five_days' && (
              <div className="rounded-xl border border-[var(--color-sidebar-border)] bg-[var(--color-sidebar-surface)]/60 p-3 space-y-2.5">
                {/* Línea de Tiempo Interactiva */}
                <div className="rounded-lg p-2.5 border border-[var(--color-sidebar-border)]/80 bg-[var(--color-sidebar-background)]/80 space-y-2">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-semibold flex items-center gap-1.5 text-white">
                      <Clock className="h-3.5 w-3.5 text-[var(--color-sidebar-icon-muted)]" /> Línea de Tiempo
                    </span>
                  </div>

                  {/* Scrubber slider */}
                  <div className="space-y-1">
                    <input
                      id="timeline-scrubber-slider"
                      type="range"
                      min={0}
                      max={5 * 24 * 60}
                      step={15}
                      value={simState.simMinutes}
                      onChange={(e) => onSeekSimMinutes && onSeekSimMinutes(Number(e.target.value))}
                      className="w-full accent-[var(--color-secondary)] cursor-pointer h-1.5 rounded-lg bg-[var(--color-sidebar-surface)]"
                    />
                    <div className="flex justify-between text-[9px] font-mono-code text-[var(--color-sidebar-icon-muted)]">
                      <span>0h (Día 1)</span>
                      <span>60h (Día 3)</span>
                      <span>120h (Día 5)</span>
                    </div>
                  </div>

                  {/* Rewind / Advance Stepper Buttons */}
                  <div className="grid grid-cols-4 gap-1 pt-0.5">
                    <button
                      type="button"
                      id="btn-timeline-rewind-1h"
                      onClick={() => onSeekSimMinutes && onSeekSimMinutes(simState.simMinutes - 60)}
                      disabled={simState.simMinutes <= 0}
                      className="py-1 text-[10px] font-mono-code rounded disabled:opacity-30 disabled:cursor-not-allowed border border-[var(--color-sidebar-border)] bg-[var(--color-sidebar-surface)] hover:bg-[var(--color-sidebar-border)] text-white transition-colors text-center font-bold"
                      title="Retroceder 1 hora"
                    >
                      -1h
                    </button>
                    <button
                      type="button"
                      id="btn-timeline-rewind-15m"
                      onClick={() => onSeekSimMinutes && onSeekSimMinutes(simState.simMinutes - 15)}
                      disabled={simState.simMinutes <= 0}
                      className="py-1 text-[10px] font-mono-code rounded disabled:opacity-30 disabled:cursor-not-allowed border border-[var(--color-sidebar-border)] bg-[var(--color-sidebar-surface)] hover:bg-[var(--color-sidebar-border)] text-white transition-colors text-center font-bold"
                      title="Retroceder 15 minutos"
                    >
                      -15m
                    </button>
                    <button
                      type="button"
                      id="btn-timeline-advance-15m"
                      onClick={() => onSeekSimMinutes && onSeekSimMinutes(simState.simMinutes + 15)}
                      disabled={simState.simMinutes >= 5 * 24 * 60}
                      className="py-1 text-[10px] font-mono-code rounded disabled:opacity-30 disabled:cursor-not-allowed border border-[var(--color-sidebar-border)] bg-[var(--color-sidebar-surface)] hover:bg-[var(--color-sidebar-border)] text-white transition-colors text-center font-bold"
                      title="Avanzar 15 minutos"
                    >
                      +15m
                    </button>
                    <button
                      type="button"
                      id="btn-timeline-advance-1h"
                      onClick={() => onSeekSimMinutes && onSeekSimMinutes(simState.simMinutes + 60)}
                      disabled={simState.simMinutes >= 5 * 24 * 60}
                      className="py-1 text-[10px] font-mono-code rounded disabled:opacity-30 disabled:cursor-not-allowed border border-[var(--color-sidebar-border)] bg-[var(--color-sidebar-surface)] hover:bg-[var(--color-sidebar-border)] text-white transition-colors text-center font-bold"
                      title="Avanzar 1 hora"
                    >
                      +1h
                    </button>
                  </div>

                  {/* Selector de Velocidad */}
                  <div className="pt-2 border-t border-[var(--color-sidebar-border)]/60 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[9px] font-bold uppercase tracking-wider text-[var(--color-sidebar-text-muted)]">
                        Velocidad
                      </span>
                      <span className="text-[10px] font-mono-code font-bold text-[var(--color-secondary)]">
                        {simState.speedMultiplier}x
                      </span>
                    </div>
                    <div className="grid grid-cols-5 gap-1">
                      {speeds.map((s) => {
                        const isSelected = simState.speedMultiplier === s;
                        return (
                          <button
                            key={s}
                            type="button"
                            id={`btn-speed-${s}x`}
                            onClick={() => onChangeSpeed(s)}
                            className={`py-1 text-[10px] font-mono-code font-bold rounded border transition-colors cursor-pointer text-center ${
                              isSelected
                                ? 'bg-[var(--color-secondary)] border-[var(--color-secondary)] text-white shadow-sm'
                                : 'bg-[var(--color-sidebar-surface)] hover:bg-[var(--color-sidebar-border)] text-slate-200 border-[var(--color-sidebar-border)]'
                            }`}
                            title={`Ajustar velocidad a ${s}x`}
                          >
                            {s}x
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* BOTÓN "CREAR AVERÍA" */}
            <div>
              <Button
                id="btn-create-breakdown"
                variant="danger"
                size="sm"
                onClick={onOpenCreateBreakdown}
                className="w-full inline-flex items-center justify-center gap-1.5 shadow-sm font-semibold"
                leftIcon={<AlertTriangle className="h-3.5 w-3.5" />}
                title="Inyectar avería de tipo 1, 2 o 3"
              >
                Crear Avería
              </Button>
            </div>

            {/* ESTADO DE ALMACENES */}
            <section className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-[10px] font-bold uppercase flex items-center gap-1.5 text-[var(--color-sidebar-text-muted)]">
                  <WarehouseIcon className="h-3 w-3 text-[var(--color-sidebar-icon-muted)]" /> Capacidad Almacenes
                </span>
                <span className="text-[9px] font-mono-code text-[var(--color-sidebar-icon-muted)]">
                  Intermedios: {(() => {
                    const finite = warehouses.filter((w) => Number.isFinite(w.capacity));
                    if (finite.length === 0) return '0%';
                    const totStock = finite.reduce((acc, w) => acc + w.currentStock, 0);
                    const totCap = finite.reduce((acc, w) => acc + w.capacity, 0);
                    return `${Math.round((totStock / totCap) * 100)}%`;
                  })()}
                </span>
              </div>

              <div className="space-y-2.5">
                {warehouses.map((w) => {
                  const isInfinite = !Number.isFinite(w.capacity);
                  const pct = isInfinite ? 0 : Math.round((w.currentStock / w.capacity) * 100);
                  const isFull = pct >= 100;
                  const isWarning = pct >= 80 && pct < 100;

                  return (
                    <div key={w.id} className="space-y-1 py-1 px-0.5">
                      <div className="flex justify-between text-[10px]">
                        <span className="font-medium text-slate-100">
                          {w.name}
                        </span>
                        <span
                          className={`font-mono-code font-bold ${
                            isInfinite
                              ? 'text-cyan-300'
                              : isFull
                              ? 'text-cyan-300'
                              : isWarning
                              ? 'text-[var(--color-warning)]'
                              : 'text-slate-200'
                          }`}
                        >
                          {isInfinite
                            ? 'Capacidad Infinita (∞)'
                            : isFull
                            ? `100% Lleno (${w.currentStock}/${w.capacity})`
                            : `${pct}% (${w.currentStock}/${w.capacity})`}
                        </span>
                      </div>
                      {!isInfinite && (
                        <div className="h-1.5 rounded-full overflow-hidden bg-[var(--color-sidebar-background)]">
                          <div
                            className={`h-full transition-all duration-300 ${
                              isFull
                                ? 'bg-cyan-400'
                                : isWarning
                                ? 'bg-[var(--color-warning)]'
                                : 'bg-[var(--color-secondary)]'
                            }`}
                            style={{ width: `${Math.min(100, pct)}%` }}
                          />
                        </div>
                      )}
                      <div className="text-[9px] font-mono-code text-[var(--color-sidebar-icon-muted)]">
                        <span>{w.code}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            {/* ESTADO DE VEHÍCULOS (2.1 Semaforización Oficial y Accesible) */}
            <section className="pt-1">
              {(() => {
                const semaforos = vehicles.map((v) =>
                  getVehicleSemaforoStatus(v, orders, simState.simMinutes, config)
                );
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
                      <div>
                        <span className="text-[10px] font-bold uppercase flex items-center gap-1.5 text-white">
                          <Car className="h-3 w-3 text-[var(--color-sidebar-icon-muted)]" /> Semáforo de Flota
                        </span>
                        <p className="text-[8px] text-[var(--color-sidebar-text-muted)]">
                          2.1 Estatus con código de color e íconos accesibles
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[9px] font-mono-code text-[var(--color-sidebar-icon-muted)]">
                          <span className="text-[#4ade80] font-bold">{onTimeCount + atRiskCount}</span>
                          <span className="text-[var(--color-sidebar-text-muted)]">
                            /{vehicles.length}
                          </span>
                        </span>
                      </div>
                    </div>

                    {/* 2.1 4 estados oficiales de semáforo con color, ícono y etiqueta */}
                    <div className="grid grid-cols-4 gap-1 text-center font-mono-code text-[9px] mb-2">
                      <div
                        className="p-1.5 rounded border border-emerald-500/40 bg-emerald-950/40 text-emerald-200"
                        title="En ruta / a tiempo (#2E7D32)"
                      >
                        <div className="flex items-center justify-center gap-1">
                          <span className="h-1.5 w-1.5 rounded-full bg-[#2E7D32] inline-block" />
                          <span className="text-[8px] block uppercase font-bold">A tiempo</span>
                        </div>
                        <span className="font-bold text-[#4ade80] text-xs">{onTimeCount}</span>
                      </div>

                      <div
                        className="p-1.5 rounded border border-amber-500/40 bg-amber-950/40 text-amber-200"
                        title="En riesgo de retraso (#F9A825)"
                      >
                        <div className="flex items-center justify-center gap-1">
                          <span className="h-1.5 w-1.5 bg-[#F9A825] inline-block transform rotate-45" />
                          <span className="text-[8px] block uppercase font-bold">En riesgo</span>
                        </div>
                        <span className="font-bold text-[#ffd166] text-xs">{atRiskCount}</span>
                      </div>

                      <div
                        className="p-1.5 rounded border border-rose-500/40 bg-rose-950/40 text-rose-200"
                        title="Retrasado / incidencia (#C62828)"
                      >
                        <div className="flex items-center justify-center gap-1">
                          <span className="h-1.5 w-1.5 bg-[#C62828] inline-block" />
                          <span className="text-[8px] block uppercase font-bold">Retraso</span>
                        </div>
                        <span className="font-bold text-[#ff6b6b] text-xs">{delayedCount}</span>
                      </div>

                      <div
                        className="p-1.5 rounded border border-[var(--color-sidebar-border)] bg-[var(--color-sidebar-surface)]/70 text-slate-300"
                        title="Sin asignar / inactivo (#9E9E9E)"
                      >
                        <div className="flex items-center justify-center gap-1">
                          <span className="h-1 w-2 bg-[#9E9E9E] inline-block rounded-sm" />
                          <span className="text-[8px] block uppercase font-bold">Inactivo</span>
                        </div>
                        <span className="font-bold text-slate-300 text-xs">{inactiveCount}</span>
                      </div>
                    </div>

                    {/* Vehicle Type Breakdown without clutter spans */}
                    <div className="space-y-1 text-xs">
                      <div className="flex items-center justify-between px-2 py-1.5 rounded border border-[var(--color-sidebar-border)] bg-[var(--color-sidebar-surface)]/50 text-slate-100">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[11px] font-medium flex items-center gap-1">
                            <Car className="h-3 w-3 text-[var(--color-sidebar-icon-muted)]" /> Autos (TA)
                          </span>
                        </div>
                        <div className="font-mono-code text-xs flex items-center gap-1">
                          <span className="font-bold text-[#4ade80]" title="En funcionamiento">
                            {operatingCars.length}
                          </span>
                          <span className="text-[var(--color-sidebar-text-muted)]">/</span>
                          <span className="font-medium text-slate-200" title="Total">
                            {cars.length}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center justify-between px-2 py-1.5 rounded border border-[var(--color-sidebar-border)] bg-[var(--color-sidebar-surface)]/50 text-slate-100">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[11px] font-medium flex items-center gap-1">
                            <Bike className="h-3 w-3 text-[var(--color-sidebar-icon-muted)]" /> Motos (TM)
                          </span>
                        </div>
                        <div className="font-mono-code text-xs flex items-center gap-1">
                          <span className="font-bold text-[#4ade80]" title="En funcionamiento">
                            {operatingMotorcycles.length}
                          </span>
                          <span className="text-[var(--color-sidebar-text-muted)]">/</span>
                          <span className="font-medium text-slate-200" title="Total">
                            {motorcycles.length}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center justify-between px-2 py-1.5 rounded border border-[var(--color-sidebar-border)] bg-[var(--color-sidebar-surface)]/50 text-slate-100">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[11px] font-medium flex items-center gap-1">
                            <Bike className="h-3 w-3 text-[var(--color-sidebar-icon-muted)]" /> Bicis (TB)
                          </span>
                        </div>
                        <div className="font-mono-code text-xs flex items-center gap-1">
                          <span className="font-bold text-[#4ade80]" title="En funcionamiento">
                            {operatingBicycles.length}
                          </span>
                          <span className="text-[var(--color-sidebar-text-muted)]">/</span>
                          <span className="font-medium text-slate-200" title="Total">
                            {bicycles.length}
                          </span>
                        </div>
                      </div>
                    </div>
                  </>
                );
              })()}
            </section>

            {/* ALERTAS Y FALLOS (High Density Collapsible Section) */}
            <section className="pt-1">
              <button
                type="button"
                id="btn-toggle-alerts-section"
                onClick={() => setIsAlertsCollapsed(!isAlertsCollapsed)}
                className="w-full flex justify-between items-center mb-1.5 p-1 -ml-1 rounded transition-colors text-left group cursor-pointer hover:bg-[var(--color-sidebar-surface)]"
                title={isAlertsCollapsed ? 'Expandir sección de alertas' : 'Colapsar sección de alertas'}
              >
                <span className="text-[10px] font-bold uppercase flex items-center gap-1.5 transition-colors text-[var(--color-sidebar-text-muted)] group-hover:text-white">
                  <ShieldAlert className="h-3 w-3 text-rose-400" /> Alertas y Fallos
                </span>
                <div className="flex items-center gap-1.5">
                  <span className="text-[9px] font-mono-code px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/40">
                    {alerts.length} activas
                  </span>
                  {isAlertsCollapsed ? (
                    <ChevronRight className="h-3.5 w-3.5 transition-colors text-[var(--color-sidebar-icon-muted)] group-hover:text-white" />
                  ) : (
                    <ChevronDown className="h-3.5 w-3.5 transition-colors text-[var(--color-sidebar-icon-muted)] group-hover:text-white" />
                  )}
                </div>
              </button>

              {!isAlertsCollapsed && (
                <div className="space-y-2 max-h-48 overflow-y-auto pr-0.5 transition-all">
                  {alerts.length === 0 ? (
                    <div className="text-[11px] italic p-2 text-center rounded border border-[var(--color-sidebar-border)] bg-[var(--color-sidebar-surface)]/40 text-[var(--color-sidebar-text-muted)]">
                      No hay alertas activas
                    </div>
                  ) : (
                    alerts.map((alt, idx) => (
                      <div
                        key={`${alt.id}-${idx}`}
                        onClick={() => {
                          if (alt.relatedVehicleId) {
                            onSelectVehicleById(alt.relatedVehicleId);
                          }
                        }}
                        className={`p-2 text-[10px] rounded-r transition-colors cursor-pointer border ${
                          alt.urgency === 'critical'
                            ? 'bg-rose-950/40 border-l-2 border-l-[var(--color-danger)] border-rose-500/30 text-rose-100'
                            : alt.urgency === 'high'
                            ? 'bg-amber-950/40 border-l-2 border-l-[var(--color-warning)] border-amber-500/30 text-amber-100'
                            : 'bg-[var(--color-sidebar-surface)]/70 border-l-2 border-l-[var(--color-secondary)] border-[var(--color-sidebar-border)] text-slate-100'
                        }`}
                      >
                        <div className="flex justify-between items-center mb-0.5">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {alt.breakdownType && (
                              <span className="text-[8px] font-mono-code font-bold px-1.5 py-0.2 rounded bg-rose-500/30 text-rose-300 border border-rose-500/50">
                                TIPO {alt.breakdownType}
                              </span>
                            )}
                            <span
                              className={`font-bold ${
                                alt.urgency === 'critical'
                                  ? 'text-rose-300'
                                  : alt.urgency === 'high'
                                  ? 'text-amber-300'
                                  : 'text-white'
                              }`}
                            >
                              {alt.title}
                            </span>
                          </div>
                          <span className="text-[9px] font-mono-code shrink-0 ml-1 text-[var(--color-sidebar-icon-muted)]">
                            {alt.timestamp}
                          </span>
                        </div>
                        <p className="leading-tight text-slate-200/90">
                          {alt.description}
                        </p>
                        {alt.relatedVehicleId && (
                          <div className="text-[9px] text-[var(--color-secondary)] mt-1 font-mono-code hover:underline">
                            Ver vehículo →
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              )}
            </section>
          </div>
        </div>
      )}

      {/* 5. Modal de Confirmación para acción destructiva (Reiniciar Simulación) */}
      <ConfirmModal
        isOpen={isResetModalOpen}
        title="Reiniciar Simulación"
        description="¿Estás seguro de que deseas reiniciar la simulación? Esta acción restablecerá el reloj operativo a las 00:00, reasignará los pedidos y reseteará el estado de la flota. Esta acción no se puede deshacer."
        confirmLabel="Sí, reiniciar"
        cancelLabel="Cancelar"
        isDestructive={true}
        isDarkTheme={isDarkTheme}
        onClose={() => setIsResetModalOpen(false)}
        onConfirm={() => {
          setIsResetModalOpen(false);
          onResetSimulation();
        }}
      />
    </aside>
  );
};
