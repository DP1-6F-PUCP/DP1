/**
 * Convierte los DTOs reales del backend (types/backend.ts) a los tipos de vista que ya usa el
 * frontend (types/order.ts, vehicle.ts, route.ts). Un adaptador, no una fuente de datos: todo lo
 * que no se puede derivar honestamente del backend queda undefined/vacio, nunca inventado.
 *
 * Huecos reales del backend que esto no puede resolver (documentados, no se simulan):
 * - PedidoDTO no expone fechaIngreso -- createdMinute/slaHours no son derivables, quedan en 0/undefined.
 * - VehiculoDTO no expone velocidad/capacidad propias -- se resuelven por tipo via TipoVehiculoDTO.
 * - VehiculoDTO no tiene historyPath ni bateria/combustible -- no son conceptos del dominio real.
 * - RutaDTO.geometria ya trae el camino real (CalculadorDistancia, respeta bloqueos); solo se
 *   recalcula localmente con generateManhattanPath si viene vacia (fallback, no el camino normal).
 */
import {
  PedidoDTO,
  VehiculoDTO,
  RutaDTO,
  AlmacenDTO,
  BloqueoDTO,
  TipoVehiculoDTO,
  EstadoOperacionDTO,
  ConfiguracionActualDTO,
} from '../types/backend';
import { Order, OrderStatus, OrderUrgency } from '../types/order';
import { Vehicle, VehicleType, VehicleStatus } from '../types/vehicle';
import { Route, Warehouse, BlockedStreet, Point } from '../types/route';
import { generateManhattanPath } from './manhattan';

const TIPO_A_VEHICLE_TYPE: Record<string, VehicleType> = {
  AUTO: 'car',
  MOTO: 'motorcycle',
  BICI: 'bicycle',
};

const ESTADO_UNIDAD_A_STATUS: Record<string, VehicleStatus> = {
  DISPONIBLE: 'idle',
  EN_RUTA: 'en_route',
  EN_MANTENIMIENTO: 'maintenance',
  AVERIADO: 'broken',
};

// Solo refina EN_RUTA: ENTREGANDO/EN_REFRIGERIO son sub-fases de "en ruta", nunca aplican a un
// vehiculo DISPONIBLE/AVERIADO/EN_MANTENIMIENTO (ver ActividadVehiculo, siempre INACTIVO en esos
// casos). Antes el front no podia distinguir "viajando" de "detenido entregando/en refrigerio" --
// ambos se veian igual (en_route), sin forma de explicar por que un vehiculo con ruta asignada no
// avanzaba entre dos snapshots.
const ACTIVIDAD_A_STATUS: Partial<Record<string, VehicleStatus>> = {
  ENTREGANDO: 'delivering',
  EN_REFRIGERIO: 'on_break',
};

const ESTADO_RUTA_A_STATUS: Record<string, Route['status']> = {
  PLANIFICADA: 'planned',
  EN_EJECUCION: 'in_progress',
  FINALIZADA: 'completed',
  REEMPLAZADA: 'blocked',
};

// Umbral puramente de UI (no es un parametro de negocio del backend) para resaltar un pedido
// PENDIENTE que se acerca a su fechaLimite.
const RIESGO_MINUTOS = 60;

function parseNodo(nodo: string): Point {
  const [x, y] = nodo.split(',').map(Number);
  return { x: x || 0, y: y || 0 };
}

export function adaptAlmacen(dto: AlmacenDTO): Warehouse {
  return {
    id: dto.nombre,
    name: dto.nombre,
    shortName: dto.nombre,
    code: dto.nombre,
    coords: { x: dto.posX, y: dto.posY },
    capacity: dto.esCentral ? Infinity : dto.capacidadMaxima,
    currentStock: dto.stockActual,
    inTransit: 0, // no expuesto por el backend
    dispatchRatePerHour: 0, // no expuesto por el backend
    occupancyPct: dto.nivelOcupacion,
    color: dto.esCentral ? '#3b82f6' : '#06b6d4',
  };
}

