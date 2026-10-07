/**
 * Tipos que calzan EXACTAMENTE con los DTOs reales del backend (com.paqrap.exposicion /
 * com.paqrap.backend.dto). No agregar campos que el backend no devuelve -- para datos derivados
 * o enriquecidos del lado del cliente, usar utils/backendAdapters.ts, nunca inventarlos aqui.
 */

export type EstadoPedido = 'PENDIENTE' | 'ENTREGADA' | 'INCUMPLIDA';
export type EstadoUnidad = 'DISPONIBLE' | 'EN_RUTA' | 'EN_MANTENIMIENTO' | 'AVERIADO';
export type EstadoRuta = 'PLANIFICADA' | 'EN_EJECUCION' | 'FINALIZADA' | 'REEMPLAZADA';
export type EstadoEjecucion = 'INICIADA' | 'EN_CURSO' | 'PAUSADA' | 'FINALIZADA' | 'DETENIDA_POR_INCUMPLIMIENTO';
export type TipoEscenarioBackend = 'DIA_A_DIA' | 'CINCO_DIAS' | 'COLAPSO_LOGISTICO';
export type TipoSolicitud =
  | 'AVERIA'
  | 'CAMBIO_VELOCIDAD'
  | 'CAMBIO_CAPACIDAD'
  | 'CAMBIO_CANTIDAD_VEHICULOS'
  | 'CAMBIO_POSICION_ALMACEN'
  | 'CAMBIO_CAPACIDAD_ALMACEN'
  | 'CAMBIO_FRECUENCIA_RECARGA'
  | 'CAMBIO_CONFIGURACION_CIUDAD'
  | 'CAMBIO_CONFIGURACION_OPERACION';

export interface PedidoDTO {
  idPedido: string;
  idCliente: string;
  estado: EstadoPedido;
  posX: number;
  posY: number;
  cantidadSolicitada: number;
  cantidadEntregada: number;
  fechaIngreso: string; // LocalDateTime ISO (sin zona)
  horasLimite: number;
  fechaLimite: string; // LocalDateTime ISO (sin zona)
}

export interface VehiculoDTO {
  idUnidad: string;
  tipo: string; // "AUTO" | "MOTO" | "BICI" en produccion, pero no es un enum cerrado en el backend
  estado: EstadoUnidad;
  posXActual: number;
  posYActual: number;
  cargaActual: number;
  // Camino real hacia el almacen mas cercano cuando la unidad ya entrego todo pero aun no llega
  // de vuelta (Ruta ya esta FINALIZADA en ese punto, por eso no vive en RutaDTO.geometria). Mismo
  // formato "x,y"; vacio cuando no aplica.
  geometriaRetorno: string[];
}

export interface RutaDTO {
  idRuta: string;
  vehiculoId: string;
  tipoVehiculo: string;
  estado: EstadoRuta;
  secuenciaEntrega: string[]; // IDs de pedido, en orden de entrega
  costoEstimado: number;
  duracionEstimadaHoras: number;
  // Camino real nodo a nodo (el mismo que CalculadorDistancia uso para evaluar la ruta, respeta
  // bloqueos vigentes), cada nodo como "x,y". Puede venir mas corta que secuenciaEntrega si algun
  // tramo quedo sin camino transitable; nunca se recalcula localmente como aproximacion.
  geometria: string[];
}

export interface AlmacenDTO {
  nombre: string;
  esCentral: boolean;
  posX: number;
  posY: number;
  stockActual: number;
  capacidadMaxima: number;
  nivelOcupacion: number; // 0..100 (ya es porcentaje, ver EnsambladorRespuestas.aAlmacenDTO -- NO es una fracción 0..1)
}

export interface BloqueoDTO {
  secuenciaNodos: string[]; // cada nodo como "x,y"
  fechaInicio: string;
  fechaFin: string;
  vigente: boolean;
}

