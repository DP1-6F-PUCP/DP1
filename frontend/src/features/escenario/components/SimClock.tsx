import React, { useEffect, useState } from 'react';
import { Clock } from 'lucide-react';
import { simulationEngine } from '../../../engine/simulationEngine';
import { useScenarioStore } from '../../../store/scenarioStore';
import { formatBackendSimulatedTime } from '../../../utils/backendTime';

/**
 * Lee el reloj simulado del motor central (ver engine/simulationEngine.ts) en vez de mantener su
 * propia extrapolacion por `k` -- ese calculo (y el de "hace cuantos segundos llego el ultimo
 * lote") ahora vive centralizado en el motor, compartido con el mapa. Este componente solo
 * fuerza un re-render cada 1s para que la hora extrapolada se vea avanzar -- no necesita
 * suscribirse a los 60 frames/segundo del motor (eso es solo para la animacion del mapa).
 */
export const SimClock: React.FC = () => {
  const [, forceTick] = useState(0);
  const saSegundos = (useScenarioStore((s) => s.ejecucion?.sa) ?? 20 / 60) * 60;

  useEffect(() => {
    const id = setInterval(() => forceTick((v) => v + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const snap = simulationEngine.getSnapshotNow();
  if (snap.nowSimMs == null) return null;

  const fechaFormateada = formatBackendSimulatedTime(snap.nowSimMs, true, true);

  // Mas de dos lotes (sa) sin recibir uno nuevo, con margen -- antes estaba fijo en 50s, que solo
  // tenia sentido con sa=20s.
  const estancado = snap.segundosDesdeUltimoLote > saSegundos * 2 + 10;

  return (
    <div
      className="flex items-center gap-2 px-0 pt-0.5 text-[11px] font-mono-code text-slate-300"
      title="Hora simulada actual de la ejecución"
    >
      <Clock className="h-3.5 w-3.5 text-cyan-400 shrink-0" />
      <span className="text-slate-100 font-medium">{fechaFormateada}</span>
      <span className={`text-[10px] ${estancado ? 'text-amber-400' : 'text-slate-500'}`}>
        actualizado hace {snap.segundosDesdeUltimoLote}s
      </span>
    </div>
  );
};
