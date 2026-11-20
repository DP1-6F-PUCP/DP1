import React, { useEffect, useRef, useState } from 'react';
import { Layers, Maximize2, Minus, Plus } from 'lucide-react';
import { useMapStore } from '../../store/mapStore';
import { hayFiltros } from '../../utils/filtrosMapa';
import { LeyendaCapas } from './LeyendaMapa';

interface Props {
  onAcercar: () => void;
  onAlejar: () => void;
  onEncuadrar: () => void;
}

const boton =
  'flex h-10 w-10 items-center justify-center text-slate-700 transition hover:bg-slate-100 hover:text-slate-900 ' +
  'focus-visible:z-10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500 ' +
  'dark:text-slate-200 dark:hover:bg-slate-800 dark:hover:text-white';

const grupo =
  'flex flex-col overflow-hidden rounded-xl border border-slate-300 bg-white shadow-lg ' +
  'dark:border-[var(--color-sidebar-border)] dark:bg-[var(--color-sidebar-background)]';

/**
 * Controles del mapa con el estilo de la app (reemplazan los +/− por defecto de Leaflet, blancos y
 * de 30 px): acercar/alejar de a un paso completo, volver a ver toda la ciudad y mostrar/ocultar
 * capas (con la leyenda, que además filtra: ver LeyendaCapas). Botones de 40 px con rótulo (y atajo de teclado) para mouse, toque y lector de pantalla.
 */
export const ControlesMapa: React.FC<Props> = ({ onAcercar, onAlejar, onEncuadrar }) => {
  const activeLayers = useMapStore((s) => s.activeLayers);
  const filtros = useMapStore((s) => s.filtros);
  const [capasAbiertas, setCapasAbiertas] = useState(false);
  const capasRef = useRef<HTMLDivElement>(null);
  // Aviso en el botón: hay capas ocultas o filtros activos (así no se cree que "faltan" cosas).
  const filtrando = hayFiltros(filtros) || Object.values(activeLayers).some((v) => !v);

  useEffect(() => {
    if (!capasAbiertas) return;
    const alClic = (e: MouseEvent) => { if (!capasRef.current?.contains(e.target as Node)) setCapasAbiertas(false); };
    const alTecla = (e: KeyboardEvent) => { if (e.key === 'Escape') setCapasAbiertas(false); };
    window.addEventListener('mousedown', alClic);
    window.addEventListener('keydown', alTecla);
    return () => {
      window.removeEventListener('mousedown', alClic);
      window.removeEventListener('keydown', alTecla);
    };
  }, [capasAbiertas]);

  return (
    <div data-panel-mapa className="absolute left-3 top-3 z-[1100] flex flex-col gap-2" role="toolbar" aria-label="Controles del mapa">
      <div className={`${grupo} divide-y divide-slate-200 dark:divide-[var(--color-sidebar-border)]`}>
        <button type="button" className={boton} onClick={onAcercar} title="Acercar (tecla +)" aria-label="Acercar">
          <Plus className="h-5 w-5" aria-hidden />
        </button>
        <button type="button" className={boton} onClick={onAlejar} title="Alejar (tecla −)" aria-label="Alejar">
          <Minus className="h-5 w-5" aria-hidden />
        </button>
      </div>

      <div className={grupo}>
        <button type="button" className={boton} onClick={onEncuadrar} title="Ver toda la ciudad" aria-label="Ver toda la ciudad">
          <Maximize2 className="h-[18px] w-[18px]" aria-hidden />
        </button>
      </div>

      <div ref={capasRef} className="relative">
        <div className={grupo}>
          <button
            type="button"
            className={`${boton} relative`}
            onClick={() => setCapasAbiertas((v) => !v)}
            title="Capas y leyenda"
            aria-label="Capas y leyenda"
            aria-expanded={capasAbiertas}
            aria-haspopup="true"
          >
            <Layers className="h-[18px] w-[18px]" aria-hidden />
            {filtrando && (
              <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-amber-400" aria-label="Hay capas ocultas o filtros activos" />
            )}
          </button>
        </div>
        {capasAbiertas && (
          // Mismo aspecto que los demás paneles sobre el mapa (relojes, indicadores).
          <div
            className="tema-panel absolute left-12 top-0 w-[316px] rounded-xl border border-[var(--color-sidebar-border)] bg-[var(--color-sidebar-background)]/95 shadow-xl backdrop-blur-sm"
            role="group"
            aria-label="Capas y leyenda del mapa"
          >
            <LeyendaCapas />
          </div>
        )}
      </div>
    </div>
  );
};
