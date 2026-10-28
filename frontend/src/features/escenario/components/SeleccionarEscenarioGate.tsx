import React, { useEffect, useState } from 'react';
import { useEscenario } from '../hooks/useEscenario';
import { useDescubrirEjecucionActiva } from '../../../hooks/useDescubrirEjecucionActiva';
import { useScenarioStore } from '../../../store/scenarioStore';
import { useConfigInicialStore } from '../../../store/configInicialStore';
import { formatDateForInput } from '../../../utils/simulation';
import { Play, Loader2 } from 'lucide-react';

const ESTADOS_ACTIVOS = new Set(['INICIADA', 'EN_CURSO', 'PAUSADA']);
const FECHA_MIN_DATOS = '2026-01-01';
const FECHA_MAX_DATOS = '2028-12-31';

export const SeleccionarEscenarioGate: React.FC<{
  children: React.ReactNode;
}> = ({ children }) => {
  const { ejecucion, iniciarEscenario, isIniciando, error } = useEscenario();
  const { verificando } = useDescubrirEjecucionActiva();
  const tipo = useScenarioStore((s) => s.selectedScenarioType);
  const ajustesPendientes = useConfigInicialStore((s) => s.ajustesPendientes);
  const [fecha, setFecha] = useState(formatDateForInput(new Date()));
  const [hora, setHora] = useState('07:00');

  // DIA_A_DIA es "tiempo real" (k=1): siempre arranca desde el instante actual.
  useEffect(() => {
    if (tipo === 'DIA_A_DIA') {
      const ahora = new Date();
      setFecha(formatDateForInput(ahora));
      setHora(`${String(ahora.getHours()).padStart(2, '0')}:${String(ahora.getMinutes()).padStart(2, '0')}`);
    }

    if (tipo !== 'DIA_A_DIA') {
      setHora('07:00');
      return;
    }

    const actualizarHoraActual = () => {
      const ahora = new Date();
      setFecha(formatDateForInput(ahora));
      setHora(`${String(ahora.getHours()).padStart(2, '0')}:${String(ahora.getMinutes()).padStart(2, '0')}`);
    };
    const intervalo = window.setInterval(actualizarHoraActual, 60_000);
    return () => window.clearInterval(intervalo);
  }, [tipo]);

  // Solo hay datos oficiales del curso (ventas/bloqueos) de 2026-01 a 2028-12: fuera de ese rango
  // la simulación arrancaría sin pedidos.
  const fechaFueraDeRango = Boolean(fecha) && (fecha < FECHA_MIN_DATOS || fecha > FECHA_MAX_DATOS);

  const hasActive = Boolean(ejecucion && ESTADOS_ACTIVOS.has(ejecucion.estado));

  if (hasActive) {
    return <>{children}</>;
  }

  return (
    <div className="absolute inset-0 z-10 flex h-full w-full items-center justify-center overflow-auto bg-[var(--color-background)] px-5 py-10 text-[var(--color-text-primary)] animate-in fade-in">
        {verificando ? (
          <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm text-slate-600 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
            <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
            <span>Verificando ejecución activa...</span>
          </div>
        ) : (
          <div className="w-full max-w-[405px] space-y-7">
            <div className="text-center">
              <div className="mx-auto mb-3 inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-500 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
                <span className="h-1.5 w-1.5 rounded-full bg-blue-600" />
                Escenario:
                <strong className="font-semibold text-slate-800 dark:text-slate-200">
                  {tipo === 'DIA_A_DIA' ? 'Tiempo Real' : tipo === 'CINCO_DIAS' ? 'Simulación 5 Días' : 'Colapso Logístico'}
                </strong>
              </div>
              <h1 className="text-[26px] font-bold tracking-tight text-slate-950 dark:text-slate-100">Inicio de ejecución</h1>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                {tipo === 'DIA_A_DIA'
                  ? 'El tiempo real comienza obligatoriamente en la fecha y hora actuales'
                  : 'Define la fecha y hora para comenzar la operación'}
              </p>
            </div>

            <div className="space-y-5">
              <div>
                <div className="mb-1.5 flex items-center justify-between text-xs font-medium text-slate-700 dark:text-slate-300">
                  <label htmlFor="fecha-inicio-simulada">Fecha</label>
                  {tipo !== 'DIA_A_DIA' && (
                    <button type="button" className="text-blue-600 hover:text-blue-700" onClick={() => setFecha(formatDateForInput(new Date()))}>
                      Hoy
                    </button>
                  )}
                </div>
                <div>
                  <input id="fecha-inicio-simulada" type="date" value={fecha} min={FECHA_MIN_DATOS} max={FECHA_MAX_DATOS} disabled={tipo === 'DIA_A_DIA'} onChange={(e) => setFecha(e.target.value)}
                    className="scheme-light h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-800 shadow-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed disabled:opacity-70 dark:scheme-dark dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:focus:ring-blue-900" />
                </div>
                <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
                  {new Date(`${fecha}T12:00:00`).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                </p>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-700 dark:text-slate-300" htmlFor="hora-inicio-simulada">Hora</label>
                <div>
                  <input id="hora-inicio-simulada" type="time" value={hora} disabled={tipo === 'DIA_A_DIA'} onChange={(e) => setHora(e.target.value)}
                    className="scheme-light h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-800 shadow-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed disabled:opacity-70 dark:scheme-dark dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:focus:ring-blue-900" />
                </div>
              </div>
            </div>

            {ajustesPendientes.length > 0 && (
              <p className="rounded-xl border border-blue-200 bg-blue-50 p-2.5 text-xs text-blue-700 dark:border-blue-900/60 dark:bg-blue-950/40 dark:text-blue-300">
                Se aplicarán {ajustesPendientes.length} ajuste(s) de parámetros guardados en Configuración.
              </p>
            )}

            {fechaFueraDeRango && (
              <p className="rounded-xl border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-300">
                Solo hay datos del curso entre el 01/01/2026 y el 31/12/2028. Elige una fecha dentro de ese rango.
              </p>
            )}

            {error && (
              <div className="rounded-xl border border-rose-200 bg-rose-50 p-2.5 text-xs text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-300">
                {(error as Error).message || 'No se pudo iniciar el escenario seleccionado.'}
              </div>
            )}

            <button
              type="button"
              disabled={isIniciando || fechaFueraDeRango || !fecha}
              onClick={() =>
                iniciarEscenario({
                  tipo,
                  fechaInicioSimulada:
                    tipo === 'DIA_A_DIA'
                      ? new Date().toISOString()
                      : fecha
                        ? `${fecha}T${hora || '00:00'}:00Z`
                        : undefined,
                  ajustesIniciales: ajustesPendientes.length > 0 ? ajustesPendientes : undefined,
                })
              }
              className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white shadow-lg shadow-blue-600/20 transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isIniciando ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Iniciando simulación...</span>
                </>
              ) : (
                <>
                  <Play className="h-4 w-4 fill-current" />
                  <span>Iniciar Simulación</span>
                </>
              )}
            </button>

          </div>
        )}
    </div>
  );
};
