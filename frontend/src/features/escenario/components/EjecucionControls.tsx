import React from 'react';
import { Pause, Play, Square } from 'lucide-react';
import { useEscenario } from '../hooks/useEscenario';

const ESTADO_LABEL: Record<string, { label: string; className: string }> = {
  INICIADA: { label: 'Iniciada', className: 'bg-blue-500/20 text-blue-300 border-blue-500/40' },
  EN_CURSO: { label: 'En curso', className: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' },
  PAUSADA: { label: 'Pausada', className: 'bg-amber-500/20 text-amber-300 border-amber-500/40' },
  FINALIZADA: { label: 'Finalizada', className: 'bg-slate-500/20 text-slate-300 border-slate-500/40' },
  DETENIDA_POR_INCUMPLIMIENTO: { label: 'Detenida', className: 'bg-rose-500/20 text-rose-300 border-rose-500/40' },
};

/**
 * pausar/reanudar/detener son transiciones reales de OrquestadorOperacion (confirmadas leyendo
 * su codigo), pero hasta ahora no tenian ningun endpoint ni control en el frontend -- se agregaron
 * ambos en esta misma pasada (ver ServicioPlanificacion.pausarEjecucion/reanudarEjecucion/
 * detenerEjecucion y SimulacionController).
 */
export const EjecucionControls: React.FC = () => {
  const { ejecucion, pausar, reanudar, detener, isPausando, isReanudando, isDeteniendo } = useEscenario();

  if (!ejecucion) return null;

  const estadoInfo = ESTADO_LABEL[ejecucion.estado] || { label: ejecucion.estado, className: 'bg-slate-500/20 text-slate-300 border-slate-500/40' };
  const enCurso = ejecucion.estado === 'EN_CURSO' || ejecucion.estado === 'INICIADA';
  const pausada = ejecucion.estado === 'PAUSADA';
  const controlesHabilitados = enCurso || pausada;

  return (
    <div className="flex items-center gap-2">
      <span className={`text-[10px] px-2 py-1 rounded-lg border font-medium uppercase tracking-wide ${estadoInfo.className}`}>
        {estadoInfo.label}
      </span>

      {controlesHabilitados && (
        <>
          {pausada ? (
            <button
              type="button"
              title="Reanudar"
              disabled={isReanudando}
              onClick={() => reanudar(ejecucion.idEjecucion)}
              className="p-1.5 rounded-lg border border-slate-700 bg-slate-800 text-emerald-400 hover:border-emerald-500/40 disabled:opacity-50 transition-colors"
            >
              <Play className="h-3.5 w-3.5" />
            </button>
          ) : (
            <button
              type="button"
              title="Pausar"
              disabled={isPausando}
              onClick={() => pausar(ejecucion.idEjecucion)}
              className="p-1.5 rounded-lg border border-slate-700 bg-slate-800 text-amber-400 hover:border-amber-500/40 disabled:opacity-50 transition-colors"
            >
              <Pause className="h-3.5 w-3.5" />
            </button>
          )}
          <button
            type="button"
            title="Detener"
            disabled={isDeteniendo}
            onClick={() => {
              if (window.confirm('¿Detener definitivamente esta ejecución? No se puede reanudar después.')) {
                detener(ejecucion.idEjecucion);
              }
            }}
            className="p-1.5 rounded-lg border border-slate-700 bg-slate-800 text-rose-400 hover:border-rose-500/40 disabled:opacity-50 transition-colors"
          >
            <Square className="h-3.5 w-3.5" />
          </button>
        </>
      )}
    </div>
  );
};
