import { useEffect } from 'react';
import { useEstadoVisual } from '../../engine/useEstadoVisual';
import { useScenarioStore } from '../../store/scenarioStore';
import { PASO_MUESTRA_MS, useHistorialReportes } from './historialStore';
import { tomarMuestra } from './muestra';

/**
 * Alimenta el historial de Reportes con el estado visible. Se monta UNA vez en el layout
 * (RootLayout), así registra aunque la página de Reportes no esté abierta. Barato: solo arma una
 * muestra cuando el reloj visible avanzó un paso (PASO_MUESTRA_MS) desde la última.
 */
export function useRegistrarHistorial(): void {
  const visual = useEstadoVisual();
  const idEjecucion = useScenarioStore((s) => s.ejecucion?.idEjecucion);
  const marca = visual.marcaVisibleMs;

  useEffect(() => {
    if (!idEjecucion || marca == null || !visual.estadoRaw) return;
    // Lotes tardíos de otra ejecución: no mezclar.
    if (visual.estadoRaw.idEjecucion && visual.estadoRaw.idEjecucion !== idEjecucion) return;
    const lista = useHistorialReportes.getState().porEjecucion[idEjecucion];
    const ultima = lista?.[lista.length - 1];
    if (ultima && marca >= ultima.t && marca - ultima.t < PASO_MUESTRA_MS) return;
    const m = tomarMuestra(visual);
    if (m) useHistorialReportes.getState().registrar(idEjecucion, m);
  }, [idEjecucion, marca, visual]);
}
