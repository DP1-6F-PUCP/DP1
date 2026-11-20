import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Wrench } from 'lucide-react';
import type { BreakdownType, Vehicle } from '../../../types';
import { OPCIONES_AVERIA, type Averiable } from '../flotaUtils';

const ANCHO = 248;

interface Props {
  vehiculo: Vehicle;
  estado: Averiable;
  ocupado: boolean;
  onAveriar: (vehiculo: Vehicle, tipo: BreakdownType) => void;
}

/**
 * Acción "Averiar" de una fila de Flota: abre un menú con los tres tipos (mismos textos y colores que
 * el menú de clic derecho del mapa). Si el vehículo no cumple la regla (salió hace < 4 h) el botón
 * queda deshabilitado con el motivo en el tooltip y para el lector de pantalla; se usa aria-disabled
 * (no disabled) para que siga siendo enfocable y el motivo se pueda leer con el teclado.
 *
 * El menú va en un portal con posición fija: la tabla tiene overflow (desplazamiento horizontal) y
 * recortaría un menú absoluto en las últimas filas.
 */
export const BotonAveria: React.FC<Props> = ({ vehiculo, estado, ocupado, onAveriar }) => {
  const [abierto, setAbierto] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const botonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const idMotivo = `motivo-averia-${vehiculo.id}`;
  const deshabilitado = !estado.ok || ocupado;

  // Si deja de cumplir la regla con el menú abierto (pasa el reloj), se cierra.
  useEffect(() => { if (deshabilitado) setAbierto(false); }, [deshabilitado]);

  useLayoutEffect(() => {
    if (!abierto) return;
    const ubicar = () => {
      const r = botonRef.current?.getBoundingClientRect();
      if (!r) return;
      const alto = menuRef.current?.offsetHeight ?? 170;
      const abajo = r.bottom + 4 + alto <= window.innerHeight;
      setPos({
        top: abajo ? r.bottom + 4 : Math.max(4, r.top - 4 - alto),
        left: Math.min(Math.max(4, r.right - ANCHO), window.innerWidth - ANCHO - 4),
      });
    };
    ubicar();
    window.addEventListener('resize', ubicar);
    window.addEventListener('scroll', ubicar, true);
    return () => {
      window.removeEventListener('resize', ubicar);
      window.removeEventListener('scroll', ubicar, true);
    };
  }, [abierto]);

  useEffect(() => {
    if (!abierto) return;
    const alClic = (e: MouseEvent) => {
      const t = e.target as Node;
      if (menuRef.current?.contains(t) || botonRef.current?.contains(t)) return;
      setAbierto(false);
    };
    window.addEventListener('mousedown', alClic);
    return () => window.removeEventListener('mousedown', alClic);
  }, [abierto]);

  // Foco en el primer tipo al abrir (cuando el menú ya tiene posición).
  const listo = abierto && pos !== null;
  useEffect(() => {
    if (listo) menuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus();
  }, [listo]);

  const cerrar = (devolverFoco = true) => {
    setAbierto(false);
    if (devolverFoco) botonRef.current?.focus();
  };

  const alTeclaMenu = (e: React.KeyboardEvent) => {
    const items = Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? []);
    const i = items.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === 'Escape') { e.preventDefault(); cerrar(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); items[(i + 1) % items.length]?.focus(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); items[(i - 1 + items.length) % items.length]?.focus(); }
    else if (e.key === 'Home') { e.preventDefault(); items[0]?.focus(); }
    else if (e.key === 'End') { e.preventDefault(); items[items.length - 1]?.focus(); }
    else if (e.key === 'Tab') cerrar(false);
  };

  return (
    <>
      <button
        ref={botonRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={abierto}
        aria-disabled={deshabilitado}
        aria-describedby={idMotivo}
        title={ocupado ? 'Enviando la solicitud…' : estado.motivo}
        onClick={() => { if (!deshabilitado) setAbierto((v) => !v); }}
        onKeyDown={(e) => { if (e.key === 'ArrowDown' && !deshabilitado) { e.preventDefault(); setAbierto(true); } }}
        className={`inline-flex items-center gap-1 whitespace-nowrap rounded-md border px-2 py-1 text-xs font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-cyan-500 ${
          deshabilitado
            ? 'cursor-not-allowed border-slate-200 text-slate-400 dark:border-slate-700/70 dark:text-slate-600'
            : 'border-rose-500/50 text-rose-700 hover:bg-rose-500/10 dark:text-rose-300'}`}
      >
        <Wrench className="h-3.5 w-3.5" aria-hidden />Averiar<ChevronDown className="h-3 w-3 opacity-70" aria-hidden />
      </button>
      <span id={idMotivo} className="sr-only">{estado.motivo}</span>

      {abierto && createPortal(
        <div
          ref={menuRef}
          role="menu"
          aria-label={`Inducir avería en ${vehiculo.code}`}
          onKeyDown={alTeclaMenu}
          style={{ top: pos?.top ?? -9999, left: pos?.left ?? -9999, width: ANCHO }}
          className="fixed z-[2100] overflow-hidden rounded-xl border border-slate-200 bg-white text-slate-900 shadow-2xl dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
        >
          <div className="border-b border-slate-200 px-3 py-2 dark:border-slate-700">
            <p className="flex items-center gap-1.5 text-xs font-semibold">
              <Wrench className="h-3.5 w-3.5 text-rose-500" aria-hidden />Inducir avería · <span className="font-mono-code">{vehiculo.code}</span>
            </p>
            <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">{estado.motivo}</p>
          </div>
          <div className="p-1">
            {OPCIONES_AVERIA.map((o) => (
              <button
                key={o.tipo}
                type="button"
                role="menuitem"
                onClick={() => { onAveriar(vehiculo, o.tipo); cerrar(); }}
                className="flex w-full items-start gap-2.5 rounded-lg px-2 py-1.5 text-left transition hover:bg-slate-100 focus-visible:bg-slate-100 focus-visible:outline-none dark:hover:bg-slate-800 dark:focus-visible:bg-slate-800"
              >
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-[1.5px] bg-white text-[8px] font-extrabold"
                  style={{ borderColor: o.hex, color: o.hex }} aria-hidden>A{o.tipo}</span>
                <span className="min-w-0">
                  <span className="block text-xs font-semibold">{o.titulo}</span>
                  <span className="block text-[11px] text-slate-500 dark:text-slate-400">{o.detalle}</span>
                </span>
              </button>
            ))}
          </div>
          <p className="border-t border-slate-200 px-3 py-1.5 text-[10px] text-slate-500 dark:border-slate-700 dark:text-slate-400">
            Se aplica al cerrar el siguiente lote de planificación.
          </p>
        </div>,
        document.body,
      )}
    </>
  );
};
