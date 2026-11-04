import assert from 'node:assert/strict';
import { adaptPedido, adaptRuta, asignarColaDeSalida, estimarEntregasEnRuta } from '../src/utils/backendAdapters';
import { classifyWarehouseShipments, isDeliveredRecently, isDueSoon } from '../src/utils/warehouseShipments';
import { vehicleIdsCarryingOrder } from '../src/utils/orderRoutes';
import { parseBackendSimulatedTime as time } from '../src/utils/backendTime';

const now = time('2026-10-28T08:00:00');
const HOUR = 3600000;
const warehouse = (id: string, x: number, capacity: number, currentStock: number) =>
  ({ id, coords: { x, y: 0 }, capacity, currentStock }) as any;
const warehouses = [warehouse('central', 0, Infinity, 0), warehouse('norte', 50, 100, 100)];
const pedido = (idPedido: string, overrides: object = {}) => ({
  idPedido, idCliente: 'C1', estado: 'PENDIENTE', posX: 60, posY: 0, cantidadSolicitada: 5, cantidadEntregada: 0,
  fechaIngreso: '2026-10-28T07:00:00', horasLimite: 48, fechaLimite: '2026-10-30T07:00:00', ...overrides,
}) as any;
const ids = (orders: { id: string }[]) => orders.map((o) => o.id);
const estimacionBase = { velocidadKmH: 50, entregaEnRuta: new Map<string, number>(), servicioHoras: 1 };
const conUnidad = (idPedido: string) => ({ ...estimacionBase, salidaPorCola: new Map([[idPedido, now]]) });
const sinUnidad = { ...estimacionBase, salidaPorCola: new Map<string, number>() };

// Con una unidad libre, un pedido sin ruta sale en el próximo lote, desde el almacén más cercano.
const libre = adaptPedido(pedido('P1'), [], now, now, warehouses, conUnidad('P1'));
assert.equal(libre.estimatedWarehouseId, 'norte');
assert.equal(libre.estimatedDepartureSimMs, now);
assert.deepEqual(ids(classifyWarehouseShipments([libre], 'norte', now - 1).upcoming), ['P1']);
assert.deepEqual(ids(classifyWarehouseShipments([libre], 'central', now - 1).upcoming), []);

// Sin stock suficiente en el intermedio, se atribuye al Central.
const sinStock = adaptPedido(pedido('P2', { cantidadSolicitada: 500 }), [], now, now, warehouses, conUnidad('P2'));
assert.equal(sinStock.estimatedWarehouseId, 'central');

// Cola: por plazo, hasta llenar cada unidad, empezando por la que se libera antes.
const tipos = [{ id: 'AUTO', capacidad: 10, velocidadKmH: 50 }] as any;
const unidades = [
  { idUnidad: 'TA01', tipo: 'AUTO', estado: 'EN_RUTA' },
  { idUnidad: 'TA02', tipo: 'AUTO', estado: 'DISPONIBLE' },
  { idUnidad: 'TA03', tipo: 'AUTO', estado: 'AVERIADO' },
] as any;
const rutaEnCurso = [{
  estado: 'EN_EJECUCION', secuenciaEntrega: ['X'], vehiculoId: 'TA01', horaSalida: '2026-10-28T07:00:00', duracionEstimadaHoras: 3,
}] as any;
const cola = asignarColaDeSalida(
  [
    pedido('tarde', { cantidadSolicitada: 8 }),
    pedido('pronto', { cantidadSolicitada: 8, fechaLimite: '2026-10-28T20:00:00' }),
    pedido('noCabe', { cantidadSolicitada: 8, fechaLimite: '2026-10-31T00:00:00' }),
    pedido('futuro', { fechaIngreso: '2026-10-28T09:00:00' }),
    pedido('X'),
  ],
  unidades, rutaEnCurso, tipos, now
);
assert.deepEqual([...cola.entries()], [['pronto', now], ['tarde', time('2026-10-28T10:00:00')]]);

// La cola no adelanta un plazo: si el límite llega antes que la unidad, manda el límite.
const apurado = adaptPedido(
  pedido('P9', { fechaLimite: '2026-10-28T09:00:00' }), [], now, now, warehouses,
  { ...estimacionBase, salidaPorCola: new Map([['P9', time('2026-10-28T10:00:00')]]) }
);
assert.equal(apurado.estimatedDepartureSimMs, time('2026-10-28T08:48:00'));

