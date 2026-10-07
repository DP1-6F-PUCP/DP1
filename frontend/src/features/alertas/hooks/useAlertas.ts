import { useQuery } from '@tanstack/react-query';
import { alertsApi } from '../../../services/alertsApi';
import { useScenarioStore } from '../../../store/scenarioStore';

/**
 * GET /api/alerts combina 2 cosas (ver AlertasController): riesgo de SLA (recalculado bajo
 * demanda sobre los pedidos PENDIENTE) y eventos de incidencia ya registrados (bloqueos,
 * averias). Antes de este hook, el backend lo exponia pero nada en el front lo consumia.
 */
export function useAlertas() {
  const ejecucion = useScenarioStore((s) => s.ejecucion);

  const query = useQuery({
    queryKey: ['alerts'],
    queryFn: () => alertsApi.getAlerts(1.0),
    refetchInterval: 5000,
    enabled: Boolean(ejecucion),
  });

  return {
    alertas: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
  };
}
