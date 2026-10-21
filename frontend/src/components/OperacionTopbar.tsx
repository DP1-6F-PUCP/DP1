import React from 'react';
import { Pause, Play, Square } from 'lucide-react';
import { useEscenario } from '../features/escenario/hooks/useEscenario';
import { SimClock } from '../features/escenario/components/SimClock';
import { EventLogButton } from '../features/eventos/components/EventLogButton';

export const OperacionTopbar: React.FC = () => {
  const { ejecucion, pausar, reanudar, detener, isPausando, isReanudando, isDeteniendo } = useEscenario();
  const pausada = ejecucion?.estado === 'PAUSADA';
  const puedeControlar = ejecucion?.estado === 'EN_CURSO' || ejecucion?.estado === 'INICIADA' || pausada;

  const stop = () => {
    if (ejecucion && window.confirm('¿Detener definitivamente esta ejecución? No se puede reanudar después.')) {
      detener(ejecucion.idEjecucion);
    }
  };

  return (
    <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-slate-700 bg-[#0f172a] px-3 text-slate-300">
      <div className="flex items-center gap-2">
        <EventLogButton />
      </div>

      <div className="flex items-center gap-2 rounded-xl border border-slate-700 bg-[#111c31] px-2 py-1.5">
        <div className="border-r border-slate-700 pr-2">
          <div className="text-[9px] font-bold uppercase tracking-wide text-slate-400">Reloj de operación</div>
          <SimClock />
        </div>
        {puedeControlar && ejecucion && (
          <>
            <button
              type="button"
              title={pausada ? 'Reanudar' : 'Pausar'}
              disabled={pausada ? isReanudando : isPausando}
              onClick={() => pausada ? reanudar(ejecucion.idEjecucion) : pausar(ejecucion.idEjecucion)}
              className="flex h-8 items-center gap-1.5 rounded-lg border border-blue-500 px-3 text-xs font-semibold text-blue-300 transition hover:bg-blue-500/10 disabled:opacity-50"
            >
              {pausada ? <Play className="h-4 w-4 fill-current" /> : <Pause className="h-4 w-4" />}
              {pausada ? 'Reanudar' : 'Pausar'}
            </button>
            <button
              type="button"
              title="Detener"
              disabled={isDeteniendo}
              onClick={stop}
              className="flex h-8 w-9 items-center justify-center rounded-lg border border-rose-500/70 text-rose-400 transition hover:bg-rose-500/10 disabled:opacity-50"
            >
              <Square className="h-4 w-4 fill-current" />
            </button>
          </>
        )}
      </div>
    </header>
  );
};
