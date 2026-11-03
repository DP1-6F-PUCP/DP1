import React, { useState } from 'react';
import { ChevronDown, ChevronUp, Gauge, Truck, Warehouse as WarehouseIcon } from 'lucide-react';
import { Vehicle, Warehouse } from '../../types';
import { getFleetFill, getWarehousesFill, WarehousesFillLevel } from '../../utils/indicadoresGlobales';
import { WAREHOUSE_STOCK_COLORS } from '../../utils/warehouseStock';

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
 * Tarjeta flotante (esquina inferior derecha del mapa, para no tapar las notificaciones de
 * arriba) con los indicadores globales:
 *  - G01/G02: llenado de toda la flota, en % y como semáforo.
 *  - G04: llenado de los almacenes en conjunto, como semáforo (+ cuántos hay en cada color).
 * Recibe el mismo estado visual que los marcadores, así que va sincronizada con lo que se ve.
 */
export const IndicadoresGlobalesMapa: React.FC<IndicadoresGlobalesMapaProps> = ({ vehicles, warehouses }) => {
  const [colapsado, setColapsado] = useState(false);
  const flota = getFleetFill(vehicles);
  const almacenes = getWarehousesFill(warehouses);

  return (
    <section
      aria-label="Indicadores globales"
      className="absolute right-3 bottom-3 z-[1000] w-[min(280px,calc(100%-1.5rem))] rounded-xl border border-[var(--color-sidebar-border)] bg-[var(--color-sidebar-background)] p-3 text-slate-100 shadow-xl backdrop-blur-sm"
    >
      <button
        type="button"
        onClick={() => setColapsado(!colapsado)}
        aria-expanded={!colapsado}
        className="flex w-full items-center gap-2 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-400 rounded"
      >
        <Gauge className="h-4 w-4 shrink-0 text-cyan-400" aria-hidden />
        <span className="whitespace-nowrap text-[11px] font-bold uppercase tracking-wide text-slate-300">Indicadores globales</span>
        {colapsado && (
          <span className="ml-auto flex items-center gap-2 font-mono-code text-[11px] font-bold">
            <span className="flex items-center gap-1" title={`Flota: ${flota.label}`}>
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: flota.hex }} />
              {flota.pct}%
            </span>
            <span className="flex items-center gap-1" title={`Almacenes: ${almacenes.label}`}>
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: almacenes.hex }} />
              {almacenes.pct}%
            </span>
          </span>
        )}
        {colapsado
          ? <ChevronDown className="h-3.5 w-3.5 shrink-0 text-slate-500" aria-hidden />
          : <ChevronUp className="ml-auto h-3.5 w-3.5 shrink-0 text-slate-500" aria-hidden />}
      </button>

      {!colapsado && (
        <div className="mt-2 space-y-3 border-t border-[var(--color-sidebar-border)] pt-2.5">
          {/* G01 + G02: llenado de la flota */}
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 text-[11px]">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: flota.hex, boxShadow: `0 0 6px ${flota.hex}` }} />
              <Truck className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden />
              <span className="font-medium text-slate-200">Flota</span>
              <span className="ml-auto font-mono-code text-sm font-bold" style={{ color: flota.hex }}>{flota.pct}%</span>
            </div>
            <BarraLlenado pct={flota.pct} hex={flota.hex} label={`Llenado de la flota ${flota.pct}%`} />
            <div className="flex justify-between text-[10px] text-slate-400">
              <span style={{ color: flota.hex }} className="font-semibold">{flota.label}</span>
              <span className="font-mono-code">{flota.load} / {flota.capacity} paq</span>
            </div>
          </div>

          {/* G04: llenado de los almacenes en conjunto */}
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 text-[11px]">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: almacenes.hex, boxShadow: `0 0 6px ${almacenes.hex}` }} />
              <WarehouseIcon className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden />
              <span className="font-medium text-slate-200">Almacenes</span>
              <span className="ml-auto font-mono-code text-sm font-bold" style={{ color: almacenes.hex }}>{almacenes.pct}%</span>
            </div>
            <BarraLlenado pct={almacenes.pct} hex={almacenes.hex} label={`Llenado de los almacenes ${almacenes.pct}%`} />
            <div className="flex items-center justify-between text-[10px] text-slate-400">
              <span style={{ color: almacenes.hex }} className="font-semibold">{almacenes.label}</span>
              <span className="flex items-center gap-2 font-mono-code">
                {ORDEN_NIVELES_ALMACEN.map((nivel) => (
                  <span
                    key={nivel}
                    className="flex items-center gap-0.5"
                    title={`${WAREHOUSE_STOCK_COLORS[nivel].label}: ${almacenes.counts[nivel]} de ${almacenes.total}`}
                  >
                    <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: WAREHOUSE_STOCK_COLORS[nivel].hex }} />
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
