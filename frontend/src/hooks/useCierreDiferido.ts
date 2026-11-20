import { useEffect, useRef, useState } from 'react';
import { simulationEngine } from '../engine/simulationEngine';
import { parseBackendSimulatedTime } from '../utils/backendTime';

/** Tope de espera (ms reales) por si el reloj visible no llega (pestaña oculta, motor detenido…). */
const TOPE_MIN_MS = 30_000;
/** Holgura (ms simulados): basta con llegar a menos de esto del cierre. */
const HOLGURA_SIM_MS = 1_000;

/**
 * El backend termina la ejecución (colapso o fin del periodo) al cerrar un lote, pero el mapa va
 * retrasado: si el reporte se abría en ese momento, tapaba el instante del incumplimiento antes de
 * que el reloj visible llegara a él. Este hook dice si todavía hay que ESPERAR: hasta que el reloj
 * visible alcance el fin de la ejecución (el último lote recibido, o el fin simulado del reporte si
 * es anterior), con un tope de seguridad de max(30 s, retraso del mapa + 5 s) reales.
 *
 * Sincrónico en el primer render en que `finalizada` pasa a true (no hay un cuadro intermedio con
 * la pantalla de inicio). Si el motor no tiene lotes (p. ej. tras detenerla con el botón, que limpia
 * la vista), no espera.
 */
export function useCierreDiferido(idEjecucion: string | undefined, finalizada: boolean, finSimulado: string | undefined): boolean {
  // Ejecución cuyo cierre ya se alcanzó: derivado por id, así una ejecución nueva vuelve a esperar.
  const [listaPara, setListaPara] = useState<string | null>(null);
  const finRef = useRef<number | null>(null);
  const fin = finSimulado ? parseBackendSimulatedTime(finSimulado) : NaN;
  finRef.current = Number.isFinite(fin) ? fin : null;

  useEffect(() => {
    if (!finalizada || !idEjecucion) return;
    simulationEngine.congelarAvance();
    const desde = performance.now();
    const tope = Math.max(TOPE_MIN_MS, simulationEngine.retrasoRenderMs() + 5_000);
    const alcanzado = () => {
      const ultima = simulationEngine.ultimaMarcaMs();
      const ahora = simulationEngine.getSnapshotNow().nowSimMs;
      if (ultima == null || ahora == null) return true;
      const objetivo = finRef.current != null ? Math.min(ultima, finRef.current) : ultima;
      return ahora >= objetivo - HOLGURA_SIM_MS || performance.now() - desde > tope;
    };
    if (alcanzado()) { setListaPara(idEjecucion); return; }
    const intervalo = window.setInterval(() => {
      if (alcanzado()) { window.clearInterval(intervalo); setListaPara(idEjecucion); }
    }, 250);
    return () => window.clearInterval(intervalo);
  }, [finalizada, idEjecucion]);

  return finalizada && Boolean(idEjecucion) && listaPara !== idEjecucion;
}
