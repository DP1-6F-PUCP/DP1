import React, { useCallback, useEffect } from 'react';
import { useBlocker, useSearchParams } from 'react-router-dom';
import { Settings } from 'lucide-react';
import { useParametrosSistema } from '../features/configuracion/useParametrosSistema';
import {
  DialogoCambiosSinGuardar,
  PanelConfiguracion,
  esSeccion,
  type SeccionConfig,
} from '../features/configuracion/components/PanelConfiguracion';
import { BORDE, TEXTO_FUERTE, TEXTO_TENUE } from '../features/configuracion/components/ui';

/**
 * Configuración a todo el ancho (sobre el mapa, como las demás secciones). La sección elegida va
 * en la URL (?seccion=flota|almacenes|operacion|apariencia|datos), así un enlace o "atrás" la
 * conservan. Con cambios sin guardar, salir a otra sección de la app pide confirmación (useBlocker)
 * y recargar/cerrar la pestaña muestra el aviso del navegador.
 *
 * Esta página solo se ve con una ejecución a la vista: antes de simular, SeleccionarEscenarioGate
 * reemplaza las rutas por la pantalla de inicio, que abre los mismos bloques en ConfigModal.
 */
export const ConfiguracionPage: React.FC = () => {
  const p = useParametrosSistema();
  const [params, setParams] = useSearchParams();
  const seccionParam = params.get('seccion');
  const seccion: SeccionConfig = esSeccion(seccionParam) ? seccionParam : 'flota';
  const onSeccion = useCallback((s: SeccionConfig) => {
    setParams((previos) => {
      const siguientes = new URLSearchParams(previos);
      if (s === 'flota') siguientes.delete('seccion');
      else siguientes.set('seccion', s);
      return siguientes;
    }, { replace: true });
  }, [setParams]);

  // Solo bloquea al salir de /configuracion (cambiar de pestaña interna no pierde nada).
  const blocker = useBlocker(({ currentLocation, nextLocation }) =>
    p.hayCambios && currentLocation.pathname !== nextLocation.pathname);

  useEffect(() => {
    if (!p.hayCambios) return;
    const alSalir = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', alSalir);
    return () => window.removeEventListener('beforeunload', alSalir);
  }, [p.hayCambios]);

  return (
    <div className={`flex h-full w-full flex-col bg-[var(--color-background)] ${TEXTO_FUERTE}`}>
      <header className={`flex shrink-0 flex-wrap items-center justify-between gap-3 border-b ${BORDE} px-4 py-4 sm:px-6`}>
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold">
            <Settings className="h-5 w-5 text-blue-600 dark:text-blue-400" aria-hidden />Configuración
          </h1>
          <p className={`text-sm ${TEXTO_TENUE}`}>Parámetros del sistema, apariencia y carga de datos.</p>
        </div>
        {/* Se quitó la etiqueta «En curso · próximo lote»: cuándo se aplica ya lo dice la barra de
            Guardar, y los campos que no se pueden cambiar llevan candado. */}
      </header>

      <PanelConfiguracion p={p} seccion={seccion} onSeccion={onSeccion} variante="pagina" />

      {blocker.state === 'blocked' && (
        <DialogoCambiosSinGuardar
          p={p}
          onSeguir={() => blocker.reset()}
          onDescartar={() => { p.descartar(); blocker.proceed(); }}
          onGuardado={() => blocker.proceed()}
        />
      )}
    </div>
  );
};
