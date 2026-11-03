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
  const transicion = useScenarioStore((s) => s.transicion);
  const estado = useScenarioStore((s) => s.ejecucion?.estado);
  const idEjecucion = useScenarioStore((s) => s.ejecucion?.idEjecucion);
  const setEjecucion = useScenarioStore((s) => s.setEjecucion);

  const query = useQuery({
    queryKey: ['escenario', idEjecucion],
    queryFn: ({ signal }) => escenariosApi.consultarEscenario(idEjecucion as string, signal),
    enabled: Boolean(idEjecucion) && !transicion && ['INICIADA', 'EN_CURSO', 'PAUSADA'].includes(estado ?? ''),
    refetchInterval: 3000,
  });

  useEffect(() => {
    if (!transicion && query.data && query.data.idEjecucion === idEjecucion
        && useScenarioStore.getState().ejecucion?.idEjecucion === idEjecucion
        && ['INICIADA', 'EN_CURSO', 'PAUSADA'].includes(useScenarioStore.getState().ejecucion?.estado ?? '')) {
      setEjecucion(query.data);
    }
  }, [query.data, idEjecucion, transicion, setEjecucion]);

  // El backend ya no conoce esta ejecución (se reinició, o se inició otra después de que esta
  // terminara): adoptar la activa actual, si la hay, en vez de quedar consultando un id muerto
  // con la vista congelada.
  useEffect(() => {
    if (!query.isError || transicion) return;
    let cancelada = false;
    const vigente = () => !cancelada && !useScenarioStore.getState().transicion
      && useScenarioStore.getState().ejecucion?.idEjecucion === idEjecucion;
    escenariosApi
      .consultarActiva()
      .then((activa) => { if (vigente()) setEjecucion(activa); })
      .catch(() => { if (vigente()) setEjecucion(null); });
    return () => { cancelada = true; };
  }, [query.isError, idEjecucion, transicion, setEjecucion]);
}
