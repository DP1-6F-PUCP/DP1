import { jsPDF } from 'jspdf';
import type { PedidoDTO, ReporteSimulacionDTO } from '../types/backend';
import { duracionReporte, motivosReporte, escenariosReporte, resumenReporte, totalesReporte } from '../utils/simulationReport';
import { parseBackendSimulatedTime } from '../utils/backendTime';

const C = { navy: '#17324d', teal: '#087f8c', blue: '#4479bc', amber: '#bb7918', red: '#b83f49', ink: '#253b50', muted: '#637487', light: '#eef3f7' };
const clean = (s: unknown) => String(s).replace(/→/g, ' > ').replace(/[–—]/g, '-').replace(/[\u202f\u00a0]/g, ' ');
const number = (n: number) => clean(n.toLocaleString('es-PE', { maximumFractionDigits: 2 }));
const money = (n: number) => `S/ ${number(n)}`;
const label = (s: string) => s.toLowerCase().replace(/_/g, ' ').replace(/^./, x => x.toUpperCase());
function date(value: string | null) {
  const ms = parseBackendSimulatedTime(value);
  if (!Number.isFinite(ms)) return 'Sin dato';
  return new Date(ms).toISOString().slice(0, 19).replace('T', ' ');
}

/** PDF vectorial con tablas paginadas. Solo utiliza datos del reporte y cálculos derivados. */
export function crearReportePdf(reporte: ReporteSimulacionDTO, inicioVisibleMs: number | null) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  doc.setProperties({ title: 'SYSMILE - Resultados de simulación', subject: reporte.idEjecucion });
  let y = 40;
  let title = '';
  const text = (s: unknown, x: number, at: number, size = 9, color = C.ink, bold = false) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal'); doc.setFontSize(size); doc.setTextColor(color);
    doc.text(clean(s), x, at);
  };
  const rect = (x: number, at: number, w: number, h: number, color: string) => {
    doc.setFillColor(color); doc.rect(x, at, w, h, 'F');
  };
  const header = () => {
    rect(0, 0, 210, 31, C.navy);
    text('SYSMILE / PaqRap', 15, 10, 9, '#a9dde1', true);
    text(title, 15, 23, 19, '#ffffff', true); y = 42;
  };
  const page = (name: string) => { if (title) doc.addPage(); title = name; header(); };
  const ensure = (height: number) => { if (y + height > 275) { doc.addPage(); header(); } };
  const paragraph = (s: string, color = C.muted) => {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
    const lines = doc.splitTextToSize(clean(s), 180) as string[];
    for (const line of lines) { ensure(5); text(line, 15, y, 9, color); y += 5; }
    y += 3;
  };
  const section = (s: string) => { ensure(20); y += 3; text(s, 15, y, 12, C.navy, true); y += 9; };
  const table = (heads: string[], rows: unknown[][], widths: number[]) => {
    const tableHead = () => {
      rect(15, y, 180, 9, C.navy); let x = 15;
      heads.forEach((h, i) => { text(h, x + 2, y + 6, 8, '#ffffff', true); x += widths[i]; }); y += 9;
    };
    ensure(22); tableHead();
    rows.forEach((row, index) => {
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
      const cells = row.map((v, i) => doc.splitTextToSize(clean(v), widths[i] - 4) as string[]);
      const lineCount = Math.max(1, ...cells.map(v => v.length));
      const rowHeight = lineCount * 4 + 4;
      if (rowHeight <= 224 && y + rowHeight > 275) { doc.addPage(); header(); tableHead(); }
      // Split exceptionally long cells across pages instead of clipping them.
      let offset = 0;
      while (offset < lineCount) {
        if (y + 10 > 275) { doc.addPage(); header(); tableHead(); }
        const count = Math.min(lineCount - offset, Math.max(1, Math.floor((275 - y - 4) / 4)));
        const height = count * 4 + 4;
        if (index % 2 === 0) rect(15, y, 180, height, C.light);
        let x = 15;
        cells.forEach((lines, i) => { lines.slice(offset, offset + count).forEach((line, j) => text(line, x + 2, y + 5 + j * 4, 8)); x += widths[i]; });
        y += height; offset += count;
      }
    }); y += 7;
  };
  const bars = (items: { name: string; value: number; display?: string; color?: string }[], max?: number) => {
    const scale = max ?? Math.max(1, ...items.map(v => v.value));
    items.forEach(item => {
      doc.setFontSize(9); doc.setFont('helvetica', 'normal');
      const lines = doc.splitTextToSize(clean(item.name), 51) as string[];
      const h = Math.max(12, lines.length * 4 + 3); ensure(h);
      lines.forEach((line, i) => text(line, 15, y + 4 + i * 4));
      rect(70, y, 85, 6, C.light);
      if (item.value > 0 && scale > 0) rect(70, y, 85 * Math.min(1, item.value / scale), 6, item.color ?? C.teal);
      text(item.display ?? number(item.value), 159, y + 4.5, 8, C.ink, true); y += h;
    }); y += 3;
  };
  const cards = (items: [string, string, string][]) => {
    ensure(31); items.forEach(([name, value, note], i) => {
      const x = 15 + i * 62; rect(x, y, 56, 29, C.light);
      text(name, x + 4, y + 7, 9, C.muted); text(value, x + 4, y + 18, 21, C.teal, true);
      text(note, x + 4, y + 25, 8, C.muted);
    }); y += 37;
  };
  const counts = (values: string[]) => {
    const result = new Map<string, number>(); values.forEach(v => result.set(v, (result.get(v) ?? 0) + 1));
    return [...result].sort(([a], [b]) => a.localeCompare(b));
  };
  const totals = totalesReporte(reporte);
  const metrics = reporte.estadoFinal.metricas;
  page('Resultados de simulación');
  paragraph(`${escenariosReporte[reporte.tipoEscenario]} | Corte simulado: ${date(reporte.finSimulado)}`);
  paragraph(motivosReporte[reporte.motivoFinalizacion], reporte.motivoFinalizacion === 'COLAPSO' ? C.red : C.teal);
  if (reporte.motivoFinalizacion !== 'PERIODO_COMPLETADO') paragraph('Simulación detenida: los resultados corresponden solo al periodo alcanzado.');
  section('01  Avance de la simulación');
  paragraph(`Tiempo simulado: ${duracionReporte(reporte.duracionSimuladaMs)}`);
  if (reporte.tipoEscenario === 'CINCO_DIAS') {
    const pct = Math.max(0, Math.min(100, reporte.duracionSimuladaMs / (5 * 86400000) * 100));
    bars([{ name: 'Horizonte de 5 días', value: pct, display: `${number(pct)} %` }], 100);
  } else paragraph('Este escenario no tiene un horizonte fijo de cinco días; no se calcula un porcentaje de avance.');
  const pct = (v: number) => totals.recibidos ? `${number(v / totals.recibidos * 100)} % del total` : 'Sin pedidos registrados';
  cards([['Recibidos', number(totals.recibidos), 'Acumulado al cierre'], ['Entregados', number(totals.entregados), pct(totals.entregados)], ['Pendientes', number(totals.pendientes), pct(totals.pendientes)]]);
  section('02  Resultado del servicio');
  bars([{ name: 'Entregados', value: totals.entregados }, { name: 'Pendientes', value: totals.pendientes, color: C.amber }, { name: 'Incumplidos', value: totals.incumplidos, color: C.red }], Math.max(1, totals.recibidos));
  table(['Indicador', 'Resultado'], [
    ['Costo acumulado (km recorridos)', money(metrics.costoTotalAcumulado)],
    ['Cumplimiento sobre pedidos resueltos', metrics.contadorEntregados + metrics.contadorIncumplidos ? `${number(metrics.porcentajeEntregasATiempo)} %` : 'No aplica: sin pedidos resueltos'],
    ['Averías registradas', metrics.contadorAverias],
  ], [120, 60]);
  paragraph('Cumplimiento = entregados / (entregados + incumplidos). Los pendientes no cuentan.');

  const stable = reporte.ultimaPlanificacionEstable;
  page('Rutas de la planificación');
  if (!stable) paragraph('No hubo un plan estable antes del cierre: no hay rutas, flota ni almacenes que mostrar.');
  else {
    paragraph(`Última planificación estable: ${date(stable.marcaTiempoActual)}. Este corte puede ser anterior al estado final.`);
    const routes = stable.rutas.filter(r => r.secuenciaEntrega.length > 0);
    section('03  Rutas con pedidos');
    paragraph(`${routes.length} rutas listadas | Suma de costos estimados: ${money(routes.reduce((s, r) => s + r.costoEstimado, 0))}`);
    paragraph('Esta suma corresponde solo a las rutas listadas, no al costo acumulado.');
    bars(counts(routes.map(r => r.estado)).map(([name, value]) => ({ name: label(name), value })));
    if (!routes.length) paragraph('Sin rutas con pedidos en esta planificación.');
    else table(['Unidad / ruta', 'Estado', 'Secuencia de pedidos', 'Costo'], routes.map(r => [`${r.vehiculoId}\n${r.idRuta}`, label(r.estado), r.secuenciaEntrega.join(' > '), money(r.costoEstimado)]), [47, 29, 76, 28]);
    section('Rutas de mayor costo (hasta 5)');
    const top = [...routes].sort((a, b) => b.costoEstimado - a.costoEstimado).slice(0, 5);
    bars(top.map((r, i) => ({ name: `${i + 1}. ${r.vehiculoId}`, value: r.costoEstimado, display: money(r.costoEstimado) })));
    page('Flota y abastecimiento');
    paragraph(`Fotografía de la última planificación estable: ${date(stable.marcaTiempoActual)}`);
    section('04  Estado de la flota');
    paragraph(`${stable.vehiculos.length} unidades registradas. Estos estados describen un instante, no toda la simulación.`);
    bars(counts(stable.vehiculos.map(v => v.estado)).map(([name, value]) => ({ name: label(name), value })));
    table(['Tipo de vehículo', 'En ruta', 'Disponibles', 'Mant.', 'Averiados', 'Total'], counts(stable.vehiculos.map(v => v.tipo)).map(([type, total]) => {
      const units = stable.vehiculos.filter(v => v.tipo === type);
      return [type, ...['EN_RUTA', 'DISPONIBLE', 'EN_MANTENIMIENTO', 'AVERIADO'].map(s => units.filter(v => v.estado === s).length), total];
    }), [55, 25, 30, 20, 27, 23]);
    section('05  Stock en almacenes');
    if (!stable.almacenes.length) paragraph('Sin almacenes registrados.');
    stable.almacenes.forEach(a => {
      if (a.esCentral) paragraph(`${a.nombre}: stock ilimitado según la configuración.`);
      else if (a.capacidadMaxima > 0) bars([{ name: a.nombre, value: a.stockActual / a.capacidadMaxima * 100, display: `${number(a.stockActual / a.capacidadMaxima * 100)} %` }], 100);
      else paragraph(`${a.nombre}: capacidad no válida; no se calcula porcentaje.`);
    });
    table(['Almacén', 'Posición X, Y', 'Stock actual', 'Capacidad'], stable.almacenes.map(a => [a.nombre, `${a.posX}, ${a.posY}`, a.esCentral ? 'Ilimitado' : number(a.stockActual), a.esCentral ? 'No aplica' : number(a.capacidadMaxima)]), [55, 40, 45, 40]);
    paragraph('El stock es una fotografía al corte; no equivale al consumo acumulado. Cantidades expresadas en la unidad configurada en el sistema.');
  }
  page('Pedidos pendientes al cierre');
  section('06  Pedidos por atender');
  const pending = reporte.pedidosFinales.filter(p => p.estado === 'PENDIENTE');
  const cutoff = parseBackendSimulatedTime(reporte.finSimulado);
  const remaining = (p: PedidoDTO) => parseBackendSimulatedTime(p.fechaLimite) - cutoff;
  const sorted = (ps: PedidoDTO[]) => [...ps].sort((a, b) => (Number.isFinite(remaining(a)) ? remaining(a) : Infinity) - (Number.isFinite(remaining(b)) ? remaining(b) : Infinity));
  paragraph(`${pending.length} pedidos pendientes | Cantidad por entregar: ${number(pending.reduce((s, p) => s + Math.max(0, p.cantidadSolicitada - p.cantidadEntregada), 0))}`);
  paragraph(`Plazos calculados desde el cierre: ${date(reporte.finSimulado)}. No se utiliza el reloj real.`);
  const buckets = [0, 0, 0, 0, 0, 0];
  pending.forEach(p => { const h = remaining(p) / 3600000; buckets[!Number.isFinite(h) ? 5 : h < 0 ? 0 : h <= 4 ? 1 : h <= 12 ? 2 : h <= 24 ? 3 : 4]++; });
  bars(['Vencidos', 'Hasta 4 h', 'Más de 4 a 12 h', 'Más de 12 a 24 h', 'Más de 24 h', 'Sin fecha válida'].map((name, i) => ({ name, value: buckets[i], color: i === 0 ? C.red : C.amber })));
  const orderTable = (ps: PedidoDTO[], showRemaining = false) => table(['Pedido / cliente', 'Destino', 'Entregado / solicitado', showRemaining ? 'Límite / tiempo restante' : 'Fecha límite'], sorted(ps).map(p => {
    const ms = remaining(p);
    const time = !Number.isFinite(ms) ? 'Sin dato' : `${ms < 0 ? 'Vencido hace ' : ''}${duracionReporte(Math.abs(ms))}`;
    return [`${p.idPedido}\n${p.idCliente}`, `${p.posX}, ${p.posY}`, `${p.cantidadEntregada} / ${p.cantidadSolicitada}`, `${date(p.fechaLimite)}${showRemaining ? `\n${time}` : ''}`];
  }), [59, 23, 42, 56]);
  if (pending.length) orderTable(pending, true); else paragraph('Sin pedidos pendientes al cierre.');
  paragraph('Un vencimiento próximo no demuestra que habrá retraso: se requiere una hora estimada de entrega para evaluar ese riesgo.');
  const failed = reporte.pedidosFinales.filter(p => p.estado === 'INCUMPLIDA');
  if (failed.length) { section('PEDIDOS INCUMPLIDOS AL CIERRE'); orderTable(failed); }
  page('Ficha técnica y anexos');
  section('07  Datos de la simulación');
  table(['Campo', 'Valor'], [['Identificador', reporte.idEjecucion], ...resumenReporte(reporte, inicioVisibleMs)], [69, 111]);
  paragraph('Fechas simuladas conservadas sin conversión de zona horaria. Fechas reales de esta ficha expresadas en la zona del navegador.');
  if (stable) {
    section('Detalle de la flota en la planificación estable');
    table(['Unidad / tipo', 'Estado / actividad', 'Posición X, Y', 'Carga'], stable.vehiculos.map(v => [`${v.idUnidad}\n${v.tipo}`, `${label(v.estado)}\n${label(v.actividad)}`, `${v.posXActual}, ${v.posYActual}`, number(v.cargaActual)]), [43, 73, 39, 25]);
    section('Pedidos por atender en la planificación estable');
    paragraph(`Corte: ${date(stable.marcaTiempoActual)}. Este anexo conserva el detalle del corte estable; no debe sumarse a los pendientes finales.`);
    const historical = reporte.pedidosPlanificacionEstable.filter(p => p.estado !== 'ENTREGADA');
    if (historical.length) orderTable(historical); else paragraph('Sin pedidos por atender en esta planificación.');
  }
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) { doc.setPage(p); text('SYSMILE / PaqRap - Reporte de simulación', 15, 289, 8, C.muted); text(`${p} / ${pages}`, 179, 289, 8, C.muted); }
  return doc;
}
