import React, { useEffect, useState } from 'react';
import { Clock } from 'lucide-react';
import { simulationEngine } from '../../../engine/simulationEngine';

/**
 * Lee el reloj simulado del motor central (ver engine/simulationEngine.ts) en vez de mantener su
 * propia extrapolacion por `k` -- ese calculo (y el de "hace cuantos segundos llego el ultimo
 * lote") ahora vive centralizado en el motor, compartido con el mapa. Este componente solo
 * fuerza un re-render cada 1s para que la hora extrapolada se vea avanzar -- no necesita
 * suscribirse a los 60 frames/segundo del motor (eso es solo para la animacion del mapa).
 */
export const SimClock: React.FC = () => {
  const [, forceTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => forceTick((v) => v + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const snap = simulationEngine.getSnapshotNow();
  if (snap.nowSimMs == null) return null;

  const fechaFormateada = new Date(snap.nowSimMs).toLocaleString('es-PE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  const estancado = snap.segundosDesdeUltimoLote > 50; // mas de sa(20s)+margen sin recibir un tick nuevo

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
