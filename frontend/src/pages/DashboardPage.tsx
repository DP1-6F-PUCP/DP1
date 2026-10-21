import React from 'react';
import { MapSlot } from '../components/map/MapSlot';

export const DashboardPage: React.FC = () => {
  return (
    <div className="flex-1 flex flex-col h-full w-full overflow-hidden bg-[var(--color-background)] text-[var(--color-text-primary)]">

      {/* Contenedor Principal: Mapa a Pantalla Completa */}
      <div className="flex-1 relative h-full w-full overflow-hidden">
        <MapSlot className="w-full h-full" />
      </div>
    </div>
  );
};
