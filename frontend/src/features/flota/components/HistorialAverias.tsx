import React, { useMemo } from 'react';
import { Clock, History, LocateFixed } from 'lucide-react';
import type { Vehicle } from '../../../types';
import { useAveriasProgramadasStore } from '../../../store/averiasProgramadasStore';
import { formatFechaHoraCorta } from '../../../utils/backendTime';
import { OPCIONES_AVERIA } from '../flotaUtils';
import { useHistorialAverias, type RegistroAveria } from '../historialAverias';
import { ACENTO, BORDE, ChipEstado, DistintivoAveria, FOCO, TEXTO, TEXTO_FUERTE, TEXTO_TENUE } from './piezas';

const TITULO_TIPO = Object.fromEntries(OPCIONES_AVERIA.map((o) => [o.tipo, o.titulo])) as Record<1 | 2 | 3, string>;

interface Props {
  vehiculos: Vehicle[];
  marcaVisibleMs: number | null;
  onVer: (v: Vehicle) => void;
}

/**
 * Historial de averías de la ejecución (ver historialAverias): vehículo, tipo, inicio, lugar, quién la
 * pidió y el estado actual del vehículo. Arriba, las pedidas que el backend aún no aplica.
 */
export const HistorialAverias: React.FC<Props> = ({ vehiculos, marcaVisibleMs, onVer }) => {
  const registros = useHistorialAverias();
  const programadas = useAveriasProgramadasStore((s) => s.pendientes);
  const porId = useMemo(() => new Map(vehiculos.map((v) => [v.id, v])), [vehiculos]);

  // Solo lo que el mapa ya mostró: el lote llega adelantado al reloj visible. Lo más reciente primero.
  const visibles = useMemo(
    () => registros
      .filter((r) => marcaVisibleMs == null || r.instanteMs <= marcaVisibleMs)
      .sort((a, b) => b.instanteMs - a.instanteMs),
    [registros, marcaVisibleMs],
  );
  const pendientes = Object.entries(programadas).filter(([id]) => porId.get(id)?.status !== 'broken');

  const enCurso = (r: RegistroAveria) => marcaVisibleMs != null && marcaVisibleMs < r.finMs;

  return (
    <section aria-labelledby="titulo-historial" className={`rounded-xl border ${BORDE} bg-[var(--color-surface)] shadow-sm`}>
      <header className={`flex flex-wrap items-center justify-between gap-2 border-b ${BORDE} px-4 py-3`}>
        <h2 id="titulo-historial" className={`flex items-center gap-2 text-sm font-semibold ${TEXTO_FUERTE}`}>
          <History className="h-4 w-4 text-rose-500" aria-hidden />Historial de averías
          <span className={`font-mono-code text-xs font-normal ${TEXTO_TENUE}`}>{visibles.length}</span>
        </h2>
        <span className={`text-xs ${TEXTO_TENUE}`}>De esta ejecución</span>
      </header>

      {visibles.length === 0 && pendientes.length === 0 ? (
        <div className={`px-4 py-8 text-center text-sm ${TEXTO_TENUE}`}>
          <p className={`font-medium ${TEXTO}`}>Sin averías en esta ejecución</p>
          <p className="mt-1">Provoca una con «Averiar» en la tabla o con clic derecho sobre un vehículo del mapa.</p>
        </div>
      ) : (
        <div className="max-h-[360px] overflow-auto">
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 bg-slate-100 text-xs uppercase tracking-wide text-slate-600 dark:bg-slate-900 dark:text-slate-400">
              <tr>
                <th scope="col" className="px-3 py-2 font-semibold">Vehículo</th>
                <th scope="col" className="px-3 py-2 font-semibold">Tipo</th>
                <th scope="col" className="px-3 py-2 font-semibold">Inicio</th>
                <th scope="col" className="px-3 py-2 font-semibold">Lugar</th>
                <th scope="col" className="px-3 py-2 font-semibold">Estado actual</th>
                <th scope="col" className="px-3 py-2"><span className="sr-only">Acciones</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {pendientes.map(([id, p]) => {
                const v = porId.get(id);
                return (
                  <tr key={`prog-${id}`} className="bg-rose-50/60 dark:bg-rose-500/[0.06]">
                    <td className={`px-3 py-2 font-mono-code font-semibold ${TEXTO_FUERTE}`}>{v?.code ?? id}</td>
                    <td className="px-3 py-2">
                      <span className={`inline-flex items-center gap-1.5 whitespace-nowrap text-xs ${TEXTO}`}>
                        <DistintivoAveria tipo={p.tipo} />{TITULO_TIPO[p.tipo]}
                      </span>
                    </td>
                    <td colSpan={3} className="px-3 py-2">
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-rose-700 dark:text-rose-300"
                        title="Solicitud enviada: el backend la aplica al cerrar el siguiente lote">
                        <Clock className="h-3.5 w-3.5" aria-hidden />Programada · se aplica en el próximo lote
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right">
                      {v && <BotonVer v={v} onVer={onVer} />}
                    </td>
                  </tr>
                );
              })}
              {visibles.map((r) => {
                const v = porId.get(r.vehiculoId);
                return (
                  <tr key={r.clave}>
                    <td className={`px-3 py-2 font-mono-code font-semibold ${TEXTO_FUERTE}`}>
                      {v?.code ?? r.vehiculoId}
                    </td>
                    <td className="px-3 py-2">
                      {r.tipo ? (
                        <span className={`inline-flex items-center gap-1.5 whitespace-nowrap text-xs ${TEXTO}`}>
                          <DistintivoAveria tipo={r.tipo} />{TITULO_TIPO[r.tipo]}
                        </span>
                      ) : <span className={`text-xs ${TEXTO_TENUE}`}>—</span>}
                    </td>
                    <td className={`whitespace-nowrap px-3 py-2 font-mono-code text-xs ${TEXTO}`}>
                      {formatFechaHoraCorta(r.instanteMs)}
                    </td>
                    <td className={`whitespace-nowrap px-3 py-2 font-mono-code text-xs ${ACENTO}`}>
                      ({r.x}, {r.y})
                    </td>
                    <td className="px-3 py-2">
                      {enCurso(r)
                        ? <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-xs font-semibold text-rose-700 dark:text-rose-300"
                            title={r.trasladoMs !== undefined ? `Pasa al almacén central ${formatFechaHoraCorta(r.trasladoMs)}` : 'Se repara en el lugar'}>
                            <span className="h-2 w-2 rounded-full bg-rose-500" aria-hidden />En curso · hasta {formatFechaHoraCorta(r.finMs)}</span>
                        : v ? <ChipEstado vehiculo={v} /> : <span className={`text-xs ${TEXTO_TENUE}`}>—</span>}
                    </td>
                    <td className="px-3 py-2 text-right">{v && <BotonVer v={v} onVer={onVer} />}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
};

const BotonVer: React.FC<{ v: Vehicle; onVer: (v: Vehicle) => void }> = ({ v, onVer }) => (
  <button type="button" onClick={() => onVer(v)} title={`Ver ${v.code} en el mapa`} aria-label={`Ver ${v.code} en el mapa`}
    className={`inline-flex items-center rounded-md p-1 ${ACENTO} hover:bg-cyan-500/10 ${FOCO}`}>
    <LocateFixed className="h-3.5 w-3.5" aria-hidden />
  </button>
);
