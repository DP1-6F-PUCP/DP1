import { jsPDF } from 'jspdf';
import type { ReporteSimulacionDTO } from '../types/backend';
import { fechaSimuladaReporte, resumenReporte, totalesReporte } from '../utils/simulationReport';

/** Documento paginado: todos los renglones se ajustan al ancho y al alto de la página. */
export function crearReportePdf(reporte: ReporteSimulacionDTO, inicioVisibleMs: number | null) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  let y = 38;
  const encabezado = () => {
    doc.setFillColor(31, 56, 100); doc.rect(0, 0, 210, 27, 'F');
    doc.setTextColor(255); doc.setFont('helvetica', 'bold'); doc.setFontSize(15);
    doc.text('SYSMILE - REPORTE DE SIMULACION', 14, 12);
    doc.setFontSize(9); doc.setFont('helvetica', 'normal');
    doc.text(`Ejecucion: ${reporte.idEjecucion}`, 14, 21);
    doc.setTextColor(35); y = 38;
  };
  encabezado();
  const texto = (value: string, bold = false) => {
    const clean = value.replace(/[→]/g, ' > ').replace(/[–—]/g, '-').replace(/[\u202f\u00a0]/g, ' ');
    doc.setFont('helvetica', bold ? 'bold' : 'normal'); doc.setFontSize(bold ? 11 : 9);
    for (const linea of doc.splitTextToSize(clean, 180)) {
      if (y > 276) { doc.addPage(); encabezado(); doc.setFont('helvetica', bold ? 'bold' : 'normal'); doc.setFontSize(bold ? 11 : 9); }
      doc.text(linea, 14, y); y += bold ? 6 : 4.8;
    }
    y += 2;
  };
  texto('RESUMEN DE LA EJECUCION', true);
  resumenReporte(reporte, inicioVisibleMs).forEach(([label, value]) => texto(`${label}: ${value}`));
  const totales = totalesReporte(reporte);
  texto('RESULTADOS AL FINALIZAR', true);
  texto(`Pedidos recibidos: ${totales.recibidos} | Entregados: ${totales.entregados} | Pendientes: ${totales.pendientes} | Incumplidos: ${totales.incumplidos}`);
  texto(`Costo acumulado estimado: S/ ${reporte.estadoFinal.metricas.costoTotalAcumulado.toFixed(2)}`);
  texto(`Entregas a tiempo: ${reporte.estadoFinal.metricas.porcentajeEntregasATiempo.toFixed(2)}% | Averías: ${reporte.estadoFinal.metricas.contadorAverias}`);
  texto('ULTIMA PLANIFICACION ESTABLE', true);
  texto('Último lote completado sin incumplimientos. Los resultados finales incluyen el lote que causó el cierre.');
  const estable = reporte.ultimaPlanificacionEstable;
  if (!estable) texto('No hubo un lote estable completado antes del cierre.');
  else {
    texto(`Instante: ${fechaSimuladaReporte(estable.marcaTiempoActual)}`);
    const rutas = estable.rutas.filter(r => r.secuenciaEntrega.length > 0);
    texto(`Rutas con pedidos: ${rutas.length}`);
    rutas.forEach(r => texto(`${r.idRuta} | Unidad: ${r.vehiculoId} | ${r.estado} | Pedidos: ${r.secuenciaEntrega.join(' > ')} | Costo: S/ ${r.costoEstimado.toFixed(2)}`));
    texto('ESTADO DE LA FLOTA EN ESA PLANIFICACION', true);
    estable.vehiculos.forEach(v => texto(`${v.idUnidad} | ${v.estado} / ${v.actividad} | Posición: (${v.posXActual}, ${v.posYActual}) | Carga: ${v.cargaActual}`));
    texto('ALMACENES EN ESA PLANIFICACION', true);
    estable.almacenes.forEach(a => texto(`${a.nombre} | Posición: (${a.posX}, ${a.posY}) | Stock: ${a.esCentral ? 'Ilimitado' : `${a.stockActual}/${a.capacidadMaxima}`}`));
    texto('PEDIDOS PENDIENTES EN ESA PLANIFICACION', true);
    const pendientes = reporte.pedidosPlanificacionEstable.filter(p => p.estado !== 'ENTREGADA');
    if (!pendientes.length) texto('Sin pedidos pendientes.');
    pendientes.forEach(p => texto(`${p.idPedido} | Cliente: ${p.idCliente} | ${p.estado} | Destino: (${p.posX}, ${p.posY}) | Cantidad: ${p.cantidadEntregada}/${p.cantidadSolicitada} | Límite: ${fechaSimuladaReporte(p.fechaLimite)}`));
  }
  const incumplidos = reporte.pedidosFinales.filter(p => p.estado === 'INCUMPLIDA');
  if (incumplidos.length) {
    texto('PEDIDOS INCUMPLIDOS AL CIERRE', true);
    incumplidos.forEach(p => texto(`${p.idPedido} | Cliente: ${p.idCliente} | Destino: (${p.posX}, ${p.posY}) | Cantidad: ${p.cantidadEntregada}/${p.cantidadSolicitada} | Límite: ${fechaSimuladaReporte(p.fechaLimite)}`));
  }
  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page++) {
    doc.setPage(page); doc.setFontSize(8); doc.setFont('helvetica', 'normal'); doc.setTextColor(100);
    doc.text(`SYSMILE / PaqRap - Pagina ${page} de ${pages}`, 14, 289);
  }
  return doc;
}
