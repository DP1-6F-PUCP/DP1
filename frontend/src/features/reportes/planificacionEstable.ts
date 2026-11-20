import { jsPDF } from 'jspdf';
import type { Order } from '../../types';
import type { PedidoDTO, RutaDTO } from '../../types/backend';
import { formatFechaHoraCorta, parseBackendSimulatedTime } from '../../utils/backendTime';
import { duracionCorta } from '../../utils/estadoPedidos';

/**
 * "Planificación estable" (regla del profesor): el último plan completo enviado al visualizador.
 * Se muestra por pedido: vehículo, ruta y orden de parada, salida, ETA, límite y estado.
 * Fuente en curso: las rutas EN_EJECUCION / PLANIFICADA del último lote recibido. Al terminar:
 * ReporteSimulacionDTO.ultimaPlanificacionEstable (+ pedidosPlanificacionEstable).
 */
export interface FilaPlan {
  pedido: string;
  cliente: string;
  cantidad: number | null;
  vehiculo: string;
  tipoVehiculo: string;
  ruta: string;
  estadoRuta: string;
  parada: number;
  paradas: number;
  salidaMs: number | null;
  etaMs: number | null;
  /** true si la hora de entrega es real (ya entregado), false si es estimada. */
  etaReal: boolean;
  limiteMs: number | null;
  /** límite − ETA; negativo = llegaría tarde. */
  holguraMs: number | null;
  estado: string;
  /** Para colorear: a tiempo / en riesgo / retrasado / entregado. */
  nivel: 'on_time' | 'at_risk' | 'delayed' | 'delivered' | 'collapsed';
}

const ESTADO_RUTA: Record<string, string> = {
  EN_EJECUCION: 'En ejecución', PLANIFICADA: 'Planificada', FINALIZADA: 'Finalizada', REEMPLAZADA: 'Reemplazada',
};
export const ESTADO_PEDIDO: Record<FilaPlan['nivel'], string> = {
  on_time: 'A tiempo', at_risk: 'En riesgo', delayed: 'Retrasado', collapsed: 'Colapsado', delivered: 'Entregado',
};
const ORDEN_RUTA: Record<string, number> = { EN_EJECUCION: 0, PLANIFICADA: 1 };

const finito = (n: number | null | undefined) => (n != null && Number.isFinite(n) ? n : null);
const rutasVigentes = (rutas: RutaDTO[]) => rutas
  .filter((r) => (r.estado === 'EN_EJECUCION' || r.estado === 'PLANIFICADA') && r.secuenciaEntrega.length > 0)
  .sort((a, b) => (ORDEN_RUTA[a.estado] ?? 9) - (ORDEN_RUTA[b.estado] ?? 9) || a.vehiculoId.localeCompare(b.vehiculoId));

function fila(r: RutaDTO, idPedido: string, i: number, info: Omit<FilaPlan, 'pedido' | 'vehiculo' | 'tipoVehiculo' | 'ruta' | 'estadoRuta' | 'parada' | 'paradas' | 'salidaMs' | 'holguraMs'>): FilaPlan {
  return {
    ...info,
    pedido: idPedido,
    vehiculo: r.vehiculoId,
    tipoVehiculo: r.tipoVehiculo,
    ruta: r.idRuta,
    estadoRuta: ESTADO_RUTA[r.estado] ?? r.estado,
    parada: i + 1,
    paradas: r.secuenciaEntrega.length,
    salidaMs: finito(parseBackendSimulatedTime(r.horaSalida ?? null)),
    holguraMs: info.limiteMs != null && info.etaMs != null ? info.limiteMs - info.etaMs : null,
  };
}

