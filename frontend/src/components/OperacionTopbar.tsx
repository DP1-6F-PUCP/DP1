import React, { useEffect, useState } from 'react';
import { Pause, Play, Square } from 'lucide-react';
import { useEscenario } from '../features/escenario/hooks/useEscenario';
import { EventLogButton } from '../features/eventos/components/EventLogButton';
import { simulationEngine } from '../engine/simulationEngine';
import { useScenarioStore } from '../store/scenarioStore';
import { formatBackendSimulatedTime } from '../utils/backendTime';

const NOMBRE_ESCENARIO = {
  DIA_A_DIA: 'Tiempo Real',
  CINCO_DIAS: 'Simulación 5 Días',
  COLAPSO_LOGISTICO: 'Colapso Logístico',
} as const;

const formatearFechaHora = (ms: number | null, simulado = false): string => {
  if (ms == null || !Number.isFinite(ms)) return '--/--/---- --:--';
  if (simulado) return formatBackendSimulatedTime(ms);
  return new Date(ms).toLocaleString('es-PE', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
};

const formatearTranscurrido = (ms: number | null, siempreIncluirDias = false): string => {
  if (ms == null || !Number.isFinite(ms)) return '--';
  const segundosTotales = Math.max(0, Math.floor(ms / 1000));
  const dias = Math.floor(segundosTotales / (24 * 3600));
  const horas = Math.floor((segundosTotales % (24 * 3600)) / 3600);
  const minutos = Math.floor((segundosTotales % 3600) / 60);
  const segundos = segundosTotales % 60;
  if (siempreIncluirDias || dias > 0) {
    return `${String(dias).padStart(2, '0')}d ${String(horas).padStart(2, '0')}h ${String(minutos).padStart(2, '0')}min ${String(segundos).padStart(2, '0')}s`;
  }
  return `${String(horas).padStart(2, '0')}h ${String(minutos).padStart(2, '0')}min ${String(segundos).padStart(2, '0')}s`;
};

export const OperacionTopbar: React.FC = () => {
  const { ejecucion, pausar, reanudar, detener, isPausando, isReanudando, isDeteniendo } = useEscenario();
  const scenarioStartMs = useScenarioStore((s) => s.scenarioStartMs());
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const snapshot = simulationEngine.getSnapshotNow();
  const fechaInicioRealMs = (() => {
    if (!ejecucion?.fechaInicio) return null;
    const rawStr = ejecucion.fechaInicio;
    const msUtc = Date.parse(rawStr);
    const msLocal = Date.parse(rawStr.endsWith('Z') ? rawStr.slice(0, -1) : rawStr);
    if (Number.isFinite(msLocal) && Number.isFinite(msUtc)) {
      const diffUtc = nowMs - msUtc;
      const diffLocal = nowMs - msLocal;
      // Si diffUtc está inflado por la zona horaria del servidor (UTC vs UTC-5), usar msLocal
      if (diffUtc > 60 * 60 * 1000 && diffLocal >= 0 && diffLocal < diffUtc) {
        return msLocal;
      }
    }
    return Number.isFinite(msUtc) ? msUtc : null;
  })();
  const pausada = ejecucion?.estado === 'PAUSADA';
  const puedeControlar = ejecucion?.estado === 'EN_CURSO' || ejecucion?.estado === 'INICIADA' || pausada;

  const stop = () => {
    if (ejecucion && window.confirm('¿Detener definitivamente esta ejecución? No se puede reanudar después.')) {
      detener(ejecucion.idEjecucion);
    }
  };

  return (
    <header className="flex h-14 shrink-0 items-center justify-between gap-3 overflow-x-auto border-b border-slate-700 bg-[#0f172a] px-3 text-slate-300">
      <div className="flex items-center gap-2 shrink-0">
        <EventLogButton />
      </div>

      <div className="flex shrink-0 items-center gap-2 rounded-xl border border-slate-700 bg-[#111c31] px-3 py-1.5 shadow-sm">
        {ejecucion && (
          <div className="border-r border-slate-700 pr-3 text-right">
            <div className="text-[9px] font-bold uppercase tracking-wide text-slate-400">
              Escenario
            </div>
            <div className="text-xs font-semibold text-white whitespace-nowrap">
              {NOMBRE_ESCENARIO[ejecucion.tipoEscenario]}
            </div>
          </div>
        )}

        {ejecucion?.tipoEscenario !== 'DIA_A_DIA' && (
          <>
            <div className="border-r border-slate-700 pr-3 text-right">
              <div className="text-[9px] font-bold uppercase tracking-wide text-slate-400">Hora en simulación</div>
              <div className="font-mono-code text-xs font-medium text-cyan-300 whitespace-nowrap">
                {formatearFechaHora(snapshot.nowSimMs, true)}
              </div>
            </div>

            <div className="border-r border-slate-700 pr-3 text-right">
              <div className="text-[9px] font-bold uppercase tracking-wide text-slate-400">Transcurrido simulado</div>
              <div className="font-mono-code text-xs font-medium text-cyan-300 whitespace-nowrap">
                {formatearTranscurrido(
                  snapshot.nowSimMs != null && scenarioStartMs != null
                    ? snapshot.nowSimMs - scenarioStartMs
                    : null,
                  true,
                )}
              </div>
            </div>
          </>
        )}

        <div className="border-r border-slate-700 pr-3 text-right">
          <div className="text-[9px] font-bold uppercase tracking-wide text-slate-400">Hora actual</div>
          <div className="font-mono-code text-xs font-medium text-amber-300 whitespace-nowrap">
            {formatearFechaHora(nowMs)}
          </div>
        </div>

        <div className="border-r border-slate-700 pr-3 text-right">
          <div className="text-[9px] font-bold uppercase tracking-wide text-slate-400">Tiempo transcurrido</div>
          <div className="font-mono-code text-xs font-medium text-amber-300 whitespace-nowrap">
            {formatearTranscurrido(
              fechaInicioRealMs != null && Number.isFinite(fechaInicioRealMs)
                ? nowMs - fechaInicioRealMs
                : null,
            )}
          </div>
        </div>

        {puedeControlar && ejecucion && (
          <div className="flex items-center gap-1.5 pl-1">
            <button
              type="button"
              title={pausada ? 'Reanudar' : 'Pausar'}
              disabled={pausada ? isReanudando : isPausando}
              onClick={() => (pausada ? reanudar(ejecucion.idEjecucion) : pausar(ejecucion.idEjecucion))}
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
          </div>
        )}
      </div>
    </header>
  );
};