// Sin unidades libres manda el plazo: 10 km a 50 km/h son 12 min antes del límite.
const holgado = adaptPedido(pedido('P3'), [], now, now, warehouses, sinUnidad);
const urgente = adaptPedido(pedido('P4', { fechaLimite: '2026-10-28T11:00:00' }), [], now, now, warehouses, sinUnidad);
assert.equal(urgente.estimatedDepartureSimMs, time('2026-10-28T10:48:00'));
assert.deepEqual(ids(classifyWarehouseShipments([holgado, urgente], 'norte', now).upcoming), ['P4']);
// El número cambia con el reloj: el holgado entra cuando su salida límite queda a 4 h o menos.
const entraEn = holgado.estimatedDepartureSimMs! - 4 * HOUR;
assert.deepEqual(ids(classifyWarehouseShipments([holgado], 'norte', entraEn - 1).upcoming), []);
assert.deepEqual(ids(classifyWarehouseShipments([holgado], 'norte', entraEn).upcoming), ['P3']);
// Con el plazo ya imposible no se estima una salida en el pasado.
const vencido = adaptPedido(pedido('P5', { fechaLimite: '2026-10-28T08:05:00' }), [], now, now, warehouses, sinUnidad);
assert.equal(vencido.estimatedDepartureSimMs, now);

// Un pedido despachado sale de "Por salir" y pasa a "En tránsito"; ya no lleva estimación.
const despachado = adaptPedido(
  pedido('P6', { origenX: 50, origenY: 0, fechaSalida: '2026-10-28T07:30:00' }), [], now, now, warehouses, conUnidad('P6')
);
assert.equal(despachado.estimatedDepartureSimMs, undefined);
const enNorte = classifyWarehouseShipments([despachado], 'norte', now);
assert.deepEqual(ids(enNorte.transit), ['P6']);
assert.deepEqual(ids(enNorte.upcoming), []);

// Una ruta aún PLANIFICADA manda sobre la estimación, y solo cuenta dentro de la ventana.
const ruta = (horaSalida: string) =>
  [{ estado: 'PLANIFICADA', secuenciaEntrega: ['P7'], origenX: 0, origenY: 0, horaSalida, vehiculoId: 'TA01' }] as any;
const dentro = adaptPedido(pedido('P7'), ruta('2026-10-28T12:00:00'), now, now, warehouses, conUnidad('P7'));
const fuera = adaptPedido(pedido('P7'), ruta('2026-10-28T12:00:01'), now, now, warehouses, conUnidad('P7'));
assert.equal(dentro.estimatedDepartureSimMs, undefined);
assert.deepEqual(ids(classifyWarehouseShipments([dentro], 'central', now).upcoming), ['P7']);
assert.deepEqual(ids(classifyWarehouseShipments([fuera], 'central', now).upcoming), []);

// Los entregados no vuelven a "Por salir" y salen de su ventana tras 4 h.
const entregado = adaptPedido(
  pedido('P8', { estado: 'ENTREGADA', origenX: 50, origenY: 0, fechaSalida: '2026-10-28T06:00:00', fechaEntrega: '2026-10-28T07:00:00' }),
  [], now, now, warehouses, conUnidad('P8')
);
assert.deepEqual(ids(classifyWarehouseShipments([entregado], 'norte', now).delivered), ['P8']);
assert.deepEqual(ids(classifyWarehouseShipments([entregado], 'norte', entregado.deliveredSimMs! + 4 * HOUR + 1).delivered), []);

assert.deepEqual(classifyWarehouseShipments([libre], 'norte', null).upcoming, []);
// E33 sin ruta: salida estimada + viaje desde el almacén (10 km a 50 km/h = 12 min) + 1 h de servicio.
assert.equal(libre.estimatedDeliverySimMs, time('2026-10-28T09:12:00'));

