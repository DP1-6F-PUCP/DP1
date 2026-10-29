import assert from 'node:assert/strict';
import { SimulationEngine } from '../src/engine/simulationEngine';
import { parseBackendSimulatedTime as time } from '../src/utils/backendTime';
import { adaptEstadoOperacion } from '../src/utils/backendAdapters';
import fixture from './fixtures/enero-ruta.json';
let real=100000;
Object.defineProperty(performance,'now',{value:()=>real, configurable:true});
const adapted=adaptEstadoOperacion(fixture.estado as any,fixture.config as any,[],time('2026-01-01T00:00:00'));
const order={id:'P0130',code:'P0130',warehouseOriginId:'',destination:{x:56,y:30},arrivalSimMs:time('2026-01-01T01:30:00'),createdMinute:90,deadlineMinute:330,status:'on_time',urgency:'normal'} as const;
const car={...adapted.vehicles[0],trajectory:[{x:27,y:14,t:time('2026-01-01T01:29:00'),act:'VIAJANDO' as const},{x:37,y:14,t:time('2026-01-01T01:31:00'),act:'VIAJANDO' as const}]};
const frame={...adapted,vehicles:[car],orders:[order],estadoRaw:undefined};
const engine=new SimulationEngine();
function feed(mark:string,orders:any[]=[order],id='trial') {
 engine.ingest({vehicles:[car],routes:adapted.routes,frame:{...frame,orders},idEjecucion:id,sa:undefined,marcaTiempoActual:mark,k:1,avanzando:true});
}
feed('2026-01-01T01:29:00');
assert.equal(engine.getEstadoVisual()!.orders.length,0);
real=180000;let snap=engine.advance();
assert.equal(engine.getEstadoVisual()!.orders.length,1);
assert.deepEqual(snap.vehiclePositions.get(car.id),{x:32,y:14});
real=181000;snap=engine.advance();
assert(snap.vehiclePositions.get(car.id)!.x>32,'El vehículo sigue moviéndose entre lotes');
const before=snap.nowSimMs!;
// El siguiente lote llega retrasado y los pedidos todavía no llegaron en la consulta separada.
feed('2026-01-01T01:29:30',[]);
assert(engine.getSnapshotNow().nowSimMs!>=before,'El reloj no retrocede');
assert.equal(engine.getEstadoVisual()!.orders.length,1,'No se borra el pedido por una respuesta vacía');
feed('2026-01-01T01:29:00',[]);
assert(engine.getSnapshotNow().nowSimMs!>=before,'Se ignoran lotes viejos');
let notifications=0;engine.subscribeVisual(()=>notifications++);
const view=engine.getEstadoVisual();
for(let i=0;i<10;i++) engine.getSnapshotNow();
assert.equal(notifications,0,'Leer el reloj no notifica React durante el render');
assert.equal(engine.getEstadoVisual(),view);
real=190000;feed('2026-01-02T00:00:00',[],'new-trial');
feed('2026-01-02T00:00:00',[],'new-trial');
assert.equal(engine.getEstadoVisual()!.orders.length,0,'Otra ejecución no hereda pedidos');
console.log('OK: movimiento interpolado, lotes tardíos, pedidos persistentes, lectura sin efectos y reinicio limpio.');

const initial=new SimulationEngine();
const ingestInitial=(id:string|undefined,mark:string)=>initial.ingest({vehicles:[car],routes:[],frame:{...frame,orders:[]},idEjecucion:id,sa:undefined,marcaTiempoActual:mark,k:1,avanzando:true});
ingestInitial(undefined,'2026-10-28T07:00:00');
ingestInitial('historical','2026-01-01T00:00:00');
ingestInitial('historical','2026-01-01T00:00:00');
assert.equal(initial.getSnapshotNow().nowSimMs,time('2026-01-01T00:00:00'));
console.log('OK: el inicio histórico no conserva el reloj anterior a la ejecución.');