/** Plan en curso: rutas del último lote + datos de cada pedido adaptados (Order). */
export function filasDesdeOperacion(rutas: RutaDTO[], orders: Order[]): FilaPlan[] {
  const porId = new Map(orders.map((o) => [o.id, o]));
  return rutasVigentes(rutas).flatMap((r) => r.secuenciaEntrega.map((id, i) => {
    const o = porId.get(id);
    const entregado = o?.status === 'delivered' && o.deliveredSimMs != null;
    return fila(r, id, i, {
      cliente: o?.clientId ?? '—',
      cantidad: o?.quantity ?? null,
      etaMs: finito(entregado ? o?.deliveredSimMs : o?.estimatedDeliverySimMs),
      etaReal: entregado,
      limiteMs: finito(o?.deadlineSimMs),
      estado: o ? ESTADO_PEDIDO[o.status] : 'Sin datos',
      nivel: o?.status ?? 'on_time',
    });
  }));
}

/** Plan del reporte final (DTOs del backend). */
export function filasDesdeReporte(rutas: RutaDTO[], pedidos: PedidoDTO[], corteMs: number | null): FilaPlan[] {
  const porId = new Map(pedidos.map((p) => [p.idPedido, p]));
  return rutasVigentes(rutas).flatMap((r) => r.secuenciaEntrega.map((id, i) => {
    const p = porId.get(id);
    const limiteMs = finito(parseBackendSimulatedTime(p?.fechaLimite ?? null));
    const entregaMs = finito(parseBackendSimulatedTime(p?.fechaEntrega ?? null));
    const nivel: FilaPlan['nivel'] = p?.estado === 'ENTREGADA' ? 'delivered' : p?.estado === 'INCUMPLIDA' ? 'delayed'
      : limiteMs != null && corteMs != null && limiteMs - corteMs <= 3_600_000 ? 'at_risk' : 'on_time';
    return fila(r, id, i, {
      cliente: p?.idCliente ?? '—',
      cantidad: p?.cantidadSolicitada ?? null,
      etaMs: entregaMs,
      etaReal: entregaMs != null,
      limiteMs,
      estado: p?.estado === 'INCUMPLIDA' ? 'Incumplido' : ESTADO_PEDIDO[nivel],
      nivel,
    });
  }));
}

export const fechaHora = (ms: number | null) => (ms == null ? '—' : formatFechaHoraCorta(ms));
export const holguraTexto = (ms: number | null) => (ms == null ? '—' : ms < 0 ? `-${duracionCorta(-ms)}` : duracionCorta(ms));

const COLUMNAS: [string, (f: FilaPlan) => string][] = [
  ['Pedido', (f) => f.pedido],
  ['Cliente', (f) => f.cliente],
  ['Cantidad', (f) => (f.cantidad == null ? '' : String(f.cantidad))],
  ['Vehículo', (f) => f.vehiculo],
  ['Tipo', (f) => f.tipoVehiculo],
  ['Ruta', (f) => f.ruta],
  ['Estado ruta', (f) => f.estadoRuta],
  ['Parada', (f) => `${f.parada}/${f.paradas}`],
  ['Salida', (f) => fechaHora(f.salidaMs)],
  ['ETA', (f) => `${f.etaMs != null && !f.etaReal ? '~' : ''}${fechaHora(f.etaMs)}`],
  ['Límite', (f) => fechaHora(f.limiteMs)],
  ['Holgura', (f) => holguraTexto(f.holguraMs)],
  ['Estado', (f) => f.estado],
];

