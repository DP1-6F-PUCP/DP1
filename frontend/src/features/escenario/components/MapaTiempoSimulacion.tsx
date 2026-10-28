import React, { useEffect, useState } from 'react';
import { CalendarClock } from 'lucide-react';
import { simulationEngine } from '../../../engine/simulationEngine';
import { useScenarioStore } from '../../../store/scenarioStore';
import { TipoEscenarioBackend } from '../../../types/backend';
import { formatBackendSimulatedTime } from '../../../utils/backendTime';

const NOMBRE_ESCENARIO: Record<TipoEscenarioBackend, string> = {
  DIA_A_DIA: 'Tiempo Real',
  CINCO_DIAS: 'Simulación 5 Días',
  COLAPSO_LOGISTICO: 'Colapso Logístico',
};

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

export const MapaTiempoSimulacion: React.FC = () => {
  const ejecucion = useScenarioStore((s) => s.ejecucion);
  const scenarioStartMs = useScenarioStore((s) => s.scenarioStartMs());
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  if (!ejecucion) return null;

  const snapshot = simulationEngine.getSnapshotNow();
  const fechaInicioRealMs = (() => {
    if (!ejecucion?.fechaInicio) return null;
    const rawStr = ejecucion.fechaInicio;
    const msUtc = Date.parse(rawStr);
    const msLocal = Date.parse(rawStr.endsWith('Z') ? rawStr.slice(0, -1) : rawStr);
    if (Number.isFinite(msLocal) && Number.isFinite(msUtc)) {
      const diffUtc = nowMs - msUtc;
      const diffLocal = nowMs - msLocal;
      if (diffUtc > 60 * 60 * 1000 && diffLocal >= 0 && diffLocal < diffUtc) {
        return msLocal;
      }
    }
    return Number.isFinite(msUtc) ? msUtc : null;
  })();
  const fechaActualMs = nowMs;

  return (
    <section
      aria-label={`Información de ${NOMBRE_ESCENARIO[ejecucion.tipoEscenario]}`}
      className="absolute left-3 top-3 z-[1000] w-[min(360px,calc(100%-1.5rem))] rounded-xl border border-slate-700/80 bg-slate-950/90 p-3 text-slate-100 shadow-xl backdrop-blur-sm"
    >
      <div className="flex items-center gap-2 border-b border-slate-700/80 pb-2">
        <CalendarClock className="h-4 w-4 shrink-0 text-cyan-400" />
        <span className="text-[11px] font-bold uppercase tracking-wide text-slate-300">
          Escenario
        </span>
        <span className="ml-auto text-xs font-semibold text-white">
          {NOMBRE_ESCENARIO[ejecucion.tipoEscenario]}
        </span>
      </div>

      <dl className="mt-2 grid grid-cols-[1fr_auto] gap-x-3 gap-y-1.5 text-[11px]">
        {ejecucion.tipoEscenario !== 'DIA_A_DIA' && (
          <>
            <dt className="text-slate-400">Momento simulado</dt>
            <dd className="font-mono-code text-right text-cyan-300">
              {formatearFechaHora(snapshot.nowSimMs, true)}
            </dd>
            <dt className="text-slate-400">Transcurrido simulado</dt>
            <dd className="font-mono-code text-right text-cyan-300">
              {formatearTranscurrido(
                snapshot.nowSimMs != null && scenarioStartMs != null
                  ? snapshot.nowSimMs - scenarioStartMs
                  : null,
                true,
              )}
            </dd>
          </>
        )}
        <dt className="text-slate-400">Momento actual</dt>
        <dd className="font-mono-code text-right text-amber-300">
          {formatearFechaHora(fechaActualMs)}
        </dd>
        <dt className="text-slate-400">Tiempo transcurrido</dt>
        <dd className="font-mono-code text-right text-amber-300">
          {formatearTranscurrido(
            fechaInicioRealMs != null && Number.isFinite(fechaInicioRealMs)
              ? fechaActualMs - fechaInicioRealMs
              : null,
          )}
        </dd>
      </dl>
    </section>
  );
};