/**
 * Bug real corregido: BloqueoDTO.secuenciaNodos es una polilínea (puede doblar, invariante
 * confirmada en Bloqueo.java), pero esto tomaba solo el primer y el ultimo nodo y los unia con UN
 * segmento -- en una grilla Manhattan eso se dibuja como una diagonal que corta a traves de
 * manzanas, aunque el bloqueo real sea dos tramos axis-aligned (p.ej. 3 nodos a la derecha, luego
 * 2 hacia arriba). Mismo criterio que fileParser.ts ya usaba correctamente para los archivos
 * subidos a mano: explota la polilinea en N-1 segmentos rectos, uno por BlockedStreet.
 *
 * Solo se llama con bloqueos ya filtrados por `vigente` (ver adaptEstadoOperacion) -- antes se
 * adaptaban y dibujaban TODOS los bloqueos alguna vez cargados (contexto.bloqueos() en el backend
 * es el universo completo, no el recortado al horizonte activo), programados o ya vencidos
 * incluidos, y nunca se quitaban del mapa: por eso parecian estaticos, nunca aparecian ni
 * desaparecian con el avance del reloj simulado aunque el backend sí sabe cuales estan vigentes.
 */
export function adaptBloqueo(dto: BloqueoDTO, polyIndex: number): BlockedStreet[] {
  const nodos = dto.secuenciaNodos.map(parseNodo);
  const segmentos: BlockedStreet[] = [];
  for (let i = 0; i < nodos.length - 1; i++) {
    const p1 = nodos[i];
    const p2 = nodos[i + 1];
    const isVertical = Math.abs(p2.y - p1.y) >= Math.abs(p2.x - p1.x);
    segmentos.push({
      id: `bloqueo-${polyIndex}-${i}`,
      name: `Bloqueo ${polyIndex + 1}`,
      start: p1,
      end: p2,
      orientation: isVertical ? 'vertical' : 'horizontal',
      severity: 'medium', // el backend no clasifica severidad
      reason: 'Bloqueo vigente',
      reportedTime: dto.fechaInicio,
    });
  }
  return segmentos;
}

function tipoVehiculoDe(tipo: string, tipos: TipoVehiculoDTO[]): TipoVehiculoDTO | undefined {
  return tipos.find((t) => t.id === tipo);
}

/** Pedido -> hora simulada de llegada a su destino, si tiene una ruta EN_EJECUCION que lo incluye. */
function destinoDeVehiculo(
  vehiculo: VehiculoDTO,
  rutas: RutaDTO[],
  pedidosById: Map<string, PedidoDTO>
): Point | undefined {
  const rutaActiva = rutas.find((r) => r.vehiculoId === vehiculo.idUnidad && r.estado === 'EN_EJECUCION');
  if (!rutaActiva || rutaActiva.secuenciaEntrega.length === 0) return undefined;
  // Bug real reportado (captura: el circulo de "destino seleccionado" aparecia lejos del
  // vehiculo mientras este estaba ENTREGANDO): secuenciaEntrega trae TODAS las paradas de la
  // ruta en orden, entregadas o no (ver EnsambladorRespuestas.aRutaDTO) -- tomar la ULTIMA
  // apuntaba siempre a la parada final del recorrido completo, no a la que el vehiculo esta
  // sirviendo ahora mismo. Se busca la primera NO entregada (ENTREGADA es el unico estado final
  // de PedidoDTO.estado), que es la parada vigente.
  const pedidoActualId = rutaActiva.secuenciaEntrega.find((id) => pedidosById.get(id)?.estado !== 'ENTREGADA')
    ?? rutaActiva.secuenciaEntrega[rutaActiva.secuenciaEntrega.length - 1];
  const pedido = pedidosById.get(pedidoActualId);
  return pedido ? { x: pedido.posX, y: pedido.posY } : undefined;
}

/**
 * Minutos simulados restantes de la fase actual (entrega/refrigerio) -- dto.actividadDesde +
 * duracionHoras (tiempoServicioClienteHoras o duracionRefrigerioHoras segun corresponda) es el
 * instante en que esa fase deberia terminar; se resta contra nowMs (marcaTiempoActual del
 * backend, mismo reloj simulado, no el reloj real del navegador). null si falta algun dato --
 * nunca se inventa un numero cuando no hay con que calcularlo.
 */
