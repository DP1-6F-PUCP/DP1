import assert from 'node:assert/strict';
import { adaptVehiculo } from '../src/utils/backendAdapters';
import {
  BREAKDOWN_LEVEL_CONFIGS,
  getBreakdownLevelConfig,
  getVehicleSemaforoStatus,
  VEHICLE_TYPE_META,
} from '../src/utils/vehicleBreakdown';
import { parseBackendSimulatedTime } from '../src/utils/backendTime';
import { simulationEngine } from '../src/engine/simulationEngine';
import type { ConfiguracionActualDTO } from '../src/types/backend';

const configMock: ConfiguracionActualDTO = {
  ciudad: { anchoKm: 70, altoKm: 50, velocidadPromedioKmH: 50 },
  operacion: {
    duracionTurnoHoras: 8,
    tiempoMaximoConduccionHoras: 7,
    duracionRefrigerioHoras: 1,
    intervaloLoteHoras: 1,
    umbralLoteCantidad: 1,
    tiempoServicioClienteHoras: 0.5,
    capacidadAlmacenIntermedio: 20,
    tiempoEsperaEnOficinaHoras: 2,
  },
  tiposVehiculo: [
    { tipo: 'AUTO', velocidadKmH: 50, capacidad: 25, tiempoRecargaHoras: 0, consumoPorKm: 1 },
    { tipo: 'MOTO', velocidadKmH: 60, capacidad: 4, tiempoRecargaHoras: 0, consumoPorKm: 1 },
    { tipo: 'BICICLETA', velocidadKmH: 15, capacidad: 2, tiempoRecargaHoras: 0, consumoPorKm: 0 },
  ],
};

// 1. Verificar mapeo de los 3 tipos de vehículo (TA, TM, TB) y los 3 niveles de avería (TIPO_1, TIPO_2, TIPO_3)
const vAutoT1 = adaptVehiculo(
  {
    idUnidad: 'TA01',
    tipo: 'AUTO',
    estado: 'AVERIADO',
    actividad: 'DETENIDO',
    actividadDesde: null,
    posXActual: 25,
    posYActual: 18,
    cargaActual: 10,
    combustibleActual: 100,
    horasConduccionAcumuladas: 2,
    refrigTomadoEnTurno: false,
    tipoAveria: 'TIPO_1',
    geometriaRetorno: [],
    trayectoria: [],
  },
  configMock,
  [],
  new Map(),
  null,
);
assert.equal(vAutoT1.type, 'car');
assert.equal(VEHICLE_TYPE_META[vAutoT1.type].codePrefix, 'TA');
assert.equal(vAutoT1.status, 'broken');
assert.equal(vAutoT1.breakdownType, 1);
assert.equal(vAutoT1.breakdownInfo?.type, 1);
assert.equal(vAutoT1.breakdownInfo?.maxSiteStayMinutes, 120);
assert.equal(vAutoT1.breakdownInfo?.towedToCentral, false);
assert.ok(vAutoT1.breakdownReason?.includes('2 horas'));

const vMotoT2 = adaptVehiculo(
  {
    idUnidad: 'TM02',
    tipo: 'MOTO',
    estado: 'AVERIADO',
    actividad: 'DETENIDO',
    actividadDesde: null,
    posXActual: 40,
    posYActual: 30,
    cargaActual: 3,
    combustibleActual: 80,
    horasConduccionAcumuladas: 3,
    refrigTomadoEnTurno: false,
    tipoAveria: 'TIPO_2',
    geometriaRetorno: [],
    trayectoria: [],
  },
  configMock,
  [],
  new Map(),
  null,
);
assert.equal(vMotoT2.type, 'motorcycle');
assert.equal(VEHICLE_TYPE_META[vMotoT2.type].codePrefix, 'TM');
assert.equal(vMotoT2.breakdownType, 2);
assert.equal(vMotoT2.breakdownInfo?.type, 2);
assert.equal(vMotoT2.breakdownInfo?.maxSiteStayMinutes, 240);
assert.equal(vMotoT2.breakdownInfo?.towedToCentral, true);
assert.ok(vMotoT2.breakdownReason?.includes('4 horas'));

