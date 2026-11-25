import React, { useEffect, useState } from 'react';
import { useEscenario } from '../hooks/useEscenario';
import { confirmar } from '../../../components/Confirmacion';
import { useDescubrirEjecucionActiva } from '../../../hooks/useDescubrirEjecucionActiva';
import { useScenarioStore } from '../../../store/scenarioStore';
import { useConfigInicialStore } from '../../../store/configInicialStore';
import { formatDateForInput } from '../../../utils/simulation';
import { TipoEscenarioBackend } from '../../../types/backend';
import { escenariosReporte } from '../../../utils/simulationReport';
import { cuenta } from '../../configuracion/components/ui';
import { Play, Loader2, Radio, Calendar, AlertCircle, SlidersHorizontal } from 'lucide-react';

const ESTADOS_ACTIVOS = new Set(['INICIADA', 'EN_CURSO', 'PAUSADA']);
const FECHA_MIN_DATOS = '2026-01-01';
const FECHA_MAX_DATOS = '2028-12-31';

const MODOS_OPERACION: Array<{
  tipo: TipoEscenarioBackend;
  label: string;
  /** Qué hace el modo, en una línea: la opción se entiende sin explicación previa. */
  detalle: string;
  Icon: React.ComponentType<{ className?: string }>;
}> = [
  { tipo: 'DIA_A_DIA', label: 'Tiempo real', detalle: 'Desde ahora, al ritmo real', Icon: Radio },
  { tipo: 'CINCO_DIAS', label: '5 días', detalle: '5 días simulados, acelerado', Icon: Calendar },
  { tipo: 'COLAPSO_LOGISTICO', label: 'Colapso', detalle: 'Hasta que un pedido falle', Icon: AlertCircle },
];

/**
 * Pantalla de inicio (sin barra lateral): logo, modo, fecha y hora, y el botón para iniciar. La
 * configuración se abre desde el botón de la esquina superior derecha. Con una ejecución activa
 * muestra directamente la operación (children).
 */