function minutosRestantesActividad(
  actividadDesde: string | null,
  duracionHoras: number,
  nowMs: number | null
): number | undefined {
  if (!actividadDesde || nowMs == null) return undefined;
  const desdeMs = Date.parse(actividadDesde);
  if (!Number.isFinite(desdeMs)) return undefined;
  const finMs = desdeMs + duracionHoras * 3_600_000;
  return Math.max(0, Math.round((finMs - nowMs) / 60_000));
}

export function adaptVehiculo(
  dto: VehiculoDTO,
  config: ConfiguracionActualDTO,
  rutas: RutaDTO[],
  pedidosById: Map<string, PedidoDTO>,
  nowMs: number | null
): Vehicle {
  const tipoDto = tipoVehiculoDe(dto.tipo, config.tiposVehiculo);
  const position = { x: dto.posXActual, y: dto.posYActual };
  const destination = destinoDeVehiculo(dto, rutas, pedidosById);
  const rutaActiva = rutas.find((r) => r.vehiculoId === dto.idUnidad && r.estado === 'EN_EJECUCION');
  const activityRemainingMinutes = dto.actividad === 'ENTREGANDO'
    ? minutosRestantesActividad(dto.actividadDesde, config.operacion.tiempoServicioClienteHoras, nowMs)
    : dto.actividad === 'EN_REFRIGERIO'
      ? minutosRestantesActividad(dto.actividadDesde, config.operacion.duracionRefrigerioHoras, nowMs)
      : undefined;

  return {
    id: dto.idUnidad,
    code: dto.idUnidad,
    type: TIPO_A_VEHICLE_TYPE[dto.tipo] || 'car',
    capacity: tipoDto?.capacidad ?? 0,
    currentLoad: dto.cargaActual,
    speed: tipoDto?.velocidadKmH ?? 0,
    status: (dto.estado === 'EN_RUTA' && ACTIVIDAD_A_STATUS[dto.actividad])
      || ESTADO_UNIDAD_A_STATUS[dto.estado]
      || 'idle',
    position,
    destination,
    returnPath: dto.geometriaRetorno.map(parseNodo),
    activityRemainingMinutes,
    activitySince: dto.actividadDesde ?? undefined,
    historyPath: [], // no expuesto por el backend
    assignedOrderIds: rutaActiva?.secuenciaEntrega ?? [],
    totalDelivered: 0, // no expuesto por el backend (no hay contador por vehiculo)
    homeWarehouseId: '', // el backend no fija un almacen base por unidad
  };
}

export function adaptPedido(
  dto: PedidoDTO,
  rutas: RutaDTO[],
  scenarioStartMs: number | null,
  nowMs: number | null
): Order {
  const createdMs = Date.parse(dto.fechaIngreso);
  const deadlineMs = Date.parse(dto.fechaLimite);
  const createdMinute = scenarioStartMs != null && Number.isFinite(createdMs)
    ? Math.round((createdMs - scenarioStartMs) / 60000)
    : 0;
  const deadlineMinute = scenarioStartMs != null && Number.isFinite(deadlineMs)
    ? Math.round((deadlineMs - scenarioStartMs) / 60000)
    : 0;

  let status: OrderStatus;
  if (dto.estado === 'ENTREGADA') {
    status = 'delivered';
  } else if (dto.estado === 'INCUMPLIDA') {
    status = 'delayed';
  } else if (nowMs != null && Number.isFinite(deadlineMs) && deadlineMs - nowMs <= RIESGO_MINUTOS * 60000) {
    status = 'at_risk';
  } else {
    status = 'on_time';
  }

  const rutaConPedido = rutas.find((r) => r.secuenciaEntrega.includes(dto.idPedido));

  return {
    id: dto.idPedido,
    code: dto.idPedido,
    warehouseOriginId: '', // el backend no indica desde que almacen se atendera
    destination: { x: dto.posX, y: dto.posY },
    createdMinute,
    deadlineMinute,
    status,
    assignedVehicleId: rutaConPedido?.vehiculoId,
    urgency: status === 'at_risk' || status === 'delayed' ? ('priority' as OrderUrgency) : 'normal',
    clientId: dto.idCliente,
    quantity: dto.cantidadSolicitada,
    slaHours: dto.horasLimite,
  };
}

