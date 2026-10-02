import React, { useState } from 'react';
import { Vehicle, BreakdownType } from '../types';
import { AlertTriangle, X, Clock, ShieldAlert, Wrench, Flame } from 'lucide-react';
import { Button } from './ui/Button';

interface BreakdownModalProps {
  isOpen: boolean;
  onClose: () => void;
  vehicles: Vehicle[];
  onConfirmBreakdown: (vehicleId: string, type: BreakdownType, reason: string) => void;
  isDarkTheme?: boolean;
}

interface TypeOption {
  type: BreakdownType;
  title: string;
  badge: string;
  badgeColor: string;
  borderColor: string;
  bgSelected: string;
  icon: React.ReactNode;
  durationText: string;
  stayText: string;
  defaultReason: string;
}

const TYPE_OPTIONS: TypeOption[] = [
  {
    type: 1,
    title: 'Avería Tipo 1 (Menor)',
    badge: '2 Horas',
    badgeColor: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
    borderColor: 'border-amber-500/60',
    bgSelected: 'bg-amber-500/10',
    icon: <Wrench className="h-4 w-4 text-amber-400" />,
    durationText: 'No disponible por 2 horas.',
    stayText: 'Permanece y se repara en el lugar de la avería.',
    defaultReason: 'Neumático desinflado (reparación rápida in situ en 2h)',
  },
  {
    type: 2,
    title: 'Avería Tipo 2 (Intermedia)',
    badge: 'Fin del sgte. turno',
    badgeColor: 'bg-orange-500/20 text-orange-300 border-orange-500/40',
    borderColor: 'border-orange-500/60',
    bgSelected: 'bg-orange-500/10',
    icon: <Clock className="h-4 w-4 text-orange-400" />,
    durationText: 'No disponible hasta el final del siguiente turno al que se averió.',
    stayText: 'Permanece en el lugar por 4 horas como máximo. Luego es llevada al Almacén Central con los paquetes no trasvasados.',
    defaultReason: 'Rotura de faja/cadena del sistema de transmisión',
  },
  {
    type: 3,
    title: 'Avería Tipo 3 (Mayor)',
    badge: '≥ 2 Días (Turno 15-23h)',
    badgeColor: 'bg-rose-500/20 text-rose-300 border-rose-500/40',
    borderColor: 'border-rose-500/60',
    bgSelected: 'bg-rose-500/10',
    icon: <Flame className="h-4 w-4 text-rose-400" />,
    durationText: 'No disponible por al menos 2 días por mantenimiento y retorna en el turno 15:00 a 23:00.',
    stayText: 'Permanece en el lugar de la avería por 4 horas. Luego es llevada al Almacén Central junto con los paquetes no trasvasados.',
    defaultReason: 'Falla crítica de motor / mantenimiento mayor integral',
  },
];