export const SeleccionarEscenarioGate: React.FC<{
  children: React.ReactNode;
  onOpenConfig?: () => void;
  /** Ejecución ya terminada cuyo cierre todavía se está mostrando (ver useCierreDiferido). */
  mostrarOperacion?: boolean;
}> = ({ children, onOpenConfig, mostrarOperacion = false }) => {
  const { ejecucion, iniciarEscenario, isIniciando, error } = useEscenario();
  const { verificando } = useDescubrirEjecucionActiva();
  const tipo = useScenarioStore((s) => s.selectedScenarioType);
  const setSelectedScenarioType = useScenarioStore((s) => s.setSelectedScenarioType);
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

  if (hasActive || mostrarOperacion) {
    return <>{children}</>;
  }

  const tiempoReal = tipo === 'DIA_A_DIA';
  const puedeIniciar = !isIniciando && !fechaFueraDeRango && Boolean(fecha);
  // "Miércoles, 18 de noviembre de 2026": mayúscula solo al inicio (capitalize de CSS la ponía en cada palabra).
  const fechaLargaCruda = fecha
    ? new Date(`${fecha}T12:00:00`).toLocaleDateString('es-PE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
    : '';
  const fechaLarga = fechaLargaCruda.charAt(0).toUpperCase() + fechaLargaCruda.slice(1);

  const iniciar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!puedeIniciar) return;
    // Mismo nombre que la barra superior y el reporte (escenariosReporte).
    const modo = escenariosReporte[tipo] ?? tipo;
    const ok = await confirmar({
      titulo: `¿Iniciar «${modo}»?`,
      detalle: `${tiempoReal ? 'Desde ahora' : `${fechaLarga}, ${hora || '00:00'}`}${ajustesPendientes.length > 0 ? ` · ${cuenta(ajustesPendientes.length, 'ajuste', 'ajustes')}` : ''}`,
      accion: 'Iniciar',
      tono: 'crear',
    });
    if (!ok) return;
    iniciarEscenario({
      tipo,
      fechaInicioSimulada: tiempoReal ? new Date().toISOString() : `${fecha}T${hora || '00:00'}:00Z`,
      ajustesIniciales: ajustesPendientes.length > 0 ? ajustesPendientes : undefined,
    });
  };

  const campo =
    'h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 shadow-sm outline-none transition scheme-light focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:scheme-dark';

  return (
    // Fondo degradado: un halo del azul de la marca desde arriba (detrás del logo) que se funde con
    // el fondo de la app hacia abajo. Sutil, para no restar contraste a los controles.
    <div className="absolute inset-0 z-10 flex h-full w-full items-center justify-center overflow-auto bg-[radial-gradient(ellipse_90%_70%_at_50%_0%,#dbeafe_0%,#eef3fb_40%,#F5F6F8_75%)] px-5 py-8 text-[var(--color-text-primary)] dark:bg-[radial-gradient(ellipse_90%_70%_at_50%_0%,#16305e_0%,#0f1d38_40%,#0B111E_75%)]">
      {onOpenConfig && (
        <button
          type="button"
          id="btn-open-system-config-inicio"
          onClick={onOpenConfig}
          className="absolute right-4 top-4 flex h-10 items-center gap-2 rounded-xl border border-slate-300 bg-white px-3.5 text-sm font-medium text-slate-700 shadow-sm transition hover:border-slate-400 hover:text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-slate-500 dark:hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500"
        >
          <SlidersHorizontal className="h-4 w-4" aria-hidden />
          Configuración
        </button>
      )}

      {verificando ? (
        <div role="status" className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm text-slate-600 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
          <Loader2 className="h-4 w-4 animate-spin text-blue-500" aria-hidden />
          <span>Buscando una simulación en curso…</span>
        </div>
      ) : (
        <form onSubmit={(e) => void iniciar(e)}className="w-full max-w-[440px]" aria-labelledby="titulo-inicio">
          {/* Dos versiones del logo: colores originales en claro; "Sys" aclarado y azules con más brillo en oscuro. */}
          <img src="/sysmile-logo-fondo-claro.png" alt="SysMile — Last-mile delivery software" className="mx-auto h-40 w-auto dark:hidden" />
          <img src="/sysmile-logo-fondo-oscuro.png" alt="SysMile — Last-mile delivery software" className="mx-auto hidden h-40 w-auto dark:block" />
          {/* Sin título visible: el logo y los controles bastan. Se conserva para lectores de pantalla. */}
          <h1 id="titulo-inicio" className="sr-only">Iniciar operación</h1>

          {/* Modo: radio group con descripción, para que cada opción se entienda sin explicación. */}
          <fieldset className="mt-7">
            <legend className="mb-2 text-sm font-medium text-slate-700 dark:text-slate-200">Modo de operación</legend>
            <div role="radiogroup" className="grid grid-cols-3 gap-2">
              {MODOS_OPERACION.map(({ tipo: modoTipo, label, detalle, Icon }) => {
                const activo = tipo === modoTipo;
                return (
                  <button
                    key={modoTipo}
                    type="button"
                    role="radio"
                    aria-checked={activo}
                    onClick={() => setSelectedScenarioType(modoTipo)}
                    className={`flex flex-col items-center gap-1 rounded-xl border px-2 py-3 text-center transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 ${
                      activo
                        ? 'border-blue-600 bg-blue-50 text-blue-800 dark:border-blue-500 dark:bg-blue-500/15 dark:text-blue-200'
                        : 'border-slate-300 bg-white text-slate-700 hover:border-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-slate-500'
                    }`}
                  >
                    <Icon className={`h-5 w-5 ${activo ? 'text-blue-600 dark:text-blue-300' : 'text-slate-500 dark:text-slate-400'}`} />
                    <span className="text-sm font-semibold">{label}</span>
                    <span className={`text-[11px] leading-snug ${activo ? 'text-blue-700 dark:text-blue-200/80' : 'text-slate-500 dark:text-slate-400'}`}>{detalle}</span>
                  </button>
                );
              })}
            </div>
          </fieldset>

          {/* Inicio: fecha y hora en una fila. En tiempo real se muestran como dato, no como campos
              deshabilitados (que se leen mal y parecen un error). */}
          <fieldset className="mt-6">
            <legend className="mb-2 text-sm font-medium text-slate-700 dark:text-slate-200">Inicio</legend>
            {tiempoReal ? (
              <div className="flex items-center justify-between rounded-xl border border-slate-300 bg-white px-3 py-2.5 dark:border-slate-700 dark:bg-slate-900/60">
                <span className="text-sm text-slate-700 dark:text-slate-300">{fechaLarga}</span>
                <span className="font-mono-code text-sm font-semibold text-slate-900 dark:text-slate-100">{hora}</span>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-[1fr_7.5rem] gap-2">
                  <div>
                    <label htmlFor="fecha-inicio-simulada" className="sr-only">Fecha</label>
                    <input
                      id="fecha-inicio-simulada"
                      type="date"
                      value={fecha}
                      min={FECHA_MIN_DATOS}
                      max={FECHA_MAX_DATOS}
                      onChange={(e) => setFecha(e.target.value)}
                      aria-invalid={fechaFueraDeRango}
                      className={campo}
                    />
                  </div>
                  <div>
                    <label htmlFor="hora-inicio-simulada" className="sr-only">Hora</label>
                    <input
                      id="hora-inicio-simulada"
                      type="time"
                      value={hora}
                      onChange={(e) => setHora(e.target.value)}
                      className={campo}
                    />
                  </div>
                </div>
              </>
            )}
          </fieldset>

          {ajustesPendientes.length > 0 && (
            <p className="mt-5 rounded-xl border border-blue-200 bg-blue-50 p-3 text-xs text-blue-800 dark:border-blue-900/60 dark:bg-blue-950/40 dark:text-blue-200">
              Se aplicarán {ajustesPendientes.length === 1 ? '1 ajuste guardado' : `${ajustesPendientes.length} ajustes guardados`} en Configuración.
            </p>
          )}

          {fechaFueraDeRango && (
            <p role="alert" className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200">
              No hay datos para esa fecha. Elige un día entre el 01/01/2026 y el 31/12/2028.
            </p>
          )}

          {error && (
            <p role="alert" className="mt-5 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-200">
              {(error as Error).message || 'No se pudo iniciar el escenario seleccionado.'}
            </p>
          )}

          <button
            type="submit"
            disabled={!puedeIniciar}
            className="mx-auto mt-7 flex h-12 w-full max-w-[13rem] items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white shadow-lg shadow-blue-600/20 transition hover:bg-blue-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-400 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isIniciando ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                <span>Iniciando…</span>
              </>
            ) : (
              <>
                <Play className="h-4 w-4 fill-current" aria-hidden />
                <span>Iniciar</span>
              </>
            )}
          </button>
        </form>
      )}
    </div>
  );
};