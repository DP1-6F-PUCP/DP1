import React, { useEffect } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
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

  // El mapa es el de Operación, que el layout mantiene montado siempre: aquí solo se selecciona.
  return null;
};