function descargar(contenido: BlobPart, tipo: string, nombre: string) {
  const url = URL.createObjectURL(new Blob([contenido], { type: tipo }));
  const a = document.createElement('a');
  a.href = url; a.download = nombre; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const nombreArchivo = (corteMs: number | null, ext: string) =>
  `planificacion-estable-${corteMs == null ? 'sin-fecha' : new Date(corteMs).toISOString().slice(0, 16).replace(/[:T]/g, '')}.${ext}`;

export function descargarCsv(filas: FilaPlan[], corteMs: number | null) {
  const celda = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  const lineas = [
    `# Planificación estable — plan del ${fechaHora(corteMs)} (hora simulada)`,
    COLUMNAS.map(([c]) => c).join(','),
    ...filas.map((f) => COLUMNAS.map(([, v]) => celda(v(f))).join(',')),
  ];
  descargar(`﻿${lineas.join('\r\n')}`, 'text/csv;charset=utf-8', nombreArchivo(corteMs, 'csv'));
}

/** Reporte de texto por pedido (formato pedido por el profesor). */
export function descargarTxt(filas: FilaPlan[], corteMs: number | null) {
  const lineas = [
    'SYSMILE / PaqRap — Planificación estable',
    `Plan del ${fechaHora(corteMs)} (hora simulada) · ${filas.length} pedidos`,
    '',
    ...filas.map((f) => `Pedido ${f.pedido} · cliente ${f.cliente} · vehículo ${f.vehiculo} (${f.tipoVehiculo}) · ruta ${f.ruta} [${f.estadoRuta}] · parada ${f.parada}/${f.paradas} · salida ${fechaHora(f.salidaMs)} · ETA ${f.etaMs != null && !f.etaReal ? '~' : ''}${fechaHora(f.etaMs)} · límite ${fechaHora(f.limiteMs)} · holgura ${holguraTexto(f.holguraMs)} · ${f.estado}`),
  ];
  descargar(lineas.join('\r\n'), 'text/plain;charset=utf-8', nombreArchivo(corteMs, 'txt'));
}

/** PDF horizontal paginado, con la misma cabecera que el reporte final (services/simulationReportPdf). */
export function descargarPdf(filas: FilaPlan[], corteMs: number | null, nota: string) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  doc.setProperties({ title: 'SYSMILE - Planificación estable' });
  const limpiar = (s: string) => s.replace(/→/g, '>').replace(/[–—]/g, '-').replace(/[  ]/g, ' ');
  const anchos = [26, 22, 15, 20, 14, 30, 22, 14, 22, 24, 22, 17, 25];
  const cabecera = () => {
    doc.setFillColor('#17324d'); doc.rect(0, 0, 297, 24, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor('#a9dde1'); doc.text('SYSMILE / PaqRap', 12, 8);
    doc.setFontSize(15); doc.setTextColor('#ffffff'); doc.text('Planificación estable', 12, 18);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
    doc.text(limpiar(`Plan del ${fechaHora(corteMs)} (hora simulada) · ${filas.length} pedidos`), 285, 18, { align: 'right' });
    let x = 12; const y = 30;
    doc.setFillColor('#17324d'); doc.rect(12, y, 273, 7, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); doc.setTextColor('#ffffff');
    COLUMNAS.forEach(([c], i) => { doc.text(limpiar(c), x + 1.5, y + 4.8); x += anchos[i]; });
    return y + 7;
  };
  let y = cabecera();
  doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor('#253b50');
  doc.text(limpiar(nota), 12, 27.5);
  filas.forEach((f, n) => {
    if (y + 6 > 198) { doc.addPage(); y = cabecera(); }
    if (n % 2 === 0) { doc.setFillColor('#eef3f7'); doc.rect(12, y, 273, 6, 'F'); }
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5);
    doc.setTextColor(f.nivel === 'delayed' || f.nivel === 'collapsed' || (f.holguraMs ?? 0) < 0 ? '#b83f49' : '#253b50');
    let x = 12;
    COLUMNAS.forEach(([, v], i) => {
      const texto = doc.splitTextToSize(limpiar(v(f)), anchos[i] - 2)[0] as string;
      doc.text(texto, x + 1.5, y + 4.2); x += anchos[i];
    });
    y += 6;
  });
  if (!filas.length) { doc.setTextColor('#637487'); doc.text('Sin pedidos en rutas vigentes en este plan.', 12, y + 6); }
  const paginas = doc.getNumberOfPages();
  for (let p = 1; p <= paginas; p++) {
    doc.setPage(p); doc.setFontSize(7.5); doc.setTextColor('#637487');
    doc.text('SYSMILE / PaqRap - Planificación estable', 12, 205); doc.text(`${p} / ${paginas}`, 285, 205, { align: 'right' });
  }
  doc.save(nombreArchivo(corteMs, 'pdf'));
}
