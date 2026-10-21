import React, { useEffect } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { MapSlot } from '../components/map/MapSlot';
import { useMapStore } from '../store/mapStore';

export const SeguimientoPage: React.FC = () => {
  const { vehicleId: pathVehicleId } = useParams<{ vehicleId?: string }>();
  const [searchParams] = useSearchParams();
  const queryVehicleId = searchParams.get('vehicleId');

  const targetVehicleId = pathVehicleId || queryVehicleId;
  const setSelectedVehicleId = useMapStore((s) => s.setSelectedVehicleId);

  useEffect(() => {
    if (targetVehicleId) {
      setSelectedVehicleId(targetVehicleId);
    }
  }, [targetVehicleId, setSelectedVehicleId]);

  return (
    <div className="flex-1 flex h-full w-full overflow-hidden bg-[#0B111E] text-slate-100">
      <MapSlot className="flex-1 relative h-full w-full" />
    </div>
  );
};
