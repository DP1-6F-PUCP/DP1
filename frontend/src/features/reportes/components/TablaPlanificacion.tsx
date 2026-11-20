import React, { useMemo, useState } from 'react';
import { CalendarClock, Car, FileDown, FileSpreadsheet, FileText, Search, X } from 'lucide-react';
import type { FilaPlan } from '../planificacionEstable';
import { descargarCsv, descargarPdf, descargarTxt, fechaHora, holguraTexto } from '../planificacionEstable';

const PAGINA = 150;

/** Mismos colores que el semáforo de pedidos del mapa (PedidosPage / leyenda). */
const HEX: Record<FilaPlan['nivel'], string> = {
  on_time: '#10B981', at_risk: '#F59E0B', delayed: '#F43F5E', collapsed: '#991B1B', delivered: '#3B82F6',
};

const BOTON = 'inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-cyan-500 hover:text-slate-900 disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:text-white';

interface Props {
  filas: FilaPlan[];
  corteMs: number | null;
  /** "Último lote recibido" o "Último lote estable (reporte final)". */
  origen: string;
  onVerVehiculo?: (idVehiculo: string, idPedido: string) => void;
}

/** Planificación estable por pedido, con búsqueda y descarga en CSV / TXT / PDF. */
export const TablaPlanificacion: React.FC<Props> = ({ filas, corteMs, origen, onVerVehiculo }) => {
  const [q, setQ] = useState('');
  const [mostrar, setMostrar] = useState(PAGINA);
  const filtradas = useMemo(() => {
    const t = q.trim().toLowerCase();
    return t ? filas.filter((f) => [f.pedido, f.cliente, f.vehiculo, f.ruta].some((v) => v.toLowerCase().includes(t))) : filas;
  }, [filas, q]);
  const rutas = useMemo(() => new Set(filas.map((f) => f.ruta)).size, [filas]);
  const tarde = useMemo(() => filas.filter((f) => (f.holguraMs ?? 0) < 0 && f.nivel !== 'delivered').length, [filas]);
  const visibles = filtradas.slice(0, mostrar);
  const nota = `${origen}. ETA con "~" = estimada. Holgura = límite - ETA.`;

  return (
    <section aria-labelledby="titulo-plan" className="rounded-xl border border-slate-200 bg-[var(--color-surface)] shadow-sm dark:border-slate-700/70">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 p-4 dark:border-slate-700/70">
        <div className="min-w-0">
          <h2 id="titulo-plan" className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
            <CalendarClock className="h-4 w-4 text-cyan-600 dark:text-cyan-400" aria-hidden />Planificación estable
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Plan del <span className="font-mono-code font-semibold text-slate-800 dark:text-slate-200">{fechaHora(corteMs)}</span> (hora simulada) · {origen} ·{' '}
            <span className="font-mono-code">{filas.length}</span> pedidos en <span className="font-mono-code">{rutas}</span> rutas
            {tarde > 0 && <> · <span className="font-semibold text-rose-700 dark:text-rose-400">{tarde} con ETA después del límite</span></>}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-slate-400" aria-hidden />
            <input value={q} onChange={(e) => { setQ(e.target.value); setMostrar(PAGINA); }} placeholder="Pedido, cliente, vehículo…"
              aria-label="Buscar en la planificación"
              className="w-52 rounded-lg border border-slate-200 bg-white py-1.5 pl-8 pr-7 text-xs text-slate-900 placeholder-slate-400 focus:border-cyan-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950/60 dark:text-slate-100" />
            {q && <button type="button" onClick={() => setQ('')} aria-label="Limpiar búsqueda" className="absolute right-2 top-2 text-slate-400 hover:text-slate-700 dark:hover:text-white"><X className="h-3.5 w-3.5" /></button>}
          </div>
          <button type="button" className={BOTON} disabled={!filas.length} onClick={() => descargarCsv(filas, corteMs)} title="Una fila por pedido (abre en Excel)">
            <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" aria-hidden />CSV
          </button>
          <button type="button" className={BOTON} disabled={!filas.length} onClick={() => descargarTxt(filas, corteMs)} title="Reporte de texto: una línea por pedido">
            <FileText className="h-3.5 w-3.5 text-slate-500" aria-hidden />Texto
          </button>
          <button type="button" className={BOTON} disabled={!filas.length} onClick={() => descargarPdf(filas, corteMs, nota)} title="PDF horizontal, paginado">
            <FileDown className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" aria-hidden />PDF
          </button>
        </div>
      </header>

      {filas.length === 0 ? (
        <div className="p-8 text-center text-sm text-slate-500 dark:text-slate-400">
          <p className="font-medium text-slate-700 dark:text-slate-300">Sin pedidos en rutas vigentes</p>
          <p className="mt-1 text-xs">El plan no tiene rutas en ejecución ni planificadas con pedidos en este momento.</p>
        </div>
      ) : (
        <div className="max-h-[480px] overflow-auto">
          <table className="w-full text-left text-xs">
            <thead className="sticky top-0 z-10 bg-slate-100 text-[11px] uppercase tracking-wide text-slate-600 dark:bg-slate-900 dark:text-slate-400">
              <tr>
                <th scope="col" className="px-3 py-2 font-semibold">Pedido</th>
                <th scope="col" className="px-3 py-2 font-semibold">Cliente</th>
                <th scope="col" className="px-3 py-2 font-semibold">Vehículo</th>
                <th scope="col" className="px-3 py-2 font-semibold">Ruta · parada</th>
                <th scope="col" className="px-3 py-2 font-semibold">Salida</th>
                <th scope="col" className="px-3 py-2 font-semibold" title="Hora estimada de entrega (~) o real">ETA</th>
                <th scope="col" className="px-3 py-2 font-semibold">Límite</th>
                <th scope="col" className="px-3 py-2 text-right font-semibold" title="Límite menos ETA; negativo = llegaría tarde">Holgura</th>
                <th scope="col" className="px-3 py-2 font-semibold">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 font-mono-code text-slate-700 dark:divide-slate-800 dark:text-slate-300">
              {visibles.map((f) => {
                const negativa = f.holguraMs != null && f.holguraMs < 0 && f.nivel !== 'delivered';
                return (
                  <tr key={`${f.ruta}-${f.pedido}`} className="hover:bg-slate-50 dark:hover:bg-white/[0.03]">
                    <td className="px-3 py-1.5 font-semibold text-slate-900 dark:text-slate-100">{f.pedido}</td>
                    <td className="px-3 py-1.5">{f.cliente}</td>
                    <td className="px-3 py-1.5">
                      {onVerVehiculo ? (
                        <button type="button" onClick={() => onVerVehiculo(f.vehiculo, f.pedido)} title={`Ver ${f.vehiculo} en el mapa`}
                          className="inline-flex items-center gap-1 rounded-md border border-cyan-600/40 px-1.5 py-px text-cyan-700 hover:bg-cyan-500/10 dark:border-cyan-500/40 dark:text-cyan-300">
                          <Car className="h-3 w-3" aria-hidden />{f.vehiculo}
                        </button>
                      ) : f.vehiculo}
                    </td>
                    <td className="px-3 py-1.5" title={`${f.estadoRuta} · ${f.tipoVehiculo}`}>
                      <span className="text-slate-500 dark:text-slate-400">{f.ruta}</span> · {f.parada}/{f.paradas}
                      {f.estadoRuta === 'Planificada' && <span className="ml-1 rounded bg-slate-200 px-1 text-[10px] font-sans font-semibold text-slate-700 dark:bg-slate-700 dark:text-slate-200">plan</span>}
                    </td>
                    <td className="px-3 py-1.5">{fechaHora(f.salidaMs)}</td>
                    <td className="px-3 py-1.5" title={f.etaReal ? 'Entrega real' : 'Estimada'}>{f.etaMs != null && !f.etaReal ? '~' : ''}{fechaHora(f.etaMs)}</td>
                    <td className="px-3 py-1.5">{fechaHora(f.limiteMs)}</td>
                    <td className={`px-3 py-1.5 text-right ${negativa ? 'font-semibold text-rose-700 dark:text-rose-400' : ''}`}>{holguraTexto(f.holguraMs)}</td>
                    <td className="px-3 py-1.5 font-sans">
                      <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-slate-900 dark:text-slate-100">
                        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: HEX[f.nivel] }} aria-hidden />{f.estado}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {filtradas.length === 0 && <p className="p-6 text-center text-sm text-slate-500 dark:text-slate-400">Sin coincidencias para «{q}».</p>}
          {filtradas.length > mostrar && (
            <button type="button" onClick={() => setMostrar((n) => n + PAGINA)}
              className="w-full border-t border-slate-200 py-2 text-xs font-medium text-slate-600 hover:text-slate-900 dark:border-slate-800 dark:text-slate-300 dark:hover:text-white">
              Ver {Math.min(PAGINA, filtradas.length - mostrar)} más ({filtradas.length - mostrar} restantes · la descarga incluye todos)
            </button>
          )}
        </div>
      )}
    </section>
  );
};
