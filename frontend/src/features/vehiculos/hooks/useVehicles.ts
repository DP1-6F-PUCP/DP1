import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { vehiclesApi } from '../services/vehiclesApi';
import { Vehicle, BreakdownType } from '../../../types';

export function useVehicles() {
  const queryClient = useQueryClient();

  const vehiclesQuery = useQuery({
    queryKey: ['vehicles'],
    queryFn: () => vehiclesApi.getVehicles(),
    refetchInterval: 3000,
  });

  const reportBreakdownMutation = useMutation({
    mutationFn: ({
      vehicleId,
      type,
      reason,
    }: {
      vehicleId: string;
      type: BreakdownType;
      reason?: string;
    }) => vehiclesApi.reportBreakdown(vehicleId, type, reason),
    onSuccess: (updatedVehicle: Vehicle) => {
      queryClient.setQueryData<Vehicle[]>(['vehicles'], (old) =>
        old ? old.map((v) => (v.id === updatedVehicle.id ? updatedVehicle : v)) : [updatedVehicle]
      );
    },
  });

  return {
    vehicles: vehiclesQuery.data ?? [],
    isLoading: vehiclesQuery.isLoading,
    isError: vehiclesQuery.isError,
    refetch: vehiclesQuery.refetch,
    reportBreakdown: reportBreakdownMutation.mutate,
    isReportingBreakdown: reportBreakdownMutation.isPending,
  };
}
