import React, { useState } from 'react';
import {
  Activity, Play, Route as RouteIcon, Truck, Navigation, MapPin, PackageOpen, PackageCheck,
  Coffee, Warehouse, Construction, Wrench, PackagePlus, RefreshCw, Camera, AlertTriangle, Flag,
} from 'lucide-react';
import { useEstadoOperacion } from '../../../hooks/useEstadoOperacion';
import type { EventoDTO } from '../../../types/backend';

const ICONO_POR_TIPO: Record<string, React.ElementType> = {
  INICIO_SIMULACION: Play,
  PLANIFICACION_RUTAS: RouteIcon,
  DESPACHO_VEHICULO: Truck,
  MOVIMIENTO_TRAMO: Navigation,
  LLEGADA_A_DESTINO: MapPin,
  INICIO_SERVICIO: PackageOpen,
  FIN_SERVICIO_ENTREGA: PackageCheck,
  INICIO_REFRIGERIO: Coffee,
  FIN_REFRIGERIO: Coffee,
  RETORNO_ALMACEN: Warehouse,
  LLEGADA_ALMACEN: Warehouse,
  INCIDENCIA_BLOQUEO: Construction,
  INCIDENCIA_AVERIA_VEHICULO: Wrench,
  INCIDENCIA_NUEVO_PEDIDO: PackagePlus,
  REPLANIFICACION_RUTAS: RefreshCw,
  SNAPSHOT_ESTADO: Camera,
  PEDIDO_EN_RIESGO_SLA: AlertTriangle,
  FIN_SIMULACION: Flag,
};

const LABEL_POR_TIPO: Record<string, string> = {
  INICIO_SIMULACION: 'Inicio de simulación',
  PLANIFICACION_RUTAS: 'Planificación de rutas',
  DESPACHO_VEHICULO: 'Despacho de vehículo',
  MOVIMIENTO_TRAMO: 'Movimiento de tramo',
  LLEGADA_A_DESTINO: 'Llegada a destino',
  INICIO_SERVICIO: 'Inicio de servicio',
  FIN_SERVICIO_ENTREGA: 'Entrega completada',
  INICIO_REFRIGERIO: 'Inicio de refrigerio',
  FIN_REFRIGERIO: 'Fin de refrigerio',
  RETORNO_ALMACEN: 'Retorno a almacén',
  LLEGADA_ALMACEN: 'Llegada a almacén',
  INCIDENCIA_BLOQUEO: 'Incidencia: bloqueo',
  INCIDENCIA_AVERIA_VEHICULO: 'Incidencia: avería',
  INCIDENCIA_NUEVO_PEDIDO: 'Nuevo pedido',
  REPLANIFICACION_RUTAS: 'Replanificación de rutas',
  SNAPSHOT_ESTADO: 'Snapshot de estado',
  PEDIDO_EN_RIESGO_SLA: 'Riesgo de SLA',
  FIN_SIMULACION: 'Fin de simulación',
};

function formatHora(instante: string): string {
  const ms = Date.parse(instante);
  if (!Number.isFinite(ms)) return instante;
  return new Date(ms).toLocaleString('es-PE', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' });
}

/**
 * EstadoOperacionDTO.eventos (la bitacora de la simulacion: 18 TipoEvento posibles, desde
 * INICIO_SIMULACION hasta FIN_SIMULACION) se traia en cada poll de useEstadoOperacion pero no se
 * mostraba en ningun componente -- solo 2 de esos 18 tipos se usaban, filtrados dentro de
 * GET /api/alerts. Este es el primer punto de la UI que muestra la bitacora completa.
 */
export const EventLogButton: React.FC = () => {
  const { estadoRaw } = useEstadoOperacion();
  const [isOpen, setIsOpen] = useState(false);

  const eventos: EventoDTO[] = [...(estadoRaw?.eventos ?? [])].sort(
    (a, b) => Date.parse(b.instante) - Date.parse(a.instante)
  );

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setIsOpen((v) => !v)}
        title="Bitácora de eventos"
        className="p-1.5 rounded-lg border border-slate-700 bg-slate-800 text-slate-300 hover:border-blue-500/40 transition-colors"
      >
        <Activity className="h-3.5 w-3.5" />
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-96 max-h-[28rem] overflow-y-auto rounded-xl border border-slate-800 bg-slate-900 shadow-xl z-50">
          <div className="p-3 border-b border-slate-800 flex items-center justify-between">
            <h3 className="text-xs font-bold text-white">Bitácora de eventos ({eventos.length})</h3>
          </div>
          {eventos.length === 0 ? (
            <p className="p-4 text-[11px] text-slate-500 text-center">Sin eventos registrados todavía.</p>
          ) : (
            <ul className="divide-y divide-slate-800">
              {eventos.map((e, idx) => {
                const Icon = ICONO_POR_TIPO[e.tipo] || Activity;
                return (
                  <li key={`${e.instante}-${e.tipo}-${idx}`} className="p-2.5 flex gap-2.5">
                    <Icon className="h-3.5 w-3.5 text-slate-400 shrink-0 mt-0.5" />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] font-medium text-slate-200">{LABEL_POR_TIPO[e.tipo] || e.tipo}</span>
                        <span className="text-[10px] font-mono-code text-slate-500">{formatHora(e.instante)}</span>
                      </div>
                      <p className="text-[11px] text-slate-400 truncate">{e.descripcion}</p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
};
