import assert from 'node:assert/strict';
import { adaptPedido } from '../src/utils/backendAdapters';
import { ordersAtSimulatedTime } from '../src/utils/orderVisibility';
import { parseBackendSimulatedTime } from '../src/utils/backendTime';
import { simulationEngine } from '../src/engine/simulationEngine';

const arrival = parseBackendSimulatedTime('2026-10-28T01:30:00');
const start = parseBackendSimulatedTime('2026-10-28T00:00:00');
const order = adaptPedido({idPedido:'P0130',idCliente:'C1',estado:'PENDIENTE',posX:1,posY:2,cantidadSolicitada:1,cantidadEntregada:0,fechaIngreso:'2026-10-28T01:30:00',horasLimite:4,fechaLimite:'2026-10-28T05:30:00'}, [], start, start);
assert.equal(order.createdMinute, 90);
assert.equal(order.deadlineMinute, 330);
assert.equal(order.arrivalSimMs, arrival);
assert.equal(ordersAtSimulatedTime([order],arrival-1).length,0);
assert.equal(ordersAtSimulatedTime([order],arrival).length,1);
assert.equal(ordersAtSimulatedTime([order],arrival+1).length,1);
assert.equal(ordersAtSimulatedTime([order],null).length,0);
assert.equal(ordersAtSimulatedTime([{...order,arrivalSimMs:NaN}],arrival).length,0);
const tomorrow={...order,id:'tomorrow',arrivalSimMs:arrival+86400000};
assert.deepEqual(ordersAtSimulatedTime([order,tomorrow],arrival).map(p=>p.id),['P0130']);

// Un solo lote, sin vehículos: el pedido debe aparecer al cruzar la hora sin otro fetch.
let real=100000;
Object.defineProperty(performance,'now',{value:()=>real,configurable:true});
simulationEngine.ingest({vehicles:[],routes:[],frame:{vehicles:[],routes:[],orders:[order,tomorrow],warehouses:[],blockedStreets:[],estadoRaw:undefined},idEjecucion:'test',sa:undefined,marcaTiempoActual:'2026-10-28T01:29:00',k:1,avanzando:true});
let notifications=0;
const unsubscribe=simulationEngine.subscribeVisual(()=>notifications++);
real=179999; // retraso de 20 s + 59.999 s simulados
simulationEngine.advance();
assert.equal(simulationEngine.getEstadoVisual()?.orders.length,0);
const before=notifications;
real=180000;
simulationEngine.advance();
assert.deepEqual(simulationEngine.getEstadoVisual()?.orders.map(p=>p.id),['P0130']);
assert.equal(notifications,before+1);
real=180001;
simulationEngine.advance();
assert.equal(notifications,before+1); // referencia estable, no notificar cada frame
unsubscribe();
console.log('OK: llegada exacta, medianoche, zona horaria, reloj desconocido y aparición dentro del mismo lote.');
