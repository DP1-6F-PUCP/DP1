import React, { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { createPortal } from 'react-dom';
import { confirmar, DialogoConfirmacion } from '../components/Confirmacion';
import { createBrowserRouter, RouterProvider, Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { DashboardPage } from '../pages/DashboardPage';
import { SeguimientoPage } from '../pages/SeguimientoPage';
import { FlotaPage } from '../pages/FlotaPage';
import { ReportesPage } from '../pages/ReportesPage';
import { ConfiguracionPage } from '../pages/ConfiguracionPage';
import { PedidosPage } from '../pages/PedidosPage';
import { guardarNavegacionExpandida, leerNavegacionExpandida, NavegacionLateral } from '../components/NavegacionLateral';
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
import { useRegistrarHistorial } from '../features/reportes/useRegistrarHistorial';
import { useEstadoOperacion } from '../hooks/useEstadoOperacion';
import { useSimulationEngineIngest } from '../engine/useSimulationEngineIngest';
import { useEstadoVisual } from '../engine/useEstadoVisual';
import { useScenarioStore } from '../store/scenarioStore';
import { useThemeStore } from '../store/themeStore';
import { OperacionTopbar } from '../components/OperacionTopbar';
import { RelojesOperacion } from '../components/RelojesOperacion';
import { SimulationFinishedModal } from '../components/SimulationFinishedModal';
import { useReporteFinal } from '../hooks/useReporteFinal';
import { useCierreDiferido } from '../hooks/useCierreDiferido';
import { AvisoCierreOperacion } from '../components/AvisoCierreOperacion';
import { useMapStore } from '../store/mapStore';
import { TOPE_AVERIA_PROGRAMADA_MS, useAveriasProgramadasStore } from '../store/averiasProgramadasStore';

const ESTADOS_ACTIVOS = new Set(['INICIADA', 'EN_CURSO', 'PAUSADA']);


const RootLayout: React.FC = () => {
  useSimulationSocket();
  useSincronizarEjecucion();
  useRegistrarHistorial(); // historial de Reportes (registra aunque la página no esté abierta)
  const reporteFinal = useReporteFinal();
  const inicioVisibleMs = useScenarioStore((s) => s.playbackStartedAtMs);

  const transicion = useScenarioStore((s) => s.transicion);
  const isDark = useThemeStore((s) => s.isDark);
  const ejecucion = useScenarioStore((s) => s.ejecucion);
  const setEjecucion = useScenarioStore((s) => s.setEjecucion);
  const setSelectedOrderId = useMapStore((s) => s.setSelectedOrderId);
  const centrarEn = useMapStore((s) => s.centrarEn);
  const navigate = useNavigate();

  const hasActiveExecution = Boolean(ejecucion && ESTADOS_ACTIVOS.has(ejecucion.estado));

  // Cierre de la ejecución (colapso o fin del periodo). El backend termina al cerrar un lote, pero
  // el mapa va retrasado: el reporte espera a que el reloj visible llegue al cierre (useCierreDiferido)
  // y, mientras, la operación sigue a la vista con un aviso no bloqueante. Su "×" ya no termina:
  // oculta el reporte y deja el mapa final para revisarlo (el aviso ofrece Reporte / Salir).
  const idEjecucion = ejecucion?.idEjecucion;
  const esperandoCierre = useCierreDiferido(idEjecucion, reporteFinal.abierto, reporteFinal.data?.finSimulado);
  const [reporteForzadoPara, setReporteForzadoPara] = useState<string | null>(null);
  const [reporteOcultoPara, setReporteOcultoPara] = useState<string | null>(null);
  const esperando = esperandoCierre && reporteForzadoPara !== idEjecucion;
  const reporteOculto = reporteFinal.abierto && reporteOcultoPara === idEjecucion;
  // Terminada, la operación sigue a la vista (también DETRÁS del reporte) hasta pulsar «Salir»:
  // antes, con el reporte abierto se veía la pantalla de inicio detrás (parecía sesión cerrada) y el
  // mapa se desmontaba, así que al cerrar el reporte volvía vacío.
  const vistaFinal = reporteFinal.abierto;
  const avisoCierre = reporteFinal.abierto && (esperando || reporteOculto);
  const reporteVisible = reporteFinal.abierto && !esperando && !reporteOculto;
  // Operación a la vista: en curso, o terminada mientras se ve su cierre.
  const vistaActiva = hasActiveExecution || vistaFinal;
  const verReporte = () => { setReporteOcultoPara(null); setReporteForzadoPara(idEjecucion ?? null); };
  // «Salir» (reporte final y aviso de cierre): se reconfirma una sola vez, aquí. Tono azul: no borra
  // datos, solo cierra la vista final.
  const terminar = async () => {
    if (!(await confirmar({ titulo: '¿Volver al inicio?', detalle: 'Se cierran el mapa final y el reporte.', accion: 'Salir', tono: 'crear' }))) return;
    setEjecucion(null);
    navigate('/', { replace: true });
  };
  const irAPedidoIncumplido = (idPedido: string) => {
    const p = reporteFinal.data?.pedidosFinales.find((x) => x.idPedido === idPedido);
    setSelectedOrderId(idPedido);
    if (p) centrarEn(p.posX, p.posY);
    navigate('/');
  };

  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  // Barra de secciones, fija a la izquierda (el botón ☰ la expande o la deja en íconos). Operación es
  // el mapa (y /seguimiento, que solo selecciona un vehículo en él); el resto son páginas de gestión
  // que se dibujan SOBRE el mapa, que sigue montado y corriendo debajo: al volver conserva zoom,
  // selección y filtros, y no se reinicia nada.
  const [navExpandida, setNavExpandida] = useState(leerNavegacionExpandida);
  const alternarNav = () => setNavExpandida((v) => { guardarNavegacionExpandida(!v); return !v; });
  const { pathname } = useLocation();
  const enOperacion = pathname === '/' || pathname.startsWith('/seguimiento');

  // El panel de operación (SidebarRight) arranca colapsado cada vez que empieza una ejecución --
  // también al recargar con una ya en curso -- para dejar todo el ancho al mapa. Se abre solo al
  // seleccionar un vehículo, almacén o pedido, o con su botón.
  const [ejecucionVista, setEjecucionVista] = useState(false);
  if (vistaActiva !== ejecucionVista) {
    setEjecucionVista(vistaActiva);
    setIsSidebarCollapsed(vistaActiva);
  }

  // Mapa persistente montado una sola vez aqui
  const [mapSlot, setMapSlot] = useState<HTMLDivElement | null>(null);
  const { warehouses, vehicles, blockedStreets, orders, ordersTotal, routes, estadoRaw } = useEstadoOperacion();
  // Unico punto de ingesta del motor de simulacion (engine/simulationEngine.ts), con el estado EN
  // VIVO. Todo lo que se muestra junto al mapa lee el estado retrasado (useEstadoVisual), para que
  // marcadores, reloj, badges y panel muestren el mismo instante.
  useSimulationEngineIngest({ vehicles, routes, orders, ordersTotal, warehouses, blockedStreets, estadoRaw });
  const visual = useEstadoVisual();
  // Averías programadas (aviso en tooltip/tarjeta hasta que se aplican): se sueltan cuando el
  // vehículo ya se ve averiado en el mapa, tras el tope, o al cambiar de ejecución.
  const quitarAverias = useAveriasProgramadasStore((s) => s.quitar);
  const limpiarAverias = useAveriasProgramadasStore((s) => s.limpiar);
  useEffect(() => { limpiarAverias(); }, [idEjecucion, limpiarAverias]);
  useEffect(() => {
    const pendientes = useAveriasProgramadasStore.getState().pendientes;
    const ahora = Date.now();
    const resueltas = Object.entries(pendientes)
      .filter(([id, p]) => ahora - p.desdeMs > TOPE_AVERIA_PROGRAMADA_MS
        || visual.vehicles.some((v) => v.id === id && (v.status === 'broken' || v.status === 'maintenance')))
      .map(([id]) => id);
    if (resueltas.length) quitarAverias(resueltas);
  }, [visual.vehicles, quitarAverias]);
  const scenarioStartMs = useScenarioStore((s) => s.scenarioStartMs());
  const simMinutesVisible = visual.marcaVisibleMs != null && scenarioStartMs != null
    ? Math.round((visual.marcaVisibleMs - scenarioStartMs) / 60000)
    : 0;

  return (
    <LiveAnnouncer>
      <ToastProvider historyScope={ejecucion?.idEjecucion ?? 'global'}>
        {/* Fondo del tema (antes fijo #0B111E: en claro asomaba una franja azul oscura bajo las páginas). */}
        <div className="relative flex h-screen w-screen overflow-hidden bg-[var(--color-background)] text-[var(--color-text-primary)] font-sans select-none">

          {/* CONTENIDO PRINCIPAL: Layout Vertical con Header Delgado + Vistas */}
          <div className="flex-1 flex flex-col h-full overflow-hidden relative">
            {vistaActiva && (
              <OperacionTopbar
                menuAbierto={navExpandida}
                onAlternarMenu={alternarNav}
              />
            )}

            {/* Cierre de la operación: franja bajo la barra, en el flujo (no tapa el mapa ni las páginas). */}
            {avisoCierre && (
              <AvisoCierreOperacion
                reporte={reporteFinal.data}
                esperando={esperando}
                onVerReporte={verReporte}
                onSalir={esperando ? undefined : () => void terminar()}
                onIrAPedido={irAPedidoIncumplido}
              />
            )}

            {/* Contenido de la Ruta con Gate de Escenario */}
            <main className="flex-1 flex overflow-hidden relative">
              {/* De izquierda a derecha: barra de secciones (única navegación), el área del mapa /
                  páginas y el panel de detalle del mapa (solo abierto, al seleccionar algo). Antes de
                  simular, la pantalla de inicio (SeleccionarEscenarioGate) ocupa todo. */}
              {vistaActiva && <NavegacionLateral expandida={navExpandida} />}
              <div className="relative flex min-w-0 flex-1 overflow-hidden">
              {vistaActiva && enOperacion && <RelojesOperacion />}
              <SeleccionarEscenarioGate onOpenConfig={() => setIsConfigOpen(true)} mostrarOperacion={vistaFinal}>
                <MapSlotContext.Provider value={{ slot: mapSlot, setSlot: setMapSlot }}>
                  {/* El mapa (DashboardPage) queda montado siempre; las secciones van encima. */}
                  <DashboardPage />
                  {enOperacion ? <Outlet /> : (
                    <div className="absolute inset-0 z-[1500]">
                      <Outlet />
                    </div>
                  )}
                </MapSlotContext.Provider>
              </SeleccionarEscenarioGate>
              </div>
              {/* Panel de detalle a la DERECHA: la izquierda queda solo para navegar y el mapa no se
                  aleja de la barra al abrir una ficha (Relojes e Indicadores se corren solos). */}
              {vistaActiva && enOperacion && (
                <SidebarRight
                  isCollapsed={isSidebarCollapsed}
                  onToggleCollapse={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
                />
              )}
            </main>
          </div>

          {transicion && (
            <div role="status" aria-live="polite" aria-busy="true"
              className="absolute inset-0 z-[5000] flex items-center justify-center bg-[var(--color-background)] text-[var(--color-text-primary)]">
              <div className="flex max-w-sm flex-col items-center gap-4 rounded-2xl border border-slate-700/60 bg-[var(--color-surface)] p-8 text-center shadow-xl">
                <Loader2 className="h-9 w-9 animate-spin text-blue-500" aria-hidden="true" />
                <p className="text-base font-semibold">{transicion === 'cerrando' ? 'Cerrando escenario…' : transicion === 'preparando' ? 'Preparando el nuevo escenario…' : 'Iniciando escenario…'}</p>
                <p className="text-sm text-slate-400">{transicion === 'cerrando' ? 'Un momento.' : 'Cargando pedidos, flota y almacenes.'}</p>
              </div>
            </div>
          )}

          {/* Modales globales pre-simulación */}
          <ConfigModal
            isOpen={isConfigOpen}
            onClose={() => setIsConfigOpen(false)}
          />

          <SimulationFinishedModal
            isOpen={reporteVisible}
            reporte={reporteFinal.data}
            inicioVisibleMs={inicioVisibleMs}
            isError={reporteFinal.isError}
            onRetry={() => { void reporteFinal.refetch(); }}
            onAccept={() => void terminar()}
            // «×» (ver el mapa final): el mapa queda quieto en su último estado, también tras «Detener».
            onClose={visual.vehicles.length > 0
              ? () => { setReporteOcultoPara(idEjecucion ?? null); setReporteForzadoPara(null); }
              : undefined}
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
                  vistaFinal={vistaFinal}
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
        element: null,
      },
      { path: 'pedidos', element: <PedidosPage /> },
      { path: 'flota', element: <FlotaPage /> },
      { path: 'reportes', element: <ReportesPage /> },
      { path: 'configuracion', element: <ConfiguracionPage /> },
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
  return (
    <>
      <RouterProvider router={router} />
      <DialogoConfirmacion />
    </>
  );
};
