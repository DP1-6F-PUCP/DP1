import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { escenariosApi } from '../services/escenariosApi';
import { useScenarioStore } from '../store/scenarioStore';

/**
 * Bug real corregido: scenarioStore.ejecucion arranca en null en cada carga de pagina (no se
 * persiste en ningun lado), y nada preguntaba al backend "ya hay algo corriendo?" al montar --
 * SeleccionarEscenarioGate siempre mostraba la pantalla de "Iniciar ejecucion" tras un refresh,
 * aunque el backend ya tuviera una activa, hasta que el usuario volvia a hacer clic manualmente
 * (lo cual SI funciona, por el join de seleccionarEscenario, pero requiere esa accion cada vez).
 * Este hook corre UNA vez al montar (solo si todavia no hay ejecucion conocida localmente) y la
 * adopta si el backend reporta una activa.
 */
export function useDescubrirEjecucionActiva() {
  const ejecucion = useScenarioStore((s) => s.ejecucion);
  const setEjecucion = useScenarioStore((s) => s.setEjecucion);

  const query = useQuery({
    queryKey: ['escenario-activa'],
    queryFn: () => escenariosApi.consultarActiva(),
    enabled: !ejecucion,
    staleTime: Infinity,
    retry: false,
  });

  useEffect(() => {
    if (query.data) {
      setEjecucion(query.data);
    }
  }, [query.data, setEjecucion]);

  // Mientras no haya ejecucion local Y la busqueda inicial siga en vuelo, el gate no deberia
  // mostrar todavia la pantalla de seleccion -- evita el parpadeo de "Iniciar ejecucion" seguido
  // de un salto al dashboard apenas resuelve la consulta.
  return { verificando: !ejecucion && query.isLoading };
}
