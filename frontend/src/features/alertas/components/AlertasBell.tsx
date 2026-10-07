import React, { useState } from 'react';
import { Bell, AlertTriangle, Construction, Wrench, FileSearch } from 'lucide-react';
import { useAlertas } from '../hooks/useAlertas';
import { useEstadoOperacion } from '../../../hooks/useEstadoOperacion';
import { useScenarioStore } from '../../../store/scenarioStore';
import { DelayAlertModal } from '../../../components/DelayAlertModal';
import type { EventoDTO } from '../../../types/backend';

const ICONO_POR_TIPO: Record<string, React.ElementType> = {
  PEDIDO_EN_RIESGO_SLA: AlertTriangle,
  INCIDENCIA_BLOQUEO: Construction,
  INCIDENCIA_AVERIA_VEHICULO: Wrench,
};

const LABEL_POR_TIPO: Record<string, string> = {
  PEDIDO_EN_RIESGO_SLA: 'Riesgo de SLA',
  INCIDENCIA_BLOQUEO: 'Bloqueo',
  INCIDENCIA_AVERIA_VEHICULO: 'Avería',
};

/**
 * GET /api/alerts ya existia en el backend (AlertasController) pero ningun componente lo
 * consumia -- este es el primer punto de la UI que lo hace. DelayAlertModal tambien existia sin
 * montarse en ningun lado; para alertas PEDIDO_EN_RIESGO_SLA se resuelve el Order real via
 * useEstadoOperacion (misma fuente que el resto del dashboard) y se abre el detalle/PDF.
 */
export const AlertasBell: React.FC = () => {
  const { alertas } = useAlertas();
  const { orders, warehouses, vehicles, estadoRaw } = useEstadoOperacion();
  const scenarioStartMs = useScenarioStore((s) => s.scenarioStartMs());
  const [isOpen, setIsOpen] = useState(false);
  const [alertaSeleccionada, setAlertaSeleccionada] = useState<EventoDTO | null>(null);

  const ordenSeleccionada = alertaSeleccionada?.pedidoId
    ? orders.find((o) => o.id === alertaSeleccionada.pedidoId) ?? null
    : null;

  const nowMs = estadoRaw?.marcaTiempoActual ? Date.parse(estadoRaw.marcaTiempoActual) : null;
  const simMinute = nowMs != null && scenarioStartMs != null ? Math.round((nowMs - scenarioStartMs) / 60000) : 0;
  const simTime = nowMs != null ? new Date(nowMs).toLocaleString('es-PE', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' }) : '--:--';

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setIsOpen((v) => !v)}
        title="Alertas"
        className="relative p-1.5 rounded-lg border border-slate-700 bg-slate-800 text-slate-300 hover:border-blue-500/40 transition-colors"
      >
        <Bell className="h-3.5 w-3.5" />
        {alertas.length > 0 && (
          <span className="absolute -top-1 -right-1 h-4 min-w-4 px-0.5 flex items-center justify-center rounded-full bg-rose-600 text-[9px] font-bold text-white">
            {alertas.length > 9 ? '9+' : alertas.length}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 max-h-96 overflow-y-auto rounded-xl border border-slate-800 bg-slate-900 shadow-xl z-50">
          <div className="p-3 border-b border-slate-800">
            <h3 className="text-xs font-bold text-white">Alertas activas ({alertas.length})</h3>
          </div>
          {alertas.length === 0 ? (
            <p className="p-4 text-[11px] text-slate-500 text-center">Sin alertas en este momento.</p>
          ) : (
            <ul className="divide-y divide-slate-800">
              {alertas.map((a, idx) => {
                const Icon = ICONO_POR_TIPO[a.tipo] || AlertTriangle;
                const tieneDetalle = a.tipo === 'PEDIDO_EN_RIESGO_SLA' && Boolean(a.pedidoId);
                return (
                  <li key={`${a.tipo}-${a.pedidoId ?? a.vehiculoId ?? idx}`} className="p-3 flex gap-2.5">
                    <Icon className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] font-medium text-slate-200">
                        {LABEL_POR_TIPO[a.tipo] || a.tipo}
                      </p>
                      <p className="text-[11px] text-slate-400 truncate">{a.descripcion}</p>
                    </div>
                    {tieneDetalle && (
                      <button
                        type="button"
                        onClick={() => {
                          setAlertaSeleccionada(a);
                          setIsOpen(false);
                        }}
                        title="Ver detalle"
                        className="shrink-0 self-center p-1 rounded text-slate-400 hover:text-blue-400 hover:bg-slate-800 transition-colors"
                      >
                        <FileSearch className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}

      <DelayAlertModal
        isOpen={Boolean(alertaSeleccionada)}
        onClose={() => setAlertaSeleccionada(null)}
        order={ordenSeleccionada}
        simTime={simTime}
        simMinute={simMinute}
        warehouses={warehouses}
        vehicles={vehicles}
        isDarkTheme={true}
      />
    </div>
  );
};
