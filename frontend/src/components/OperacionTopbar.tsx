import React from 'react';
import { Play, Square } from 'lucide-react';
import { useEscenario } from '../features/escenario/hooks/useEscenario';
import { EventLogButton } from '../features/eventos/components/EventLogButton';

const NOMBRE_ESCENARIO = {
  DIA_A_DIA: 'Tiempo Real',
  CINCO_DIAS: 'Simulación 5 Días',
  COLAPSO_LOGISTICO: 'Colapso Logístico',
} as const;

/**
 * Barra superior de la operación: registro de eventos (izquierda), escenario (al centro) y el botón
 * de detener (derecha). Los cuatro relojes están en un cuadro flotante sobre el mapa (ver
 * RelojesOperacion). Ya no hay botón de pausa; solo aparece "Reanudar" si la ejecución quedó
 * pausada por otra vía (otro navegador o la API), para no dejarla trabada.
 */
export const OperacionTopbar: React.FC = () => {
  const { ejecucion, reanudar, detener, isReanudando, isDeteniendo } = useEscenario();
  const pausada = ejecucion?.estado === 'PAUSADA';
  const puedeControlar = ejecucion?.estado === 'EN_CURSO' || ejecucion?.estado === 'INICIADA' || pausada;

  const stop = () => {
    if (ejecucion && window.confirm('¿Detener definitivamente esta ejecución? No se puede reanudar después.')) {
      detener(ejecucion.idEjecucion);
    }
  };

  return (
    <header className="relative flex h-14 shrink-0 items-center justify-between gap-3 border-b border-[var(--color-sidebar-border)] bg-[var(--color-sidebar-background)] px-3 text-slate-300">
      <div className="flex items-center gap-2 shrink-0">
        <EventLogButton />
      </div>

      {ejecucion && (
        <div className="pointer-events-none absolute left-1/2 -translate-x-1/2 text-center">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Escenario</div>
          <div className="text-sm font-semibold text-white whitespace-nowrap">
            {NOMBRE_ESCENARIO[ejecucion.tipoEscenario]}
          </div>
        </div>
      )}

      {puedeControlar && ejecucion && (
        <div className="flex shrink-0 items-center gap-1.5">
          {pausada && (
            <button
              type="button"
              title="Reanudar"
              disabled={isReanudando}
              onClick={() => reanudar(ejecucion.idEjecucion)}
              className="flex h-8 items-center gap-1.5 rounded-lg border border-blue-500 px-3 text-xs font-semibold text-blue-300 transition hover:bg-blue-500/10 disabled:opacity-50"
            >
              <Play className="h-4 w-4 fill-current" />
              Reanudar
            </button>
          )}
          <button
            type="button"
            title="Detener la ejecución"
            aria-label="Detener la ejecución"
            disabled={isDeteniendo}
            onClick={stop}
            className="flex h-8 w-9 items-center justify-center rounded-lg border border-rose-500/70 text-rose-400 transition hover:bg-rose-500/10 disabled:opacity-50"
          >
            <Square className="h-4 w-4 fill-current" />
          </button>
        </div>
      )}
    </header>
  );
};
