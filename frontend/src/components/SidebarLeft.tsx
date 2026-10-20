import React from 'react';
import {
  Radio,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Upload,
  SlidersHorizontal,
  Calendar,
} from 'lucide-react';
import { TipoEscenarioBackend } from '../types/backend';

interface SidebarLeftProps {
  currentScenario: TipoEscenarioBackend;
  onSelectScenario: (scenario: TipoEscenarioBackend) => void;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  onOpenConfig: () => void;
  onOpenDataFiles: () => void;
  isDataFilesActive?: boolean;
  hasActiveExecution?: boolean;
}

export const SidebarLeft: React.FC<SidebarLeftProps> = ({
  currentScenario,
  onSelectScenario,
  isCollapsed,
  onToggleCollapse,
  onOpenConfig,
  onOpenDataFiles,
  isDataFilesActive = false,
  hasActiveExecution = false,
}) => {
  return (
    <aside
      id="sidebar-left-nav"
      className={`relative flex flex-col transition-all duration-300 select-none z-20 shrink-0 ${
        isCollapsed ? 'w-16' : 'w-64'
      } bg-[var(--color-sidebar-background)] border-r border-[var(--color-sidebar-border)] text-white shadow-xl h-full overflow-hidden`}
    >
      {/* 1. Header con logo y botón collapse */}
      <div className="flex h-14 items-center justify-between px-3.5 border-b border-[var(--color-sidebar-border)]/70 shrink-0">
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
              type="button"
              id="btn-toggle-left-sidebar"
              onClick={onToggleCollapse}
              title="Colapsar menú"
              className="text-[var(--color-sidebar-icon-muted)] hover:text-white p-1 rounded-lg hover:bg-slate-800/60 transition-colors cursor-pointer"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
          </>
        ) : (
          <div className="w-full flex items-center justify-center">
            <button
              type="button"
              onClick={onToggleCollapse}
              title="Expandir menú"
              className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#2E5B9A] text-white font-bold text-xs shadow-sm cursor-pointer hover:opacity-90"
            >
              SM
            </button>
          </div>
        )}
      </div>

      {/* Línea divisoria */}
      <div className="p-2.5 space-y-1.5 shrink-0">
        <button
          type="button"
          id="btn-sidebar-carga-datos"
          onClick={onOpenDataFiles}
          title="Página de Carga de Datos"
          className={`w-full flex items-center rounded-xl py-2.5 px-3 transition-colors cursor-pointer active:scale-98 ${
            isDataFilesActive
              ? 'bg-[#2D5388] text-white shadow-sm border border-blue-400/40'
              : 'text-slate-100 hover:text-white hover:bg-[var(--color-sidebar-surface)]'
          } ${
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
            onClick={() => onSelectScenario('DIA_A_DIA')}
            title="Seleccionar escenario: Tiempo Real"
            className={`w-full flex items-center justify-between rounded-xl py-2.5 px-3 transition-all cursor-pointer group ${
              isCollapsed ? 'justify-center px-1' : ''
            } ${
              !isDataFilesActive && currentScenario === 'DIA_A_DIA'
                ? 'bg-[#2D5388] text-white shadow-sm border border-blue-400/40'
                : 'text-slate-300 hover:text-white hover:bg-[#2D5388]/30'
            }`}
          >
            <div className={`flex items-center ${isCollapsed ? '' : 'gap-3'}`}>
              <Radio className="h-5 w-5 text-white shrink-0" />
              {!isCollapsed && <span className="text-sm font-medium">Tiempo Real</span>}
            </div>
            {!isCollapsed && !isDataFilesActive && currentScenario === 'DIA_A_DIA' && hasActiveExecution && (
              <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse shrink-0" />
            )}
          </button>

          {/* Opción 2: Simulación 5 Días */}
          <button
            type="button"
            id="btn-scenario-five_days"
            onClick={() => onSelectScenario('CINCO_DIAS')}
            title="Seleccionar escenario: Simulación 5 Días"
            className={`w-full flex items-center justify-between rounded-xl py-2.5 px-3 transition-all cursor-pointer group ${
              isCollapsed ? 'justify-center px-1' : ''
            } ${
              !isDataFilesActive && currentScenario === 'CINCO_DIAS'
                ? 'bg-[#2D5388] text-white shadow-sm border border-blue-400/40'
                : 'text-slate-300 hover:text-white hover:bg-[#2D5388]/30'
            }`}
          >
            <div className={`flex items-center ${isCollapsed ? '' : 'gap-3'}`}>
              <Calendar className="h-5 w-5 text-white shrink-0" />
              {!isCollapsed && <span className="text-sm font-medium">Simulación 5 Días</span>}
            </div>
            {!isCollapsed && !isDataFilesActive && currentScenario === 'CINCO_DIAS' && hasActiveExecution && (
              <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse shrink-0" />
            )}
          </button>

          {/* Opción 3: Colapso */}
          <button
            type="button"
            id="btn-scenario-collapse"
            onClick={() => onSelectScenario('COLAPSO_LOGISTICO')}
            title="Seleccionar escenario: Colapso"
            className={`w-full flex items-center justify-between rounded-xl py-2.5 px-3 transition-all cursor-pointer group ${
              isCollapsed ? 'justify-center px-1' : ''
            } ${
              !isDataFilesActive && currentScenario === 'COLAPSO_LOGISTICO'
                ? 'bg-[#2D5388] text-white shadow-sm border border-blue-400/40'
                : 'text-slate-300 hover:text-white hover:bg-[#2D5388]/30'
            }`}
          >
            <div className={`flex items-center ${isCollapsed ? '' : 'gap-3'}`}>
              <AlertCircle className="h-5 w-5 text-white shrink-0" />
              {!isCollapsed && <span className="text-sm font-medium">Colapso Logístico</span>}
            </div>
            {!isCollapsed && !isDataFilesActive && currentScenario === 'COLAPSO_LOGISTICO' && hasActiveExecution && (
              <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse shrink-0" />
            )}
          </button>
        </div>
      </div>

      {/* Línea divisoria inferior */}
      <div className="mx-3.5 border-t border-[var(--color-sidebar-border)]/60" />

      {/* 4. Configuración al pie */}
      <div className="p-3 shrink-0">
        <button
          type="button"
          id="btn-open-system-config-left"
          onClick={onOpenConfig}
          title="Configuración"
          className={`w-full flex items-center justify-center rounded-xl py-2.5 px-3 transition-colors cursor-pointer text-slate-100 hover:text-white hover:bg-[var(--color-sidebar-surface)] ${
            isCollapsed ? '' : 'gap-3'
          }`}
        >
          <SlidersHorizontal className="h-5 w-5 text-white shrink-0" />
          {!isCollapsed && <span className="text-sm font-medium">Configuración</span>}
        </button>
      </div>

      {/* Si está colapsado, botón expandir al pie */}
      {isCollapsed && (
        <div className="p-2 border-t border-[var(--color-sidebar-border)]/60 flex justify-center shrink-0">
          <button
            type="button"
            onClick={onToggleCollapse}
            title="Expandir menú"
            className="text-[var(--color-sidebar-icon-muted)] hover:text-white p-1.5 rounded-lg transition-colors cursor-pointer"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}
    </aside>
  );
};
