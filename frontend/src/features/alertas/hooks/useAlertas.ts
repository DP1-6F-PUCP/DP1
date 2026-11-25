import { useQuery } from '@tanstack/react-query';
import { alertsApi } from '../../../services/alertsApi';
import { useScenarioStore } from '../../../store/scenarioStore';
import { useUmbrales } from '../../../store/umbralesStore';

/**
 * GET /api/alerts combina 2 cosas (ver AlertasController): riesgo de SLA (recalculado bajo
 * demanda sobre los pedidos PENDIENTE) y eventos de incidencia ya registrados (bloqueos,
 * averias). Antes de este hook, el backend lo exponia pero nada en el front lo consumia.
 *
 * El umbral de riesgo es el mismo corte "en riesgo" de Configuración → Apariencia (riesgoMinutos):
 * antes la campana pedía siempre 1 h aunque el usuario hubiera cambiado ese corte.
 */
export function useAlertas() {
  const ejecucion = useScenarioStore((s) => s.ejecucion);
  const { riesgoMinutos } = useUmbrales();
  const horasUmbralSLA = riesgoMinutos / 60;

  const query = useQuery({
    queryKey: ['alerts', horasUmbralSLA],
    queryFn: () => alertsApi.getAlerts(horasUmbralSLA),
    refetchInterval: 5000,
    enabled: Boolean(ejecucion),
  });

  return {
    alertas: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
  };
}
