/**
 * Rangos del semáforo de vehículos por plazo, como holgura en minutos simulados entre el instante
 * actual y el plazo más próximo de los pedidos que lleva el vehículo:
 *  - verde: holgura > riesgoMinutos
 *  - ámbar: retrasoMinutos < holgura <= riesgoMinutos
 *  - rojo:  holgura <= retrasoMinutos (o avería / mantenimiento)
 *
 * Los valores vigentes salen de store/umbralesStore (Configuración → Semáforos), con la misma escala
 * que los pedidos: riesgoMinutos = riesgoMinutos, retrasoMinutos = 0 (vencido).
 */
export interface UmbralesSemaforo {
  riesgoMinutos: number;
  retrasoMinutos: number;
}

export const UMBRALES_SEMAFORO_DEFAULT: UmbralesSemaforo = { riesgoMinutos: 180, retrasoMinutos: 60 };
