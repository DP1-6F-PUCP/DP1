import React from 'react';
import { Car, CircleParking, Coffee, Navigation, PackageCheck, Warehouse, Wrench } from 'lucide-react';
import { FaBicycle, FaMotorcycle } from 'react-icons/fa';
import type { BreakdownType, Vehicle } from '../../../types';
import { ESTADO_FLOTA, HEX_AVERIA, estadoFlota, type EstadoFlota } from '../flotaUtils';
import { nivelCargaPct, SEMAFORO_CARGA } from '../../../utils/filtrosMapa';

// Colores compartidos (claro / oscuro), los mismos de la página Pedidos.
export const BORDE = 'border-slate-200 dark:border-slate-700/70';
export const TEXTO_FUERTE = 'text-slate-900 dark:text-slate-100';
export const TEXTO = 'text-slate-700 dark:text-slate-300';
export const TEXTO_TENUE = 'text-slate-500 dark:text-slate-400';
export const ACENTO = 'text-cyan-700 dark:text-cyan-300';
export const CAMPO = `rounded-lg border ${BORDE} bg-white text-slate-900 placeholder-slate-400 focus:border-cyan-500 focus:outline-none dark:bg-slate-950/60 dark:text-slate-100 dark:placeholder-slate-500`;
export const FOCO = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-cyan-500';

export const corto = (codigo: string) => (codigo.length > 8 ? `#${codigo.slice(-4)}` : codigo);

export const ICONO_ESTADO: Record<EstadoFlota, React.ElementType> = {
  disponible: CircleParking,
  en_ruta: Navigation,
  entregando: PackageCheck,
  refrigerio: Coffee,
  almacen: Warehouse,
  averiado: Wrench,
  mantenimiento: Wrench,
};

export const TIPOS_VEHICULO: Array<{ tipo: Vehicle['type']; label: string; Icono: React.ElementType }> = [
  { tipo: 'car', label: 'Auto', Icono: Car },
  { tipo: 'motorcycle', label: 'Moto', Icono: FaMotorcycle },
  { tipo: 'bicycle', label: 'Bici', Icono: FaBicycle },
];
export const ICONO_TIPO: Record<Vehicle['type'], React.ElementType> = { car: Car, motorcycle: FaMotorcycle, bicycle: FaBicycle };
export const NOMBRE_TIPO: Record<Vehicle['type'], string> = { car: 'Auto', motorcycle: 'Moto', bicycle: 'Bici' };

/** Distintivo de avería del mapa y la leyenda (círculo blanco con "A1"/"A2"/"A3"). */
export const DistintivoAveria: React.FC<{ tipo: BreakdownType; className?: string }> = ({ tipo, className = 'h-4 w-4 text-[7px]' }) => (
  <span className={`flex shrink-0 items-center justify-center rounded-full border-[1.5px] bg-white font-extrabold ${className}`}
    style={{ borderColor: HEX_AVERIA[tipo], color: HEX_AVERIA[tipo] }} aria-hidden>A{tipo}</span>
);

/** Chip del estado de un vehículo, con el color y el ícono de la leyenda. */
export const ChipEstado: React.FC<{ vehiculo: Vehicle }> = ({ vehiculo }) => {
  const e = estadoFlota(vehiculo);
  const tipo = vehiculo.breakdownType ?? 1;
  const hex = e === 'averiado' ? HEX_AVERIA[tipo] : ESTADO_FLOTA[e].hex;
  const Icono = ICONO_ESTADO[e];
  const label = e === 'averiado' ? `Avería tipo ${tipo}` : ESTADO_FLOTA[e].label;
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border px-1.5 py-0.5 text-xs font-medium ${TEXTO_FUERTE}`}
      style={{ borderColor: `${hex}66`, backgroundColor: `${hex}1A` }}
      title={e === 'averiado' ? undefined : ESTADO_FLOTA[e].ayuda}
    >
      {e === 'averiado'
        ? <DistintivoAveria tipo={tipo} />
        : <Icono className="h-3.5 w-3.5 shrink-0" style={{ color: hex }} aria-hidden />}
      {label}
    </span>
  );
};

/** Carga a bordo: barra con el semáforo de capacidad (mismo color que el vehículo en el mapa) y "X/Y". */
export const BarraCarga: React.FC<{ carga: number; capacidad: number }> = ({ carga, capacidad }) => {
  const pct = capacidad > 0 ? Math.min(100, Math.round((carga / capacidad) * 100)) : 0;
  const semaforo = SEMAFORO_CARGA[nivelCargaPct(pct)];
  return (
    <div className="flex min-w-[110px] items-center gap-2" title={`${carga} de ${capacidad} paquetes (${pct} %) · ${semaforo.label}`}>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800" role="progressbar"
        aria-valuemin={0} aria-valuemax={capacidad} aria-valuenow={carga} aria-label="Carga a bordo">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: semaforo.hex }} />
      </div>
      <span className={`shrink-0 font-mono-code text-xs ${TEXTO_FUERTE}`}>{carga}<span className={TEXTO_TENUE}>/{capacidad}</span></span>
    </div>
  );
};

export const Chip: React.FC<{
  activo: boolean;
  onClick: () => void;
  hex?: string;
  title?: string;
  children: React.ReactNode;
}> = ({ activo, onClick, hex, title, children }) => (
  <button
    type="button"
    aria-pressed={activo}
    onClick={onClick}
    title={title}
    className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition ${FOCO} ${
      activo
        ? 'border-cyan-600 bg-cyan-50 text-cyan-800 dark:border-cyan-500 dark:bg-cyan-500/15 dark:text-cyan-200'
        : `${BORDE} ${TEXTO} hover:border-slate-400 hover:text-slate-900 dark:hover:border-slate-500 dark:hover:text-white`}`}
  >
    {hex && <span className="h-2 w-2 rounded-full" style={{ backgroundColor: hex }} aria-hidden />}
    {children}
  </button>
);
