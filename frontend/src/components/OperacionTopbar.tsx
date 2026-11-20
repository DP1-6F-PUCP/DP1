import React from 'react';
import { Menu, Play, Square } from 'lucide-react';
import { useEscenario } from '../features/escenario/hooks/useEscenario';
import { EventLogButton } from '../features/eventos/components/EventLogButton';
import { useLocation } from 'react-router-dom';
import { seccionDe } from './NavegacionLateral';
import { confirmar } from './Confirmacion';
import { CLASE_TONO_ALERTA, useAlertasSecciones } from '../hooks/useAlertasSecciones';

const NOMBRE_ESCENARIO = {
  DIA_A_DIA: 'Tiempo Real',
  CINCO_DIAS: 'Simulación 5 Días',
  COLAPSO_LOGISTICO: 'Colapso Logístico',
} as const;

/**
 * Barra superior de la operación: botón de menú (☰, abre la barra de secciones), sección actual y registro de eventos (izquierda), escenario (al centro) y el botón
 * de detener (derecha). Los cuatro relojes están en un cuadro flotante sobre el mapa (ver
 * RelojesOperacion). Ya no hay botón de pausa; solo aparece "Reanudar" si la ejecución quedó
 * pausada por otra vía (otro navegador o la API), para no dejarla trabada.
 */
interface Props {
  /** Barra de secciones (NavegacionLateral) abierta. */
  menuAbierto?: boolean;
  onAlternarMenu?: () => void;
}

export const OperacionTopbar: React.FC<Props> = ({ menuAbierto, onAlternarMenu }) => {
  const { ejecucion, reanudar, detener, isReanudando, isDeteniendo } = useEscenario();
  const pausada = ejecucion?.estado === 'PAUSADA';
  const seccion = seccionDe(useLocation().pathname);
  // Punto en ☰ con la alerta más grave de las secciones (el detalle va en cada sección de la barra).
  const { peor } = useAlertasSecciones();
  const puedeControlar = ejecucion?.estado === 'EN_CURSO' || ejecucion?.estado === 'INICIADA' || pausada;

  const stop = async () => {
    if (!ejecucion) return;
    const ok = await confirmar({
      titulo: '¿Detener la simulación?', detalle: 'No se puede reanudar después.', accion: 'Detener', tono: 'peligro',
    });
    if (ok) detener(ejecucion.idEjecucion);
  };

  return (
    <header className="tema-panel relative flex h-14 shrink-0 items-center justify-between gap-3 border-b border-[var(--color-sidebar-border)] bg-[var(--color-sidebar-background)] px-3 text-slate-300">
      <div className="flex items-center gap-2 shrink-0">
        {/* Logo (antes en la cabecera del panel lateral, que ya no tiene riel propio). */}
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#2E5B9A] text-xs font-bold tracking-wide text-white shadow-sm" title="SysMile" aria-hidden>SM</span>
        {onAlternarMenu && (
          <button
            type="button"
            data-boton-menu
            onClick={onAlternarMenu}
            aria-expanded={menuAbierto}
            aria-label={`${menuAbierto ? 'Contraer la barra de secciones' : 'Expandir la barra de secciones'}${peor ? ' (hay alertas)' : ''}`}
            title={menuAbierto ? 'Contraer la barra de secciones' : 'Expandir la barra de secciones'}
            className={`relative flex h-9 w-9 items-center justify-center rounded-lg border transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-400 ${
              menuAbierto
                ? 'border-cyan-500/60 bg-cyan-500/10 text-cyan-300'
                : 'border-[var(--color-sidebar-border)] text-slate-300 hover:bg-white/5 hover:text-white'}`}
          >
            <Menu className="h-5 w-5" aria-hidden />
            {peor && (
              <span className={`absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full ring-2 ring-[var(--color-sidebar-background)] ${CLASE_TONO_ALERTA[peor]}`} aria-hidden />
            )}
          </button>
        )}
        <span className="px-1 text-sm font-semibold text-white">{seccion.nombre}</span>
        <EventLogButton />
      </div>

      {ejecucion && (
        <div className="pointer-events-none absolute left-1/2 -translate-x-1/2 text-center">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Escenario</div>
          <div className="text-sm font-semibold text-white whitespace-nowrap">
            {NOMBRE_ESCENARIO[ejecucion.tipoEscenario]}
          </div>
        </div>
      )}

      {puedeControlar && ejecucion && (
        <div className="flex shrink-0 items-center gap-1.5">
          {pausada && (
            <button
              type="button"
              title="Reanudar"
              disabled={isReanudando}
              onClick={() => reanudar(ejecucion.idEjecucion)}
              className="flex h-8 items-center gap-1.5 rounded-lg border border-blue-500 px-3 text-xs font-semibold text-blue-300 transition hover:bg-blue-500/10 disabled:opacity-50"
            >
              <Play className="h-4 w-4 fill-current" />
              Reanudar
            </button>
          )}
          <button
            type="button"
            title="Detener la ejecución"
            aria-label="Detener la ejecución"
            disabled={isDeteniendo}
            onClick={() => void stop()}
            className="flex h-8 w-9 items-center justify-center rounded-lg border border-rose-500/70 text-rose-400 transition hover:bg-rose-500/10 disabled:opacity-50"
          >
            <Square className="h-4 w-4 fill-current" />
          </button>
        </div>
      )}
    </header>
  );
};
