import React, { useEffect, useState } from 'react';
import { ChevronDown, ChevronUp, Clock, GripVertical } from 'lucide-react';
import { simulationEngine } from '../engine/simulationEngine';
import { useScenarioStore } from '../store/scenarioStore';
import { formatBackendSimulatedTime24 } from '../utils/backendTime';
import { usePanelFlotante } from '../hooks/usePanelFlotante';

const horaReal24 = (ms: number) =>
  new Date(ms).toLocaleString('es-PE', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).replace(',', '');

/** Duración sin segundos: "02d 14h 12m", o "14h 12m" si no se piden días y no los hay. */
const duracion = (ms: number | null, siempreDias = false): string => {
  if (ms == null || !Number.isFinite(ms)) return '--';
  const minutosTotales = Math.max(0, Math.floor(ms / 60000));
  const dias = Math.floor(minutosTotales / 1440);
  const horas = Math.floor((minutosTotales % 1440) / 60);
  const minutos = minutosTotales % 60;
  const hm = `${String(horas).padStart(2, '0')}h ${String(minutos).padStart(2, '0')}m`;
  return siempreDias || dias > 0 ? `${String(dias).padStart(2, '0')}d ${hm}` : hm;
};

const Celda: React.FC<{ etiqueta: string; valor: string; color: string }> = ({ etiqueta, valor, color }) => (
  <div className="min-w-0 rounded-lg bg-slate-950/50 px-2 py-1.5">
    <div className="text-[11px] font-medium text-slate-300 whitespace-nowrap">{etiqueta}</div>
    <div className={`font-mono-code text-[13px] font-semibold leading-tight whitespace-nowrap ${color}`}>{valor}</div>
  </div>
);

/**
 * Los cuatro relojes de la operación en un cuadro 2×2 flotante sobre el mapa (antes iban en fila
 * en la barra superior y no se leían bien). Arranca en la esquina superior derecha, se puede
 * colapsar a una píldora con la hora y arrastrar a cualquier parte del mapa; posición y estado se
 * recuerdan en este navegador.
 */
export const RelojesOperacion: React.FC = () => {
  const ejecucion = useScenarioStore((s) => s.ejecucion);
  const playbackStartedAtMs = useScenarioStore((s) => s.playbackStartedAtMs);
  const scenarioStartMs = useScenarioStore((s) => s.scenarioStartMs());
  const [nowMs, setNowMs] = useState(() => Date.now());
  const panel = usePanelFlotante('paqrap.panel.relojes', { derecha: 12, vertical: 12 }, 'arriba');

  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  // Inicio real de la reproducción (mismo criterio que tenía la barra superior).
  const fechaInicioRealMs = (() => {
    if (playbackStartedAtMs != null) return playbackStartedAtMs;
    if (!ejecucion?.fechaInicio) return null;
    const raw = ejecucion.fechaInicio;
    const msUtc = Date.parse(raw);
    const msLocal = Date.parse(raw.endsWith('Z') ? raw.slice(0, -1) : raw);
    // Si la diferencia en UTC está inflada por la zona del servidor (UTC vs UTC-5), usar la local.
    if (Number.isFinite(msLocal) && Number.isFinite(msUtc)) {
      const diffUtc = nowMs - msUtc;
      const diffLocal = nowMs - msLocal;
      if (diffUtc > 3600_000 && diffLocal >= 0 && diffLocal < diffUtc) return msLocal;
    }
    return Number.isFinite(msUtc) ? msUtc : null;
  })();

  const simulado = ejecucion?.tipoEscenario !== 'DIA_A_DIA';
  const nowSimMs = simulationEngine.getSnapshotNow().nowSimMs;
  const horaSim = nowSimMs != null && Number.isFinite(nowSimMs) ? formatBackendSimulatedTime24(nowSimMs) : '--/--/---- --:--';
  const horaSimCorta = nowSimMs != null && Number.isFinite(nowSimMs) ? formatBackendSimulatedTime24(nowSimMs, false) : '--:--';
  const transcurridoSim = duracion(nowSimMs != null && scenarioStartMs != null ? nowSimMs - scenarioStartMs : null, true);
  // Siempre con días: en el colapso logístico la ejecución real puede durar más de un día.
  const transcurridoReal = duracion(fechaInicioRealMs != null ? nowMs - fechaInicioRealMs : null, true);

  return (
    <section
      ref={panel.ref}
      aria-label="Relojes de la operación"
      style={panel.style}
      className={`absolute z-[1100] ${panel.colapsado ? '' : 'w-[316px]'} rounded-xl border border-[var(--color-sidebar-border)] bg-[var(--color-sidebar-background)]/95 text-slate-100 shadow-xl backdrop-blur-sm select-none`}
    >
      <div
        {...panel.manejadoresArrastre}
        title="Arrastra para mover"
        className="flex cursor-grab touch-none items-center gap-1.5 px-2 py-1.5 active:cursor-grabbing"
      >
        <GripVertical className="h-4 w-4 shrink-0 text-slate-500" aria-hidden />
        <Clock className="h-4 w-4 shrink-0 text-cyan-400" aria-hidden />
        {panel.colapsado ? (
          <span className={`font-mono-code text-sm font-semibold ${simulado ? 'text-cyan-300' : 'text-amber-300'}`}>
            {simulado ? horaSimCorta : horaReal24(nowMs).slice(-5)}
          </span>
        ) : (
          <span className="text-xs font-semibold text-slate-200">Relojes</span>
        )}
        <button
          type="button"
          onClick={panel.alternar}
          aria-expanded={!panel.colapsado}
          aria-label={panel.colapsado ? 'Mostrar relojes' : 'Colapsar relojes'}
          className="ml-auto rounded p-0.5 text-slate-400 hover:text-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-400"
        >
          {panel.colapsado ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
        </button>
      </div>

      {!panel.colapsado && (
        <div className="grid grid-cols-2 gap-1.5 px-2 pb-2">
          {simulado && <Celda etiqueta="Hora simulación" valor={horaSim} color="text-cyan-300" />}
          {simulado && <Celda etiqueta="Transcurrido sim." valor={transcurridoSim} color="text-cyan-300" />}
          <Celda etiqueta="Hora actual" valor={horaReal24(nowMs)} color="text-amber-300" />
          <Celda etiqueta="Transcurrido real" valor={transcurridoReal} color="text-amber-300" />
        </div>
      )}
    </section>
  );
};
