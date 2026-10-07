import React, { useRef } from 'react';
import { createBrowserRouter, RouterProvider, Navigate, Outlet, Link, useLocation } from 'react-router-dom';
import { DashboardPage } from '../pages/DashboardPage';
import { RutasPage } from '../pages/RutasPage';
import { SeguimientoPage } from '../pages/SeguimientoPage';
import { LayoutDashboard, Route as RouteIcon, Navigation, Truck } from 'lucide-react';
import { ToastProvider } from '../components/ToastProvider';
import { LiveAnnouncer } from '../components/LiveAnnouncer';
import { MapErrorBoundary } from '../components/map/MapErrorBoundary';
import { RouteMap } from '../components/map/RouteMap';
import { MapSlotContext } from '../contexts/MapSlotContext';
import { SeleccionarEscenarioGate } from '../features/escenario/components/SeleccionarEscenarioGate';
import { EjecucionDetenidaBanner } from '../features/escenario/components/EjecucionDetenidaBanner';
import { EjecucionControls } from '../features/escenario/components/EjecucionControls';
import { SimClock } from '../features/escenario/components/SimClock';
import { NuevaSolicitudButton } from '../features/escenario/components/NuevaSolicitudButton';
import { AlertasBell } from '../features/alertas/components/AlertasBell';
import { ArchivosButton } from '../features/archivos/components/ArchivosButton';
import { EventLogButton } from '../features/eventos/components/EventLogButton';
import { useSimulationSocket } from '../hooks/useSimulationSocket';
import { useSincronizarEjecucion } from '../hooks/useSincronizarEjecucion';
import { useEstadoOperacion } from '../hooks/useEstadoOperacion';

const RootLayout: React.FC = () => {
  const location = useLocation();
  useSimulationSocket();
  useSincronizarEjecucion();

  // El mapa se monta UNA sola vez aqui (no en cada pagina); cada MapSlot lo reparenta (appendChild
  // nativo, ver contexts/MapSlotContext.tsx) hacia donde la pagina activa lo necesite.
  const mapHostRef = useRef<HTMLDivElement>(null);
  const { warehouses, vehicles, blockedStreets, orders, routes } = useEstadoOperacion();

  const navLinks = [
    { to: '/', label: 'Dashboard', icon: LayoutDashboard, exact: true },
    { to: '/rutas', label: 'Rutas', icon: RouteIcon },
    { to: '/seguimiento', label: 'Seguimiento', icon: Navigation },
  ];

  return (
    <LiveAnnouncer>
    <ToastProvider>
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-[#0B111E] text-slate-100 font-sans">
      {/* Barra de Navegación Superior Centralizada */}
      <nav
        id="main-app-nav"
        aria-label="Navegación principal"
        className="h-14 border-b border-slate-800 bg-[#0F172A] px-4 flex items-center justify-between z-30 shrink-0"
      >
        <div className="flex items-center gap-6">
          <Link to="/" className="flex items-center gap-2.5 group">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-white font-bold text-xs shadow">
              <Truck className="h-4 w-4" />
            </div>
            <span className="font-bold text-sm tracking-wider uppercase text-white font-mono-code">
              Sys<span className="text-blue-400">Mile</span>
            </span>
          </Link>

          <div className="flex items-center gap-1 text-xs">
            {navLinks.map((link) => {
              const Icon = link.icon;
              const isActive = link.exact
                ? location.pathname === link.to
                : location.pathname.startsWith(link.to);
              return (
                <Link
                  key={link.to}
                  to={link.to}
                  aria-current={isActive ? 'page' : undefined}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition-colors ${
                    isActive
                      ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  <span>{link.label}</span>
                </Link>
              );
            })}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <SimClock />
          <AlertasBell />
          <EventLogButton />
          <ArchivosButton />
          <NuevaSolicitudButton />
          <EjecucionControls />
        </div>
      </nav>

      <EjecucionDetenidaBanner />

      {/* Contenido de la Ruta */}
      <main className="flex-1 flex overflow-hidden">
        <SeleccionarEscenarioGate>
          <MapSlotContext.Provider value={mapHostRef}>
            <Outlet />
          </MapSlotContext.Provider>
        </SeleccionarEscenarioGate>
      </main>

      {/* Mapa persistente: una sola instancia de React/Leaflet para toda la sesión, SIEMPRE
          montada aqui -- cada <MapSlot/> de la página activa la reparenta (appendChild nativo)
          hacia donde la necesite. Navegar entre Dashboard/Rutas/Seguimiento ya no destruye y
          reconstruye el mapa (ni pierde la animación en tiempo real): el nodo real nunca se
          desmonta, solo cambia de padre en el DOM. */}
      <div ref={mapHostRef} className="hidden w-full h-full">
        <MapErrorBoundary fallbackTitle="Error en el Mapa">
          <RouteMap
            warehouses={warehouses}
            vehicles={vehicles}
            blockedStreets={blockedStreets}
            orders={orders}
            routes={routes}
            isDarkTheme={true}
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
        path: 'rutas',
        element: <RutasPage />,
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
