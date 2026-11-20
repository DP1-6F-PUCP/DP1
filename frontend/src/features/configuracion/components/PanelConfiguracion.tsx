import React, { useEffect, useRef } from 'react';
import { AlertCircle, Clock, Database, Gauge, Loader2, Palette, RotateCcw, Save, Warehouse } from 'lucide-react';
import { confirmar } from '../../../components/Confirmacion';
import { CargaMasivaArchivos } from '../../archivos/components/CargaMasivaArchivos';
import type { BloqueEditable, ParametrosSistema } from '../useParametrosSistema';
import { BloqueAlmacenes, BloqueApariencia, BloqueFlota, BloqueOperacion, TextoAplicacion } from './Bloques';
import { Aviso, BORDE, BOTON_PRIMARIO, BOTON_SECUNDARIO, EncabezadoBloque, TEXTO, TEXTO_FUERTE, TEXTO_TENUE } from './ui';

export type SeccionConfig = BloqueEditable | 'datos';

export const SECCIONES: { id: SeccionConfig; label: string; detalle: string; Icono: typeof Gauge }[] = [
  { id: 'flota', label: 'Flota', detalle: 'Unidades, velocidad y capacidad', Icono: Gauge },
  { id: 'almacenes', label: 'Almacenes', detalle: 'Ubicación, capacidad y recarga', Icono: Warehouse },
  { id: 'operacion', label: 'Operación y turnos', detalle: 'Turnos y tiempos de servicio', Icono: Clock },
  { id: 'apariencia', label: 'Apariencia', detalle: 'Tema y semáforos', Icono: Palette },
  { id: 'datos', label: 'Datos', detalle: 'Carga masiva de archivos', Icono: Database },
];

export const esSeccion = (v: string | null): v is SeccionConfig => SECCIONES.some((s) => s.id === v);

/**
 * Cuerpo de Configuración: sub-navegación por bloques, el bloque elegido y la barra de acciones
 * fija (Guardar/Aplicar, Descartar, Restaurar valores oficiales). Lo usan la página /configuracion
 * (variante "pagina", sección en la URL) y el modal de la pantalla de inicio (variante "modal").
 */
