// Ejecutar únicamente contra un backend aislado en el puerto 18088.
import assert from 'node:assert/strict';
import { QueryClient } from '@tanstack/react-query';
import { iniciarEjecucion, cerrarEjecucion } from '../src/services/scenarioLifecycle';
import { simulationEngine } from '../src/engine/simulationEngine';
import { useScenarioStore } from '../src/store/scenarioStore';
import { parseBackendSimulatedTime } from '../src/utils/backendTime';

const nativeFetch = globalThis.fetch;
globalThis.fetch = (input, options) => nativeFetch(
  typeof input === 'string' && input.startsWith('/api/') ? `http://127.0.0.1:18088${input}` : input, options);
const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
let id: string | null = null;
try {
  for (const fecha of ['2026-01-01T00:00:00Z', '2026-01-01T01:25:00Z']) {
    const before = Date.now();
    const dto = await iniciarEjecucion(client, { tipo: 'CINCO_DIAS', fechaInicioSimulada: fecha });
    id = dto.idEjecucion;
    const snapshot = simulationEngine.getSnapshotNow();
    assert(Math.abs(snapshot.nowSimMs! - parseBackendSimulatedTime(fecha)) < 1000);
    assert.equal(snapshot.buffering, false);
    assert(Date.now() - useScenarioStore.getState().playbackStartedAtMs! < 1000);
    await new Promise(r => setTimeout(r, 1000));
    const avanzado = simulationEngine.advance().nowSimMs! - snapshot.nowSimMs!;
    assert(avanzado >= 140_000 && avanzado < 180_000, `El primer segundo debe avanzar a K=150: ${avanzado}`);
    console.log(JSON.stringify({ fecha, cargaMs: Date.now() - before - 1000, avancePrimerSegundoSimuladoMs: avanzado }));
    await cerrarEjecucion(client, id);
    id = null;
  }
} finally {
  if (id) await cerrarEjecucion(client, id);
  client.clear();
  globalThis.fetch = nativeFetch;
}
