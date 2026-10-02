import React from 'react';
import {
  Radio,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Upload,
  SlidersHorizontal,
} from 'lucide-react';
import { ScenarioType } from '../types';

interface SidebarLeftProps {
  currentScenario: ScenarioType;
  onSelectScenario: (scenario: ScenarioType) => void;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  onOpenConfig: () => void;
  onOpenDataFilesTab?: () => void;
  activeVehiclesCount?: number;
  totalAlertsCount?: number;
  isDarkTheme?: boolean;
}

export const SidebarLeft: React.FC<SidebarLeftProps> = ({
  currentScenario,
  onSelectScenario,
  isCollapsed,
  onToggleCollapse,
  onOpenConfig,
  onOpenDataFilesTab,
}) => {
  return (
    <aside
      id="sidebar-left-nav"
      className={`relative flex flex-col transition-all duration-300 select-none z-20 shrink-0 ${
        isCollapsed ? 'w-16' : 'w-60'
      } bg-[var(--color-sidebar-background)] border-r border-[var(--color-sidebar-border)] text-white shadow-xl h-full overflow-hidden`}
    >
      {/* 1. Header con logo y botón collapse */}
      <div className="flex h-14 items-center justify-between px-3.5 border-b border-[var(--color-sidebar-border)]/70">
        {!isCollapsed ? (
          <>
            <div className="flex items-center gap-2.5">
              {/* Badge SM azul redondeado */}
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#2E5B9A] text-white font-bold text-xs shadow-sm tracking-wide">
                SM
              </div>
              {/* SYSMILE: SYS blanco negrita, MILE gris tenue */}
              <div className="text-sm font-bold tracking-wider font-mono-code">
                <span className="text-white">SYS</span>
                <span className="text-[var(--color-sidebar-icon-muted)] font-medium">MILE</span>
              </div>
            </div>

            <button
              id="btn-toggle-left-sidebar"
              onClick={onToggleCollapse}
              aria-label="Colapsar menú lateral"
              title="Colapsar menú"
              className="text-[var(--color-sidebar-icon-muted)] hover:text-white p-1 rounded-lg transition-colors cursor-pointer"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
          </>
        ) : (
          <div className="w-full flex items-center justify-center">
            <button
              onClick={onToggleCollapse}
              aria-label="Expandir menú lateral"
              title="Expandir menú"
              className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#2E5B9A] text-white font-bold text-xs shadow-sm cursor-pointer hover:opacity-90"
            >
              SM
            </button>
          </div>
        )}
      </div>

      {/* 2. Item Carga de Datos */}
      <div className="p-2.5">
        <button
          type="button"
          id="btn-sidebar-carga-datos"
          onClick={onOpenDataFilesTab}
          title="Carga de Datos"
          className={`w-full flex items-center rounded-xl py-2.5 px-3 transition-colors cursor-pointer text-slate-100 hover:text-white hover:bg-[var(--color-sidebar-surface)] ${
            isCollapsed ? 'justify-center px-1' : 'gap-3'
          }`}
        >
          <Upload className="h-5 w-5 text-white shrink-0" />
          {!isCollapsed && <span className="text-sm font-medium">Carga de Datos</span>}
        </button>
      </div>

      {/* Línea divisoria */}
      <div className="mx-3.5 border-b border-[var(--color-sidebar-border)]/60" />

      {/* 3. Escenarios de Operación */}
      <div className="flex-1 p-2.5 space-y-2 overflow-y-auto">
        {!isCollapsed && (
          <div className="px-2 pt-2 pb-1 text-[11px] font-normal text-[var(--color-sidebar-text-muted)] tracking-normal">
            Escenarios de Operación
          </div>
        )}

        <div className="space-y-1.5">
          {/* Opción 1: Tiempo Real */}
          <button
            type="button"
            id="btn-scenario-realtime"
            onClick={() => onSelectScenario('realtime')}
            aria-pressed={currentScenario === 'realtime'}
            title="Tiempo Real"
            className={`w-full flex items-center rounded-xl py-3 px-3 transition-all cursor-pointer ${
              isCollapsed ? 'justify-center px-1' : 'gap-3'
            } ${
              currentScenario === 'realtime'
                ? 'control-pressed shadow-sm border'
                : 'text-slate-300 hover:text-white hover:bg-[var(--color-sidebar-surface)]'
            }`}
          >
            <Radio className="h-5 w-5 text-white shrink-0" />
            {!isCollapsed && <span className="text-sm font-medium">Tiempo Real</span>}
          </button>

          {/* Opción 2: Simulación 5 Días */}
          <button
            type="button"
            id="btn-scenario-five_days"
            onClick={() => onSelectScenario('five_days')}
            aria-pressed={currentScenario === 'five_days'}
            title="Simulación 5 Días"
            className={`w-full flex items-center rounded-xl py-3 px-3 transition-all cursor-pointer ${
              isCollapsed ? 'justify-center px-1' : 'gap-3'
            } ${
              currentScenario === 'five_days'
                ? 'control-pressed shadow-sm border'
                : 'text-slate-300 hover:text-white hover:bg-[var(--color-sidebar-surface)]'
            }`}
          >
            {/* Ícono Notebook con anillas espirales tal como en la imagen */}
            <svg
              className="h-5 w-5 text-white shrink-0"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="5" y="3" width="15" height="18" rx="2" />
              <line x1="2" y1="7" x2="6" y2="7" />
              <line x1="2" y1="12" x2="6" y2="12" />
              <line x1="2" y1="17" x2="6" y2="17" />
            </svg>
            {!isCollapsed && <span className="text-sm font-medium">Simulación 5 Días</span>}
          </button>

          {/* Opción 3: Colapso */}
          <button
            type="button"
            id="btn-scenario-collapse"
            onClick={() => onSelectScenario('collapse')}
            aria-pressed={currentScenario === 'collapse'}
            title="Colapso"
            className={`w-full flex items-center rounded-xl py-3 px-3 transition-all cursor-pointer ${
              isCollapsed ? 'justify-center px-1' : 'gap-3'
            } ${
              currentScenario === 'collapse'
                ? 'control-pressed shadow-sm border'
                : 'text-slate-300 hover:text-white hover:bg-[var(--color-sidebar-surface)]'
            }`}
          >
            <AlertCircle className="h-5 w-5 text-white shrink-0" />
            {!isCollapsed && <span className="text-sm font-medium">Colapso</span>}
          </button>
        </div>
      </div>

      {/* Línea divisoria inferior */}
      <div className="mx-3.5 border-t border-[var(--color-sidebar-border)]/60" />

      {/* 4. Configuración al pie */}
      <div className="p-3">
        <button
          type="button"
          id="btn-open-system-config-left"
          onClick={onOpenConfig}
          title="Configuración"
          className={`w-full flex items-center rounded-xl py-2.5 px-3 transition-colors cursor-pointer text-slate-100 hover:text-white hover:bg-[var(--color-sidebar-surface)] ${
            isCollapsed ? 'justify-center px-1' : 'gap-3 justify-center'
          }`}
        >
          <SlidersHorizontal className="h-5 w-5 text-white shrink-0" />
          {!isCollapsed && <span className="text-sm font-medium">Configuración</span>}
        </button>
      </div>

      {/* Si está colapsado, botón expandir al pie */}
      {isCollapsed && (
        <div className="p-2 border-t border-[var(--color-sidebar-border)]/60 flex justify-center">
          <button
            onClick={onToggleCollapse}
            aria-label="Expandir menú lateral"
            title="Expandir menú"
            className="text-[var(--color-sidebar-icon-muted)] hover:text-white p-1 rounded-lg"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}
    </aside>
  );
};