export function adaptRuta(
  dto: RutaDTO,
  vehiculo: VehiculoDTO | undefined,
  pedidosById: Map<string, PedidoDTO>,
  bloqueos: BlockedStreet[]
): Route {
  const puntos: Point[] = dto.secuenciaEntrega
    .map((id) => pedidosById.get(id))
    .filter((p): p is PedidoDTO => Boolean(p))
    .map((p) => ({ x: p.posX, y: p.posY }));

  const origin = vehiculo ? { x: vehiculo.posXActual, y: vehiculo.posYActual } : puntos[0] || { x: 0, y: 0 };
  const destination = puntos[puntos.length - 1] || origin;

  // dto.geometria es el camino real que CalculadorDistancia uso para evaluar la ruta en el
  // backend (respeta bloqueos vigentes via A*) -- ya no se recalcula una aproximacion local salvo
  // que venga vacia (ruta sin paradas, o backend viejo sin este campo todavia en cache).
  let waypoints: Point[] = dto.geometria.length > 0 ? dto.geometria.map(parseNodo) : [];
  if (waypoints.length === 0) {
    waypoints = [origin];
    let cursor = origin;
    for (const punto of puntos) {
      waypoints = waypoints.concat(generateManhattanPath(cursor, punto, bloqueos).slice(1));
      cursor = punto;
    }
  }

  return {
    id: dto.idRuta,
    vehicleId: dto.vehiculoId,
    vehicleCode: dto.vehiculoId,
    origin,
    destination,
    waypoints,
    // distanceKm en realidad es costoEstimado (EvaluadorCostos pondera distancia, no es km puro)
    // -- se usa este campo porque Route no distingue costo de distancia; es el valor real del
    // planificador, no una aproximacion, aunque la etiqueta no sea 100% exacta.
    distanceKm: dto.costoEstimado,
    estimatedDurationMinutes: Math.round(dto.duracionEstimadaHoras * 60),
    status: ESTADO_RUTA_A_STATUS[dto.estado] || 'planned',
    assignedOrderCount: dto.secuenciaEntrega.length,
  };
}

export interface EstadoAdaptado {
  vehicles: Vehicle[];
  orders: Order[];
  routes: Route[];
  warehouses: Warehouse[];
  blockedStreets: BlockedStreet[];
}

/** Adapta el EstadoOperacionDTO completo de una sola pasada, cruzando pedidos/rutas/vehiculos. */
export function adaptEstadoOperacion(
  estado: EstadoOperacionDTO,
  config: ConfiguracionActualDTO,
  pedidos: PedidoDTO[],
  scenarioStartMs: number | null
): EstadoAdaptado {
  const nowMs = estado.marcaTiempoActual ? Date.parse(estado.marcaTiempoActual) : null;
  const pedidosById = new Map(pedidos.map((p) => [p.idPedido, p]));
  const vehiculosById = new Map(estado.vehiculos.map((v) => [v.idUnidad, v]));
  const blockedStreets = estado.bloqueos.filter((b) => b.vigente).flatMap(adaptBloqueo);

  return {
    vehicles: estado.vehiculos.map((v) =>
      adaptVehiculo(v, config, estado.rutas, pedidosById, nowMs)
    ),
    orders: pedidos.map((p) => adaptPedido(p, estado.rutas, scenarioStartMs, nowMs)),
    routes: estado.rutas.map((r) => adaptRuta(r, vehiculosById.get(r.vehiculoId), pedidosById, blockedStreets)),
    warehouses: estado.almacenes.map(adaptAlmacen),
    blockedStreets,
  };
}
