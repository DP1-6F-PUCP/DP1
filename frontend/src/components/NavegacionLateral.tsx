import React from 'react';
import { NavLink } from 'react-router-dom';
import { BarChart3, Map as MapIcon, Package, Settings, Truck } from 'lucide-react';
import { rutaPedidos } from '../utils/pedidosUrl';
import { CLASE_TONO_ALERTA, useAlertasSecciones } from '../hooks/useAlertasSecciones';

/** Secciones de la aplicación. Operación es el mapa; el resto son páginas de gestión. */
export const SECCIONES = [
  { ruta: '/', nombre: 'Operación', icono: MapIcon, descripcion: 'Mapa en vivo de la operación' },
  { ruta: '/pedidos', nombre: 'Pedidos', icono: Package, descripcion: 'Lista completa con búsqueda, filtros y "Ver en el mapa"' },
  { ruta: '/flota', nombre: 'Flota', icono: Truck, descripcion: 'Vehículos, mantenimientos y averías' },
  { ruta: '/reportes', nombre: 'Reportes', icono: BarChart3, descripcion: 'Indicadores detallados' },
  { ruta: '/configuracion', nombre: 'Configuración', icono: Settings, descripcion: 'Parámetros de la operación' },
] as const;

export const seccionDe = (ruta: string) =>
  SECCIONES.find((s) => s.ruta !== '/' && ruta.startsWith(s.ruta)) ?? SECCIONES[0];

const CLAVE_EXPANDIDA = 'paqrap.navegacion.expandida';
export const leerNavegacionExpandida = (): boolean => {
  try { return localStorage.getItem(CLAVE_EXPANDIDA) !== '0'; } catch { return true; }
};
export const guardarNavegacionExpandida = (valor: boolean) => {
  try { localStorage.setItem(CLAVE_EXPANDIDA, valor ? '1' : '0'); } catch { /* sin almacenamiento: no se recuerda */ }
};

/**
 * Barra de secciones, fija a la izquierda: la ÚNICA navegación de la app (antes convivía con el riel
 * "SM / PANEL" del panel de detalle, con otro estilo y sin rótulos). Expandida muestra ícono y
 * nombre; compacta, solo el ícono (el botón ☰ alterna y se recuerda). Cada sección es una ruta real
 * (/pedidos, /flota…): funcionan "atrás" y los enlaces directos. Los contadores avisan de algo grave
 * en otra sección (ver useAlertasSecciones).
 */
export const NavegacionLateral: React.FC<{ expandida: boolean }> = ({ expandida }) => {
  const { porRuta } = useAlertasSecciones();

  return (
    <nav
      aria-label="Secciones"
      className={`tema-panel z-30 flex shrink-0 flex-col gap-1 border-r border-[var(--color-sidebar-border)] bg-[var(--color-sidebar-background)] p-1.5 transition-[width] duration-200 ${
        expandida ? 'w-[92px]' : 'w-14'}`}
    >
      {SECCIONES.map(({ ruta, nombre, icono: Icono, descripcion }) => {
        const alerta = porRuta[ruta];
        return (
          <NavLink
            key={ruta}
            to={ruta === '/pedidos' ? rutaPedidos() : ruta}
            end={ruta === '/'}
            title={`${expandida ? '' : `${nombre}: `}${descripcion}${alerta ? ` · ${alerta.ayuda}` : ''}`}
            aria-label={expandida ? undefined : nombre}
            className={({ isActive }) =>
              `relative flex flex-col items-center gap-1 rounded-lg px-1 py-2.5 text-center text-[11px] font-medium leading-tight transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-400 ${
                isActive
                  ? 'bg-cyan-500/15 text-cyan-300 before:absolute before:inset-y-2 before:left-0 before:w-[3px] before:rounded-full before:bg-cyan-400'
                  : 'text-slate-300 hover:bg-white/5 hover:text-white'}`}
          >
            <Icono className="h-5 w-5" aria-hidden />
            {expandida && nombre}
            {alerta && (
              // Contador de alertas de la sección: rojo = actuar, ámbar = atención.
              <span
                className={`absolute top-1 min-w-[18px] rounded-full px-1 text-center text-[10px] font-bold leading-[18px] ${
                  expandida ? 'right-2' : 'right-0.5'} ${CLASE_TONO_ALERTA[alerta.tono]}`}
                aria-label={alerta.ayuda}
              >
                {alerta.cantidad > 99 ? '99+' : alerta.cantidad}
              </span>
            )}
          </NavLink>
        );
      })}
    </nav>
  );
};