export const PanelConfiguracion: React.FC<{
  p: ParametrosSistema;
  seccion: SeccionConfig;
  onSeccion: (s: SeccionConfig) => void;
  variante: 'pagina' | 'modal';
}> = ({ p, seccion, onSeccion, variante }) => {
  const contenidoRef = useRef<HTMLDivElement>(null);
  // Al cambiar de bloque, el contenido vuelve arriba.
  useEffect(() => { contenidoRef.current?.scrollTo({ top: 0 }); }, [seccion]);

  const cargando = !p.values || !p.configuracion;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        {/* Sub-navegación: columna a la izquierda en pantallas medianas; fila desplazable en angostas. */}
        <nav aria-label="Secciones de configuración"
          className={`shrink-0 border-b ${BORDE} md:w-60 md:border-b-0 md:border-r ${variante === 'pagina' ? 'md:py-2' : 'md:py-3'}`}>
          <ul className="flex gap-1 overflow-x-auto px-3 py-2 md:flex-col md:overflow-visible md:px-3 md:py-0">
            {SECCIONES.map(({ id, label, detalle, Icono }) => {
              const activo = seccion === id;
              const cambios = id === 'datos' ? 0 : p.cambiosPorBloque[id];
              const errores = id === 'datos' ? 0 : p.erroresPorBloque[id];
              return (
                <li key={id} className="shrink-0">
                  <button type="button" onClick={() => onSeccion(id)} aria-current={activo ? 'page' : undefined}
                    className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500 ${
                      activo
                        ? 'bg-blue-50 text-blue-800 dark:bg-blue-500/15 dark:text-blue-100'
                        : `${TEXTO} hover:bg-slate-100 dark:hover:bg-slate-800/60`}`}>
                    <Icono className={`h-4 w-4 shrink-0 ${activo ? 'text-blue-600 dark:text-blue-300' : TEXTO_TENUE}`} aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="block whitespace-nowrap text-sm font-medium">{label}</span>
                      <span className={`hidden truncate text-[11px] md:block ${activo ? 'text-blue-700/80 dark:text-blue-200/70' : TEXTO_TENUE}`}>{detalle}</span>
                    </span>
                    {errores > 0 ? (
                      <span title={`${errores} campo(s) con error`} className="flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-600 px-1 text-[11px] font-semibold text-white">!</span>
                    ) : cambios > 0 ? (
                      <span title={`${cambios} cambio(s) sin guardar`} className="flex h-5 min-w-5 items-center justify-center rounded-full bg-blue-600 px-1.5 font-mono-code text-[11px] font-semibold text-white">{cambios}</span>
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>

        <div ref={contenidoRef} className="min-h-0 flex-1 overflow-y-auto">
          <div className={`mx-auto w-full max-w-5xl ${variante === 'pagina' ? 'px-4 py-5 sm:px-6' : 'px-4 py-4 sm:px-5'}`}>
            {seccion === 'datos' ? (
              <>
                <EncabezadoBloque titulo="Datos" descripcion="Carga masiva de los archivos del caso: pedidos, bloqueos y mantenimiento preventivo." />
                <CargaMasivaArchivos enCaliente={p.enCaliente} />
              </>
            ) : cargando ? (
              <div role="status" className={`flex items-center justify-center gap-2 py-16 text-sm ${TEXTO_TENUE}`}>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />Cargando parámetros del sistema…
              </div>
            ) : seccion === 'flota' ? <BloqueFlota p={p} />
              : seccion === 'almacenes' ? <BloqueAlmacenes p={p} />
              : seccion === 'operacion' ? <BloqueOperacion p={p} />
              : <BloqueApariencia p={p} />}
          </div>
        </div>
      </div>

      <BarraAcciones p={p} />
    </div>
  );
};

/** Barra fija inferior: estado de los cambios y acciones explícitas. */
const BarraAcciones: React.FC<{ p: ParametrosSistema }> = ({ p }) => {
  const nErrores = Object.keys(p.errores).length;
  const cargando = !p.values;
  return (
    <div className={`shrink-0 border-t ${BORDE} bg-[var(--color-surface)] px-4 py-3 sm:px-5`}>
      {p.errorGeneral && <div className="mb-2"><Aviso tono="error" icono={<AlertCircle className="h-3.5 w-3.5" />}>{p.errorGeneral}</Aviso></div>}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex min-w-[13rem] flex-1 flex-col" aria-live="polite">
          {nErrores > 0 ? (
            <span className="flex items-center gap-1.5 text-sm font-medium text-rose-700 dark:text-rose-300">
              <AlertCircle className="h-4 w-4" aria-hidden />{nErrores} campo(s) con error
            </span>
          ) : p.hayCambios ? (
            <span className={`flex items-center gap-1.5 text-sm font-medium ${TEXTO_FUERTE}`}>
              <span className="h-2 w-2 rounded-full bg-blue-500" aria-hidden />{p.totalCambios} cambio(s) sin guardar
            </span>
          ) : (
            <span className={`text-sm ${TEXTO_TENUE}`}>
              Sin cambios pendientes
              {p.ajustesPendientes.length > 0 && ` · ${p.ajustesPendientes.length} ajuste(s) guardados para el inicio`}
            </span>
          )}
          <TextoAplicacion enCaliente={p.enCaliente} />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" disabled={cargando || p.esOficial || p.isSaving} className={BOTON_SECUNDARIO}
            onClick={async () => {
              if (await confirmar({ titulo: '¿Restaurar los valores oficiales?', detalle: 'Reemplaza lo editado en el formulario. No se guarda hasta que pulses Guardar.', accion: 'Restaurar', tono: 'peligro' })) p.restaurarOficiales();
            }}
            title={p.enCaliente
              ? 'Carga los valores oficiales del caso en lo editable ahora (no cambia flota ni posición de almacenes). Revisa y guarda.'
              : 'Carga los valores oficiales del caso en el formulario. Revisa y guarda.'}>
            <RotateCcw className="h-4 w-4" aria-hidden />Restaurar valores oficiales
          </button>
          <button type="button" disabled={!p.hayCambios || p.isSaving} className={BOTON_SECUNDARIO}
            onClick={async () => {
              if (await confirmar({ titulo: `¿Descartar ${p.totalCambios} cambio(s)?`, detalle: 'Vuelve a lo último guardado.', accion: 'Descartar', tono: 'peligro' })) p.descartar();
            }}>
            Descartar
          </button>
          <button type="button" onClick={async () => {
            const ok = await confirmar({
              titulo: `¿Guardar ${p.totalCambios} cambio(s)?`,
              detalle: p.cambiosPorBloque.apariencia === p.totalCambios ? 'Se aplican al instante.'
                : p.enCaliente ? 'Se aplican en el próximo lote.' : 'Se aplican al iniciar la simulación.',
              accion: 'Guardar', tono: 'crear',
            });
            if (ok) void p.guardar();
          }} disabled={cargando || !p.hayCambios || nErrores > 0 || p.isSaving}
            title={nErrores > 0 ? 'Corrige los campos marcados' : undefined} className={BOTON_PRIMARIO}>
            {/* Siempre "Guardar": cuándo se aplica ya lo dice la barra de la izquierda. */}
            {p.isSaving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Save className="h-4 w-4" aria-hidden />}
            Guardar
          </button>
        </div>
      </div>
    </div>
  );
};

/** Confirmación al salir con cambios sin guardar. */
export const DialogoCambiosSinGuardar: React.FC<{
  p: ParametrosSistema;
  onSeguir: () => void;
  onDescartar: () => void;
  onGuardado: () => void;
}> = ({ p, onSeguir, onDescartar, onGuardado }) => {
  const seguirRef = useRef<HTMLButtonElement>(null);
  const onSeguirRef = useRef(onSeguir);
  useEffect(() => { onSeguirRef.current = onSeguir; }, [onSeguir]);
  useEffect(() => {
    seguirRef.current?.focus();
    // Fase de captura: Esc cierra este diálogo y no llega al modal de debajo.
    const alTecla = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onSeguirRef.current(); } };
    window.addEventListener('keydown', alTecla, true);
    return () => window.removeEventListener('keydown', alTecla, true);
  }, []);
  const nErrores = Object.keys(p.errores).length;
  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/50 p-4 backdrop-blur-[2px]">
      <div role="alertdialog" aria-modal="true" aria-labelledby="titulo-sin-guardar" aria-describedby="detalle-sin-guardar"
        className={`w-full max-w-md rounded-2xl border ${BORDE} bg-[var(--color-surface)] p-5 shadow-2xl`}>
        <h2 id="titulo-sin-guardar" className={`text-base font-semibold ${TEXTO_FUERTE}`}>¿Salir sin guardar?</h2>
        <p id="detalle-sin-guardar" className={`mt-1.5 text-sm ${TEXTO}`}>
          Tienes {p.totalCambios} cambio(s) sin guardar en Configuración. Si sales ahora se descartan
          {p.cambiosPorBloque.apariencia > 0 ? ' (el tema vuelve al guardado)' : ''}.
        </p>
        {nErrores > 0 && <p className="mt-2 text-xs text-rose-700 dark:text-rose-300">Hay {nErrores} campo(s) con error: corrígelos para poder guardar.</p>}
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button ref={seguirRef} type="button" onClick={onSeguir} className={BOTON_SECUNDARIO}>Seguir editando</button>
          <button type="button" onClick={onDescartar}
            className="inline-flex items-center justify-center rounded-lg border border-rose-300 px-3 py-2 text-sm font-medium text-rose-700 transition hover:bg-rose-50 dark:border-rose-800 dark:text-rose-300 dark:hover:bg-rose-950/40">
            Descartar y salir
          </button>
          <button type="button" disabled={nErrores > 0 || p.isSaving} className={BOTON_PRIMARIO}
            onClick={async () => { if (await p.guardar()) onGuardado(); }}>
            {p.isSaving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            Guardar y salir
          </button>
        </div>
      </div>
    </div>
  );
};
