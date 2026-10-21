import { useMutation, useQueryClient } from '@tanstack/react-query';
import { escenariosApi } from '../../../services/escenariosApi';
import { useScenarioStore } from '../../../store/scenarioStore';
import { useConfigInicialStore } from '../../../store/configInicialStore';
import { SeleccionarEscenarioRequest } from '../../../types/backend';

export function useEscenario() {
  const ejecucion = useScenarioStore((s) => s.ejecucion);
  const setEjecucion = useScenarioStore((s) => s.setEjecucion);
  const limpiarAjustesPendientes = useConfigInicialStore((s) => s.limpiar);
  const queryClient = useQueryClient();

  const iniciarMutation = useMutation({
    mutationFn: (request: SeleccionarEscenarioRequest) => escenariosApi.iniciarEscenario(request),
    onSuccess: (dto) => {
      setEjecucion(dto);
      // Los ajustes ya forman parte de la configuración vigente del servidor.
      limpiarAjustesPendientes();
      queryClient.invalidateQueries({ queryKey: ['estado-operacion'] });
      queryClient.invalidateQueries({ queryKey: ['pedidos'] });
      queryClient.invalidateQueries({ queryKey: ['configuracion'] });
    },
  });

  // Los 3 endpoints devuelven void -- el estado nuevo se conoce de antemano (son transiciones
  // deterministas), asi que se refleja localmente en vez de esperar un refetch que no traeria
  // nada distinto (ningun DTO expone EstadoEjecucion, ver EjecucionDetenidaBanner).
  const pausarMutation = useMutation({
    mutationFn: (idEjecucion: string) => escenariosApi.pausar(idEjecucion),
    onSuccess: () => {
      if (ejecucion) setEjecucion({ ...ejecucion, estado: 'PAUSADA' });
    },
  });

  const reanudarMutation = useMutation({
    mutationFn: (idEjecucion: string) => escenariosApi.reanudar(idEjecucion),
    onSuccess: () => {
      if (ejecucion) setEjecucion({ ...ejecucion, estado: 'EN_CURSO' });
    },
  });

  const detenerMutation = useMutation({
    mutationFn: (idEjecucion: string) => escenariosApi.detener(idEjecucion),
    onSuccess: () => {
      if (ejecucion) setEjecucion({ ...ejecucion, estado: 'FINALIZADA' });
    },
  });

  return {
    ejecucion,
    iniciarEscenario: iniciarMutation.mutate,
    isIniciando: iniciarMutation.isPending,
    error: iniciarMutation.error,
    pausar: pausarMutation.mutate,
    isPausando: pausarMutation.isPending,
    reanudar: reanudarMutation.mutate,
    isReanudando: reanudarMutation.isPending,
    detener: detenerMutation.mutate,
    isDeteniendo: detenerMutation.isPending,
    errorControl: pausarMutation.error || reanudarMutation.error || detenerMutation.error,
  };
}