// E33 con ruta: recorre las paradas pendientes desde la posición actual, sumando viaje y servicio.
const configEntrega = {
  operacion: { tiempoServicioClienteHoras: 1, duracionRefrigerioHoras: 0.5 },
  tiposVehiculo: [{ id: 'AUTO', capacidad: 10, velocidadKmH: 50 }],
} as any;
const paradas = new Map([
  ['hecho', pedido('hecho', { estado: 'ENTREGADA', posX: 5 })],
  ['A', pedido('A', { posX: 50 })],
  ['B', pedido('B', { posX: 100 })],
]);
const rutaAB = [{ estado: 'EN_EJECUCION', vehiculoId: 'TA01', secuenciaEntrega: ['hecho', 'A', 'B'] }] as any;
const enViaje = estimarEntregasEnRuta(
  rutaAB, [{ idUnidad: 'TA01', tipo: 'AUTO', posXActual: 0, posYActual: 0, actividad: 'VIAJANDO' }] as any, paradas, configEntrega, now
);
assert.deepEqual([...enViaje.entries()], [['A', now + 2 * HOUR], ['B', now + 4 * HOUR]]);
// A mitad del servicio en A: A termina al acabar ese servicio, y B viaja desde ahí.
const sirviendo = estimarEntregasEnRuta(
  rutaAB,
  [{ idUnidad: 'TA01', tipo: 'AUTO', posXActual: 50, posYActual: 0, actividad: 'ENTREGANDO', actividadDesde: '2026-10-28T07:30:00' }] as any,
  paradas, configEntrega, now
);
assert.deepEqual([...sirviendo.entries()], [['A', now + 0.5 * HOUR], ['B', now + 2.5 * HOUR]]);
// Una ruta reemplazada no estima nada; la entrega por ruta manda sobre la estimación sin ruta.
assert.equal(estimarEntregasEnRuta([{ ...rutaAB[0], estado: 'REEMPLAZADA' }], [{ idUnidad: 'TA01', tipo: 'AUTO', posXActual: 0, posYActual: 0, actividad: 'VIAJANDO' }] as any, paradas, configEntrega, now).size, 0);
const conRuta = adaptPedido(pedido('A', { posX: 50 }), rutaAB, now, now, warehouses, { ...sinUnidad, entregaEnRuta: enViaje });
assert.equal(conRuta.estimatedDeliverySimMs, now + 2 * HOUR);

// Ventanas de la lista de envíos, con sus dos bordes exactos.
const conEntrega = (estimatedDeliverySimMs?: number, deliveredSimMs?: number) => ({ ...libre, estimatedDeliverySimMs, deliveredSimMs });
assert.equal(isDueSoon(conEntrega(now + 4 * HOUR), now), true);
assert.equal(isDueSoon(conEntrega(now + 4 * HOUR + 1), now), false);
assert.equal(isDueSoon(conEntrega(undefined), now), false);
assert.equal(isDueSoon(conEntrega(undefined, now - 1), now), false);
// Entregado más adelante en el lote que se reproduce: para el reloj visible, aún está por entregar.
assert.equal(isDueSoon(conEntrega(undefined, now + HOUR), now), true);
assert.equal(isDeliveredRecently(conEntrega(undefined, now + HOUR), now), false);
assert.equal(isDeliveredRecently(conEntrega(undefined, now - 4 * HOUR), now), true);
assert.equal(isDeliveredRecently(conEntrega(undefined, now - 4 * HOUR - 1), now), false);

// F03: resalta todas las rutas en curso que llevan el envío, también con entregas parciales.
const rutaDe = (vehicleId: string, status: string, orderIds: string[]) => ({ vehicleId, status, orderIds }) as any;
const rutasF03 = [
  rutaDe('TA01', 'in_progress', ['A', 'X']),
  rutaDe('TA02', 'in_progress', ['A']),
  rutaDe('TA03', 'in_progress', ['Y']),
  rutaDe('TA04', 'blocked', ['A']),
];
assert.deepEqual([...vehicleIdsCarryingOrder({ id: 'A', status: 'on_time' } as any, rutasF03)], ['TA01', 'TA02']);
assert.deepEqual([...vehicleIdsCarryingOrder({ id: 'A', status: 'delivered' } as any, rutasF03)], []);
assert.deepEqual([...vehicleIdsCarryingOrder({ id: 'Z', status: 'on_time' } as any, rutasF03)], []);
assert.deepEqual(
  adaptRuta({ idRuta: 'R', vehiculoId: 'TA01', estado: 'EN_EJECUCION', secuenciaEntrega: ['A'], geometria: ['0,0', '1,0'], costoEstimado: 0, duracionEstimadaHoras: 0 } as any, undefined, paradas, [], 70, 50).orderIds,
  ['A']
);

console.log('OK: envíos por almacén (E20-E22), ventanas de entrega (E32/E33) y rutas del envío (F03).');
