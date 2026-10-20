import React, { useEffect, useMemo, useState } from 'react';
import {
  Bike,
  Car,
  Check,
  Gauge,
  RotateCcw,
  Settings,
  Sun,
  Moon,
  Warehouse,
  X,
} from 'lucide-react';
import { useEstadoOperacion } from '../hooks/useEstadoOperacion';
import { useThemeStore } from '../store/themeStore';
import { useToast } from './ToastProvider';

interface ConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface ConfigValues {
  speeds: Record<string, number>;
  warehouseCapacities: Record<string, number | null>;
  fleetCounts: Record<string, number>;
}

const STORAGE_KEY = 'sysmile_operational_config';

const inputClass =
  'h-8 w-full rounded-lg border border-slate-700 bg-[#0f172a] px-2 text-xs font-mono-code text-slate-100 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20';

export const ConfigModal: React.FC<ConfigModalProps> = ({ isOpen, onClose }) => {
  const { isDark, setTheme } = useThemeStore();
  const { configuracion } = useEstadoOperacion();
  const { addToast } = useToast();
  const [values, setValues] = useState<ConfigValues | null>(null);

  const defaults = useMemo<ConfigValues | null>(() => {
    if (!configuracion) return null;
    return {
      speeds: Object.fromEntries(configuracion.tiposVehiculo.map((type) => [type.id, type.velocidadKmH])),
      warehouseCapacities: Object.fromEntries(
        configuracion.almacenes.map((warehouse) => [
          warehouse.nombre,
          Number.isFinite(warehouse.capacidadMaxima) ? warehouse.capacidadMaxima : null,
        ]),
      ),
      fleetCounts: Object.fromEntries(
        configuracion.tiposVehiculo.map((type) => [
          type.id,
          configuracion.tiposVehiculo
            .filter((candidate) => candidate.id === type.id)
            .reduce((count) => count, 0),
        ]),
      ),
    };
  }, [configuracion]);

  useEffect(() => {
    if (!isOpen || !defaults) return;
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) {
      setValues(defaults);
      return;
    }
    try {
      setValues({ ...defaults, ...JSON.parse(stored) });
    } catch {
      setValues(defaults);
    }
  }, [defaults, isOpen]);

  if (!isOpen) return null;

  const current = values ?? defaults;
  const types = configuracion?.tiposVehiculo ?? [];
  const warehouses = configuracion?.almacenes ?? [];

  const updateSpeed = (id: string, value: string) => {
    setValues((previous) => previous && { ...previous, speeds: { ...previous.speeds, [id]: Number(value) } });
  };

  const updateCapacity = (id: string, value: string) => {
    setValues((previous) =>
      previous && {
        ...previous,
        warehouseCapacities: { ...previous.warehouseCapacities, [id]: value === '' ? null : Number(value) },
      },
    );
  };

  const updateFleetCount = (id: string, value: string) => {
    setValues((previous) => previous && { ...previous, fleetCounts: { ...previous.fleetCounts, [id]: Number(value) } });
  };

  const save = () => {
    if (!current) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
    addToast({
      type: 'success',
      title: 'Parámetros guardados',
      description: 'La configuración se guardó correctamente.',
    });
    onClose();
  };

  const reset = () => {
    if (!defaults) return;
    setValues(defaults);
    localStorage.removeItem(STORAGE_KEY);
  };

  const totalVehicles = types.reduce((sum, type) => sum + (current?.fleetCounts[type.id] ?? 0), 0);

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center overflow-hidden bg-black/75 p-2 backdrop-blur-sm">
      <div className="max-h-[calc(100vh-1rem)] w-full max-w-xl overflow-y-auto rounded-xl border border-slate-700 bg-[#0f172a] p-3 text-slate-100 shadow-2xl sm:p-4">
        <header className="flex items-center justify-between border-b border-slate-800 pb-2.5">
          <div className="flex items-center gap-2.5">
            <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 p-1.5 text-blue-500">
              <Settings className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Parámetros del Sistema</h2>
              <p className="text-[11px] text-slate-400">Ajuste de capacidades, velocidades de flota y visualización</p>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Cerrar configuración" className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-white">
            <X className="h-6 w-6" />
          </button>
        </header>

        {!current ? (
          <div className="py-12 text-center text-sm text-slate-400">Cargando parámetros del sistema...</div>
        ) : (
          <div className="space-y-3 pt-3">
            <section className="border-b border-slate-800 pb-3">
              <h3 className="mb-2 flex items-center gap-2 text-[11px] font-bold text-slate-200">
                <Gauge className="h-3.5 w-3.5 text-blue-500" /> Velocidad por Tipo de Flota (km/h)
              </h3>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                {types.map((type) => (
                  <label key={type.id} className="space-y-1">
                    <span className="flex items-center justify-between text-[11px] font-medium text-slate-400">
                      <span className="flex items-center gap-1">{type.id.toLowerCase().includes('moto') ? <Bike className="h-3 w-3 text-purple-400" /> : type.id.toLowerCase().includes('bici') ? <Bike className="h-3 w-3 text-emerald-400" /> : <Car className="h-3 w-3 text-blue-400" />}{type.nombre}</span>
                    </span>
                    <input type="number" min="1" value={current.speeds[type.id] ?? ''} onChange={(event) => updateSpeed(type.id, event.target.value)} className={`${inputClass} h-9`} />
                  </label>
                ))}
              </div>
            </section>

            <section className="border-b border-slate-800 pb-3">
              <h3 className="mb-2 flex items-center gap-2 text-[11px] font-bold text-slate-200">
                <Warehouse className="h-3.5 w-3.5 text-blue-500" /> Capacidad Máxima de Almacenes
              </h3>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                {warehouses.map((warehouse) => (
                  <label key={warehouse.nombre} className="space-y-1">
                    <span className="text-[11px] font-medium text-slate-400">{warehouse.nombre}</span>
                    <input type="number" min="0" value={current.warehouseCapacities[warehouse.nombre] ?? ''} placeholder="Infinita (∞)" onChange={(event) => updateCapacity(warehouse.nombre, event.target.value)} className={`${inputClass} h-9`} />
                  </label>
                ))}
              </div>
            </section>

            <section className="border-b border-slate-800 pb-3">
              <div className="mb-2 flex items-center justify-between">
                <div>
                  <h3 className="flex items-center gap-2 text-[11px] font-bold text-slate-200"><Car className="h-3.5 w-3.5 text-blue-500" /> Flota de Transporte (Formato TTNN)</h3>
                  <p className="text-[10px] text-slate-500">TT: Tipo (TA: Autos, TB: Bicicletas, TM: Motos) / NN: Correlativo</p>
                </div>
                <span className="rounded-lg border border-blue-500/30 px-2 py-0.5 font-mono-code text-[10px] text-blue-400">Total: {totalVehicles} vehículos</span>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                {types.map((type) => (
                  <label key={type.id} className="p-2">
                    <span className="mb-1.5 flex items-center gap-1 text-[11px] font-medium text-slate-400">
                      {type.id.toLowerCase().includes('moto') ? (
                        <Bike className="h-3 w-3 text-purple-400" />
                      ) : type.id.toLowerCase().includes('bici') ? (
                        <Bike className="h-3 w-3 text-emerald-400" />
                      ) : (
                        <Car className="h-3 w-3 text-blue-400" />
                      )}
                      {type.nombre}
                    </span>
                    <input type="number" min="0" value={current.fleetCounts[type.id] ?? 0} onChange={(event) => updateFleetCount(type.id, event.target.value)} className={`${inputClass} h-9`} />
                  </label>
                ))}
              </div>
            </section>

            <section className="border-b border-slate-800 pb-3">
              <h3 className="mb-2 text-[11px] font-bold text-slate-200">Tema Visual de la Interfaz</h3>
              <div className="grid grid-cols-2 gap-3">
                <button type="button" onClick={() => setTheme('dark')} className={`flex h-9 items-center justify-center gap-2 rounded-lg border text-[11px] ${isDark ? 'border-blue-500 bg-blue-600 font-semibold text-white' : 'border-slate-700 text-slate-400'}`}>
                  <Moon className="h-3.5 w-3.5" /> Modo Oscuro
                </button>
                <button type="button" onClick={() => setTheme('light')} className={`flex h-9 items-center justify-center gap-2 rounded-lg border text-[11px] ${!isDark ? 'border-blue-500 bg-blue-600 font-semibold text-white' : 'border-slate-700 text-slate-400'}`}>
                  <Sun className="h-3.5 w-3.5" /> Modo Claro
                </button>
              </div>
            </section>

            <footer className="flex flex-wrap items-center justify-between gap-3">
              <button type="button" onClick={reset} className="flex items-center gap-2 text-xs text-slate-400 hover:text-white"><RotateCcw className="h-4 w-4" /> Valores por defecto</button>
              <div className="flex gap-2">
                <button type="button" onClick={onClose} className="rounded-xl border border-slate-700 px-4 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-800">Cancelar</button>
                <button type="button" onClick={save} className="flex items-center gap-2 rounded-xl bg-blue-700 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-600">
                  <Check className="h-4 w-4" /> Guardar Parámetros
                </button>
              </div>
            </footer>
          </div>
        )}
      </div>
    </div>
  );
};
