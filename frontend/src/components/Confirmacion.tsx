import React, { useEffect, useRef } from 'react';
import { create } from 'zustand';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';

/**
 * Reconfirmación de toda acción que crea o destruye algo (regla de usabilidad del proyecto: evitar
 * misclicks). Uso, desde cualquier lugar (también fuera de React):
 *
 *   if (!(await confirmar({ titulo: '¿Detener la simulación?', accion: 'Detener', tono: 'peligro' }))) return;
 *
 * Un solo diálogo montado en la raíz (<DialogoConfirmacion />). Esc o clic fuera = cancelar. El foco
 * empieza en "Cancelar": un Enter accidental nunca confirma.
 */
export interface PedidoConfirmacion {
  titulo: string;
  /** Una línea con la consecuencia; opcional. */
  detalle?: React.ReactNode;
  /** Verbo del botón: "Detener", "Guardar", "Averiar"… */
  accion: string;
  /** peligro = destruye o no se puede deshacer (rojo); crear = construye (azul). */
  tono?: 'peligro' | 'crear';
}

interface Estado {
  pedido: (PedidoConfirmacion & { resolver: (ok: boolean) => void }) | null;
}

const useConfirmacion = create<Estado>(() => ({ pedido: null }));

export function confirmar(pedido: PedidoConfirmacion): Promise<boolean> {
  return new Promise((resolver) => {
    useConfirmacion.getState().pedido?.resolver(false); // uno a la vez
    useConfirmacion.setState({ pedido: { ...pedido, resolver } });
  });
}

const responder = (ok: boolean) => {
  const { pedido } = useConfirmacion.getState();
  if (!pedido) return;
  useConfirmacion.setState({ pedido: null });
  pedido.resolver(ok);
};

export const DialogoConfirmacion: React.FC = () => {
  const pedido = useConfirmacion((s) => s.pedido);
  const cancelarRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!pedido) return;
    const previo = document.activeElement as HTMLElement | null;
    cancelarRef.current?.focus();
    // Captura: Esc cierra esta confirmación y no llega al menú o modal de debajo.
    const alTecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); responder(false); }
    };
    window.addEventListener('keydown', alTecla, true);
    return () => {
      window.removeEventListener('keydown', alTecla, true);
      previo?.focus?.();
    };
  }, [pedido]);

  if (!pedido) return null;
  const peligro = pedido.tono === 'peligro';
  const Icono = peligro ? AlertTriangle : CheckCircle2;
  return (
    <div className="fixed inset-0 z-[10050] flex items-center justify-center bg-black/50 p-4 backdrop-blur-[2px]"
      onMouseDown={(e) => { if (e.target === e.currentTarget) responder(false); }}>
      <div role="alertdialog" aria-modal="true" aria-labelledby="confirmacion-titulo"
        aria-describedby={pedido.detalle ? 'confirmacion-detalle' : undefined}
        className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl dark:border-slate-700/70 dark:bg-slate-900">
        <div className="flex items-start gap-3">
          <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${peligro
            ? 'bg-rose-100 text-rose-600 dark:bg-rose-500/15 dark:text-rose-400'
            : 'bg-blue-100 text-blue-600 dark:bg-blue-500/15 dark:text-blue-400'}`}>
            <Icono className="h-5 w-5" aria-hidden />
          </span>
          <div className="min-w-0 pt-1">
            <h2 id="confirmacion-titulo" className="text-base font-semibold text-slate-900 dark:text-slate-100">{pedido.titulo}</h2>
            {pedido.detalle && (
              <p id="confirmacion-detalle" className="mt-1 text-sm text-slate-600 dark:text-slate-300">{pedido.detalle}</p>
            )}
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button ref={cancelarRef} type="button" onClick={() => responder(false)}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800">
            Cancelar
          </button>
          <button type="button" onClick={() => responder(true)}
            className={`rounded-lg px-4 py-2 text-sm font-semibold text-white shadow-sm transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ${peligro
              ? 'bg-rose-600 hover:bg-rose-500 focus-visible:outline-rose-400'
              : 'bg-blue-600 hover:bg-blue-500 focus-visible:outline-blue-400'}`}>
            {pedido.accion}
          </button>
        </div>
      </div>
    </div>
  );
};
