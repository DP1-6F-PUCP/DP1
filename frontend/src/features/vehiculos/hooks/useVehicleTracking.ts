import { useEffect } from 'react';
import { trackingSocket } from '../services/trackingSocket';
import { useMapStore } from '../../../store/mapStore';

export function useVehicleTracking() {
  const updateBatchPositions = useMapStore((s) => s.updateBatchPositions);
  const realtimePositions = useMapStore((s) => s.realtimePositions);

  useEffect(() => {
    trackingSocket.connect();
    const unsubscribe = trackingSocket.subscribe((positions) => {
      updateBatchPositions(positions);
    });

    return () => {
      unsubscribe();
    };
  }, [updateBatchPositions]);

  return { realtimePositions };
}
