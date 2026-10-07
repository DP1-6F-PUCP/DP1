import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { escenariosApi } from '../services/escenariosApi';
import { useScenarioStore } from '../store/scenarioStore';

/**
 * Sincroniza periodicamente scenarioStore.ejecucion con GET /api/escenarios/{id} -- este
 * endpoint no existia antes de esta pasada; sin el, el frontend nunca se enteraba de que
 * OrquestadorOperacion se detuvo solo (DETENIDA_POR_INCUMPLIMIENTO) hasta que alguien notaba que
 * el reloj dejo de avanzar. Ahora se lee el estado real directamente.
 */
export function useSincronizarEjecucion() {
  const idEjecucion = useScenarioStore((s) => s.ejecucion?.idEjecucion);
  const setEjecucion = useScenarioStore((s) => s.setEjecucion);

  const query = useQuery({
    queryKey: ['escenario', idEjecucion],
    queryFn: () => escenariosApi.consultarEscenario(idEjecucion as string),
    enabled: Boolean(idEjecucion),
    refetchInterval: 3000,
  });

  useEffect(() => {
    if (query.data) {
      setEjecucion(query.data);
    }
  }, [query.data, setEjecucion]);
}
