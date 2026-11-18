import type { QueryClient } from '@tanstack/react-query';
import type { EjecucionEscenarioDTO, SeleccionarEscenarioRequest } from '../types/backend';
import { escenariosApi } from './escenariosApi';
import { estadoOperacionApi } from './estadoOperacionApi';
import { configuracionApi } from './configuracionApi';
import { simulationSocket } from './simulationSocket';
import { simulationEngine } from '../engine/simulationEngine';
import { useScenarioStore } from '../store/scenarioStore';
import { parseBackendSimulatedTime } from '../utils/backendTime';
import { useMapStore } from '../store/mapStore';
import { adaptEstadoOperacion } from '../utils/backendAdapters';

const consultas = ['estado-operacion', 'pedidos', 'configuracion', 'escenario', 'escenario-activa'];
async function cancelarConsultas(client: QueryClient) {
  simulationSocket.disconnect();
  await Promise.all(consultas.map((key) => client.cancelQueries({ queryKey: [key] })));
}
function limpiarVista(client: QueryClient, conservarInicio = false) {
  simulationEngine.reset();
  if (!conservarInicio) useScenarioStore.setState({ playbackStartedAtMs: null });
  useMapStore.setState({ selectedVehicleId: null, selectedWarehouseId: null, selectedRouteId: null,
    selectedOrderId: null, realtimePositions: {} });
  for (const key of ['estado-operacion', 'pedidos', 'escenario']) client.removeQueries({ queryKey: [key] });
  client.setQueryData(['escenario-activa'], null);
}

async function prepararReproduccion(client: QueryClient, dto: EjecucionEscenarioDTO) {
  const inicio = parseBackendSimulatedTime(dto.fechaInicioSimulada);
  simulationEngine.beginExecution(dto.idEjecucion, inicio, true);
  // El límite es de recuperación ante errores, no una duración mínima del cargador.
  const signal = AbortSignal.timeout(Math.max(60_000, dto.sa * 120_000 + 30_000));
  const config = await client.fetchQuery({ queryKey: ['configuracion'],
    queryFn: ({ signal: consulta }) => configuracionApi.getConfiguracion(AbortSignal.any([signal, consulta])),
    retry: false, staleTime: 0 });
  while (true) {
    signal.throwIfAborted();
    const [estado, pedidos] = await Promise.all([
      client.fetchQuery({ queryKey: ['estado-operacion', dto.idEjecucion], retry: false,
        queryFn: ({ signal: consulta }) => estadoOperacionApi.getEstado(AbortSignal.any([signal, consulta]), dto.idEjecucion), staleTime: 0 }),
      client.fetchQuery({ queryKey: ['pedidos', dto.idEjecucion], retry: false,
        queryFn: ({ signal: consulta }) => estadoOperacionApi.getPedidos(undefined, AbortSignal.any([signal, consulta])), staleTime: 0 }),
    ]);
    const frame = { ...adaptEstadoOperacion(estado, config, pedidos, inicio), estadoRaw: estado };
    simulationEngine.ingest({ vehicles: frame.vehicles, routes: frame.routes, frame,
      idEjecucion: dto.idEjecucion, sa: dto.sa, k: dto.k,
      marcaTiempoActual: estado.marcaTiempoActual, avanzando: true });
    if (simulationEngine.isPlaybackReady()) break;
    const actual = await escenariosApi.consultarEscenario(dto.idEjecucion, signal);
    if (!['INICIADA', 'EN_CURSO'].includes(actual.estado)) {
      // Incluso una ejecución que finaliza durante la carga debe presentar su reporte.
      if (actual.estado !== 'PAUSADA') return actual;
      throw new Error('La ejecución se pausó antes de completar la preparación inicial.');
    }
    // Muestrear con más frecuencia que Sa para conservar la trayectoria de cada lote.
    await new Promise<void>((resolve) => setTimeout(resolve, Math.min(500, dto.sa * 30_000)));
  }
  simulationEngine.startPreparedPlayback();
  return dto;
}

export async function iniciarEjecucion(client: QueryClient, request: SeleccionarEscenarioRequest) {
  const store = useScenarioStore.getState();
  if (store.transicion) throw new Error('Hay un cambio de escenario en curso.');
  store.setTransicion('iniciando');
  let creada: EjecucionEscenarioDTO | null = null;
  try {
    await cancelarConsultas(client);
    limpiarVista(client);
    const dto = await escenariosApi.iniciarEscenario(request);
    if (dto.tipoEscenario !== request.tipo || (request.tipo !== 'DIA_A_DIA'
        && request.fechaInicioSimulada
        && parseBackendSimulatedTime(dto.fechaInicioSimulada) !== parseBackendSimulatedTime(request.fechaInicioSimulada))) {
      throw new Error('El servidor conserva otro escenario activo. Ciérralo antes de iniciar la fecha seleccionada.');
    }
    creada = dto;
    store.setTransicion('preparando');
    const preparada = await prepararReproduccion(client, dto);
    store.setEjecucion(preparada);
    useScenarioStore.setState({ playbackStartedAtMs: ['INICIADA', 'EN_CURSO'].includes(preparada.estado) ? Date.now() : null });
    return preparada;
  } catch (error) {
    // Un fallo de preparación no debe dejar una ejecución invisible corriendo en el servidor.
    if (creada) {
      try { await escenariosApi.detener(creada.idEjecucion); }
      catch { store.setEjecucion(creada); }
    }
    limpiarVista(client);
    throw error;
  } finally {
    store.setTransicion(null);
  }
}

export async function cerrarEjecucion(client: QueryClient, id: string) {
  const store = useScenarioStore.getState();
  if (store.transicion) throw new Error('Hay un cambio de escenario en curso.');
  store.setTransicion('cerrando');
  try {
    await cancelarConsultas(client);
    await escenariosApi.detener(id);
    const actual = useScenarioStore.getState().ejecucion;
    if (actual?.idEjecucion === id) store.setEjecucion({ ...actual, estado: 'FINALIZADA' });
    limpiarVista(client, true);
  } finally {
    store.setTransicion(null);
  }
}
