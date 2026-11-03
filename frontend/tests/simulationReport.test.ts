import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { crearReportePdf } from '../src/services/simulationReportPdf';
import { SimulationFinishedModal } from '../src/components/SimulationFinishedModal';
import { resumenReporte, totalesReporte } from '../src/utils/simulationReport';
import type { ReporteSimulacionDTO } from '../src/types/backend';
import fixture from './fixtures/enero-ruta.json';

const pedido = { idPedido: 'P1', idCliente: 'C1', estado: 'PENDIENTE' as const, posX: 56, posY: 30,
  cantidadSolicitada: 2, cantidadEntregada: 0, fechaIngreso: '2026-01-01T01:30:00',
  fechaLimite: '2026-01-01T02:30:00', horasLimite: 1 };
const reporte: ReporteSimulacionDTO = {
  idEjecucion: 'prueba-reporte', tipoEscenario: 'COLAPSO_LOGISTICO', motivoFinalizacion: 'COLAPSO',
  inicioReal: '2026-11-02T20:00:00Z', finReal: '2026-11-02T20:02:00Z', duracionRealMs: 120_000,
  inicioSimulado: '2026-01-01T00:00:00', finSimulado: '2026-01-01T02:37:30', duracionSimuladaMs: 9_450_000,
  estadoFinal: fixture.estado as any,
  pedidosFinales: [{ ...pedido, estado: 'INCUMPLIDA' }, { ...pedido, idPedido: 'P2', estado: 'ENTREGADA' }, { ...pedido, idPedido: 'P3' }],
  ultimaPlanificacionEstable: { ...fixture.estado, marcaTiempoActual: '2026-01-01T02:25:00',
    vehiculos: Array.from({ length: 37 }, (_, i) => ({ ...fixture.estado.vehiculos[0], idUnidad: `TA${i + 1}` })) } as any,
  pedidosPlanificacionEstable: [pedido, { ...pedido, idPedido: 'P3' }],
};
assert.deepEqual(totalesReporte(reporte), { recibidos: 3, entregados: 1, pendientes: 1, incumplidos: 1 });
const inicioVisible = Date.parse('2026-11-02T20:00:10Z');
const resumen = resumenReporte(reporte, inicioVisible);
assert(resumen.some(([k, v]) => k === 'Tiempo transcurrido real' && v.endsWith('01min 50s')));
assert(resumen.some(([k, v]) => k === 'Tiempo simulado' && v.includes('02h 37min 30s')));
for (const motivo of ['COLAPSO', 'PARADA_MANUAL', 'PERIODO_COMPLETADO'] as const) {
  const markup = renderToStaticMarkup(createElement(SimulationFinishedModal, { isOpen: true,
    onAccept() {}, reporte: { ...reporte, motivoFinalizacion: motivo }, inicioVisibleMs: inicioVisible,
    isError: false, onRetry() {} }));
  assert(markup.includes('Reporte de simulación finalizada'));
  assert(markup.includes('Última planificación estable'));
  assert(markup.includes('Descargar PDF'));
}
const documento = crearReportePdf(reporte, inicioVisible);
assert(documento.getNumberOfPages() > 1, 'La flota y las rutas deben paginarse');
const contenido = documento.output();
assert(!contenido.includes('NaN'));
assert(contenido.includes('P3'));
assert(contenido.includes('PEDIDOS INCUMPLIDOS AL CIERRE'));
const vacio = crearReportePdf({ ...reporte, ultimaPlanificacionEstable: null, pedidosPlanificacionEstable: [], pedidosFinales: [] }, null);
assert(vacio.output().includes('No hubo un lote estable'));
if (process.env.SYSMILE_REPORT_PREVIEW) {
  writeFileSync(process.env.SYSMILE_REPORT_PREVIEW, Buffer.from(documento.output('arraybuffer')));
}
console.log(`OK: tres motivos de cierre, tiempos separados, totales, planificación estable y PDF de ${documento.getNumberOfPages()} páginas.`);
