import React, { useState, useEffect } from 'react';
import { SystemConfig } from '../types';
import {
  Settings,
  X,
  Warehouse,
  RotateCcw,
  Check,
  Sun,
  Moon,
  Car,
  Bike,
  Gauge,
  Pause,
} from 'lucide-react';

interface ConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: SystemConfig;
  onSaveConfig: (updated: SystemConfig) => void;
  isDarkTheme?: boolean;
  isSimRunning?: boolean;
  onPauseSim?: () => void;
}

export const ConfigModal: React.FC<ConfigModalProps> = ({
  isOpen,
  onClose,
  config,
  onSaveConfig,
  isDarkTheme: isDarkProp,
  isSimRunning = false,
  onPauseSim,
}) => {
  const [localConfig, setLocalConfig] = useState<SystemConfig>({ ...config });

  useEffect(() => {
    if (isOpen) {
      setLocalConfig({ ...config });
    }
  }, [isOpen, config]);

  if (!isOpen) return null;

  const handleSave = () => {
    onSaveConfig(localConfig);
    onClose();
  };

  const isDark = isDarkProp !== undefined ? isDarkProp : localConfig.theme === 'dark';

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-in fade-in">
      <div
        className={`w-full max-w-xl rounded-2xl shadow-2xl p-6 space-y-5 max-h-[90vh] overflow-y-auto border ${
          isDark
            ? 'bg-slate-900 border-slate-700 text-slate-100'
            : 'bg-[var(--color-surface)] border-slate-200 text-[var(--color-text-primary)]'
        }`}
      >
        <div
          className={`flex items-center justify-between border-b pb-3 ${
            isDark ? 'border-slate-800' : 'border-slate-200'
          }`}
        >
          <div className="flex items-center gap-2.5">
            <div
              className={`p-2 rounded-xl border text-blue-500 ${
                isDark ? 'bg-slate-900 border-slate-800' : 'bg-slate-100 border-slate-200'
              }`}
            >
              <Settings className="h-5 w-5" />
            </div>
            <div>
              <h3 className={`font-bold text-lg ${isDark ? 'text-white' : 'text-slate-900'}`}>
                Parámetros del Sistema VRP (SysMile)
              </h3>
              <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                Ajuste de capacidades, velocidades de flota y visualización
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar configuración"
            className={`transition-colors p-1 ${
              isDark ? 'text-slate-400 hover:text-white' : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Form Body */}
        <div className="space-y-4 text-xs">
          {/* Velocidad por Tipo de Flota */}
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <span
                className={`font-semibold flex items-center gap-1.5 ${
                  isDark ? 'text-slate-200' : 'text-slate-800'
                }`}
              >
                <Gauge className="h-4 w-4 text-blue-500" /> Velocidad por Tipo de Flota (km/h)
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {/* Autos */}
              <div
                className={`p-2.5 rounded-xl ${
                  isDark ? 'bg-slate-900' : 'bg-slate-50'
                }`}
              >
                <div className="flex justify-between items-center mb-1">
                  <span
                    className={`text-[10px] font-medium flex items-center gap-1 ${
                      isDark ? 'text-slate-400' : 'text-slate-600'
                    }`}
                  >
                    <Car className="h-3 w-3 text-blue-500" /> Autos
                  </span>
                  <span className="font-mono-code text-blue-500 font-bold text-xs">
                    {localConfig.fleetSpeeds?.car || 50} km/h
                  </span>
                </div>
                <input
                  type="number"
                  min="15"
                  max="120"
                  step="1"
                  value={localConfig.fleetSpeeds?.car || 50}
                  onChange={(e) =>
                    setLocalConfig({
                      ...localConfig,
                      fleetSpeeds: {
                        ...(localConfig.fleetSpeeds || { car: 50, motorcycle: 60, bicycle: 20 }),
                        car: Math.max(10, Math.min(140, Number(e.target.value) || 50)),
                      },
                    })
                  }
                  className={`w-full rounded-lg p-1.5 font-mono-code text-xs focus:outline-none focus:border-blue-500 border ${
                    isDark
                      ? 'bg-slate-900 border-slate-700 text-white'
                      : 'bg-white border-slate-300 text-slate-900'
                  }`}
                />
              </div>

              {/* Motos */}
              <div
                className={`p-2.5 rounded-xl ${
                  isDark ? 'bg-slate-900' : 'bg-slate-50'
                }`}
              >
                <div className="flex justify-between items-center mb-1">
                  <span
                    className={`text-[10px] font-medium flex items-center gap-1 ${
                      isDark ? 'text-slate-400' : 'text-slate-600'
                    }`}
                  >
                    <Bike className="h-3 w-3 text-purple-500" /> Motos
                  </span>
                  <span className="font-mono-code text-purple-500 font-bold text-xs">
                    {localConfig.fleetSpeeds?.motorcycle || 60} km/h
                  </span>
                </div>
                <input
                  type="number"
                  min="15"
                  max="120"
                  step="1"
                  value={localConfig.fleetSpeeds?.motorcycle || 60}
                  onChange={(e) =>
                    setLocalConfig({
                      ...localConfig,
                      fleetSpeeds: {
                        ...(localConfig.fleetSpeeds || { car: 50, motorcycle: 60, bicycle: 20 }),
                        motorcycle: Math.max(10, Math.min(140, Number(e.target.value) || 60)),
                      },
                    })
                  }
                  className={`w-full rounded-lg p-1.5 font-mono-code text-xs focus:outline-none focus:border-blue-500 border ${
                    isDark
                      ? 'bg-slate-900 border-slate-700 text-white'
                      : 'bg-white border-slate-300 text-slate-900'
                  }`}
                />
              </div>

              {/* Bicis */}
              <div
                className={`p-2.5 rounded-xl ${
                  isDark ? 'bg-slate-900' : 'bg-slate-50'
                }`}
              >
                <div className="flex justify-between items-center mb-1">
                  <span
                    className={`text-[10px] font-medium flex items-center gap-1 ${
                      isDark ? 'text-slate-400' : 'text-slate-600'
                    }`}
                  >
                    <Bike className="h-3 w-3 text-emerald-500" /> Bicis
                  </span>
                  <span className="font-mono-code text-emerald-500 font-bold text-xs">
                    {localConfig.fleetSpeeds?.bicycle || 20} km/h
                  </span>
                </div>
                <input
                  type="number"
                  min="5"
                  max="60"
                  step="1"
                  value={localConfig.fleetSpeeds?.bicycle || 20}
                  onChange={(e) =>
                    setLocalConfig({
                      ...localConfig,
                      fleetSpeeds: {
                        ...(localConfig.fleetSpeeds || { car: 50, motorcycle: 60, bicycle: 20 }),
                        bicycle: Math.max(5, Math.min(60, Number(e.target.value) || 20)),
                      },
                    })
                  }
                  className={`w-full rounded-lg p-1.5 font-mono-code text-xs focus:outline-none focus:border-blue-500 border ${
                    isDark
                      ? 'bg-slate-900 border-slate-700 text-white'
                      : 'bg-white border-slate-300 text-slate-900'
                  }`}
                />
              </div>
            </div>
          </div>

          {/* Capacidades de Almacenes */}
          <div
            className={`space-y-2 pt-2 border-t ${
              isDark ? 'border-slate-800' : 'border-slate-200'
            }`}
          >
            <span
              className={`font-semibold flex items-center gap-1.5 ${
                isDark ? 'text-slate-200' : 'text-slate-800'
              }`}
            >
              <Warehouse className="h-4 w-4 text-blue-500" /> Capacidad Máxima de Almacenes
            </span>
            <div className="grid grid-cols-3 gap-2">
              <div
                className={`p-2.5 rounded-xl ${
                  isDark ? 'bg-slate-900' : 'bg-slate-50'
                }`}
              >
                <span
                  className={`text-[10px] block ${
                    isDark ? 'text-slate-400' : 'text-slate-600'
                  }`}
                >
                  Central
                </span>
                <input
                  type="text"
                  disabled
                  value="Infinita (∞)"
                  className={`w-full border text-blue-500 font-bold rounded-lg p-1.5 font-mono-code mt-1 text-xs cursor-not-allowed ${
                    isDark ? 'bg-slate-900 border-slate-700/60' : 'bg-slate-100 border-slate-300'
                  }`}
                />
              </div>

              <div
                className={`p-2.5 rounded-xl ${
                  isDark ? 'bg-slate-900' : 'bg-slate-50'
                }`}
              >
                <span
                  className={`text-[10px] block ${
                    isDark ? 'text-slate-400' : 'text-slate-600'
                  }`}
                >
                  Nor-Oeste
                </span>
                <input
                  type="number"
                  min="500"
                  max="3000"
                  step="50"
                  value={localConfig.warehouseCapacities.northwest}
                  onChange={(e) =>
                    setLocalConfig({
                      ...localConfig,
                      warehouseCapacities: {
                        ...localConfig.warehouseCapacities,
                        northwest: Number(e.target.value),
                      },
                    })
                  }
                  className={`w-full rounded-lg p-1.5 font-mono-code mt-1 text-xs focus:outline-none focus:border-blue-500 border ${
                    isDark
                      ? 'bg-slate-900 border-slate-700 text-white'
                      : 'bg-white border-slate-300 text-slate-900'
                  }`}
                />
              </div>

              <div
                className={`p-2.5 rounded-xl ${
                  isDark ? 'bg-slate-900' : 'bg-slate-50'
                }`}
              >
                <span
                  className={`text-[10px] block ${
                    isDark ? 'text-slate-400' : 'text-slate-600'
                  }`}
                >
                  Este
                </span>
                <input
                  type="number"
                  min="500"
                  max="3000"
                  step="50"
                  value={localConfig.warehouseCapacities.east}
                  onChange={(e) =>
                    setLocalConfig({
                      ...localConfig,
                      warehouseCapacities: {
                        ...localConfig.warehouseCapacities,
                        east: Number(e.target.value),
                      },
                    })
                  }
                  className={`w-full rounded-lg p-1.5 font-mono-code mt-1 text-xs focus:outline-none focus:border-blue-500 border ${
                    isDark
                      ? 'bg-slate-900 border-slate-700 text-white'
                      : 'bg-white border-slate-300 text-slate-900'
                  }`}
                />
              </div>
            </div>
          </div>

          {/* Composición de Flota Heterogénea (Códigos TTNN) */}
          <div
            className={`space-y-2 pt-2 border-t ${
              isDark ? 'border-slate-800' : 'border-slate-200'
            }`}
          >
            <div className="flex justify-between items-center">
              <div>
                <span
                  className={`font-semibold flex items-center gap-1.5 ${
                    isDark ? 'text-slate-200' : 'text-slate-800'
                  }`}
                >
                  <Car className="h-4 w-4 text-blue-500" /> Flota de Transporte (Formato TTNN)
                </span>
                <p className={`text-[10px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                  TT: Tipo (TA: Autos, TB: Bicicletas, TM: Motos) | NN: Correlativo (01, 02...)
                </p>
              </div>
              <span
                className={`text-[11px] font-mono-code font-bold border px-2 py-0.5 rounded ${
                  isDark
                    ? 'text-blue-400 bg-slate-900 border-slate-800'
                    : 'text-blue-600 bg-blue-50 border-blue-200'
                }`}
              >
                Total: {localConfig.fleetCounts.car + localConfig.fleetCounts.motorcycle + localConfig.fleetCounts.bicycle} vehículos
              </span>
            </div>

            <div className="grid grid-cols-3 gap-2">
              {/* Autos (TA) */}
              <div
                className={`p-2.5 rounded-xl border ${
                  isDark ? 'bg-slate-900 border-slate-800' : 'bg-slate-50 border-slate-200'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span
                    className={`text-[10px] font-medium flex items-center gap-1 ${
                      isDark ? 'text-slate-400' : 'text-slate-600'
                    }`}
                  >
                    <Car className="h-3 w-3 text-blue-500" /> Autos (TA)
                  </span>
                  <span className="text-[9px] font-mono-code font-bold px-1 rounded bg-blue-500/20 text-blue-400 border border-blue-500/30">
                    TA01..TA{String(localConfig.fleetCounts.car).padStart(2, '0')}
                  </span>
                </div>
                <input
                  type="number"
                  min="1"
                  max="25"
                  value={localConfig.fleetCounts.car}
                  onChange={(e) =>
                    setLocalConfig({
                      ...localConfig,
                      fleetCounts: {
                        ...localConfig.fleetCounts,
                        car: Math.max(1, Math.min(25, Number(e.target.value) || 1)),
                      },
                    })
                  }
                  className={`w-full rounded-lg p-1.5 font-mono-code text-xs focus:outline-none focus:border-blue-500 border ${
                    isDark
                      ? 'bg-slate-900 border-slate-700 text-white'
                      : 'bg-white border-slate-300 text-slate-900'
                  }`}
                />
              </div>

              {/* Motos (TM) */}
              <div
                className={`p-2.5 rounded-xl border ${
                  isDark ? 'bg-slate-900 border-slate-800' : 'bg-slate-50 border-slate-200'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span
                    className={`text-[10px] font-medium flex items-center gap-1 ${
                      isDark ? 'text-slate-400' : 'text-slate-600'
                    }`}
                  >
                    <Bike className="h-3 w-3 text-purple-500" /> Motos (TM)
                  </span>
                  <span className="text-[9px] font-mono-code font-bold px-1 rounded bg-purple-500/20 text-purple-400 border border-purple-500/30">
                    TM01..TM{String(localConfig.fleetCounts.motorcycle).padStart(2, '0')}
                  </span>
                </div>
                <input
                  type="number"
                  min="1"
                  max="25"
                  value={localConfig.fleetCounts.motorcycle}
                  onChange={(e) =>
                    setLocalConfig({
                      ...localConfig,
                      fleetCounts: {
                        ...localConfig.fleetCounts,
                        motorcycle: Math.max(1, Math.min(25, Number(e.target.value) || 1)),
                      },
                    })
                  }
                  className={`w-full rounded-lg p-1.5 font-mono-code text-xs focus:outline-none focus:border-blue-500 border ${
                    isDark
                      ? 'bg-slate-900 border-slate-700 text-white'
                      : 'bg-white border-slate-300 text-slate-900'
                  }`}
                />
              </div>

              {/* Bicis (TB) */}
              <div
                className={`p-2.5 rounded-xl border ${
                  isDark ? 'bg-slate-900 border-slate-800' : 'bg-slate-50 border-slate-200'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span
                    className={`text-[10px] font-medium flex items-center gap-1 ${
                      isDark ? 'text-slate-400' : 'text-slate-600'
                    }`}
                  >
                    <Bike className="h-3 w-3 text-emerald-500" /> Bicis (TB)
                  </span>
                  <span className="text-[9px] font-mono-code font-bold px-1 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                    TB01..TB{String(localConfig.fleetCounts.bicycle).padStart(2, '0')}
                  </span>
                </div>
                <input
                  type="number"
                  min="1"
                  max="25"
                  value={localConfig.fleetCounts.bicycle}
                  onChange={(e) =>
                    setLocalConfig({
                      ...localConfig,
                      fleetCounts: {
                        ...localConfig.fleetCounts,
                        bicycle: Math.max(1, Math.min(25, Number(e.target.value) || 1)),
                      },
                    })
                  }
                  className={`w-full rounded-lg p-1.5 font-mono-code text-xs focus:outline-none focus:border-blue-500 border ${
                    isDark
                      ? 'bg-slate-900 border-slate-700 text-white'
                      : 'bg-white border-slate-300 text-slate-900'
                  }`}
                />
              </div>
            </div>
          </div>

          {/* Tema Visual de la Interfaz */}
          <div
            className={`space-y-2 pt-2 border-t ${
              isDark ? 'border-slate-800' : 'border-slate-200'
            }`}
          >
            <label
              className={`block font-semibold ${
                isDark ? 'text-slate-200' : 'text-slate-800'
              }`}
            >
              Tema Visual de la Interfaz
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                id="btn-modal-theme-dark"
                onClick={() => setLocalConfig({ ...localConfig, theme: 'dark' })}
                aria-pressed={localConfig.theme === 'dark'}
                className={`p-2.5 rounded-xl border flex items-center justify-center gap-2 transition-all ${
                  localConfig.theme === 'dark'
                    ? 'control-pressed font-semibold'
                    : isDark
                    ? 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700'
                    : 'bg-slate-100 border-slate-200 text-slate-600 hover:border-slate-300'
                }`}
              >
                <Moon className="h-4 w-4" /> Modo Oscuro
              </button>
              <button
                type="button"
                id="btn-modal-theme-light"
                onClick={() => setLocalConfig({ ...localConfig, theme: 'light' })}
                aria-pressed={localConfig.theme === 'light'}
                className={`p-2.5 rounded-xl border flex items-center justify-center gap-2 transition-all ${
                  localConfig.theme === 'light'
                    ? 'control-pressed font-semibold'
                    : isDark
                    ? 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700'
                    : 'bg-slate-100 border-slate-200 text-slate-600 hover:border-slate-300'
                }`}
              >
                <Sun className="h-4 w-4" /> Modo Claro
              </button>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div
          className={`flex items-center justify-between pt-3 border-t ${
            isDark ? 'border-slate-800' : 'border-slate-200'
          }`}
        >
          <button
            type="button"
            onClick={() => {
              setLocalConfig({
                ...config,
                fleetSpeeds: { car: 50, motorcycle: 60, bicycle: 20 },
                warehouseCapacities: { central: Infinity, northwest: 1000, east: 1000 },
                theme: 'dark',
                fleetCounts: { car: 6, motorcycle: 10, bicycle: 8 },
                vehicleThresholds: { warningDeviationMinutes: 15, dangerDelayMinutes: 30 },
              });
            }}
            className={`flex items-center gap-1.5 text-xs transition-colors ${
              isDark ? 'text-slate-400 hover:text-white' : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            <RotateCcw className="h-3.5 w-3.5" /> Valores por defecto
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className={`py-2 px-4 rounded-lg border font-semibold text-xs transition-colors ${
                isDark
                  ? 'border-slate-700 bg-slate-900 hover:bg-slate-800 text-slate-300'
                  : 'border-slate-300 bg-white hover:bg-slate-100 text-slate-700'
              }`}
            >
              Cancelar
            </button>
            <button
              id="btn-save-full-config"
              type="button"
              onClick={handleSave}
              className="btn-primary py-2 px-5 rounded-lg text-white font-bold text-xs shadow-md transition-all flex items-center gap-1.5"
            >
              <Check className="h-4 w-4" /> Guardar Parámetros
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
