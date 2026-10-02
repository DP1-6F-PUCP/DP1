import React from 'react';
import { createBrowserRouter, RouterProvider, Navigate, Outlet, Link, useLocation } from 'react-router-dom';
import { ProtectedRoute } from './ProtectedRoute';
import { LoginPage } from '../pages/LoginPage';
import { DashboardPage } from '../pages/DashboardPage';
import { RutasPage } from '../pages/RutasPage';
import { SeguimientoPage } from '../pages/SeguimientoPage';
import { useAuthStore } from '../store/authStore';
import { LayoutDashboard, Route as RouteIcon, Navigation, LogOut, Truck } from 'lucide-react';

const RootLayout: React.FC = () => {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const location = useLocation();

  const navLinks = [
    { to: '/', label: 'Dashboard', icon: LayoutDashboard, exact: true },
    { to: '/rutas', label: 'Rutas', icon: RouteIcon },
    { to: '/seguimiento', label: 'Seguimiento', icon: Navigation },
  ];

  return (
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

        {/* Info Usuario & Logout */}
        <div className="flex items-center gap-3 text-xs">
          {user && (
            <div className="hidden sm:flex flex-col items-end">
              <span className="text-slate-200 font-medium leading-tight">{user.name}</span>
              <span className="text-[10px] text-slate-400 leading-tight">{user.email}</span>
            </div>
          )}
          <button
            type="button"
            onClick={logout}
            aria-label="Cerrar sesión"
            title="Cerrar sesión"
            className="p-2 rounded-lg border border-slate-700 bg-slate-800 text-slate-400 hover:text-rose-400 hover:border-rose-500/40 transition-colors"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </nav>

      {/* Contenido de la Ruta */}
      <main className="flex-1 flex overflow-hidden">
        <Outlet />
      </main>
    </div>
  );
};

export const router = createBrowserRouter([
  {
    path: '/login',
    element: <LoginPage />,
  },
  {
    path: '/',
    element: (
      <ProtectedRoute>
        <RootLayout />
      </ProtectedRoute>
    ),
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
