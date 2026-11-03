import assert from 'node:assert/strict';
import { SimulationEngine } from '../src/engine/simulationEngine';
let real = 100_000;
Object.defineProperty(performance, 'now', { value: () => real, configurable: true });
const engine = new SimulationEngine();
const closure = { secuenciaNodos: ['2,3', '3,3'], fechaInicio: '2026-01-01T00:05:00',
  fechaFin: '2026-01-01T00:15:00', vigente: false };
function feed(mark: string) {
  engine.ingest({ vehicles: [], routes: [], idEjecucion: 'enero', sa: undefined, k: 240,
    marcaTiempoActual: mark, avanzando: true,
    frame: { vehicles: [], routes: [], orders: [], warehouses: [], blockedStreets: [],
      estadoRaw: { idEjecucion: 'enero', marcaTiempoActual: mark, bloqueos: [closure] } as any } });
}
feed('2026-01-01T00:00:00');
real += 5000; feed('2026-01-01T00:20:00');
real = 121_249; engine.advance();
assert.equal(engine.getEstadoVisual()!.blockedStreets.length, 0, 'No mostrar el bloqueo antes de las 00:05');
real = 121_250; engine.advance();
assert.equal(engine.getEstadoVisual()!.blockedStreets.length, 1, 'Aparece a las 00:05 aunque el backend ya haya terminado ese lote');
real = 123_750; engine.advance();
assert.equal(engine.getEstadoVisual()!.blockedStreets.length, 1, 'Incluye el instante final de vigencia');
real += 1; engine.advance();
assert.equal(engine.getEstadoVisual()!.blockedStreets.length, 0, 'Desaparece al vencer, sin esperar otro lote');
console.log('OK: bloqueos sincronizados con el reloj visible, incluida activación y vencimiento dentro del lote.');
