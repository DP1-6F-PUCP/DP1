import assert from 'node:assert/strict';
import { fixedDashOffset, routeLineKey } from '../src/utils/routeLine';
import { SimulationEngine } from '../src/engine/simulationEngine';

const PERIODO = 14;
const destino = { x: 10, y: 5 };
// Fase del patrón en un punto fijo del mapa, para una línea que empieza en el vehículo: debe ser la
// misma aunque el vehículo avance.
const fase = (xVehiculo: number, xPunto: number, escala: number) => {
  const camino = [{ x: xVehiculo, y: 0 }, { x: 10, y: 0 }, destino];
  const offset = fixedDashOffset(camino, escala, '6, 8')!;
  return ((xPunto - xVehiculo) * escala + offset) % PERIODO;
};
for (const escala of [1, 2.5, 8, 16]) {
  const referencia = fase(0, 9, escala);
  for (const x of [0.1, 1, 3.7, 6, 8.5]) {
    assert.ok(Math.abs(fase(x, 9, escala) - referencia) < 1e-9, `fase distinta en x=${x}, escala=${escala}`);
  }
}

const offset = fixedDashOffset([{ x: 0, y: 0 }, { x: 3, y: 0 }], 2, '2, 8')!;
assert.ok(offset >= 0 && offset < 10);
assert.equal(fixedDashOffset([{ x: 0, y: 0 }, { x: 7, y: 0 }], 1, '6, 8'), 7);
assert.equal(fixedDashOffset([{ x: 0, y: 0 }, { x: 14, y: 0 }], 1, '6, 8'), 0);
assert.equal(fixedDashOffset([{ x: 0, y: 0 }, { x: 1, y: 0 }], 1, ''), null);

assert.equal(routeLineKey([{ x: 1, y: 2 }, { x: 3, y: 2 }]), routeLineKey([{ x: 1, y: 2 }, { x: 3, y: 2 }]));
assert.notEqual(routeLineKey([{ x: 1, y: 2 }, { x: 3, y: 2 }]), routeLineKey([{ x: 1.5, y: 2 }, { x: 3, y: 2 }]));

// Retorno dentro del lote: sigue siendo entrega hasta que pasa su última parada, y después es regreso.
const engine = new SimulationEngine() as any;
engine.lineas.set('TA01', [
  { x: 0, y: 0, t: 100, act: 'VIAJANDO' },
  { x: 5, y: 0, t: 200, act: 'ENTREGANDO' },
  { x: 5, y: 0, t: 300, act: 'VIAJANDO' },
  { x: 0, y: 0, t: 400, act: 'INACTIVO' },
]);
const conReloj = (t: number) => {
  engine.ultimoSimNow = t;
  return engine.sinEntregasPendientes('TA01');
};
assert.equal(conReloj(150), false);
assert.equal(conReloj(199), false);
assert.equal(conReloj(200), true);
assert.equal(conReloj(350), true);
assert.equal(engine.sinEntregasPendientes('TA99'), false);
engine.ultimoSimNow = null;
assert.equal(engine.sinEntregasPendientes('TA01'), false);

console.log('OK: punteado fijo, detección de cambios de trazado y regreso de la unidad dentro del lote.');
