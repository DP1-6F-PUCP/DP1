import React, { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { createPortal } from 'react-dom';
import { createBrowserRouter, RouterProvider, Navigate, Outlet, useNavigate } from 'react-router-dom';
import { DashboardPage } from '../pages/DashboardPage';
import { DataFilesPage } from '../pages/DataFilesPage';
import { SeguimientoPage } from '../pages/SeguimientoPage';
import { ToastProvider } from '../components/ToastProvider';
import { LiveAnnouncer } from '../components/LiveAnnouncer';
import { MapErrorBoundary } from '../components/map/MapErrorBoundary';
import { RouteMap } from '../components/map/RouteMap';
import { MapSlotContext } from '../contexts/MapSlotContext';
import { SeleccionarEscenarioGate } from '../features/escenario/components/SeleccionarEscenarioGate';
import { SidebarLeft } from '../components/SidebarLeft';
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
  const selectedScenarioType = useScenarioStore((s) => s.selectedScenarioType);
  const setSelectedScenarioType = useScenarioStore((s) => s.setSelectedScenarioType);
  const setEjecucion = useScenarioStore((s) => s.setEjecucion);
  const navigate = useNavigate();

  const hasActiveExecution = Boolean(ejecucion && ESTADOS_ACTIVOS.has(ejecucion.estado));

  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [showDataFiles, setShowDataFiles] = useState(false);

  // Mapa persistente montado una sola vez aqui
  const [mapSlot, setMapSlot] = useState<HTMLDivElement | null>(null);
  const { warehouses, vehicles, blockedStreets, orders, routes, estadoRaw } = useEstadoOperacion();
  // Unico punto de ingesta del motor de simulacion (engine/simulationEngine.ts), con el estado EN
  // VIVO. Todo lo que se muestra junto al mapa lee el estado retrasado (useEstadoVisual), para que
  // marcadores, reloj, badges y panel muestren el mismo instante.
  useSimulationEngineIngest({ vehicles, routes, orders, warehouses, blockedStreets, estadoRaw });
  const visual = useEstadoVisual();
  const scenarioStartMs = useScenarioStore((s) => s.scenarioStartMs());
  const simMinutesVisible = visual.marcaVisibleMs != null && scenarioStartMs != null
    ? Math.round((visual.marcaVisibleMs - scenarioStartMs) / 60000)
    : 0;

  return (
    <LiveAnnouncer>
      <ToastProvider historyScope={ejecucion?.idEjecucion ?? 'global'}>
        <div className="relative flex h-screen w-screen overflow-hidden bg-[#0B111E] text-slate-100 font-sans select-none">
          {/* SIDEBAR IZQUIERDO:
              - Antes de la simulación: SidebarLeft (logo, Carga de Datos, selección de escenarios, Config)
              - Durante la simulación: SidebarRight (Operación, Semáforo de flota, Seguimiento, Averías)
          */}
          {hasActiveExecution ? (
            <SidebarRight
              isCollapsed={isSidebarCollapsed}
              onToggleCollapse={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
            />
          ) : (
            <SidebarLeft
              currentScenario={selectedScenarioType}
              onSelectScenario={(scenario) => {
                setShowDataFiles(false);
                setSelectedScenarioType(scenario);
              }}
              isCollapsed={isSidebarCollapsed}
              onToggleCollapse={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
              onOpenConfig={() => setIsConfigOpen(true)}
              onOpenDataFiles={() => setShowDataFiles(true)}
              isDataFilesActive={showDataFiles}
              hasActiveExecution={false}
            />
          )}

          {/* CONTENIDO PRINCIPAL: Layout Vertical con Header Delgado + Vistas */}
          <div className="flex-1 flex flex-col h-full overflow-hidden relative">
            {hasActiveExecution && (
              <OperacionTopbar />
            )}

            {/* Contenido de la Ruta con Gate de Escenario */}
            <main className="flex-1 flex overflow-hidden relative">
              {showDataFiles ? (
                <DataFilesPage warehouses={warehouses} />
              ) : (
                <SeleccionarEscenarioGate>
                  <MapSlotContext.Provider value={{ slot: mapSlot, setSlot: setMapSlot }}>
                    <Outlet />
                  </MapSlotContext.Provider>
                </SeleccionarEscenarioGate>
              )}
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
              setShowDataFiles(false);
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
