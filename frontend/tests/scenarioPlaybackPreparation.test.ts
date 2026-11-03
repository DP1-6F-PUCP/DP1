import assert from 'node:assert/strict';
import { SimulationEngine } from '../src/engine/simulationEngine';
import { parseBackendSimulatedTime as time } from '../src/utils/backendTime';

let real = 100_000;
Object.defineProperty(performance, 'now', { value: () => real, configurable: true });
const engine = new SimulationEngine();
const start = time('2026-01-01T00:00:00');
function batch(minutes: number) {
  const mark = new Date(start + minutes * 60_000).toISOString();
  engine.ingest({ vehicles: [], routes: [], idEjecucion: 'enero', sa: 5 / 60, k: 150,
    marcaTiempoActual: mark, avanzando: true,
    frame: { vehicles: [], routes: [], orders: [], warehouses: [], blockedStreets: [],
      estadoRaw: { idEjecucion: 'enero', marcaTiempoActual: mark } as any } });
}
engine.beginExecution('enero', start, true);
batch(12.5);
assert.equal(engine.isPlaybackReady(), false, 'Un lote no cubre Sa más el margen de recepción');
real += 5000; batch(25);
assert.equal(engine.isPlaybackReady(), false);
real += 5000; batch(37.5);
assert.equal(engine.isPlaybackReady(), true);
assert.equal(engine.getSnapshotNow().nowSimMs, start, 'La carga conserva la hora elegida');
engine.startPreparedPlayback();
assert.equal(engine.getSnapshotNow().nowSimMs, start);
assert.equal(engine.getSnapshotNow().buffering, false);
real += 100;
assert.equal(engine.advance().nowSimMs, start + 15_000, 'Avanza desde el primer décimo de segundo visible a K=150');
real += 900;
assert.equal(engine.advance().nowSimMs, start + 150_000);
real += 4000; batch(50);
assert.equal(engine.getSnapshotNow().nowSimMs, start + 750_000, 'El primer lote en vivo no introduce otra espera ni cambia K');
engine.beginExecution('febrero', time('2026-02-01T00:00:00'), true);
assert.equal(engine.isPlaybackReady(), false, 'Otro escenario debe preparar sus propios datos');
assert.equal(engine.getSnapshotNow().buffering, true);
console.log('OK: preparación real, inicio exacto, avance inmediato, K y continuidad del primer lote en vivo.');
