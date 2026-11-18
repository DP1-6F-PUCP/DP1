import React from 'react';
import { ChevronDown, ChevronUp, Gauge, GripVertical, Truck, Warehouse as WarehouseIcon } from 'lucide-react';
import { Vehicle, Warehouse } from '../../types';
import { getFleetFill, getWarehousesFill, WarehousesFillLevel } from '../../utils/indicadoresGlobales';
import { WAREHOUSE_STOCK_COLORS } from '../../utils/warehouseStock';
import { usePanelFlotante } from '../../hooks/usePanelFlotante';

interface IndicadoresGlobalesMapaProps {
  vehicles: Vehicle[];
  warehouses: Warehouse[];
}

const ORDEN_NIVELES_ALMACEN: WarehousesFillLevel[] = ['high', 'medium', 'low', 'empty'];

const BarraLlenado: React.FC<{ pct: number; hex: string; label: string }> = ({ pct, hex, label }) => (
  <div
    className="h-1.5 overflow-hidden rounded-full bg-slate-800"
    role="progressbar"
    aria-valuenow={pct}
    aria-valuemin={0}
    aria-valuemax={100}
    aria-label={label}
  >
    <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: hex }} />
  </div>
);

/**
 * Tarjeta flotante con los indicadores globales, compacta y movible (arranca en la esquina
 * inferior derecha del mapa, para no tapar las notificaciones de arriba):
 *  - G01/G02: llenado de toda la flota, en % y como semáforo.
 *  - G04: llenado de los almacenes en conjunto, como semáforo (+ cuántos hay en cada color).
 * Se arrastra desde el encabezado y se colapsa a una línea con los dos porcentajes; posición y
 * estado se recuerdan en el navegador. Recibe el mismo estado visual que los marcadores.
 */
export const IndicadoresGlobalesMapa: React.FC<IndicadoresGlobalesMapaProps> = ({ vehicles, warehouses }) => {
  const panel = usePanelFlotante('paqrap.panel.indicadores', { derecha: 12, vertical: 12 }, 'abajo');
  const flota = getFleetFill(vehicles);
  const almacenes = getWarehousesFill(warehouses);

  return (
    <section
      ref={panel.ref}
      style={panel.style}
      aria-label="Indicadores globales"
      className={`absolute z-[1000] ${panel.colapsado ? '' : 'w-[316px]'} rounded-xl border border-[var(--color-sidebar-border)] bg-[var(--color-sidebar-background)]/95 text-slate-100 shadow-xl backdrop-blur-sm select-none`}
    >
      <div
        {...panel.manejadoresArrastre}
        title="Arrastra para mover"
        className="flex cursor-grab touch-none items-center gap-1.5 px-2 py-1.5 active:cursor-grabbing"
      >
        <GripVertical className="h-4 w-4 shrink-0 text-slate-500" aria-hidden />
        <Gauge className="h-4 w-4 shrink-0 text-cyan-400" aria-hidden />
        {panel.colapsado ? (
          <span className="flex items-center gap-2 font-mono-code text-sm font-bold">
            <span className="flex items-center gap-1" title={`Flota: ${flota.label}`}>
              <Truck className="h-3.5 w-3.5 text-slate-400" aria-hidden />
              <span style={{ color: flota.hex }}>{flota.pct}%</span>
            </span>
            <span className="flex items-center gap-1" title={`Almacenes: ${almacenes.label}`}>
              <WarehouseIcon className="h-3.5 w-3.5 text-slate-400" aria-hidden />
              <span style={{ color: almacenes.hex }}>{almacenes.pct}%</span>
            </span>
          </span>
        ) : (
          <span className="text-xs font-semibold text-slate-200">Indicadores globales</span>
        )}
        <button
          type="button"
          onClick={panel.alternar}
          aria-expanded={!panel.colapsado}
          aria-label={panel.colapsado ? 'Mostrar indicadores' : 'Colapsar indicadores'}
          className="ml-auto rounded p-0.5 text-slate-400 hover:text-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-400"
        >
          {panel.colapsado ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
        </button>
      </div>

      {!panel.colapsado && (
        <div className="space-y-2.5 px-3 pb-2.5">
          {/* G01 + G02: llenado de la flota */}
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 text-xs">
              <Truck className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden />
              <span className="font-medium text-slate-200">Flota</span>
              <span className="ml-auto font-mono-code text-sm font-bold" style={{ color: flota.hex }}>{flota.pct}%</span>
            </div>
            <BarraLlenado pct={flota.pct} hex={flota.hex} label={`Llenado de la flota ${flota.pct}%, ${flota.label}`} />
            <div className="flex items-center justify-between text-[11px]">
              <span className="font-medium" style={{ color: flota.hex }}>{flota.label}</span>
              <span className="font-mono-code text-slate-300">{flota.load} / {flota.capacity} paq</span>
            </div>
          </div>

          {/* G04: llenado de los almacenes en conjunto */}
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 text-xs">
              <WarehouseIcon className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden />
              <span className="font-medium text-slate-200">Almacenes</span>
              <span className="ml-auto font-mono-code text-sm font-bold" style={{ color: almacenes.hex }}>{almacenes.pct}%</span>
            </div>
            <BarraLlenado pct={almacenes.pct} hex={almacenes.hex} label={`Llenado de los almacenes ${almacenes.pct}%, ${almacenes.label}`} />
            <div className="flex items-center justify-between text-[11px]">
              <span className="font-medium" style={{ color: almacenes.hex }}>{almacenes.label}</span>
              <span className="flex items-center gap-2 font-mono-code text-slate-300">
                {ORDEN_NIVELES_ALMACEN.map((nivel) => (
                  <span
                    key={nivel}
                    className="flex items-center gap-1"
                    title={`${WAREHOUSE_STOCK_COLORS[nivel].label}: ${almacenes.counts[nivel]} de ${almacenes.total}`}
                  >
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: WAREHOUSE_STOCK_COLORS[nivel].hex }} />
                    {almacenes.counts[nivel]}
                  </span>
                ))}
              </span>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
