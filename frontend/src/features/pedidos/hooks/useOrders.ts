import { useEstadoOperacion } from '../../../hooks/useEstadoOperacion';

/**
 * No existe un endpoint para asignar manualmente un pedido a un vehiculo -- la asignacion la
 * decide el planificador (ALNS/IPSO) en cada lote, no una llamada de API directa. Por eso este
 * hook ya no expone assignVehicle: no hay nada real a lo que llamarlo.
 */
export function useOrders() {
  const { orders, isLoading, isError, refetch } = useEstadoOperacion();

  return {
    orders,
    isLoading,
    isError,
    refetch,
  };
}
