import React, { useEffect, useRef } from 'react';
import { AlertOctagon } from 'lucide-react';
import { useScenarioStore } from '../../../store/scenarioStore';
import { useEstadoOperacion } from '../../../hooks/useEstadoOperacion';
import { useLiveAnnouncer } from '../../../components/LiveAnnouncer';

/**
 * Refleja un comportamiento real de OrquestadorOperacion que discutimos a fondo esta sesion: la
 * ejecucion se autodetiene en el primer pedido incumplido (ejecutarSiguienteLote -> detener()).
 * Antes, el frontend no tenia forma de saberlo (EstadoOperacionDTO no expone EstadoEjecucion);
 * ahora se lee directo de GET /api/escenarios/{id} via useSincronizarEjecucion (montado en
 * RootLayout), que mantiene scenarioStore.ejecucion.estado al dia.
 */
export const EjecucionDetenidaBanner: React.FC = () => {
  const ejecucion = useScenarioStore((s) => s.ejecucion);
  const setEjecucion = useScenarioStore((s) => s.setEjecucion);
  const { estadoRaw } = useEstadoOperacion();
  const { announceAssertive } = useLiveAnnouncer();
  const yaAnunciado = useRef(false);

  const detenida = ejecucion?.estado === 'DETENIDA_POR_INCUMPLIMIENTO';
  const incumplidos = estadoRaw?.metricas.contadorIncumplidos ?? 0;

  useEffect(() => {
    if (detenida && !yaAnunciado.current) {
      yaAnunciado.current = true;
      announceAssertive(`La ejecución se detuvo automáticamente por ${incumplidos} pedido incumplido.`);
    } else if (!detenida) {
      yaAnunciado.current = false;
    }
  }, [detenida, incumplidos, announceAssertive]);

  if (!detenida) return null;

  return (
    <div className="shrink-0 bg-rose-950/80 border-b border-rose-500/40 px-4 py-2.5 flex items-center justify-between gap-4">
      <div className="flex items-center gap-2.5 text-rose-200">
        <AlertOctagon className="h-4 w-4 shrink-0" />
        <span className="text-xs">
          La ejecución se detuvo automáticamente: {incumplidos} pedido{incumplidos === 1 ? '' : 's'} incumplido
          {incumplidos === 1 ? '' : 's'}. El reloj simulado no va a volver a avanzar en esta ejecución.
        </span>
      </div>
      <button
        type="button"
        onClick={() => setEjecucion(null)}
        className="shrink-0 text-xs font-medium px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white transition-colors"
      >
        Iniciar nueva ejecución
      </button>
    </div>
  );
};
