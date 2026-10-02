import React, { useState } from 'react';
import { useVehicles } from '../hooks/useVehicles';
import { useMapStore } from '../../../store/mapStore';
import { Vehicle, BreakdownType } from '../../../types';
import { StatusBadge } from '../../../components/StatusBadge';
import { useToast } from '../../../components/ToastProvider';
import { Car, Bike, Search, AlertTriangle, BatteryCharging, Package, MapPin } from 'lucide-react';

export const VehiclePanelContainer: React.FC = () => {
  const { vehicles, reportBreakdown, isReportingBreakdown } = useVehicles();
  const selectedVehicleId = useMapStore((s) => s.selectedVehicleId);
  const setSelectedVehicleId = useMapStore((s) => s.setSelectedVehicleId);
  const { addToast } = useToast();

  const [filterType, setFilterType] = useState<'all' | 'car' | 'motorcycle' | 'bicycle'>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [isBreakdownModalOpen, setIsBreakdownModalOpen] = useState(false);
  const [breakdownType, setBreakdownType] = useState<BreakdownType>(1);

  const selectedVehicle = vehicles.find((v) => v.id === selectedVehicleId) || null;

  const handleSelectVehicle = (vehicle: Vehicle) => {
    setSelectedVehicleId(vehicle.id);
  };

  const handleReportBreakdown = () => {
    if (!selectedVehicle) return;
    reportBreakdown(
      {
        vehicleId: selectedVehicle.id,
        type: breakdownType,
        reason: `Avería Tipo ${breakdownType} reportada manualmente`,
      },
      {
        onSuccess: () => {
          setIsBreakdownModalOpen(false);
          addToast({
            type: 'warning',
            title: `Avería Tipo ${breakdownType} inyectada`,
            description: `Unidad ${selectedVehicle.code} inmovilizada. Se activó plan de contingencia.`,
          });
        },
        onError: (err) => {
          addToast({
            type: 'error',
            title: 'Error al reportar avería',
            description: (err as Error)?.message || 'No se pudo comunicar el fallo.',
          });
        },
      }
    );
  };

  const filteredVehicles = vehicles.filter((v) => {
    const matchesType = filterType === 'all' || v.type === filterType;
    const matchesSearch =
      v.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
      v.id.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesType && matchesSearch;
  });

  return (
    <div className="flex flex-col h-full space-y-3">
      {/* Controles de Búsqueda y Tipo */}
      <div className="space-y-2">
        <div className="relative">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar por código (TA01, TM03, TB02)..."
            className="w-full pl-9 pr-3 py-2 rounded-xl text-xs bg-slate-900 border border-slate-700 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500"
          />
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto text-[11px] pb-1">
          {(['all', 'car', 'motorcycle', 'bicycle'] as const).map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => setFilterType(type)}
              className={`px-2.5 py-1 rounded-lg font-medium transition-colors cursor-pointer shrink-0 ${
                filterType === type
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              {type === 'all'
                ? 'Todos'
                : type === 'car'
                ? 'Autos (TA)'
                : type === 'motorcycle'
                ? 'Motos (TM)'
                : 'Bicis (TB)'}
            </button>
          ))}
        </div>
      </div>

      {/* Lista de Vehículos */}
      <div className="flex-1 overflow-y-auto space-y-2 pr-1">
        {filteredVehicles.map((v) => {
          const isSelected = selectedVehicleId === v.id;
          return (
            <div
              key={v.id}
              onClick={() => handleSelectVehicle(v)}
              className={`p-3 rounded-xl border transition-all cursor-pointer ${
                isSelected
                  ? 'bg-blue-900/30 border-blue-500 ring-1 ring-blue-500/50 shadow-md'
                  : 'bg-slate-900/60 hover:bg-slate-800/80 border-slate-700/60 text-slate-200'
              }`}
            >
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-blue-500/20 text-blue-400">
                    {v.type === 'car' ? (
                      <Car className="h-4 w-4" />
                    ) : (
                      <Bike className="h-4 w-4" />
                    )}
                  </div>
                  <div>
                    <span className="font-mono-code font-bold text-sm text-white">
                      {v.code}
                    </span>
                    <span className="text-[10px] text-slate-400 ml-1.5">
                      {v.type.toUpperCase()}
                    </span>
                  </div>
                </div>
                <StatusBadge status={v.status} type="vehicle" size="sm" />
              </div>

              <div className="grid grid-cols-3 gap-1.5 text-[11px] my-2">
                <div className="p-1 rounded bg-slate-950/40 border border-slate-800/80 text-center">
                  <span className="text-[9px] text-slate-400 block">Velocidad</span>
                  <span className="font-mono-code font-bold text-slate-200">{v.speed} km/h</span>
                </div>
                <div className="p-1 rounded bg-slate-950/40 border border-slate-800/80 text-center">
                  <span className="text-[9px] text-slate-400 block">Carga</span>
                  <span className="font-mono-code font-bold text-slate-200">
                    {v.currentLoad}/{v.capacity}
                  </span>
                </div>
                <div className="p-1 rounded bg-slate-950/40 border border-slate-800/80 text-center">
                  <span className="text-[9px] text-slate-400 block">Entregas</span>
                  <span className="font-mono-code font-bold text-emerald-400">
                    {v.totalDelivered}
                  </span>
                </div>
              </div>

              {isSelected && (
                <div className="pt-2 border-t border-slate-800 flex items-center justify-between gap-2">
                  <span className="text-[10px] text-slate-400 font-mono-code flex items-center gap-1">
                    <MapPin className="h-3 w-3 text-cyan-400" /> X={v.position.x}, Y={v.position.y}
                  </span>
                  {v.status !== 'broken' && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setIsBreakdownModalOpen(true);
                      }}
                      className="text-[10px] font-semibold py-1 px-2 rounded-lg bg-rose-500/20 text-rose-300 border border-rose-500/40 hover:bg-rose-500/30 transition-colors inline-flex items-center gap-1"
                    >
                      <AlertTriangle className="h-3 w-3 text-rose-400" /> Forzar Avería
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Modal Inyección de Avería */}
      {isBreakdownModalOpen && selectedVehicle && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="w-full max-w-md rounded-2xl bg-slate-900 border border-slate-700 p-5 shadow-2xl text-slate-100 space-y-4">
            <div className="flex items-center gap-2 text-rose-400 border-b border-slate-800 pb-3">
              <AlertTriangle className="h-5 w-5" />
              <h4 className="font-bold text-sm text-white">
                Inyectar Avería a {selectedVehicle.code}
              </h4>
            </div>

            <div className="space-y-2 text-xs">
              <p className="text-slate-300">
                Seleccione el tipo normativo según lineamientos de operación:
              </p>
              <div className="space-y-2">
                {[
                  {
                    type: 1 as BreakdownType,
                    title: 'Tipo 1 (Menor)',
                    desc: 'No disponible por 2 horas. Solución in situ (neumático).',
                  },
                  {
                    type: 2 as BreakdownType,
                    title: 'Tipo 2 (Intermedia)',
                    desc: 'No disponible hasta fin del siguiente turno. Permanece máx 4h y traslado a Central.',
                  },
                  {
                    type: 3 as BreakdownType,
                    title: 'Tipo 3 (Mayor)',
                    desc: '≥ 2 días de inmovilización. Retorna en turno 15:00-23:00.',
                  },
                ].map((opt) => (
                  <label
                    key={opt.type}
                    className={`block p-2.5 rounded-xl border cursor-pointer transition-all ${
                      breakdownType === opt.type
                        ? 'border-rose-500 bg-rose-500/10 text-white'
                        : 'border-slate-800 bg-slate-950/40 text-slate-300'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="breakdownType"
                        checked={breakdownType === opt.type}
                        onChange={() => setBreakdownType(opt.type)}
                        className="accent-rose-500"
                      />
                      <span className="font-bold">{opt.title}</span>
                    </div>
                    <p className="text-[11px] text-slate-400 pl-5 mt-0.5">{opt.desc}</p>
                  </label>
                ))}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setIsBreakdownModalOpen(false)}
                className="py-1.5 px-3 rounded-lg border border-slate-700 bg-slate-800 text-xs font-medium text-slate-300 hover:bg-slate-700"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={isReportingBreakdown}
                onClick={handleReportBreakdown}
                className="btn-danger py-1.5 px-3 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5"
              >
                Confirmar Avería
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
