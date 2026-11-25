/**
 * Tipos que calzan EXACTAMENTE con los DTOs reales del backend (com.paqrap.exposicion /
 * com.paqrap.backend.dto). No agregar campos que el backend no devuelve -- para datos derivados
 * o enriquecidos del lado del cliente, usar utils/backendAdapters.ts, nunca inventarlos aqui.
 */

export type EstadoPedido = 'PENDIENTE' | 'ENTREGADA' | 'INCUMPLIDA';
export type EstadoUnidad = 'DISPONIBLE' | 'EN_RUTA' | 'EN_MANTENIMIENTO' | 'AVERIADO';

// Que esta haciendo la unidad dentro de su EstadoUnidad general (ver ActividadVehiculo en el
// dominio) -- distingue, p. ej., EN_RUTA viajando de EN_RUTA detenido entregando o en refrigerio.
export type ActividadVehiculo = 'INACTIVO' | 'VIAJANDO' | 'ENTREGANDO' | 'EN_REFRIGERIO' | 'TRASVASANDO';
export type EstadoRuta = 'PLANIFICADA' | 'EN_EJECUCION' | 'FINALIZADA' | 'REEMPLAZADA';
/** INTERRUMPIDA: cortada por un apagado o reinicio del backend (con reporte si el apagado fue ordenado). */
export type EstadoEjecucion = 'INICIADA' | 'EN_CURSO' | 'PAUSADA' | 'FINALIZADA' | 'DETENIDA_POR_INCUMPLIMIENTO' | 'INTERRUMPIDA';
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
  fechaEntrega?: string | null; // última entrega cumplida; null mientras no esté ENTREGADA
  // Nodo e instante de su último despacho (null si aún no salió). Sobrevive a que la ruta
  // FINALIZADA deje de venir en EstadoOperacionDTO.rutas.
  origenX?: number | null;
  origenY?: number | null;
  fechaSalida?: string | null;
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
  actividad: ActividadVehiculo;
  // Instante (LocalDateTime ISO sin zona) en que arranco la fase actual de `actividad` --
  // solo presente para ENTREGANDO/EN_REFRIGERIO, null en cualquier otro caso.
  actividadDesde: string | null;
  // Recorrido real del ultimo lote, nodo a nodo con instantes simulados (incluye pausas): desde
  // cada punto hasta el siguiente el vehiculo hace `actividad`.
  trayectoria: PuntoTrayectoriaDTO[];
  // Tipo de la avería activa ("TIPO_1", "TIPO_2" o "TIPO_3"); null si no está averiado.
  tipoAveria: string | null;
  // Últimas dos salidas de un almacén (LocalDateTime ISO). El lote llega adelantado al reloj del
  // mapa: si la última aún no ocurrió en ese reloj, vale la anterior. Opcionales: backend previo.
  salidaAlmacen?: string | null;
  salidaAlmacenAnterior?: string | null;
  // Avería activa: inicio y fin estimado (vuelve a estar disponible).
  inicioAveria?: string | null;
  finAveria?: string | null;
}

/** GET /api/estado-operacion/mantenimientos */
export interface MantenimientoDTO {
  idUnidad: string;
  tipoVehiculo: string;
  inicio: string;
  fin: string;
}

/** GET /api/estado-operacion/averias */
export interface AveriaRegistroDTO {
  idUnidad: string;
  tipoVehiculo: string;
  tipoAveria: string;
  inicio: string;
  finEstimado: string;
  trasladoAlmacen: string | null;
  x: number;
  y: number;
}

export interface PuntoTrayectoriaDTO {
  x: number;
  y: number;
  instante: string; // LocalDateTime ISO (sin zona)
  actividad: ActividadVehiculo;
  /** El tramo que empieza aquí va hacia un almacén sin repartir (regreso o camino a cargar). */
  retorno?: boolean;
  /** Paquetes a bordo en ese tramo. */
  cargaABordo?: number;
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
  // Nodo de salida (donde se despacho, o la posicion actual si sigue PLANIFICADA) e instante de
  // salida (real si ya se despacho, planificado si no).
  origenX?: number;
  origenY?: number;
  horaSalida?: string | null;
}

export interface AlmacenDTO {
  nombre: string;
  esCentral: boolean;
  posX: number;
  posY: number;
  stockActual: number;
  capacidadMaxima: number;
  nivelOcupacion: number; // 0..100 (ya es porcentaje, ver EnsambladorRespuestas.aAlmacenDTO -- NO es una fracción 0..1)
  frecuenciaRecargaHoras: number; // 0 para el central (no se recarga, stock infinito)
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
  cantidadUnidades: number; // unidades de este tipo en la flota vigente
}

export interface ConfiguracionActualDTO {
  ciudad: CiudadDTO;
  operacion: ConfiguracionOperacionDTO;
  tiposVehiculo: TipoVehiculoDTO[];
  almacenes: AlmacenDTO[];
}

export interface EstadoOperacionDTO {
  /** Ejecución que produjo esta instantánea; permite descartar mensajes tardíos. */
  idEjecucion?: string | null;
  marcaTiempoActual: string | null;
  rutas: RutaDTO[];
  vehiculos: VehiculoDTO[];
  almacenes: AlmacenDTO[];
  bloqueos: BloqueoDTO[];
  eventos: EventoDTO[];
  metricas: MetricasOperacionDTO;
  /** Número correlativo del lote dentro de la ejecución (1, 2, 3…); un salto indica lotes perdidos. */
  secuencia?: number;
  /** Pedidos nuevos o cambiados desde el lote anterior (se mezclan con los ya conocidos). */
  pedidosCambiados?: PedidoDTO[];
}

export interface PaginaPedidosDTO {
  total: number;
  pagina: number;
  tamano: number;
  pedidos: PedidoDTO[];
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

/** GET /api/files: una carga vigente. */
export interface ArchivoCargadoDTO {
  id: string;
  /** OFFICIAL = precargado; MANUAL = subido por el operador. */
  origen: 'OFFICIAL' | 'MANUAL';
  tipoArchivo: 'PEDIDOS' | 'BLOQUEOS' | 'MANTENIMIENTO';
  nombreArchivo: string;
  anio: number | null;
  mes: number | null;
  filas: number;
  fecha: string;
}

export interface ResultadoCargaDTO {
  nombreArchivo: string;
  /** Con una simulación en curso: qué pasó con los pedidos del archivo (sin simulación, todo en 0). */
  enSimulacion?: boolean;
  incorporados?: number;
  programados?: number;
  /** Ingresaron antes del inicio de la simulación: no entraron. */
  anterioresAlInicio?: number;
  /** Ya vencidos al subirlos: no entraron (habrían detenido la simulación al instante). */
  vencidos?: number;
}

export interface ReporteSimulacionDTO {
  idEjecucion: string;
  tipoEscenario: TipoEscenarioBackend;
  motivoFinalizacion: 'COLAPSO' | 'PARADA_MANUAL' | 'PERIODO_COMPLETADO' | 'REINICIO_SERVIDOR';
  inicioReal: string;
  finReal: string;
  duracionRealMs: number;
  inicioSimulado: string;
  finSimulado: string;
  duracionSimuladaMs: number;
  estadoFinal: EstadoOperacionDTO;
  pedidosFinales: PedidoDTO[];
  ultimaPlanificacionEstable: EstadoOperacionDTO | null;
  pedidosPlanificacionEstable: PedidoDTO[];
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
