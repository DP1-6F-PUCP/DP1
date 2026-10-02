import React, { useState, useRef } from 'react';
import { LeafletManhattanMap } from './map/LeafletManhattanMap';
import {
  Warehouse,
  Vehicle,
  BlockedStreet,
  Order,
  Point,
  VehicleType,
  SystemConfig,
} from '../types';
import { GRID_WIDTH_KM, GRID_HEIGHT_KM } from '../utils/manhattan';
import {
  getVehicleSemaforoStatus,
  SemaforoBadge,
  VehicleSemaforoState,
} from '../utils/vehicleStatus';
import { Button } from './ui/Button';
import {
  Car,
  Bike,
  AlertTriangle,
  Crosshair,
  ShieldAlert,
  Warehouse as WarehouseIcon,
} from 'lucide-react';

interface CentralMapProps {
  warehouses: Warehouse[];
  vehicles: Vehicle[];
  blockedStreets: BlockedStreet[];
  orders: Order[];
  selectedVehicleId?: string;
  onSelectVehicle: (vehicle: Vehicle | null) => void;
  selectedWarehouseId?: string;
  onSelectWarehouse: (warehouse: Warehouse | null) => void;
  onCreateBreakdownForVehicle: (vehicleId: string) => void;
  showProjectedRoutes: boolean;
  onToggleProjectedRoutes?: () => void;
  showBlockedStreets: boolean;
  onToggleBlockedStreets?: () => void;
  showCoverageZones: boolean;
  onToggleCoverageZones?: () => void;
  isDarkTheme: boolean;
  config?: SystemConfig;
  simMinutes?: number;
}

