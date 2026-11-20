import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CalendarClock, Wrench } from 'lucide-react';
import type { Vehicle } from '../../../types';
import { escenariosApi } from '../../../services/escenariosApi';
import { useScenarioStore } from '../../../store/scenarioStore';
import { parseBackendSimulatedTime } from '../../../utils/backendTime';
import { BORDE, TEXTO, TEXTO_FUERTE, TEXTO_TENUE } from './piezas';

/** Fecha simulada (convención UTC del backend) como clave "AAAAMMDD". */
export const claveDia = (ms: number) => new Date(ms).toISOString().slice(0, 10).replace(/-/g, '');

export interface RegistroMantenimiento {
  id: string;
  vehicleCode: string;
  dateKey: string;
  /** "dd/mm" del inicio. */
  fecha: string;
  inicioMs: number;
  finMs: number;
}

/**
 * Calendario de mantenimientos de la ejecución activa (GET /api/estado-operacion/mantenimientos: el
 * oficial y los cargados a mano). Devuelve los pendientes o en curso al reloj del mapa y, por código
 * de vehículo, el próximo. Se vuelve a pedir cada minuto: el backend carga bimestres nuevos al avanzar.
 */
export function useMantenimientos(marcaVisibleMs: number | null) {
  const id = useScenarioStore((s) => s.ejecucion?.idEjecucion);
  const { data, isSuccess } = useQuery({
    queryKey: ['mantenimientos', id],
    queryFn: ({ signal }) => escenariosApi.consultarMantenimientos(signal),
    enabled: Boolean(id),
    staleTime: 55_000,
    refetchInterval: 60_000,
  });
  const registros = useMemo<RegistroMantenimiento[]>(() => (data ?? []).map((m) => {
    const inicioMs = parseBackendSimulatedTime(m.inicio);
    const iso = new Date(inicioMs).toISOString();
    return {
      id: `${m.idUnidad}|${m.inicio}`,
      vehicleCode: m.idUnidad,
      dateKey: claveDia(inicioMs),
      fecha: `${iso.slice(8, 10)}/${iso.slice(5, 7)}`,
      inicioMs,
      finMs: parseBackendSimulatedTime(m.fin),
    };
  }), [data]);
  return useMemo(() => {
    const hoy = marcaVisibleMs != null ? claveDia(marcaVisibleMs) : '';
    const proximos = registros
      .filter((r) => marcaVisibleMs == null || r.finMs > marcaVisibleMs)
      .sort((a, b) => a.inicioMs - b.inicioMs || a.vehicleCode.localeCompare(b.vehicleCode));
    const porVehiculo = new Map<string, RegistroMantenimiento>();
    for (const r of proximos) if (!porVehiculo.has(r.vehicleCode)) porVehiculo.set(r.vehicleCode, r);
    return { hayDatos: isSuccess, proximos, porVehiculo, hoy };
  }, [registros, marcaVisibleMs, isSuccess]);
}

const fechaCorta = (r: RegistroMantenimiento) => r.fecha;

export const Mantenimientos: React.FC<{ vehiculos: Vehicle[]; marcaVisibleMs: number | null }> = ({ vehiculos, marcaVisibleMs }) => {
  const { hayDatos, proximos, hoy } = useMantenimientos(marcaVisibleMs);
  const enMantenimiento = vehiculos.filter((v) => v.status === 'maintenance');

  // Calendario simple: los próximos días con mantenimiento y sus vehículos.
  const dias = useMemo(() => {
    const mapa = new Map<string, RegistroMantenimiento[]>();
    for (const r of proximos) {
      const lista = mapa.get(r.dateKey);
      if (lista) lista.push(r); else mapa.set(r.dateKey, [r]);
    }
    return [...mapa.entries()].slice(0, 8);
  }, [proximos]);

  return (
    <section aria-labelledby="titulo-mant" className={`rounded-xl border ${BORDE} bg-[var(--color-surface)] shadow-sm`}>
      <header className={`flex items-center gap-2 border-b ${BORDE} px-4 py-3`}>
        <h2 id="titulo-mant" className={`flex items-center gap-2 text-sm font-semibold ${TEXTO_FUERTE}`}>
          <CalendarClock className="h-4 w-4 text-orange-500" aria-hidden />Mantenimientos
        </h2>
      </header>
      <div className="space-y-3 px-4 py-3 text-sm">
        <div>
          <p className={`text-xs font-semibold uppercase tracking-wide ${TEXTO_TENUE}`}>Ahora en mantenimiento</p>
          {enMantenimiento.length === 0 ? (
            <p className={`mt-1 ${TEXTO}`}>Ningún vehículo.</p>
          ) : (
            <ul className="mt-1 flex flex-wrap gap-1.5">
              {enMantenimiento.map((v) => (
                <li key={v.id} className={`inline-flex items-center gap-1 rounded-md border border-orange-500/40 bg-orange-500/10 px-1.5 py-0.5 font-mono-code text-xs ${TEXTO_FUERTE}`}>
                  <Wrench className="h-3 w-3 text-orange-500" aria-hidden />{v.code}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <p className={`text-xs font-semibold uppercase tracking-wide ${TEXTO_TENUE}`}>Próximos</p>
          {!hayDatos ? (
            <p className={`mt-1 text-xs ${TEXTO_TENUE}`}>Cargando calendario…</p>
          ) : dias.length === 0 ? (
            <p className={`mt-1 ${TEXTO}`}>No quedan mantenimientos programados.</p>
          ) : (
            <ol className="mt-1 space-y-1.5">
              {dias.map(([dia, lista]) => (
                <li key={dia} className="flex items-start gap-2">
                  <span className={`w-12 shrink-0 pt-0.5 font-mono-code text-xs font-semibold ${dia === hoy ? 'text-orange-600 dark:text-orange-400' : TEXTO}`}>
                    {dia === hoy ? 'Hoy' : fechaCorta(lista[0])}
                  </span>
                  <span className="flex flex-wrap gap-1">
                    {lista.map((r) => (
                      <span key={r.id} className={`rounded border ${BORDE} px-1.5 py-px font-mono-code text-xs ${TEXTO_FUERTE}`}>{r.vehicleCode}</span>
                    ))}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
    </section>
  );
};
