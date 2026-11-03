/**
 * Convierte los DTOs reales del backend (types/backend.ts) a los tipos de vista que ya usa el
 * frontend (types/order.ts, vehicle.ts, route.ts). Un adaptador, no una fuente de datos: todo lo
 * que no se puede derivar honestamente del backend queda undefined/vacio, nunca inventado.
 *
 * Huecos reales del backend que esto no puede resolver (documentados, no se simulan):
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
import { BreakdownInfo, BreakdownType, Vehicle, VehicleType, VehicleStatus } from '../types/vehicle';
import { Route, Warehouse, BlockedStreet, Point } from '../types/route';
import { generateManhattanPath, isSegmentBlocked, normalizeManhattanPath } from './manhattan';
import { parseBackendSimulatedTime } from './backendTime';
import { BREAKDOWN_LEVEL_CONFIGS } from './vehicleBreakdown';

const TIPO_A_VEHICLE_TYPE: Record<string, VehicleType> = {
  AUTO: 'car',
  TA: 'car',
  MOTO: 'motorcycle',
  TM: 'motorcycle',
  BICI: 'bicycle',
  BICICLETA: 'bicycle',
  TB: 'bicycle',
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

const TIPO_AVERIA_A_BREAKDOWN_TYPE: Record<string, BreakdownType> = {
  TIPO_1: 1,
  TIPO_2: 2,
  TIPO_3: 3,
};

function parseBreakdownType(value: string | number | null | undefined): BreakdownType | undefined {
  if (typeof value === 'number') {
    return value === 1 || value === 2 || value === 3 ? value : undefined;
  }
  if (!value) return undefined;

  const normalized = value.trim().toUpperCase().replace(/[\s-]+/g, '_');
  const enumValue = TIPO_AVERIA_A_BREAKDOWN_TYPE[normalized];
  if (enumValue) return enumValue;

  const numericValue = Number(normalized.replace(/^TIPO_?/, ''));
  if (numericValue === 1) return 1;
  if (numericValue === 2) return 2;
  if (numericValue === 3) return 3;
  return undefined;
}

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
  const desdeMs = parseBackendSimulatedTime(actividadDesde);
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

  const breakdownType = parseBreakdownType(dto.tipoAveria);
  const breakdownCfg = breakdownType ? BREAKDOWN_LEVEL_CONFIGS[breakdownType] : undefined;
  const breakdownInfo: BreakdownInfo | undefined = breakdownType && breakdownCfg
    ? {
        type: breakdownType,
        typeName: breakdownCfg.label,
        reason: `${breakdownCfg.unavailableText} · ${breakdownCfg.siteStayText}`,
        startMinute: 0,
        locationAtBreakdown: position,
        maxSiteStayMinutes: breakdownType === 1 ? 120 : 240,
        towedToCentral: breakdownType === 2 || breakdownType === 3,
        returnToOperationMinute: 0,
        returnShiftDescription: breakdownCfg.unavailableText,
      }
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
    breakdownType,
    breakdownInfo,
    breakdownReason: breakdownCfg
      ? `${breakdownCfg.unavailableText} · ${breakdownCfg.siteStayText}`
      : undefined,
    position,
    destination,
    returnPath: normalizeManhattanPath(dto.geometriaRetorno.map(parseNodo)),
    activityRemainingMinutes,
    activitySince: dto.actividadDesde ?? undefined,
    trajectory: (dto.trayectoria ?? []).map((p) => ({ x: p.x, y: p.y, t: parseBackendSimulatedTime(p.instante), act: p.actividad })),
    historyPath: [], // no expuesto por el backend
    assignedOrderIds: rutaActiva?.secuenciaEntrega ?? [],
    totalDelivered: 0, // no expuesto por el backend (no hay contador por vehiculo)
    homeWarehouseId: '', // el backend no fija un almacen base por unidad
  };
}

function almacenMasCercano(warehouses: Warehouse[], x: number, y: number): Warehouse | undefined {
  let mejor: Warehouse | undefined;
  let mejorDist = Infinity;
  for (const w of warehouses) {
    const dist = Math.abs(w.coords.x - x) + Math.abs(w.coords.y - y);
    if (dist < mejorDist) {
      mejor = w;
      mejorDist = dist;
    }
  }
  return mejor;
}

export function adaptPedido(
  dto: PedidoDTO,
  rutas: RutaDTO[],
  scenarioStartMs: number | null,
  nowMs: number | null,
  warehouses: Warehouse[] = []
): Order {
  const createdMs = parseBackendSimulatedTime(dto.fechaIngreso);
  const deadlineMs = parseBackendSimulatedTime(dto.fechaLimite);
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
  // Para atribuir el pedido a su almacen de salida se prefiere la ruta que realmente lo lleva
  // (EN_EJECUCION/FINALIZADA) sobre una PLANIFICADA o REEMPLAZADA que tambien lo liste.
  const rutaOrigen = ['EN_EJECUCION', 'FINALIZADA', 'PLANIFICADA']
    .map((estado) => rutas.find((r) => r.estado === estado && r.secuenciaEntrega.includes(dto.idPedido)))
    .find(Boolean);
  // Si el pedido ya se despacho, su propio origen manda (la ruta FINALIZADA deja de venir en el
  // estado); si no -- o si tras un replan vuelve a esperar en una ruta PLANIFICADA -- se usa el de
  // esa ruta.
  const despachado = dto.origenX != null && dto.origenY != null && rutaOrigen?.estado !== 'PLANIFICADA';
  const origenX = despachado ? dto.origenX : rutaOrigen?.origenX;
  const origenY = despachado ? dto.origenY : rutaOrigen?.origenY;
  const almacenOrigen = origenX != null && origenY != null
    ? almacenMasCercano(warehouses, origenX, origenY)
    : undefined;
  const salida = despachado ? dto.fechaSalida : rutaOrigen?.horaSalida;
  const departureMs = salida ? parseBackendSimulatedTime(salida) : NaN;
  const deliveredMs = dto.fechaEntrega ? parseBackendSimulatedTime(dto.fechaEntrega) : NaN;

  return {
    id: dto.idPedido,
    code: dto.idPedido,
    warehouseOriginId: almacenOrigen?.id ?? '',
    departureSimMs: Number.isFinite(departureMs) ? departureMs : undefined,
    departed: despachado || rutaOrigen?.estado === 'EN_EJECUCION' || rutaOrigen?.estado === 'FINALIZADA',
    deliveredSimMs: Number.isFinite(deliveredMs) ? deliveredMs : undefined,
    deliveredMinute: scenarioStartMs != null && Number.isFinite(deliveredMs)
      ? Math.round((deliveredMs - scenarioStartMs) / 60000)
      : undefined,
    destination: { x: dto.posX, y: dto.posY },
    arrivalSimMs: createdMs,
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
  bloqueos: BlockedStreet[],
  cityWidth: number,
  cityHeight: number
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
  let waypoints: Point[] = dto.geometria.length > 0
    ? normalizeManhattanPath(dto.geometria.map(parseNodo))
    : [];
  const geometriaCruzaBloqueo = waypoints.some((point, index) =>
    index > 0 && isSegmentBlocked(waypoints[index - 1], point, bloqueos)
  );
  if (waypoints.length === 0 || geometriaCruzaBloqueo) {
    waypoints = [origin];
    let cursor = origin;
    for (const punto of puntos) {
      const tramo = generateManhattanPath(cursor, punto, bloqueos, cityWidth, cityHeight);
      waypoints = waypoints.concat(tramo.slice(1));
      cursor = tramo[tramo.length - 1];
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
  const nowMs = estado.marcaTiempoActual ? parseBackendSimulatedTime(estado.marcaTiempoActual) : null;
  const pedidosById = new Map(pedidos.map((p) => [p.idPedido, p]));
  const vehiculosById = new Map(estado.vehiculos.map((v) => [v.idUnidad, v]));
  const blockedStreets = estado.bloqueos.filter((b) => b.vigente).flatMap(adaptBloqueo);
  const warehouses = estado.almacenes.map(adaptAlmacen);

  return {
    vehicles: estado.vehiculos.map((v) =>
      adaptVehiculo(v, config, estado.rutas, pedidosById, nowMs)
    ),
    orders: pedidos.map((p) => adaptPedido(p, estado.rutas, scenarioStartMs, nowMs, warehouses)),
    routes: estado.rutas.map((r) =>
      adaptRuta(
        r,
        vehiculosById.get(r.vehiculoId),
        pedidosById,
        blockedStreets,
        config.ciudad.ancho,
        config.ciudad.alto
      )
    ),
    warehouses,
    blockedStreets,
  };
}