const vBiciT3 = adaptVehiculo(
  {
    idUnidad: 'TB03',
    tipo: 'BICICLETA',
    estado: 'AVERIADO',
    actividad: 'DETENIDO',
    actividadDesde: null,
    posXActual: 15,
    posYActual: 22,
    cargaActual: 1,
    combustibleActual: 0,
    horasConduccionAcumuladas: 1,
    refrigTomadoEnTurno: false,
    tipoAveria: 'TIPO_3',
    geometriaRetorno: [],
    trayectoria: [],
  },
  configMock,
  [],
  new Map(),
  null,
);
assert.equal(vBiciT3.type, 'bicycle');
assert.equal(VEHICLE_TYPE_META[vBiciT3.type].codePrefix, 'TB');
assert.equal(vBiciT3.breakdownType, 3);
assert.equal(vBiciT3.breakdownInfo?.type, 3);
assert.equal(vBiciT3.breakdownInfo?.maxSiteStayMinutes, 240);
assert.equal(vBiciT3.breakdownInfo?.towedToCentral, true);
assert.ok(vBiciT3.breakdownReason?.includes('15:00 a 23:00'));

// 2. Verificar semáforo diferenciado por nivel de avería (A1, A2, A3)
const semT1 = getVehicleSemaforoStatus(vAutoT1, [], 0);
const semT2 = getVehicleSemaforoStatus(vMotoT2, [], 0);
const semT3 = getVehicleSemaforoStatus(vBiciT3, [], 0);

assert.equal(semT1.shortLabel, 'A1');
assert.equal(semT1.hex, BREAKDOWN_LEVEL_CONFIGS[1].hex);
assert.equal(semT2.shortLabel, 'A2');
assert.equal(semT2.hex, BREAKDOWN_LEVEL_CONFIGS[2].hex);
assert.equal(semT3.shortLabel, 'A3');
assert.equal(semT3.hex, BREAKDOWN_LEVEL_CONFIGS[3].hex);
assert.notEqual(semT1.hex, semT2.hex);
assert.notEqual(semT2.hex, semT3.hex);
assert.equal(getBreakdownLevelConfig(undefined), null);

// 3. Verificar permanencia de 4 horas en el lugar de la avería y traslado instantáneo al Almacén Central (Tipo 2 y 3)
const tAveria = '2026-10-28T08:00:00';
const tTraslado = '2026-10-28T12:00:00'; // +4 horas
const tFinLote = '2026-10-28T13:00:00';
const vConTrayectoriaTraslado = adaptVehiculo(
  {
    idUnidad: 'TA09',
    tipo: 'AUTO',
    estado: 'AVERIADO',
    actividad: 'DETENIDO',
    actividadDesde: null,
    posXActual: 12,
    posYActual: 8,
    cargaActual: 5,
    combustibleActual: 90,
    horasConduccionAcumuladas: 2,
    refrigTomadoEnTurno: false,
    tipoAveria: 'TIPO_2',
    geometriaRetorno: [],
    trayectoria: [
      { x: 44, y: 28, instante: tAveria, actividad: 'DETENIDO' },
      { x: 44, y: 28, instante: tTraslado, actividad: 'DETENIDO' },
      { x: 12, y: 8, instante: tTraslado, actividad: 'DETENIDO' },
      { x: 12, y: 8, instante: tFinLote, actividad: 'DETENIDO' },
    ],
  },
  configMock,
  [],
  new Map(),
  null,
);

let realMs = 100000;
Object.defineProperty(performance, 'now', { value: () => realMs, configurable: true });

// A las 11:59:00 (3h 59m después de la avería), debe seguir en el sitio de la avería (44, 28)
simulationEngine.ingest({
  vehicles: [vConTrayectoriaTraslado],
  routes: [],
  frame: {
    vehicles: [vConTrayectoriaTraslado],
    routes: [],
    orders: [],
    warehouses: [],
    blockedStreets: [],
    estadoRaw: undefined,
  },
  idEjecucion: 'test-averia-4h',
  sa: undefined,
  marcaTiempoActual: '2026-10-28T11:59:00',
  k: 1,
  avanzando: true,
});
realMs = 120000; // compensa el delay de 20s del motor -> reloj visual en 11:59:00
simulationEngine.advance();
const posAntesDe4h = simulationEngine.getEstadoVisual()?.vehicles[0]?.position;
assert.deepEqual(posAntesDe4h, { x: 44, y: 28 });

// A las 12:00:01 (cumplidas las 4h), se traslada de manera instantánea al Almacén Central (12, 8)
realMs = 120000 + 61000;
simulationEngine.advance();
const posDespuesDe4h = simulationEngine.getEstadoVisual()?.vehicles[0]?.position;
assert.deepEqual(posDespuesDe4h, { x: 12, y: 8 });
assert.equal(parseBackendSimulatedTime(tTraslado) - parseBackendSimulatedTime(tAveria), 4 * 3600 * 1000);

console.log('OK: diferenciación de tipos de vehículo (TA/TM/TB), niveles de avería (A1/A2/A3) y traslado instantáneo tras 4h en sitio.');
