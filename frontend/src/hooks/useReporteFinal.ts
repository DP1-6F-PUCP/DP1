import { useQuery } from '@tanstack/react-query';
import { escenariosApi } from '../services/escenariosApi';
import { useScenarioStore } from '../store/scenarioStore';

export function useReporteFinal() {
  const ejecucion = useScenarioStore((s) => s.ejecucion);
  const transicion = useScenarioStore((s) => s.transicion);
  const finalizada = Boolean(ejecucion && ['FINALIZADA', 'DETENIDA_POR_INCUMPLIMIENTO'].includes(ejecucion.estado));
  const query = useQuery({
    queryKey: ['reporte-simulacion', ejecucion?.idEjecucion],
    queryFn: ({ signal }) => escenariosApi.consultarReporte(ejecucion!.idEjecucion, signal),
    enabled: finalizada && !transicion,
    staleTime: Infinity,
    retry: 1,
  });
  return { ...query, abierto: finalizada && !transicion };
}
