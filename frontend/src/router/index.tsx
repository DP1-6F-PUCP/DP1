import React, { useRef, useState } from 'react';
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
import { useScenarioStore } from '../store/scenarioStore';
import { useThemeStore } from '../store/themeStore';
import { OperacionTopbar } from '../components/OperacionTopbar';
import { SimulationFinishedModal } from '../components/SimulationFinishedModal';

const ESTADOS_ACTIVOS = new Set(['INICIADA', 'EN_CURSO', 'PAUSADA']);

const RootLayout: React.FC = () => {
  useSimulationSocket();
  useSincronizarEjecucion();

  const isDark = useThemeStore((s) => s.isDark);
  const ejecucion = useScenarioStore((s) => s.ejecucion);
  const selectedScenarioType = useScenarioStore((s) => s.selectedScenarioType);
  const setSelectedScenarioType = useScenarioStore((s) => s.setSelectedScenarioType);
  const setEjecucion = useScenarioStore((s) => s.setEjecucion);
  const navigate = useNavigate();

  const hasActiveExecution = Boolean(ejecucion && ESTADOS_ACTIVOS.has(ejecucion.estado));
  const simulationStoppedByBreach = ejecucion?.estado === 'DETENIDA_POR_INCUMPLIMIENTO';
  const simulationFinished = simulationStoppedByBreach;

  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [showDataFiles, setShowDataFiles] = useState(false);

  // Mapa persistente montado una sola vez aqui (no en cada pagina); cada MapSlot lo reparenta
  // (appendChild nativo, ver contexts/MapSlotContext.tsx) hacia donde la pagina activa lo necesite.
  const mapHostRef = useRef<HTMLDivElement>(null);
  const { warehouses, vehicles, blockedStreets, orders, routes, estadoRaw } = useEstadoOperacion();
  // Unico punto de ingesta del motor de simulacion (engine/simulationEngine.ts) -- de aqui en
  // adelante, el mapa/SimClock/etc. ya no calculan nada por su cuenta, solo leen del motor.
  useSimulationEngineIngest(vehicles, routes, blockedStreets, estadoRaw?.marcaTiempoActual ?? null);
  const failedOrder = orders.find((order) => order.status === 'delayed') ?? null;
  const failedOrderVehicle = failedOrder?.assignedVehicleId
    ? vehicles.find((vehicle) => vehicle.id === failedOrder.assignedVehicleId) ?? null
    : null;

  return (
    <LiveAnnouncer>
      <ToastProvider historyScope={ejecucion?.idEjecucion ?? 'global'}>
        <div className="flex h-screen w-screen overflow-hidden bg-[#0B111E] text-slate-100 font-sans select-none">
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
                  <MapSlotContext.Provider value={mapHostRef}>
                    <Outlet />
                  </MapSlotContext.Provider>
                </SeleccionarEscenarioGate>
              )}
            </main>
          </div>

          {/* Modales globales pre-simulación */}
          <ConfigModal
            isOpen={isConfigOpen}
            onClose={() => setIsConfigOpen(false)}
          />

          <SimulationFinishedModal
            isOpen={simulationFinished}
            order={failedOrder}
            vehicle={failedOrderVehicle}
            onAccept={() => {
              setEjecucion(null);
              setShowDataFiles(false);
              navigate('/', { replace: true });
            }}
          />

          {/* Mapa persistente: una sola instancia de React/Leaflet para toda la sesion, SIEMPRE
              montada aqui -- cada <MapSlot/> de la pagina activa la reparenta (appendChild nativo)
              hacia donde la necesite. Navegar entre paginas ya no destruye y reconstruye el mapa
              (ni pierde la animacion en tiempo real, ni la suscripcion al motor de simulacion): el
              nodo real nunca se desmonta, solo cambia de padre en el DOM. */}
          <div ref={mapHostRef} className="hidden w-full h-full">
            <MapErrorBoundary fallbackTitle="Error en el Mapa">
              <RouteMap
                warehouses={warehouses}
                vehicles={vehicles}
                blockedStreets={blockedStreets}
                orders={orders}
                routes={routes}
                isDarkTheme={isDark}
              />
            </MapErrorBoundary>
          </div>
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
