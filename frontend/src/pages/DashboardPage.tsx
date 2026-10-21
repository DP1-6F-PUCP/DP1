import React from 'react';
import { MapSlot } from '../components/map/MapSlot';
import { useEstadoOperacion } from '../hooks/useEstadoOperacion';
import { MetricasStrip } from '../features/metricas/components/MetricasStrip';
import { useScenarioStore } from '../store/scenarioStore';
import { useThemeStore } from '../store/themeStore';
import { getVehicleSemaforoStatus } from '../utils/vehicleStatus';

export const DashboardPage: React.FC = () => {
  const { vehicles, orders, estadoRaw } = useEstadoOperacion();
  const scenarioStartMs = useScenarioStore((s) => s.scenarioStartMs());
  const isDark = useThemeStore((s) => s.isDark);

  const nowMs = estadoRaw?.marcaTiempoActual ? Date.parse(estadoRaw.marcaTiempoActual) : null;
  const simMinutes =
    scenarioStartMs != null && nowMs != null ? Math.round((nowMs - scenarioStartMs) / 60000) : 0;

  const semaforos = vehicles.map((v) => getVehicleSemaforoStatus(v, orders, simMinutes));
  const onTimeCount = semaforos.filter((s) => s.state === 'on_time').length;
  const atRiskCount = semaforos.filter((s) => s.state === 'at_risk').length;
  const delayedCount = semaforos.filter((s) => s.state === 'delayed').length;

  return (
    <div className="flex-1 flex flex-col h-full w-full overflow-hidden bg-[var(--color-background)] text-[var(--color-text-primary)]">

      {/* Contenedor Principal: Mapa a Pantalla Completa */}
      <div className="flex-1 relative h-full w-full overflow-hidden">
        <MapSlot className="w-full h-full" />
      </div>
    </div>
  );
};
