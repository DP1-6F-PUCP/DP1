import React, { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { createPortal } from 'react-dom';
import { createBrowserRouter, RouterProvider, Navigate, Outlet, useNavigate } from 'react-router-dom';
import { DashboardPage } from '../pages/DashboardPage';
import { SeguimientoPage } from '../pages/SeguimientoPage';
import { ToastProvider } from '../components/ToastProvider';
import { LiveAnnouncer } from '../components/LiveAnnouncer';
import { MapErrorBoundary } from '../components/map/MapErrorBoundary';
import { RouteMap } from '../components/map/RouteMap';
import { MapSlotContext } from '../contexts/MapSlotContext';
import { SeleccionarEscenarioGate } from '../features/escenario/components/SeleccionarEscenarioGate';
import { SidebarRight } from '../components/SidebarRight';
import { ConfigModal } from '../components/ConfigModal';
import { useSimulationSocket } from '../hooks/useSimulationSocket';
import { useSincronizarEjecucion } from '../hooks/useSincronizarEjecucion';
import { useEstadoOperacion } from '../hooks/useEstadoOperacion';
import { useSimulationEngineIngest } from '../engine/useSimulationEngineIngest';
import { useEstadoVisual } from '../engine/useEstadoVisual';
import { useScenarioStore } from '../store/scenarioStore';
import { useThemeStore } from '../store/themeStore';
import { OperacionTopbar } from '../components/OperacionTopbar';
import { RelojesOperacion } from '../components/RelojesOperacion';
import { SimulationFinishedModal } from '../components/SimulationFinishedModal';
import { useReporteFinal } from '../hooks/useReporteFinal';

const ESTADOS_ACTIVOS = new Set(['INICIADA', 'EN_CURSO', 'PAUSADA']);

const RootLayout: React.FC = () => {
  useSimulationSocket();
  useSincronizarEjecucion();
  const reporteFinal = useReporteFinal();
  const inicioVisibleMs = useScenarioStore((s) => s.playbackStartedAtMs);

  const transicion = useScenarioStore((s) => s.transicion);
  const isDark = useThemeStore((s) => s.isDark);
  const ejecucion = useScenarioStore((s) => s.ejecucion);
  const setEjecucion = useScenarioStore((s) => s.setEjecucion);
  const navigate = useNavigate();

  const hasActiveExecution = Boolean(ejecucion && ESTADOS_ACTIVOS.has(ejecucion.estado));

  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isConfigOpen, setIsConfigOpen] = useState(false);

  // El panel de operación (SidebarRight) arranca colapsado cada vez que empieza una ejecución --
  // también al recargar con una ya en curso -- para dejar todo el ancho al mapa. Se abre solo al
  // seleccionar un vehículo, almacén o pedido, o con su botón.
  const [ejecucionVista, setEjecucionVista] = useState(false);
  if (hasActiveExecution !== ejecucionVista) {
    setEjecucionVista(hasActiveExecution);
    setIsSidebarCollapsed(hasActiveExecution);
  }

  // Mapa persistente montado una sola vez aqui
  const [mapSlot, setMapSlot] = useState<HTMLDivElement | null>(null);
  const { warehouses, vehicles, blockedStreets, orders, ordersTotal, routes, estadoRaw } = useEstadoOperacion();
  // Unico punto de ingesta del motor de simulacion (engine/simulationEngine.ts), con el estado EN
  // VIVO. Todo lo que se muestra junto al mapa lee el estado retrasado (useEstadoVisual), para que
  // marcadores, reloj, badges y panel muestren el mismo instante.
  useSimulationEngineIngest({ vehicles, routes, orders, ordersTotal, warehouses, blockedStreets, estadoRaw });
  const visual = useEstadoVisual();
  const scenarioStartMs = useScenarioStore((s) => s.scenarioStartMs());
  const simMinutesVisible = visual.marcaVisibleMs != null && scenarioStartMs != null
    ? Math.round((visual.marcaVisibleMs - scenarioStartMs) / 60000)
    : 0;

  return (
    <LiveAnnouncer>
      <ToastProvider historyScope={ejecucion?.idEjecucion ?? 'global'}>
        <div className="relative flex h-screen w-screen overflow-hidden bg-[#0B111E] text-slate-100 font-sans select-none">
          {/* Barra lateral solo durante la operación (SidebarRight). Antes de simular, la pantalla de
              inicio (SeleccionarEscenarioGate) ocupa todo: logo, modo/fecha/hora y Configuración. */}
          {hasActiveExecution && (
            <SidebarRight
              isCollapsed={isSidebarCollapsed}
              onToggleCollapse={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
            />
          )}

          {/* CONTENIDO PRINCIPAL: Layout Vertical con Header Delgado + Vistas */}
          <div className="flex-1 flex flex-col h-full overflow-hidden relative">
            {hasActiveExecution && (
              <OperacionTopbar />
            )}

            {/* Contenido de la Ruta con Gate de Escenario */}
            <main className="flex-1 flex overflow-hidden relative">
              {hasActiveExecution && <RelojesOperacion />}
              <SeleccionarEscenarioGate onOpenConfig={() => setIsConfigOpen(true)}>
                <MapSlotContext.Provider value={{ slot: mapSlot, setSlot: setMapSlot }}>
                  <Outlet />
                </MapSlotContext.Provider>
              </SeleccionarEscenarioGate>
            </main>
          </div>

          {transicion && (
            <div role="status" aria-live="polite" aria-busy="true"
              className="absolute inset-0 z-[5000] flex items-center justify-center bg-[var(--color-background)] text-[var(--color-text-primary)]">
              <div className="flex max-w-sm flex-col items-center gap-4 rounded-2xl border border-slate-700/60 bg-[var(--color-surface)] p-8 text-center shadow-xl">
                <Loader2 className="h-9 w-9 animate-spin text-blue-500" aria-hidden="true" />
                <p className="text-base font-semibold">{transicion === 'cerrando' ? 'Cerrando escenario…' : transicion === 'preparando' ? 'Preparando el nuevo escenario…' : 'Iniciando escenario…'}</p>
                <p className="text-sm text-slate-400">{transicion === 'cerrando' ? 'Finalizando la ejecución y limpiando sus datos.' : 'Cargando los datos iniciales de la nueva ejecución.'}</p>
              </div>
            </div>
          )}

          {/* Modales globales pre-simulación */}
          <ConfigModal
            isOpen={isConfigOpen}
            onClose={() => setIsConfigOpen(false)}
          />

          <SimulationFinishedModal
            isOpen={reporteFinal.abierto}
            reporte={reporteFinal.data}
            inicioVisibleMs={inicioVisibleMs}
            isError={reporteFinal.isError}
            onRetry={() => { void reporteFinal.refetch(); }}
            onAccept={() => {
              setEjecucion(null);
              navigate('/', { replace: true });
            }}
          />

          {mapSlot &&
            createPortal(
              <MapErrorBoundary fallbackTitle="Error en el Mapa">
                <RouteMap
                  warehouses={visual.warehouses}
                  vehicles={visual.vehicles}
                  blockedStreets={visual.blockedStreets}
                  orders={visual.orders}
                  routes={visual.routes}
                  simMinutes={simMinutesVisible}
                  isDarkTheme={isDark}
                />
              </MapErrorBoundary>,
              mapSlot,
            )}
        </div>
      </ToastProvider>
    </LiveAnnouncer>
  );
};

export const router = createBrowserRouter([
  {
    path: '/',
    element: <RootLayout />,
    children: [
      {
        index: true,
        element: <DashboardPage />,
      },
      {
        path: 'seguimiento',
        element: <SeguimientoPage />,
      },
      {
        path: 'seguimiento/:vehicleId',
        element: <SeguimientoPage />,
      },
      {
        path: '*',
        element: <Navigate to="/" replace />,
      },
    ],
  },
]);

export const AppRouter: React.FC = () => {
  return <RouterProvider router={router} />;
};