export const CentralMap: React.FC<CentralMapProps> = ({
  warehouses,
  vehicles,
  blockedStreets,
  orders,
  selectedVehicleId,
  onSelectVehicle,
  selectedWarehouseId,
  onSelectWarehouse,
  onCreateBreakdownForVehicle,
  showProjectedRoutes,
  showBlockedStreets,
  showCoverageZones,
  isDarkTheme,
  config,
  simMinutes = 0,
}) => {
  const [mouseCoords, setMouseCoords] = useState<Point | null>(null);
  const [activeFilterType, setActiveFilterType] = useState<VehicleType | 'all'>('all');
  const [activeSemaforoFilter, setActiveSemaforoFilter] = useState<VehicleSemaforoState | 'all'>('all');
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);

  // Selected entities
  const selectedVehicle = vehicles?.find((v) => v && v.id === selectedVehicleId) || null;
  const selectedWarehouse = warehouses?.find((w) => w && w.id === selectedWarehouseId) || null;
  const selectedBlock = blockedStreets?.find((b) => b && b.id === selectedBlockId) || null;

  const handleMouseMove = (e: React.MouseEvent) => {
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const rawX = (e.clientX - rect.left) / rect.width;
      const rawY = (e.clientY - rect.top) / rect.height;

      const kmX = Math.max(0, Math.min(GRID_WIDTH_KM, Math.round(rawX * GRID_WIDTH_KM * 10) / 10));
      const kmY = Math.max(0, Math.min(GRID_HEIGHT_KM, Math.round((1 - rawY) * GRID_HEIGHT_KM * 10) / 10));

      setMouseCoords({ x: kmX, y: kmY });
    }
  };

  // Filter vehicles by type and semaforo status
  const filteredVehicles = vehicles.filter((v) => {
    if (activeFilterType !== 'all' && v.type !== activeFilterType) return false;
    if (activeSemaforoFilter !== 'all') {
      const s = getVehicleSemaforoStatus(v, orders, simMinutes, config);
      if (s.state !== activeSemaforoFilter) return false;
    }
    return true;
  });

  return (
    <main
      id="main-manhattan-map-container"
      className="relative z-0 isolate flex flex-col flex-1 h-full overflow-hidden select-none text-[var(--color-text-primary)]"
      style={{
        backgroundColor: isDarkTheme ? '#0B111E' : '#F5F6F8',
      }}
    >
      {/* Top Map HUD Bar (Con el mismo color de fondo del mapa) */}
      <div
        className="relative z-30 shrink-0 px-4 py-2.5 flex flex-wrap items-center justify-between gap-3"
        style={{
          backgroundColor: isDarkTheme ? '#0B111E' : '#F5F6F8',
        }}
      >
        {/* Filtros rápidos combinados: Tipo de vehículo */}
        <div
          className="flex flex-wrap items-center gap-1.5 backdrop-blur-md border border-slate-200/80 dark:border-slate-700/80 bg-[var(--color-surface)]/95 text-[var(--color-text-primary)] rounded-xl p-1.5 shadow-sm transition-colors"
        >
          {/* Tipo */}
          <div className="flex items-center gap-1">
            <button
              id="filter-vehicles-all"
              type="button"
              onClick={() => setActiveFilterType('all')}
              aria-pressed={activeFilterType === 'all'}
              className={`control-pressed px-2 py-1 rounded-lg text-xs font-semibold transition-colors ${
                activeFilterType !== 'all' &&
                'text-[var(--color-text-secondary)] hover:text-[var(--color-primary)] hover:bg-[var(--color-secondary)]/10'
              }`}
            >
              Todos ({vehicles.length})
            </button>
            <button
              id="filter-vehicles-cars"
              type="button"
              onClick={() => setActiveFilterType('car')}
              aria-label="Filtrar por autos"
              aria-pressed={activeFilterType === 'car'}
              className={`control-pressed flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold transition-colors ${
                activeFilterType !== 'car' &&
                'text-[var(--color-text-secondary)] hover:text-[var(--color-primary)] hover:bg-[var(--color-secondary)]/10'
              }`}
            >
              <Car className="h-3.5 w-3.5" />
              <span>Autos ({vehicles.filter((v) => v.type === 'car').length})</span>
            </button>
            <button
              id="filter-vehicles-motos"
              type="button"
              onClick={() => setActiveFilterType('motorcycle')}
              aria-label="Filtrar por motos"
              aria-pressed={activeFilterType === 'motorcycle'}
              className={`control-pressed flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold transition-colors ${
                activeFilterType !== 'motorcycle' &&
                'text-[var(--color-text-secondary)] hover:text-[var(--color-primary)] hover:bg-[var(--color-secondary)]/10'
              }`}
            >
              <Bike className="h-3.5 w-3.5" />
              <span>Motos ({vehicles.filter((v) => v.type === 'motorcycle').length})</span>
            </button>
            <button
              id="filter-vehicles-bikes"
              type="button"
              onClick={() => setActiveFilterType('bicycle')}
              aria-label="Filtrar por bicicletas"
              aria-pressed={activeFilterType === 'bicycle'}
              className={`control-pressed flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold transition-colors ${
                activeFilterType !== 'bicycle' &&
                'text-[var(--color-text-secondary)] hover:text-[var(--color-primary)] hover:bg-[var(--color-secondary)]/10'
              }`}
            >
              <Bike className="h-3.5 w-3.5 text-emerald-500" />
              <span>Bicis ({vehicles.filter((v) => v.type === 'bicycle').length})</span>
            </button>
          </div>
        </div>
      </div>

      {/* Contenedor del Mapa posicionado estrictamente debajo de la barra de filtros */}
      <div
        ref={containerRef}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setMouseCoords(null)}
        className="relative z-0 flex-1 w-full min-h-0 overflow-hidden"
      >
        <LeafletManhattanMap
          warehouses={warehouses}
          vehicles={filteredVehicles}
          blockedStreets={blockedStreets}
          orders={orders}
          selectedVehicleId={selectedVehicleId}
          selectedWarehouseId={selectedWarehouseId}
          selectedBlockId={selectedBlockId}
          onSelectVehicle={(v) => {
            onSelectVehicle(v);
            if (v) {
              onSelectWarehouse(null);
              setSelectedBlockId(null);
            }
          }}
          onSelectWarehouse={(w) => {
            onSelectWarehouse(w);
            if (w) {
              onSelectVehicle(null);
              setSelectedBlockId(null);
            }
          }}
          onSelectBlock={(b) => {
            setSelectedBlockId(b ? b.id : null);
            if (b) {
              onSelectVehicle(null);
              onSelectWarehouse(null);
            }
          }}
          showBlockedStreets={showBlockedStreets}
          showProjectedRoutes={showProjectedRoutes}
          showCoverageZones={showCoverageZones}
          showOrders={false}
          isDarkTheme={isDarkTheme}
          simMinutes={simMinutes}
          onCreateBreakdownForVehicle={onCreateBreakdownForVehicle}
          className="w-full h-full"
        />

        {/* Bottom Floating Inspector Overlays (6. Margen 16px, padding 12px, ancho max 280px, truncate) */}
        {selectedVehicle && (() => {
          const selSemaforo = getVehicleSemaforoStatus(selectedVehicle, orders, simMinutes, config);
          return (
            <div
              id="inspector-vehicle-card"
              className={`absolute bottom-4 left-4 z-30 w-[280px] max-w-[280px] backdrop-blur-md rounded-xl p-3 shadow-2xl animate-in fade-in slide-in-from-bottom-2 border ${
                isDarkTheme
                  ? 'bg-slate-900/95 border-slate-700/80 text-slate-100'
                  : 'bg-[var(--color-surface)] border-slate-200 text-[var(--color-text-primary)] shadow-lg'
              }`}
            >
              <div className={`flex items-start justify-between border-b pb-2 ${
                isDarkTheme ? 'border-slate-800' : 'border-slate-100'
              }`}>
                <div className="flex items-center gap-2 overflow-hidden">
                  <div
                    className="p-1.5 rounded-lg text-white shrink-0"
                    style={{ backgroundColor: selSemaforo.hex }}
                  >
                    {selectedVehicle.type === 'car' && <Car className="h-4 w-4" aria-label="Auto" />}
                    {selectedVehicle.type === 'motorcycle' && <Bike className="h-4 w-4" aria-label="Moto" />}
                    {selectedVehicle.type === 'bicycle' && <Bike className="h-4 w-4" aria-label="Bicicleta" />}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className={`font-mono-code font-bold text-sm truncate ${
                        isDarkTheme ? 'text-white' : 'text-[var(--color-primary)]'
                      }`}>
                        {selectedVehicle.code}
                      </span>
                      <span className="text-[9px] font-mono-code px-1 py-0.2 rounded bg-blue-500/20 text-blue-400 border border-blue-500/30 shrink-0">
                        {selectedVehicle.type === 'car'
                          ? 'TA'
                          : selectedVehicle.type === 'motorcycle'
                          ? 'TM'
                          : 'TB'}
                      </span>
                    </div>
                    <div className="mt-1">
                      <SemaforoBadge status={selSemaforo} size="sm" />
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => onSelectVehicle(null)}
                  aria-label="Cerrar inspector de vehículo"
                  className={`text-xs p-1 rounded transition-colors ${
                    isDarkTheme ? 'text-slate-400 hover:text-white' : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
                  }`}
                >
                  ✕
                </button>
              </div>

              <div className="grid grid-cols-3 gap-1.5 my-2.5 text-xs">
                <div className={`rounded-lg p-1.5 border ${
                  isDarkTheme ? 'bg-slate-800/80 border-slate-700/50' : 'bg-slate-50 border-slate-200'
                }`}>
                  <span className="text-[10px] text-[var(--color-text-secondary)] block truncate">Velocidad</span>
                  <span className={`font-mono-code font-semibold ${isDarkTheme ? 'text-slate-200' : 'text-[var(--color-text-primary)]'}`}>
                    {selectedVehicle.status === 'broken' ? '0' : selectedVehicle.speed} km/h
                  </span>
                </div>
                <div className={`rounded-lg p-1.5 border ${
                  isDarkTheme ? 'bg-slate-800/80 border-slate-700/50' : 'bg-slate-50 border-slate-200'
                }`}>
                  <span className="text-[10px] text-[var(--color-text-secondary)] block truncate">Carga</span>
                  <span className={`font-mono-code font-semibold ${isDarkTheme ? 'text-slate-200' : 'text-[var(--color-text-primary)]'}`}>
                    {selectedVehicle.currentLoad}/{selectedVehicle.capacity}
                  </span>
                </div>
                <div className={`rounded-lg p-1.5 border ${
                  isDarkTheme ? 'bg-slate-800/80 border-slate-700/50' : 'bg-slate-50 border-slate-200'
                }`}>
                  <span className="text-[10px] text-[var(--color-text-secondary)] block truncate">Entregas</span>
                  <span className="font-mono-code font-semibold text-[#2E7D32]">
                    {selectedVehicle.totalDelivered}
                  </span>
                </div>
              </div>

              {selectedVehicle.status === 'broken' ? (
                <div className="p-2 rounded-lg bg-rose-950/60 border border-rose-800/60 text-xs text-rose-300 mb-2 space-y-1">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1 font-bold truncate">
                      <AlertTriangle className="h-3.5 w-3.5 text-rose-400 shrink-0" />
                      <span className="truncate">{selectedVehicle.breakdownInfo?.typeName || 'Avería'}</span>
                    </div>
                    {selectedVehicle.breakdownType && (
                      <span className="text-[9px] font-mono-code font-bold px-1 rounded bg-rose-500/20 text-rose-300 shrink-0">
                        T{selectedVehicle.breakdownType}
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-rose-200/90 leading-tight truncate">
                    {selectedVehicle.breakdownReason || 'Falla mecánica en proceso.'}
                  </p>
                  {selectedVehicle.breakdownInfo && (
                    <div className="pt-1 border-t border-rose-800/40 text-[10px] space-y-0.5 text-rose-300/80">
                      <div className="truncate">
                        <span className="font-semibold text-rose-200">Logística: </span>
                        {selectedVehicle.breakdownInfo.type === 1 ? (
                          <span>En sitio</span>
                        ) : selectedVehicle.breakdownInfo.towedToCentral ? (
                          <span className="text-emerald-300">En Central</span>
                        ) : (
                          <span>En sitio (máx 4h)</span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ) : selectedVehicle.status === 'maintenance' ? (
                <div className="p-2 rounded-lg bg-purple-950/60 border border-purple-800/60 text-xs text-purple-300 mb-2 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-purple-200 truncate">Mantenimiento</span>
                    <span className="text-[9px] font-mono-code bg-purple-900/60 px-1 rounded">
                      00:00-23:59
                    </span>
                  </div>
                  <p className="text-[11px] text-purple-200/90 leading-tight truncate">
                    {selectedVehicle.maintenanceReason || 'Unidad no disponible para asignación.'}
                  </p>
                </div>
              ) : (
                <Button
                  id={`btn-breakdown-veh-${selectedVehicle.id}`}
                  variant="danger"
                  size="sm"
                  className="w-full"
                  onClick={() => onCreateBreakdownForVehicle(selectedVehicle.id)}
                >
                  <AlertTriangle className="h-3.5 w-3.5 mr-1" />
                  Forzar Avería
                </Button>
              )}
            </div>
          );
        })()}

        {/* Warehouse Inspector Card (6. Ancho max 280px, padding 12px, margen 16px) */}
        {selectedWarehouse && (
          <div
            id="inspector-warehouse-card"
            className={`absolute bottom-4 left-4 z-30 w-[280px] max-w-[280px] backdrop-blur-md rounded-xl p-3 shadow-2xl animate-in fade-in slide-in-from-bottom-2 border ${
              isDarkTheme
                ? 'bg-slate-900/95 border-slate-700/80 text-slate-100'
                : 'bg-[var(--color-surface)] border-slate-200 text-[var(--color-text-primary)] shadow-lg'
            }`}
          >
            <div className={`flex items-start justify-between border-b pb-2 ${
              isDarkTheme ? 'border-slate-800' : 'border-slate-100'
            }`}>
              <div className="flex items-center gap-2 overflow-hidden">
                <div
                  className="p-1.5 rounded-lg text-white shrink-0"
                  style={{ backgroundColor: selectedWarehouse.color }}
                >
                  <WarehouseIcon className="h-4 w-4" aria-label="Almacén" />
                </div>
                <div className="min-w-0">
                  <span className={`font-bold text-sm block truncate ${
                    isDarkTheme ? 'text-white' : 'text-[var(--color-primary)]'
                  }`}>
                    {selectedWarehouse.name}
                  </span>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-mono-code text-[var(--color-text-secondary)]">
                      {selectedWarehouse.code}
                    </span>
                    <span className="text-[10px] font-mono-code px-1 py-0.2 rounded bg-slate-100 dark:bg-slate-800 text-[var(--color-secondary)] dark:text-blue-300 border border-slate-200 dark:border-slate-700">
                      {selectedWarehouse.coords.x}, {selectedWarehouse.coords.y}
                    </span>
                  </div>
                </div>
              </div>
              <button
                onClick={() => onSelectWarehouse(null)}
                aria-label="Cerrar inspector de almacén"
                className={`text-xs p-1 rounded transition-colors ${
                  isDarkTheme ? 'text-slate-400 hover:text-white' : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
                }`}
              >
                ✕
              </button>
            </div>

            <div className="space-y-2 my-2 text-xs">
              <div>
                <div className="flex justify-between text-[11px] mb-1">
                  <span className="text-[var(--color-text-secondary)]">Capacidad</span>
                  <span className={`font-mono-code font-bold ${isDarkTheme ? 'text-slate-200' : 'text-[var(--color-text-primary)]'}`}>
                    {!Number.isFinite(selectedWarehouse.capacity)
                      ? 'Infinita (∞)'
                      : `${Math.round((selectedWarehouse.currentStock / selectedWarehouse.capacity) * 100)}% (${selectedWarehouse.currentStock}/${selectedWarehouse.capacity})`}
                  </span>
                </div>
                <div className="h-1.5 w-full bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: !Number.isFinite(selectedWarehouse.capacity)
                        ? '100%'
                        : `${Math.min(100, (selectedWarehouse.currentStock / selectedWarehouse.capacity) * 100)}%`,
                      backgroundColor: !Number.isFinite(selectedWarehouse.capacity)
                        ? selectedWarehouse.color
                        : (selectedWarehouse.currentStock / selectedWarehouse.capacity) > 0.85
                        ? '#C62828'
                        : selectedWarehouse.color,
                    }}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-1.5">
                <div className={`rounded-lg p-1.5 border ${
                  isDarkTheme ? 'bg-slate-800/80 border-slate-700/50' : 'bg-slate-50 border-slate-200'
                }`}>
                  <span className="text-[10px] text-[var(--color-text-secondary)] block truncate">Tránsito</span>
                  <span className="font-mono-code font-semibold text-[var(--color-secondary)]">
                    {selectedWarehouse.inTransit} paq.
                  </span>
                </div>
                <div className={`rounded-lg p-1.5 border ${
                  isDarkTheme ? 'bg-slate-800/80 border-slate-700/50' : 'bg-slate-50 border-slate-200'
                }`}>
                  <span className="text-[10px] text-[var(--color-text-secondary)] block truncate">Salida</span>
                  <span className={`font-mono-code font-semibold ${isDarkTheme ? 'text-slate-200' : 'text-[var(--color-text-primary)]'}`}>
                    {selectedWarehouse.dispatchRatePerHour} paq/h
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Blocked Street Inspector Card (6. Ancho max 280px, padding 12px, margen 16px) */}
        {selectedBlock && (
          <div
            id="inspector-block-card"
            className={`absolute bottom-4 left-4 z-30 w-[280px] max-w-[280px] backdrop-blur-md rounded-xl p-3 shadow-2xl animate-in fade-in slide-in-from-bottom-2 border ${
              isDarkTheme
                ? 'bg-slate-900/95 border-rose-800/70 text-slate-100'
                : 'bg-[var(--color-surface)] border-rose-200 text-[var(--color-text-primary)] shadow-lg'
            }`}
          >
            <div className={`flex items-start justify-between border-b pb-2 ${
              isDarkTheme ? 'border-slate-800' : 'border-slate-100'
            }`}>
              <div className="flex items-center gap-2 overflow-hidden">
                <div className="p-1.5 rounded-lg bg-[#C62828] text-white shrink-0">
                  <ShieldAlert className="h-4 w-4" aria-label="Bloqueo" />
                </div>
                <div className="min-w-0">
                  <span className={`font-bold text-sm block truncate ${
                    isDarkTheme ? 'text-white' : 'text-[var(--color-danger)]'
                  }`}>
                    Bloqueo Permanente
                  </span>
                  <span className="text-xs text-[var(--color-danger)] font-mono-code">
                    {selectedBlock.severity.toUpperCase()}
                  </span>
                </div>
              </div>
              <button
                onClick={() => setSelectedBlockId(null)}
                aria-label="Cerrar inspector de bloqueo"
                className={`text-xs p-1 rounded transition-colors ${
                  isDarkTheme ? 'text-slate-400 hover:text-white' : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
                }`}
              >
                ✕
              </button>
            </div>
            <div className="my-2 space-y-1.5 text-xs">
              <div className={`rounded-lg p-1.5 border ${
                isDarkTheme ? 'bg-slate-800/80 border-slate-700/50' : 'bg-slate-50 border-slate-200'
              }`}>
                <span className="text-[10px] text-[var(--color-text-secondary)] block truncate">Tramo</span>
                <span className={`font-semibold truncate block ${isDarkTheme ? 'text-slate-200' : 'text-[var(--color-text-primary)]'}`}>
                  {selectedBlock.name}
                </span>
              </div>
              <div className={`rounded-lg p-1.5 border ${
                isDarkTheme ? 'bg-slate-800/80 border-slate-700/50' : 'bg-slate-50 border-slate-200'
              }`}>
                <span className="text-[10px] text-[var(--color-text-secondary)] block truncate">Motivo</span>
                <span className={`text-[11px] truncate block ${isDarkTheme ? 'text-slate-300' : 'text-[var(--color-text-secondary)]'}`}>
                  {selectedBlock.reason}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Live Mouse Coordinates Indicator HUD */}
        {mouseCoords && (
          <div className={`absolute bottom-3 right-4 z-20 pointer-events-none backdrop-blur px-2.5 py-1.5 rounded text-[10px] font-mono-code flex items-center gap-1.5 shadow border ${
            isDarkTheme ? 'bg-slate-900/90 border-slate-800 text-slate-300' : 'bg-[var(--color-surface)] border-slate-200 text-[var(--color-text-primary)]'
          }`}>
            <Crosshair className="h-3 w-3 text-[var(--color-secondary)]" />
            <span className="text-[var(--color-text-secondary)]">L1:</span>
            <span className="text-[var(--color-primary)] font-bold">X={mouseCoords.x}k</span>
            <span className="text-slate-300 dark:text-slate-600">|</span>
            <span className="text-[var(--color-primary)] font-bold">Y={mouseCoords.y}k</span>
          </div>
        )}
      </div>
    </main>
  );
};
