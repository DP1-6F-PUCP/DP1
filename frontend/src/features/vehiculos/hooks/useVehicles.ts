import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '../../../components/ToastProvider';
import { useEstadoOperacion } from '../../../hooks/useEstadoOperacion';
import { escenariosApi } from '../../../services/escenariosApi';
import { useAveriasProgramadasStore } from '../../../store/averiasProgramadasStore';
import { useScenarioStore } from '../../../store/scenarioStore';
import { BreakdownType } from '../../../types';
import { toBackendInstant } from '../../../utils/backendTime';

export function useVehicles() {
  const { vehicles, isLoading, isError, refetch, estadoRaw } = useEstadoOperacion();
  const queryClient = useQueryClient();
  const ejecucion = useScenarioStore((s) => s.ejecucion);
  const { addToast } = useToast();
  const programarAveria = useAveriasProgramadasStore((s) => s.programar);

  // El backend no tiene un endpoint dedicado a "reportar averia" -- es una SolicitudOperacion
  // generica (ver ProgramarSolicitudRequest/TipoSolicitud.AVERIA) sobre la ejecucion activa.
  const reportBreakdownMutation = useMutation({
    mutationFn: async ({ vehicleId, type }: { vehicleId: string; type: BreakdownType; reason?: string }) => {
      if (!ejecucion) {
        throw new Error('No hay una ejecución de escenario activa.');
      }
      if (!estadoRaw?.marcaTiempoActual) {
        throw new Error('No se conoce el instante simulado actual.');
      }
      // Bug real corregido: se mandaba String(type) ("1"/"2"/"3"), pero
      // OrquestadorOperacion.aplicarAveria hace TipoAveria.valueOf(valorNuevo), que espera el
      // NOMBRE del enum ("TIPO_1"/"TIPO_2"/"TIPO_3") -- esto lanzaba IllegalArgumentException en
      // cada lote (confirmado en los logs reales), y como nada retiraba la solicitud fallida de
      // la cola de pendientes, se reintentaba para siempre y la excepcion cortaba el lote ANTES
      // de avanzar el reloj simulado: una sola averia mal formada congelaba la simulacion entera,
      // no solo la averia.
      await escenariosApi.programarSolicitud(ejecucion.idEjecucion, {
        tiempoSimulado: toBackendInstant(estadoRaw.marcaTiempoActual),
        tipoSolicitud: 'AVERIA',
        entidadObjetivo: vehicleId,
        valorNuevo: `TIPO_${type}`,
      });
    },
    // Los avisos van AQUÍ y no en los callbacks de mutate(): el menú de clic derecho se cierra (se
    // desmonta) al elegir, y TanStack Query no ejecuta los callbacks de mutate() de un componente
    // desmontado -- por eso no aparecía "Avería tipo N programada". Los de useMutation corren
    // siempre (addToast es del ToastProvider raíz, que sigue montado).
    onSuccess: (_data, { vehicleId, type }) => {
      programarAveria(vehicleId, type);
      addToast({
        type: 'warning',
        title: `Avería tipo ${type} programada`,
        description: `${vehicleId} se averiará en el próximo lote de planificación.`,
      });
      queryClient.invalidateQueries({ queryKey: ['estado-operacion'] });
    },
    onError: (error, { vehicleId }) => {
      addToast({
        type: 'error',
        title: `Error al averiar ${vehicleId}`,
        description: error instanceof Error ? error.message : 'No se pudo programar la avería.',
      });
    },
  });

  return {
    vehicles,
    isLoading,
    isError,
    refetch,
    reportBreakdown: reportBreakdownMutation.mutate,
    isReportingBreakdown: reportBreakdownMutation.isPending,
  };
}
