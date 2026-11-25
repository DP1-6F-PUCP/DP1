import React, { useEffect, useRef, useState } from 'react';
import { Settings, X } from 'lucide-react';
import { useParametrosSistema } from '../features/configuracion/useParametrosSistema';
import {
  DialogoCambiosSinGuardar,
  PanelConfiguracion,
  type SeccionConfig,
} from '../features/configuracion/components/PanelConfiguracion';
import { BORDE, TEXTO_FUERTE } from '../features/configuracion/components/ui';

interface ConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * Configuración desde la pantalla de inicio (antes de simular). Allí SeleccionarEscenarioGate
 * reemplaza las rutas, así que /configuracion no se puede mostrar: se abren los MISMOS bloques
 * (PanelConfiguracion + useParametrosSistema) en un diálogo grande. Lo guardado queda como ajustes
 * pendientes que viajan al pulsar "Iniciar". Con una simulación en curso se usa la página.
 *
 * El contenido se monta solo mientras está abierto: cada apertura parte de lo guardado, y al
 * cerrarlo sin guardar la vista previa del tema se revierte (cleanup del hook).
 */
export const ConfigModal: React.FC<ConfigModalProps> = ({ isOpen, onClose }) =>
  isOpen ? <ContenidoModal onClose={onClose} /> : null;

const ContenidoModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const p = useParametrosSistema();
  const [seccion, setSeccion] = useState<SeccionConfig>('flota');
  const [confirmando, setConfirmando] = useState(false);
  const cerrarRef = useRef<HTMLButtonElement>(null);

  const pedirCierre = () => {
    if (p.isSaving) return;
    if (p.hayCambios) setConfirmando(true);
    else onClose();
  };
  const pedirCierreRef = useRef(pedirCierre);
  useEffect(() => { pedirCierreRef.current = pedirCierre; });

  useEffect(() => {
    cerrarRef.current?.focus();
    const alTecla = (e: KeyboardEvent) => { if (e.key === 'Escape') pedirCierreRef.current(); };
    window.addEventListener('keydown', alTecla);
    return () => window.removeEventListener('keydown', alTecla);
  }, []);

  return (
    <div className="fixed inset-0 z-9999 flex items-center justify-center bg-black/60 p-2 backdrop-blur-sm sm:p-4"
      onMouseDown={(e) => { if (e.target === e.currentTarget) pedirCierre(); }}>
      <div role="dialog" aria-modal="true" aria-labelledby="titulo-config-modal"
        className={`flex h-[min(820px,calc(100vh-1rem))] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border ${BORDE} bg-[var(--color-background)] shadow-2xl ${TEXTO_FUERTE}`}>
        <header className={`flex shrink-0 items-center justify-between gap-3 border-b ${BORDE} bg-[var(--color-surface)] px-4 py-3 sm:px-5`}>
          <div className="min-w-0">
            <h2 id="titulo-config-modal" className="flex items-center gap-2 text-base font-semibold">
              <Settings className="h-5 w-5 text-blue-600 dark:text-blue-400" aria-hidden />Configuración
            </h2>
            {/* Cuándo se aplica lo guardado ya lo dice la barra inferior, junto a «Guardar». */}
          </div>
          <button ref={cerrarRef} type="button" onClick={pedirCierre} aria-label="Cerrar configuración"
            className="rounded-lg p-2 text-slate-500 transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white">
            <X className="h-5 w-5" />
          </button>
        </header>
        <PanelConfiguracion p={p} seccion={seccion} onSeccion={setSeccion} variante="modal" />
      </div>

      {confirmando && (
        <DialogoCambiosSinGuardar
          p={p}
          onSeguir={() => setConfirmando(false)}
          onDescartar={() => { p.descartar(); setConfirmando(false); onClose(); }}
          onGuardado={() => { setConfirmando(false); onClose(); }}
        />
      )}
    </div>
  );
};
