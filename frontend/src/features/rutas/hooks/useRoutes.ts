import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { routesApi } from '../services/routesApi';
import { Route } from '../../../types';

export function useRoutes() {
  const queryClient = useQueryClient();

  const routesQuery = useQuery({
    queryKey: ['routes'],
    queryFn: () => routesApi.getRoutes(),
  });

  const recalculateMutation = useMutation({
    mutationFn: (routeId: string) => routesApi.recalculateRoute(routeId),
    onSuccess: (updatedRoute: Route) => {
      queryClient.setQueryData<Route[]>(['routes'], (old) =>
        old ? old.map((r) => (r.id === updatedRoute.id ? updatedRoute : r)) : [updatedRoute]
      );
    },
  });

  return {
    routes: routesQuery.data ?? [],
    isLoading: routesQuery.isLoading,
    isError: routesQuery.isError,
    error: routesQuery.error,
    refetch: routesQuery.refetch,
    recalculateRoute: recalculateMutation.mutate,
    isRecalculating: recalculateMutation.isPending,
  };
}
