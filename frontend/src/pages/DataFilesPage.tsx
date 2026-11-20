import React from 'react';
import { Database } from 'lucide-react';
import { CargaMasivaArchivos } from '../features/archivos/components/CargaMasivaArchivos';
import { useScenarioStore } from '../store/scenarioStore';

const ESTADOS_ACTIVOS = new Set(['INICIADA', 'EN_CURSO', 'PAUSADA']);

/**
 * Carga masiva como página suelta. No tiene ruta propia: la carga vive en Configuración › Datos
 * (/configuracion?seccion=datos), que usa el mismo CargaMasivaArchivos. Se conserva por si se
 * quiere enlazar sola.
 */
export const DataFilesPage: React.FC = () => {
  const ejecucion = useScenarioStore((s) => s.ejecucion);
  const enCaliente = Boolean(ejecucion && ESTADOS_ACTIVOS.has(ejecucion.estado));
  return (
    <div className="h-full w-full overflow-y-auto bg-[var(--color-background)] px-4 py-5 text-slate-900 dark:text-slate-100 sm:px-6">
      <div className="mx-auto max-w-6xl space-y-4">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold">
            <Database className="h-5 w-5 text-blue-600 dark:text-blue-400" aria-hidden />Carga masiva de datos
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">Pedidos, tramos bloqueados y mantenimiento preventivo.</p>
        </div>
        <CargaMasivaArchivos enCaliente={enCaliente} />
      </div>
    </div>
  );
};
