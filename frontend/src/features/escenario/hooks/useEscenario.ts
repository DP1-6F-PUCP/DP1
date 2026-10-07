import { useMutation, useQueryClient } from '@tanstack/react-query';
import { escenariosApi } from '../../../services/escenariosApi';
import { useScenarioStore } from '../../../store/scenarioStore';
import { TipoEscenarioBackend } from '../../../types/backend';

export function useEscenario() {
  const ejecucion = useScenarioStore((s) => s.ejecucion);
  const setEjecucion = useScenarioStore((s) => s.setEjecucion);
  const queryClient = useQueryClient();

  const iniciarMutation = useMutation({
    mutationFn: ({ tipo, fechaInicioSimulada }: { tipo: TipoEscenarioBackend; fechaInicioSimulada?: string }) =>
      escenariosApi.iniciarEscenario({ tipo, fechaInicioSimulada }),
    onSuccess: (dto) => {
      setEjecucion(dto);
      queryClient.invalidateQueries({ queryKey: ['estado-operacion'] });
      queryClient.invalidateQueries({ queryKey: ['pedidos'] });
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
