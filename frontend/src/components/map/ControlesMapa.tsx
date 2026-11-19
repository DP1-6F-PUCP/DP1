import React, { useEffect, useRef, useState } from 'react';
import { Layers, Maximize2, Minus, Plus } from 'lucide-react';
import { MapLayersState, useMapStore } from '../../store/mapStore';

interface Props {
  onAcercar: () => void;
  onAlejar: () => void;
  onEncuadrar: () => void;
}

const CAPAS: Array<{ clave: keyof MapLayersState; label: string }> = [
  { clave: 'projectedRoutes', label: 'Rutas planificadas' },
  { clave: 'orderPins', label: 'Pedidos (destinos)' },
  { clave: 'blockedStreets', label: 'Calles bloqueadas' },
];

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
 * capas. Botones de 40 px con rótulo (y atajo de teclado) para mouse, toque y lector de pantalla.
 */
export const ControlesMapa: React.FC<Props> = ({ onAcercar, onAlejar, onEncuadrar }) => {
  const activeLayers = useMapStore((s) => s.activeLayers);
  const toggleLayer = useMapStore((s) => s.toggleLayer);
  const [capasAbiertas, setCapasAbiertas] = useState(false);
  const capasRef = useRef<HTMLDivElement>(null);
  const ocultas = CAPAS.filter((c) => !activeLayers[c.clave]).length;

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
    <div className="absolute left-3 top-3 z-[1100] flex flex-col gap-2" role="toolbar" aria-label="Controles del mapa">
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
            title="Capas del mapa"
            aria-label="Capas del mapa"
            aria-expanded={capasAbiertas}
            aria-haspopup="true"
          >
            <Layers className="h-[18px] w-[18px]" aria-hidden />
            {ocultas > 0 && (
              // Aviso de que hay capas ocultas: así no se cree que "faltan" rutas o pedidos.
              <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-amber-400" aria-label={`${ocultas} capa(s) oculta(s)`} />
            )}
          </button>
        </div>
        {capasAbiertas && (
          <div className={`${grupo} absolute left-12 top-0 w-56 p-2`} role="group" aria-label="Capas visibles">
            <div className="px-1 pb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Mostrar en el mapa
            </div>
            {CAPAS.map((c) => (
              <label
                key={c.clave}
                className="flex cursor-pointer items-center gap-2.5 rounded-lg px-1.5 py-1.5 text-sm text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                <input
                  type="checkbox"
                  checked={activeLayers[c.clave]}
                  onChange={() => toggleLayer(c.clave)}
                  className="h-4 w-4 accent-blue-600"
                />
                {c.label}
              </label>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