export interface EventoDTO {
  instante: string;
  tipo: string; // ver TipoEvento en el backend
  vehiculoId: string | null;
  x: number;
  y: number;
  pedidoId: string | null;
  descripcion: string;
}

export interface MetricasOperacionDTO {
  costoTotalAcumulado: number;
  porcentajeEntregasATiempo: number; // 0..100 (ReporteDesempeno.porcentajeEntregasATiempo)
  contadorEntregados: number;
  contadorIncumplidos: number;
  contadorParadasReasignadas: number;
  contadorAverias: number;
  contadorInterferenciasBloqueo: number;
}

export interface CiudadDTO {
  ancho: number;
  alto: number;
  distanciaEntreNodos: number;
  callesDobleSentido: boolean;
  origenX: number;
  origenY: number;
}

export interface ConfiguracionOperacionDTO {
  duracionTurnoHoras: number;
  horaInicioTurno: number;
  tiempoServicioClienteHoras: number;
  duracionRefrigerioHoras: number;
  tiempoTrasvaseHoras: number;
  margenRefrigerioHoras: number;
  tiempoCargaAlmacenHoras: number;
  maxParadasPorRuta: number;
}

export interface TipoVehiculoDTO {
  id: string;
  nombre: string;
  capacidad: number;
  velocidadKmH: number;
  costoPorKm: number;
}

export interface ConfiguracionActualDTO {
  ciudad: CiudadDTO;
  operacion: ConfiguracionOperacionDTO;
  tiposVehiculo: TipoVehiculoDTO[];
  almacenes: AlmacenDTO[];
}

export interface EstadoOperacionDTO {
  marcaTiempoActual: string | null;
  rutas: RutaDTO[];
  vehiculos: VehiculoDTO[];
  almacenes: AlmacenDTO[];
  bloqueos: BloqueoDTO[];
  eventos: EventoDTO[];
  metricas: MetricasOperacionDTO;
}

export interface EjecucionEscenarioDTO {
  idEjecucion: string;
  tipoEscenario: TipoEscenarioBackend;
  estado: EstadoEjecucion;
  fechaInicio: string;
  fechaInicioSimulada: string | null;
  /** Minutos reales entre lotes de planificación. */
  sa: number;
  /** Segundos simulados por segundo real (horasAvance=(sa/60)*k repartido en sa minutos reales se
   * simplifica exactamente a esto, independiente de sa) -- usado para extrapolar en tiempo real la
   * posición de cada vehículo entre lotes en vez de que "salte" solo cuando llega uno nuevo. */
  k: number;
}

export interface ResultadoCargaDTO {
  nombreArchivo: string;
}

export interface TickUpdateDTO {
  event: string; // "LOTE_ACTUALIZADO"
  estado: EstadoOperacionDTO;
  alertas: EventoDTO[];
}

export interface ApiResponseDTO<T> {
  data: T;
  meta: { timestamp: string };
}

export interface ApiErrorDTO {
  error: {
    code: string;
    message: string;
    details?: { field: string; issue: string }[] | null;
  };
}

export interface SeleccionarEscenarioRequest {
  tipo: TipoEscenarioBackend;
  fechaInicioSimulada?: string; // Instant ISO, opcional
  ajustesIniciales?: AjusteInicial[]; // aplicados antes del primer lote, opcional
}

export interface ProgramarSolicitudRequest {
  tiempoSimulado: string; // Instant ISO
  tipoSolicitud: TipoSolicitud;
  entidadObjetivo: string;
  valorNuevo: string;
}

// Mismo catalogo de TipoSolicitud que ProgramarSolicitudRequest, pero sin tiempoSimulado: se
// aplica en fechaInicioSimulada, antes de que arranque el ciclo periodico del escenario. A
// diferencia de programarSolicitud, aqui CAMBIO_CONFIGURACION_CIUDAD si esta permitido.
export interface AjusteInicial {
  tipoSolicitud: TipoSolicitud;
  entidadObjetivo: string;
  valorNuevo: string;
}
