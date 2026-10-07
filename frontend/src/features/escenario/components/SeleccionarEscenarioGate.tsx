import React, { useState } from 'react';
import { useEscenario } from '../hooks/useEscenario';
import { useDescubrirEjecucionActiva } from '../../../hooks/useDescubrirEjecucionActiva';
import { TipoEscenarioBackend } from '../../../types/backend';
import { formatDateForInput } from '../../../utils/simulation';

const OPCIONES: { tipo: TipoEscenarioBackend; label: string; description: string }[] = [
  { tipo: 'DIA_A_DIA', label: 'Día a día', description: 'Operación continua en tiempo real (k=1).' },
  { tipo: 'CINCO_DIAS', label: 'Cinco días', description: 'Evaluación comprimida de 5 días simulados.' },
  { tipo: 'COLAPSO_LOGISTICO', label: 'Colapso logístico', description: 'Estrés hasta el primer incumplimiento.' },
];

/**
 * Bloquea el resto de la app hasta que exista una ejecucion activa -- sin esto, GET
 * /api/estado-operacion siempre devuelve un contexto vacio (OrquestadorOperacion ni existe).
 * seleccionarEscenario es idempotente en el backend: si otro dispositivo ya inicio una ejecucion,
 * esta llamada simplemente se le une en vez de crear una segunda.
 */
// Mismo criterio que ServicioPlanificacionImpl.esEjecucionActiva: PAUSADA sigue contando como
// activa (reversible, la app debe seguir visible aunque congelada); FINALIZADA/
// DETENIDA_POR_INCUMPLIMIENTO no.
const ESTADOS_ACTIVOS = new Set(['INICIADA', 'EN_CURSO', 'PAUSADA']);

export const SeleccionarEscenarioGate: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { ejecucion, iniciarEscenario, isIniciando, error } = useEscenario();
  const { verificando } = useDescubrirEjecucionActiva();
  const [tipo, setTipo] = useState<TipoEscenarioBackend>('DIA_A_DIA');
  const [fecha, setFecha] = useState(formatDateForInput(new Date()));

  if (ejecucion && ESTADOS_ACTIVOS.has(ejecucion.estado)) {
    return <>{children}</>;
  }

  // Evita el parpadeo de "Iniciar ejecución" seguido de un salto al dashboard apenas resuelve la
  // consulta de useDescubrirEjecucionActiva (GET /api/escenarios/activa).
  if (verificando) {
    return (
      <div className="flex-1 flex items-center justify-center bg-[#0B111E] text-slate-400 text-xs">
        Buscando ejecución activa...
      </div>
    );
  }

  return (
    <div className="flex-1 flex items-center justify-center bg-[#0B111E] text-slate-100 p-6">
      <div className="w-full max-w-md rounded-xl border border-slate-800 bg-slate-900/95 p-6 space-y-5">
        <div>
          <h1 className="text-lg font-bold text-white">Iniciar ejecución</h1>
          <p className="text-xs text-slate-400 mt-1">
            Elige el tipo de escenario para arrancar el planificador. Si ya hay una ejecución activa en
            cualquier dispositivo, esta pantalla se une a ella en vez de crear una nueva.
          </p>
        </div>

        <div className="space-y-2">
          {OPCIONES.map((op) => (
            <label
              key={op.tipo}
              className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                tipo === op.tipo
                  ? 'border-blue-500/60 bg-blue-950/30'
                  : 'border-slate-800 hover:border-slate-700'
              }`}
            >
              <input
                type="radio"
                name="tipo-escenario"
                className="mt-1"
                checked={tipo === op.tipo}
                onChange={() => setTipo(op.tipo)}
              />
              <span>
                <span className="block text-sm font-medium text-slate-100">{op.label}</span>
                <span className="block text-xs text-slate-400">{op.description}</span>
              </span>
            </label>
          ))}
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1" htmlFor="fecha-inicio-simulada">
            Fecha de inicio simulada
          </label>
          <input
            id="fecha-inicio-simulada"
            type="date"
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
            className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
          />
        </div>

        {error && (
          <p className="text-xs text-rose-400">{(error as Error).message || 'No se pudo iniciar el escenario.'}</p>
        )}

        <button
          type="button"
          disabled={isIniciando}
          onClick={() =>
            iniciarEscenario({
              tipo,
              fechaInicioSimulada: fecha ? `${fecha}T00:00:00Z` : undefined,
            })
          }
          className="w-full py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-medium transition-colors"
        >
          {isIniciando ? 'Iniciando...' : 'Iniciar ejecución'}
        </button>
      </div>
    </div>
  );
};
