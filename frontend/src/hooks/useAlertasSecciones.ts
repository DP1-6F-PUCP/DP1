import { useMemo } from 'react';
import { useEstadoVisual } from '../engine/useEstadoVisual';
import { pedidosPorVencer } from '../utils/estadoPedidos';
import { useUmbrales } from '../store/umbralesStore';

export type TonoAlerta = 'rojo' | 'ambar';
export interface AlertaSeccion {
  cantidad: number;
  tono: TonoAlerta;
  /** Texto para tooltip y lector de pantalla. */
  ayuda: string;
}

const MINUTO = 60_000;

/**
 * Alertas que se muestran como contador sobre cada sección (barra ☰) y como punto en el propio
 * botón ☰, para enterarse de algo grave sin estar en esa sección:
 *  - Pedidos: vencidos sin entregar (rojo: hacen colapsar la operación) o, si no hay, los "en
 *    riesgo" según el corte configurable (ámbar). Mismo criterio que el indicador "Vence" y la lista "Vence el plazo".
 *  - Flota: vehículos averiados (rojo).
 * Todo al instante visible del mapa (useEstadoVisual), igual que el resto de la pantalla.
 */
export function useAlertasSecciones(): { porRuta: Record<string, AlertaSeccion | undefined>; peor: TonoAlerta | null } {
  const { orders, vehicles, marcaVisibleMs } = useEstadoVisual();
  const { riesgoMinutos } = useUmbrales();
  return useMemo(() => {
    const porRuta: Record<string, AlertaSeccion | undefined> = {};
    if (marcaVisibleMs != null) {
      const criticos = pedidosPorVencer(orders, vehicles, marcaVisibleMs, {
        incluirVencidos: true,
        hastaMs: marcaVisibleMs + riesgoMinutos * MINUTO,
      });
      const vencidos = criticos.filter((p) => p.restoMs <= 0).length;
      if (vencidos > 0) {
        porRuta['/pedidos'] = { cantidad: vencidos, tono: 'rojo', ayuda: `${vencidos} pedido(s) vencido(s) sin entregar` };
      } else if (criticos.length > 0) {
        porRuta['/pedidos'] = { cantidad: criticos.length, tono: 'ambar', ayuda: `${criticos.length} pedido(s) vencen en ${riesgoMinutos} min o menos` };
      }
    }
    const averiados = vehicles.filter((v) => v.status === 'broken').length;
    if (averiados > 0) {
      porRuta['/flota'] = { cantidad: averiados, tono: 'rojo', ayuda: `${averiados} vehículo(s) averiado(s)` };
    }
    const tonos = Object.values(porRuta).map((a) => a?.tono);
    const peor: TonoAlerta | null = tonos.includes('rojo') ? 'rojo' : tonos.includes('ambar') ? 'ambar' : null;
    return { porRuta, peor };
  }, [orders, vehicles, marcaVisibleMs, riesgoMinutos]);
}

export const CLASE_TONO_ALERTA: Record<TonoAlerta, string> = {
  rojo: 'bg-rose-500 text-white',
  ambar: 'bg-amber-400 text-slate-900',
};
