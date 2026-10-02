import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ordersApi } from '../services/ordersApi';
import { Order } from '../../../types';

export function useOrders() {
  const queryClient = useQueryClient();

  const ordersQuery = useQuery({
    queryKey: ['orders'],
    queryFn: () => ordersApi.getOrders(),
    refetchInterval: 5000,
  });

  const assignVehicleMutation = useMutation({
    mutationFn: ({ orderId, vehicleId }: { orderId: string; vehicleId: string }) =>
      ordersApi.assignVehicle(orderId, vehicleId),
    onSuccess: (updatedOrder: Order) => {
      queryClient.setQueryData<Order[]>(['orders'], (old) =>
        old ? old.map((o) => (o.id === updatedOrder.id ? updatedOrder : o)) : [updatedOrder]
      );
    },
  });

  return {
    orders: ordersQuery.data ?? [],
    isLoading: ordersQuery.isLoading,
    isError: ordersQuery.isError,
    refetch: ordersQuery.refetch,
    assignVehicle: assignVehicleMutation.mutate,
    isAssigning: assignVehicleMutation.isPending,
  };
}
