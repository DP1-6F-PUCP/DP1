import React from 'react';
import { AlertTriangle, Hourglass } from 'lucide-react';
import type { OrderStatus } from '../types/order';
import { duracionCorta, haceCorto, tonoFaltan } from '../utils/estadoPedidos';

/** Colores: página (claro y oscuro) o panel lateral (siempre oscuro). */
const COLORES = {
  pagina: {
    rojo: 'font-semibold text-rose-600 dark:text-rose-400',
    ambar: 'font-semibold text-amber-600 dark:text-amber-400',
    neutro: 'text-slate-700 dark:text-slate-300',
    tenue: 'text-slate-500 dark:text-slate-400',
  },
  panel: {
    rojo: 'font-bold text-rose-300',
    ambar: 'font-bold text-amber-300',
    neutro: 'text-slate-300',
    tenue: 'text-slate-500',
  },
} as const;

/**
 * "Faltan" hasta el límite, con el mismo formato en la tabla de Pedidos, la ficha del pedido y la
 * tarjeta del vehículo: "2h 58m"; "vencido hace 12m" (rojo); "—" en servicio o sin dato. Colores
 * del indicador (rojo < 1 h, ámbar < 3 h) salvo junto a "A tiempo", que no se pinta ámbar: ese
 * tramo lleva un reloj de arena neutro (ver tonoFaltan).
 */
export const Faltan: React.FC<{
  ms: number | undefined;
  status: OrderStatus;
  servicio?: boolean;
  variante?: keyof typeof COLORES;
  /** Antepone "Faltan" / "Vencido" (para fichas sin columna rotulada). */
  conRotulo?: boolean;
}> = ({ ms, status, servicio = false, variante = 'pagina', conRotulo = false }) => {
  const c = COLORES[variante];
  if (status === 'delivered' || ms === undefined) return <span className={c.tenue}>—</span>;
  if (servicio) return <span className={c.tenue} title="En servicio: su vehículo ya llegó, ya no puede vencer">—</span>;
  if (ms <= 0) {
    return (
      <span className={`inline-flex items-center gap-0.5 ${c.rojo}`} title="Límite vencido al reloj del mapa">
        <AlertTriangle className="h-3 w-3 shrink-0" aria-hidden />vencido {haceCorto(ms)}
      </span>
    );
  }
  const { tono, pronto } = tonoFaltan(ms, status);
  return (
    <span className={`inline-flex items-center gap-0.5 ${c[tono]}`}
      title={pronto ? 'Vence en menos de 3 h (aún a tiempo)' : undefined}>
      {pronto && <Hourglass className="h-3 w-3 shrink-0" aria-hidden />}
      {conRotulo && <span className="font-sans font-normal opacity-80">Faltan</span>}
      {duracionCorta(ms)}
    </span>
  );
};