export const BreakdownModal: React.FC<BreakdownModalProps> = ({
  isOpen,
  onClose,
  vehicles,
  onConfirmBreakdown,
  isDarkTheme = true,
}) => {
  const activeVehicles = vehicles.filter((v) => v.status !== 'broken');
  const [selectedVehicleId, setSelectedVehicleId] = useState<string>(
    activeVehicles[0]?.id || ''
  );
  const [selectedType, setSelectedType] = useState<BreakdownType>(1);

  if (!isOpen) return null;

  const handleSelectType = (type: BreakdownType) => {
    setSelectedType(type);
  };

  const handleConfirm = () => {
    let targetId = selectedVehicleId;
    if (!targetId || targetId === 'random') {
      const randomIndex = Math.floor(Math.random() * activeVehicles.length);
      targetId = activeVehicles[randomIndex]?.id;
    }
    if (targetId) {
      const opt = TYPE_OPTIONS.find((o) => o.type === selectedType);
      const reason = opt?.defaultReason || `Avería Tipo ${selectedType}`;
      onConfirmBreakdown(targetId, selectedType, reason);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in">
      <div
        className={`w-full max-w-xl rounded-2xl shadow-2xl p-5 space-y-4 max-h-[90vh] overflow-y-auto border transition-colors ${
          isDarkTheme
            ? 'bg-slate-900 border-slate-700 text-slate-100'
            : 'bg-[var(--color-surface)] border-slate-200 text-[var(--color-text-primary)] shadow-xl'
        }`}
      >
        <div
          className={`flex items-center justify-between border-b pb-3 ${
            isDarkTheme ? 'border-slate-800' : 'border-slate-200'
          }`}
        >
          <div className="flex items-center gap-2.5 text-[var(--color-danger)]">
            <div
              className={`p-2 rounded-xl border ${
                isDarkTheme
                  ? 'bg-rose-500/20 border-rose-500/40 text-rose-400'
                  : 'bg-rose-50 border-rose-200 text-[var(--color-danger)]'
              }`}
            >
              <ShieldAlert className="h-5 w-5" />
            </div>
            <div>
              <h3
                className={`font-bold text-base ${
                  isDarkTheme ? 'text-white' : 'text-[var(--color-text-primary)]'
                }`}
              >
                Simulador de Avería de Flota
              </h3>
              <p
                className={`text-xs ${
                  isDarkTheme ? 'text-slate-400' : 'text-[var(--color-text-secondary)]'
                }`}
              >
                Seleccione la unidad y el tipo normativo de avería
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className={`p-1 rounded-lg transition-colors ${
              isDarkTheme
                ? 'text-slate-400 hover:text-white hover:bg-slate-800'
                : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-slate-100'
            }`}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Selection of Vehicle */}
        <div className="space-y-3 text-xs">
          <div>
            <label
              className={`block font-semibold mb-1 ${
                isDarkTheme ? 'text-slate-300' : 'text-slate-700'
              }`}
            >
              Unidad de Transporte Objetivo
            </label>
            <select
              value={selectedVehicleId}
              onChange={(e) => setSelectedVehicleId(e.target.value)}
              className={`w-full rounded-xl px-3 py-2 font-mono-code focus:outline-none focus:border-blue-500 border ${
                isDarkTheme
                  ? 'bg-slate-800 border-slate-700 text-white'
                  : 'bg-slate-50 border-slate-300 text-slate-900'
              }`}
            >
              <option value="random">🎲 Seleccionar aleatorio (Cualquier activo)</option>
              {activeVehicles.map((v) => {
                const typeLabel =
                  v.type === 'car'
                    ? 'Auto (TA)'
                    : v.type === 'bicycle'
                    ? 'Bicicleta (TB)'
                    : 'Moto (TM)';
                return (
                  <option key={v.id} value={v.id}>
                    {v.code} - {typeLabel} ({v.currentLoad}/{v.capacity} paquetes en ruta)
                  </option>
                );
              })}
            </select>
          </div>

          {/* 3 Types of Breakdowns */}
          <div>
            <label
              className={`block font-semibold mb-1.5 ${
                isDarkTheme ? 'text-slate-300' : 'text-slate-700'
              }`}
            >
              Tipo de Avería
            </label>
            <div className="space-y-2">
              {TYPE_OPTIONS.map((opt) => {
                const isSelected = selectedType === opt.type;
                return (
                  <div
                    key={opt.type}
                    onClick={() => handleSelectType(opt.type)}
                    className={`p-3 rounded-xl border transition-all cursor-pointer ${
                      isSelected
                        ? `${opt.borderColor} ${opt.bgSelected} ring-1 ring-offset-0 ring-rose-500/20 shadow-sm`
                        : isDarkTheme
                        ? 'border-slate-800 bg-slate-800/50 hover:border-slate-700 text-slate-300'
                        : 'border-slate-200 bg-slate-50/80 hover:border-slate-300 text-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        {opt.icon}
                        <span
                          className={`font-bold text-xs ${
                            isDarkTheme ? 'text-white' : 'text-slate-900'
                          }`}
                        >
                          {opt.title}
                        </span>
                      </div>
                      <span
                        className={`text-[9px] font-mono-code font-bold px-2 py-0.5 rounded border ${opt.badgeColor}`}
                      >
                        {opt.badge}
                      </span>
                    </div>

                    <p
                      className={`text-[11px] mb-1 ${
                        isDarkTheme ? 'text-slate-300' : 'text-slate-700'
                      }`}
                    >
                      {opt.durationText}
                    </p>

                    <div
                      className={`text-[10px] p-2 rounded-lg border ${
                        isDarkTheme
                          ? 'text-slate-400 bg-slate-950/40 border-slate-800/80'
                          : 'text-slate-600 bg-white border-slate-200'
                      }`}
                    >
                      <span
                        className={`font-medium ${
                          isDarkTheme ? 'text-slate-300' : 'text-slate-800'
                        }`}
                      >
                        Permanencia en sitio:{" "}
                      </span>
                      <span>{opt.stayText}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Action buttons (5. Botón primario y secundario del sistema) */}
        <div
          className={`flex items-center gap-2 pt-2 border-t ${
            isDarkTheme ? 'border-slate-800' : 'border-slate-200'
          }`}
        >
          <Button
            variant="secondary"
            onClick={onClose}
            className="flex-1"
          >
            Cancelar
          </Button>
          <Button
            id="btn-confirm-create-breakdown"
            variant="danger"
            onClick={handleConfirm}
            className="flex-1"
          >
            <AlertTriangle className="h-3.5 w-3.5 mr-1.5" />
            Inyectar Avería Tipo {selectedType}
          </Button>
        </div>
      </div>
    </div>
  );
};

