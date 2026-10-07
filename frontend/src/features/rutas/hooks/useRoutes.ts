import { useEstadoOperacion } from '../../../hooks/useEstadoOperacion';

/**
 * No existe un endpoint para recalcular una ruta puntual -- las rutas se recalculan enteras en
 * cada lote de OrquestadorOperacion. Por eso este hook ya no expone recalculateRoute.
 */
export function useRoutes() {
  const { routes, isLoading, isError, refetch } = useEstadoOperacion();

  return {
    routes,
    isLoading,
    isError,
    refetch,
  };
}
