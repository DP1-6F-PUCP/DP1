import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Wrench } from 'lucide-react';
import { BreakdownType, Vehicle } from '../../types';
import { useVehicles } from '../../features/vehiculos/hooks/useVehicles';
import { useAveriable } from '../../features/flota/useAveriable';
import { confirmar } from '../Confirmacion';

/* Mismos colores que el distintivo de avería del mapa (BREAKDOWN_COLORS) y la leyenda. */
const OPCIONES: Array<{ tipo: BreakdownType; color: string; titulo: string; detalle: string }> = [
  { tipo: 1, color: '#8B5CF6', titulo: 'Tipo 1 · menor', detalle: '2 h, se repara en el lugar' },
  { tipo: 2, color: '#EC4899', titulo: 'Tipo 2 · intermedia', detalle: 'Hasta fin del siguiente turno' },
  { tipo: 3, color: '#14B8A6', titulo: 'Tipo 3 · mayor', detalle: '≥ 2 días, va al almacén central' },
];

const ANCHO = 232;

/** Reconfirmación de una avería (mapa y tabla de Flota): no se puede deshacer. */
export const confirmarAveria = (codigo: string, tipo: BreakdownType) => {
  const o = OPCIONES.find((x) => x.tipo === tipo);
  return confirmar({
    titulo: `¿Averiar ${codigo}?`,
    detalle: o ? `${o.titulo} · ${o.detalle}. No se puede deshacer.` : 'No se puede deshacer.',
    accion: 'Averiar',
    tono: 'peligro',
  });
};

interface Props {
  vehiculo: Vehicle;
  /** Posición del clic, en px del contenedor del mapa. */
  punto: { x: number; y: number };
  onCerrar: () => void;
}

/**
 * Menú de clic derecho sobre un vehículo: induce una avería (pedido del profesor). Usa el mismo
 * flujo que el panel lateral (solicitud AVERIA al backend + aviso). Se cierra con Esc, con un clic
 * fuera o al elegir.
 */
export const MenuAveriaVehiculo: React.FC<Props> = ({ vehiculo, punto, onCerrar }) => {
  const { reportBreakdown, isReportingBreakdown } = useVehicles();
  const ref = useRef<HTMLDivElement>(null);
  const [posicion, setPosicion] = useState({ left: punto.x, top: punto.y });
  // Regla de 4 h (la misma de la tabla de Flota). Se fija al abrir: el reloj avanza mientras el menú
  // está abierto y no debe cambiar bajo el cursor.
  const reglaAhora = useAveriable(vehiculo);
  const [regla] = useState(reglaAhora);
  const noDisponible = regla ? !regla.ok : vehiculo.status === 'broken' || vehiculo.status === 'maintenance';

  useEffect(() => {
    const alTecla = (e: KeyboardEvent) => { if (e.key === 'Escape') onCerrar(); };
    const alClic = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) onCerrar(); };
    window.addEventListener('keydown', alTecla);
    window.addEventListener('mousedown', alClic);
    ref.current?.querySelector<HTMLButtonElement>('button:not([disabled])')?.focus();
    return () => {
      window.removeEventListener('keydown', alTecla);
      window.removeEventListener('mousedown', alClic);
    };
  }, [onCerrar]);

  // El aviso de confirmación o error lo da useVehicles (en el useMutation): el menú se cierra ya y,
  // desmontado, los callbacks de mutate() no se ejecutarían.
  const inducir = async (tipo: BreakdownType) => {
    onCerrar();
    if (await confirmarAveria(vehiculo.code, tipo)) reportBreakdown({ vehicleId: vehiculo.id, type: tipo });
  };

  // Que no se salga del mapa: si no cabe a la derecha o abajo del clic, se abre hacia el otro lado.
  // Se mide ya montado (antes de pintarse), con el alto real del menú.
  useLayoutEffect(() => {
    const menu = ref.current;
    const padre = menu?.parentElement;
    if (!menu || !padre) return;
    const alto = menu.offsetHeight;
    setPosicion({
      left: punto.x + ANCHO > padre.clientWidth ? Math.max(4, punto.x - ANCHO) : punto.x,
      top: punto.y + alto > padre.clientHeight ? Math.max(4, punto.y - alto) : punto.y,
    });
  }, [punto.x, punto.y]);

  return (
    <div
      ref={ref}
      role="menu"
      aria-label={`Inducir avería en ${vehiculo.code}`}
      style={{ left: posicion.left, top: posicion.top, width: ANCHO }}
      onContextMenu={(e) => e.preventDefault()}
      className="tema-panel absolute z-[1200] overflow-hidden rounded-xl border border-[var(--color-sidebar-border)] bg-[var(--color-sidebar-background)] text-slate-100 shadow-2xl"
    >
      <div className="flex items-center gap-2 border-b border-[var(--color-sidebar-border)] px-3 py-2">
        <Wrench className="h-4 w-4 text-rose-400" aria-hidden />
        <span className="text-xs font-semibold">Inducir avería · {vehiculo.code}</span>
      </div>
      {noDisponible ? (
        <p role="note" className="px-3 py-2.5 text-xs text-slate-400">
          {regla?.motivo ?? (vehiculo.status === 'broken' ? 'Ya está averiado' : 'Está en mantenimiento')}
        </p>
      ) : (
        <div className="p-1">
          {regla && <p className="px-2 pb-1 pt-0.5 text-[11px] text-slate-400">{regla.motivo}</p>}
          {OPCIONES.map((o) => (
            <button
              key={o.tipo}
              type="button"
              role="menuitem"
              disabled={isReportingBreakdown}
              onClick={() => void inducir(o.tipo)}
              className="flex w-full items-start gap-2.5 rounded-lg px-2 py-1.5 text-left transition hover:bg-slate-800 focus-visible:bg-slate-800 focus-visible:outline-none disabled:opacity-50"
            >
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-[1.5px] bg-white text-[8px] font-extrabold"
                style={{ borderColor: o.color, color: o.color }}>A{o.tipo}</span>
              <span className="min-w-0">
                <span className="block text-xs font-semibold text-slate-100">{o.titulo}</span>
                <span className="block text-[11px] text-slate-400">{o.detalle}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
