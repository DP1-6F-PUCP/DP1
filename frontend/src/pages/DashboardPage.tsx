import React from 'react';
import { MapSlot } from '../components/map/MapSlot';
import { useEstadoOperacion } from '../hooks/useEstadoOperacion';
import { useScenarioStore } from '../store/scenarioStore';
import { useMapStore } from '../store/mapStore';
import { getVehicleSemaforoStatus } from '../utils/vehicleStatus';
import { OrderListContainer } from '../features/pedidos/components/OrderListContainer';
import { MetricasStrip } from '../features/metricas/components/MetricasStrip';
import { Link } from 'react-router-dom';

export const DashboardPage: React.FC = () => {
  const { vehicles, orders, routes, warehouses, estadoRaw } = useEstadoOperacion();
  const scenarioStartMs = useScenarioStore((s) => s.scenarioStartMs());
  const selectedVehicleId = useMapStore((s) => s.selectedVehicleId);
  const setSelectedVehicleId = useMapStore((s) => s.setSelectedVehicleId);

  // Minutos simulados transcurridos desde fechaInicioSimulada -- ya no es un contador local de
  // mentira, se deriva del instante real que reporta el backend en cada tick.
  const nowMs = estadoRaw?.marcaTiempoActual ? Date.parse(estadoRaw.marcaTiempoActual) : null;
  const simMinutes = scenarioStartMs != null && nowMs != null ? Math.round((nowMs - scenarioStartMs) / 60000) : 0;

  const selectedVehicle = vehicles.find((v) => v.id === selectedVehicleId) || null;

  // Conteo de semáforo
  const semaforos = vehicles.map((v) => getVehicleSemaforoStatus(v, orders, simMinutes));
  const onTimeCount = semaforos.filter((s) => s.state === 'on_time').length;
  const atRiskCount = semaforos.filter((s) => s.state === 'at_risk').length;
  const delayedCount = semaforos.filter((s) => s.state === 'delayed').length;

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-[#0B111E] text-slate-100">
      {/* Barra de Estadísticas Rápidas de Operación */}
      <header className="p-3.5 border-b border-slate-800 bg-slate-900/90 flex flex-wrap items-center justify-between gap-4 shrink-0">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-xs font-bold uppercase tracking-wider text-slate-200">
              Operación VRP en Vivo
            </span>
          </div>

          <div className="flex items-center gap-4 text-xs font-mono-code">
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-950/40 border border-emerald-500/40 text-emerald-300">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              <span>A tiempo: {onTimeCount}</span>
            </div>
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-950/40 border border-amber-500/40 text-amber-300">
              <span className="h-2 w-2 bg-amber-500 transform rotate-45" />
              <span>En riesgo: {atRiskCount}</span>
            </div>
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-rose-950/40 border border-rose-500/40 text-rose-300">
              <span className="h-2 w-2 bg-rose-500" />
              <span>Retrasos: {delayedCount}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Link
            to="/rutas"
            className="text-xs font-medium py-1.5 px-3 rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors"
          >
            Ver Rutas ({routes.length})
          </Link>
          <Link
            to="/seguimiento"
            className="text-xs font-medium py-1.5 px-3 rounded-lg bg-blue-600 hover:bg-blue-500 text-white shadow transition-colors"
          >
            Seguimiento de Flota
          </Link>
        </div>
      </header>

      {/* Metricas globales de la operacion -- MetricasOperacionDTO completo (antes solo se leia
          contadorIncumplidos, en otro lado) */}
      <div className="px-3.5 py-2 border-b border-slate-800 bg-slate-900/60 shrink-0">
        <MetricasStrip metricas={estadoRaw?.metricas} />
      </div>

      {/* Cuerpo Principal: Inspector Lateral + Mapa -- mismo lado del panel que Rutas/Seguimiento
          (antes el mapa iba primero aqui, invirtiendo el patron de las otras 2 paginas sin razon). */}
      <div className="flex-1 flex overflow-hidden">
        {/* Panel Lateral de Inspección Rápida */}
        <aside className="w-96 border-r border-slate-800 bg-slate-900/95 flex flex-col p-4 space-y-4 overflow-y-auto shrink-0 text-xs">
          <div>
            <h3 className="font-bold text-sm text-white mb-1">Centro de Despacho</h3>
            <p className="text-[11px] text-slate-400">
              Malla Manhattan 70x50 km · 3 Almacenes Nodales
            </p>
          </div>

          {selectedVehicle ? (
            <div className="p-3 rounded-xl border border-blue-500/40 bg-blue-950/20 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="font-mono-code font-bold text-sm text-blue-300">
                  {selectedVehicle.code}
                </span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300 uppercase font-semibold">
                  {selectedVehicle.type}
                </span>
              </div>
              <div className="space-y-1 text-[11px] text-slate-300">
                <div>
                  <span className="text-slate-400">Ubicación actual: </span>
                  <span className="font-mono-code">
                    X={selectedVehicle.position.x}, Y={selectedVehicle.position.y}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400">Carga a bordo: </span>
                  <span className="font-mono-code">
                    {selectedVehicle.currentLoad}/{selectedVehicle.capacity} bultos
                  </span>
                </div>
                <div>
                  <span className="text-slate-400">Velocidad: </span>
                  <span className="font-mono-code">{selectedVehicle.speed} km/h</span>
                </div>
              </div>
              <div className="pt-2 border-t border-slate-800 flex justify-between">
                <Link
                  to={`/seguimiento?vehicleId=${selectedVehicle.id}`}
                  className="text-cyan-400 hover:underline font-medium text-[11px]"
                >
                  Abrir Seguimiento Detallado →
                </Link>
                <button
                  type="button"
                  onClick={() => setSelectedVehicleId(null)}
                  className="text-slate-400 hover:text-white"
                >
                  Cerrar
                </button>
              </div>
            </div>
          ) : (
            <div className="p-4 rounded-xl border border-dashed border-slate-800 text-center text-slate-400 text-xs">
              Haga clic sobre un vehículo o almacén en el mapa para inspeccionar sus parámetros operativos.
            </div>
          )}

          {/* Resumen de Almacenes -- ahora desde GET /api/estado-operacion */}
          <div className="space-y-2 pt-2 border-t border-slate-800">
            <h4 className="font-semibold text-slate-200 text-xs">Capacidad en Almacenes</h4>
            {warehouses.length === 0 && (
              <div className="p-3 rounded-lg bg-slate-950/60 border border-dashed border-slate-800 text-[11px] text-slate-500">
                Sin datos de almacenes todavía.
              </div>
            )}
            {warehouses.map((wh) => {
              const esCentral = !Number.isFinite(wh.capacity);
              const pct = Math.round(wh.occupancyPct);
              return (
                <div key={wh.id} className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800">
                  <div className="flex justify-between items-center mb-1">
                    <span className="font-medium text-slate-200">{wh.name}</span>
                    <span className="font-mono-code text-[11px] text-blue-400">
                      {esCentral ? '∞' : `${wh.currentStock}/${wh.capacity}`}
                    </span>
                  </div>
                  {!esCentral && (
                    <div className="h-1.5 rounded-full bg-slate-800 overflow-hidden">
                      <div
                        className={`h-full rounded-full ${pct > 85 ? 'bg-rose-500' : 'bg-cyan-500'}`}
                        style={{ width: `${Math.min(100, pct)}%` }}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Pedidos -- OrderListContainer existia completo pero nunca se montaba en ninguna
              pagina (ver auditoria); va aqui en vez de una pestaña propia del nav. */}
          <div className="pt-2 border-t border-slate-800 h-80 flex flex-col shrink-0">
            <h4 className="font-semibold text-slate-200 text-xs mb-2">Pedidos</h4>
            <div className="flex-1 min-h-0">
              <OrderListContainer />
            </div>
          </div>
        </aside>

        <MapSlot className="flex-1 relative h-full" />
      </div>
    </div>
  );
};
