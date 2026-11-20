import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Construction, PanelLeftOpen } from 'lucide-react';
import { useMapStore } from '../store/mapStore';
import { SECCIONES } from '../components/NavegacionLateral';

const CONTENIDO_PREVISTO: Record<string, string[]> = {
  '/flota': ['Lista de vehículos con su estado y carga', 'Calendario de mantenimientos', 'Historial de averías'],
  '/reportes': ['Indicadores detallados de la operación', 'Cumplimiento de plazos', 'Uso de la flota y de los almacenes'],
};

/** Mientras la sección no tiene su página, su lista sigue en el panel de detalle de Operación. */
const EN_EL_PANEL: Record<string, { pestana: 'operation' | 'fleet'; rotulo: string }> = {
  '/flota': { pestana: 'fleet', rotulo: 'Ver vehículos en vivo' },
  '/reportes': { pestana: 'operation', rotulo: 'Ver métricas y almacenes' },
};

/**
 * Página de una sección de gestión (fase 1: aún sin contenido). Se dibuja SOBRE el mapa, que
 * sigue montado y corriendo debajo (ver router): al volver a Operación conserva zoom, selección y
 * filtros.
 */
export const SeccionPage: React.FC<{ ruta: string }> = ({ ruta }) => {
  const navigate = useNavigate();
  const seccion = SECCIONES.find((s) => s.ruta === ruta) ?? SECCIONES[0];
  const Icono = seccion.icono;
  const previsto = CONTENIDO_PREVISTO[ruta] ?? [];
  const enPanel = EN_EL_PANEL[ruta];
  const abrirPanel = useMapStore((s) => s.abrirPanel);

  return (
    <div className="h-full w-full overflow-y-auto bg-[var(--color-background)] p-6 text-[var(--color-text-primary)]">
      <div className="mx-auto max-w-3xl">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-500/15 text-cyan-700 dark:text-cyan-400">
            <Icono className="h-5 w-5" aria-hidden />
          </span>
          <div>
            <h1 className="text-xl font-semibold">{seccion.nombre}</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">{seccion.descripcion}</p>
          </div>
        </div>

        <div className="mt-6 rounded-xl border border-dashed border-slate-300 bg-[var(--color-surface)] p-6 dark:border-slate-600">
          <div className="flex items-center gap-2 text-sm font-semibold text-amber-700 dark:text-amber-300">
            <Construction className="h-4 w-4" aria-hidden />En construcción
          </div>
          {previsto.length > 0 && (
            <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-slate-700 marker:text-slate-400 dark:text-slate-300 dark:marker:text-slate-500">
              {previsto.map((p) => <li key={p}>{p}</li>)}
            </ul>
          )}
          <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">Mientras tanto, esta información está en el panel de detalle de Operación.</p>
          {enPanel && (
            <button
              type="button"
              onClick={() => { abrirPanel(enPanel.pestana); navigate('/'); }}
              className="mt-4 inline-flex items-center gap-2 rounded-lg bg-cyan-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-cyan-500"
            >
              <PanelLeftOpen className="h-4 w-4" aria-hidden />{enPanel.rotulo}
            </button>
          )}
        </div>

        <button
          type="button"
          onClick={() => navigate('/')}
          className="mt-6 inline-flex items-center gap-2 rounded-lg border border-cyan-600/60 px-4 py-2 text-sm font-semibold text-cyan-700 transition hover:bg-cyan-500/10 dark:border-cyan-500/60 dark:text-cyan-300"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />Volver a la operación
        </button>
      </div>
    </div>
  );
};
