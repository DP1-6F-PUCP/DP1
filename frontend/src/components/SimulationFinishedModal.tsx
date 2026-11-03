import React from 'react';
import { AlertCircle, CheckCircle2, Download, Loader2, X } from 'lucide-react';
import type { ReporteSimulacionDTO } from '../types/backend';
import { motivosReporte, resumenReporte, totalesReporte } from '../utils/simulationReport';
import { crearReportePdf } from '../services/simulationReportPdf';

interface Props {
  isOpen: boolean;
  onAccept: () => void;
  reporte: ReporteSimulacionDTO | undefined;
  inicioVisibleMs: number | null;
  isError: boolean;
  onRetry: () => void;
}

export const SimulationFinishedModal: React.FC<Props> = ({ isOpen, onAccept, reporte, inicioVisibleMs, isError, onRetry }) => {
  if (!isOpen) return null;
  const colapso = reporte?.motivoFinalizacion === 'COLAPSO';
  const totales = reporte ? totalesReporte(reporte) : null;
  const rutas = reporte?.ultimaPlanificacionEstable?.rutas.filter(r => r.secuenciaEntrega.length > 0) ?? [];
  return (
    <div role="dialog" aria-modal="true" aria-labelledby="simulation-report-title"
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 p-3 backdrop-blur-sm">
      <div className={`relative flex max-h-[90vh] w-full max-w-3xl flex-col rounded-xl border ${colapso ? 'border-red-500' : 'border-slate-700'} bg-[#121722] p-4 text-slate-100 shadow-2xl`}>
        <button type="button" aria-label="Cerrar reporte" onClick={onAccept} className="absolute right-3 top-3 text-slate-400 hover:text-white"><X className="h-4 w-4" /></button>
        <div className="mb-4 flex items-center gap-3 pr-6">
          <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border-2 ${colapso ? 'border-red-500/80 bg-red-500/10 text-red-500' : 'border-blue-500/80 bg-blue-500/10 text-blue-400'}`}>
            {colapso ? <AlertCircle className="h-5 w-5" /> : <CheckCircle2 className="h-5 w-5" />}
          </div>
          <div><h2 id="simulation-report-title" className="text-lg font-bold text-white">Reporte de simulación finalizada</h2>
            <p className="text-xs text-slate-400">{reporte ? motivosReporte[reporte.motivoFinalizacion] : 'Preparando el reporte de cierre…'}</p></div>
        </div>
        <div className="min-h-0 overflow-y-auto rounded-lg border border-slate-700 bg-[#0a0f18] p-3">
          {!reporte && (isError
            ? <div role="alert" className="p-4 text-sm text-slate-300">No se pudo cargar el reporte de esta ejecución. Reintenta la consulta.
                <button type="button" onClick={onRetry} className="mt-3 block text-blue-400 hover:text-blue-300">Reintentar</button></div>
            : <div role="status" className="flex items-center gap-2 p-4 text-sm text-slate-400"><Loader2 className="h-4 w-4 animate-spin" />Cargando resultados y última planificación estable…</div>)}
          {reporte && <>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {resumenReporte(reporte, inicioVisibleMs).map(([label, value]) => <div key={label} className="rounded-md border border-slate-700/60 bg-[#141a27] p-2">
                <p className="mb-0.5 text-[11px] text-slate-400">{label}</p><p className="text-xs font-semibold text-white">{value}</p>
              </div>)}
            </div>
            {totales && <div className="my-3 grid grid-cols-2 gap-2 sm:grid-cols-4">{Object.entries(totales).map(([label, value]) =>
              <div key={label} className="rounded-md border border-slate-700/60 bg-[#141a27] p-2"><p className="text-[11px] capitalize text-slate-400">{label}</p><p className="font-mono-code text-sm font-semibold text-blue-300">{value}</p></div>)}</div>}
            <h3 className="mt-3 text-sm font-semibold text-blue-400">Última planificación estable</h3>
            <p className="my-1 text-xs text-slate-400">Último lote completado sin incumplimientos. El PDF incluye sus rutas, flota, almacenes y pedidos pendientes.</p>
            <div className="overflow-x-auto"><table className="w-full text-left text-xs"><thead className="text-slate-400"><tr><th className="py-2 pr-3">Unidad</th><th className="pr-3">Estado de ruta</th><th>Pedidos</th></tr></thead>
              <tbody>{rutas.map(r => <tr key={r.idRuta} className="border-t border-slate-700/60"><td className="py-2 pr-3 font-semibold">{r.vehiculoId}</td><td className="pr-3">{r.estado}</td><td>{r.secuenciaEntrega.join(', ')}</td></tr>)}</tbody></table></div>
            {!rutas.length && <p className="py-2 text-xs text-slate-400">{reporte.ultimaPlanificacionEstable ? 'Sin rutas con pedidos en el último lote estable.' : 'No hubo una planificación estable completada.'}</p>}
            {reporte.pedidosFinales.filter(p => p.estado === 'INCUMPLIDA').map(p => <p key={p.idPedido} className="mt-2 text-xs text-red-400">Pedido incumplido: {p.idPedido} · Cliente {p.idCliente} · Destino ({p.posX}, {p.posY})</p>)}
          </>}
        </div>
        <div className="mt-4 flex gap-2">
          <button type="button" disabled={!reporte} onClick={() => { if (reporte) crearReportePdf(reporte, inicioVisibleMs).save(`reporte-simulacion-${reporte.idEjecucion}.pdf`); }}
            className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-slate-700 px-3 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-50"><Download className="h-4 w-4 text-blue-400" />Descargar PDF</button>
          <button type="button" onClick={onAccept} className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-[#2a437a] px-3 py-2.5 text-sm font-semibold text-white transition hover:bg-[#355498]"><CheckCircle2 className="h-4 w-4" />Aceptar</button>
        </div>
      </div>
    </div>
  );
};
