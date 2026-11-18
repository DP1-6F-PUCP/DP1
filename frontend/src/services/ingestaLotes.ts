import type { QueryClient } from '@tanstack/react-query';
import type { ConfiguracionActualDTO, EstadoOperacionDTO, PedidoDTO } from '../types/backend';
import { estadoOperacionApi } from './estadoOperacionApi';
import { simulationEngine } from '../engine/simulationEngine';
import { adaptEstadoOperacion } from '../utils/backendAdapters';
import { keepRecentOrders, MAX_LOADED_ORDERS } from '../utils/shipmentList';

/**
 * Ingesta ordenada de lotes numerados. Antes el lote viajaba WS -> caché de React Query -> render
 * -> motor: si dos lotes llegaban casi juntos (los precalculados al arrancar), React se quedaba con
 * el último y el motor nunca veía el anterior, así que esa trayectoria se perdía. Ahora cada lote
 * entra directo al motor y en orden; si la secuencia salta (reconexión, pestaña en segundo plano),
 * se piden los que faltan a GET /api/estado-operacion/lotes?desde=N.
 *
 * Los pedidos llegan como cambios (`pedidosCambiados`) y se mezclan con la caché de pedidos, en
 * vez de volver a descargar la lista completa en cada lote.
 */

interface Contexto {
  idEjecucion: string;
  sa: number | undefined;
  k: number;
  scenarioStartMs: number | null;
  avanzando: boolean;
}

let ejecucionActual: string | null = null;
let ultimaSecuencia = 0;
let cadena: Promise<void> = Promise.resolve();

/** Olvidar la numeración (al iniciar o cerrar una ejecución). */
export function reiniciarIngesta(idEjecucion: string | null = null): void {
  ejecucionActual = idEjecucion;
  ultimaSecuencia = 0;
}

export function ultimaSecuenciaIngerida(): number {
  return ultimaSecuencia;
}

/**
 * Aplica los pedidos que cambiaron sobre la lista conocida; devuelve una lista nueva. Se recorta
 * al mismo tope que usa la vista (MAX_LOADED_ORDERS), descartando solo entregados antiguos: sin
 * esto la caché crecía con todo el historial de la ejecución. Lo anterior se consulta en
 * GET /api/pedidos/historial.
 */
function mezclarPedidos(base: PedidoDTO[] | undefined, cambiados: PedidoDTO[] | undefined): PedidoDTO[] {
  if (!cambiados || cambiados.length === 0) return base ?? [];
  const porId = new Map((base ?? []).map((p) => [p.idPedido, p]));
  for (const p of cambiados) porId.set(p.idPedido, p);
  return keepRecentOrders([...porId.values()], MAX_LOADED_ORDERS,
    (p) => p.estado === 'ENTREGADA',
    (p) => (p.fechaEntrega ? Date.parse(p.fechaEntrega) : 0));
}

function aplicar(client: QueryClient, estado: EstadoOperacionDTO, ctx: Contexto): void {
  const pedidos = mezclarPedidos(client.getQueryData<PedidoDTO[]>(['pedidos', ctx.idEjecucion]), estado.pedidosCambiados);
  client.setQueryData(['pedidos', ctx.idEjecucion], pedidos);
  client.setQueryData(['estado-operacion', ctx.idEjecucion], estado);
  if (estado.secuencia) ultimaSecuencia = Math.max(ultimaSecuencia, estado.secuencia);
  const config = client.getQueryData<ConfiguracionActualDTO>(['configuracion']);
  if (!config) return; // sin configuración aún: lo tomará la ingesta por render
  const frame = { ...adaptEstadoOperacion(estado, config, pedidos, ctx.scenarioStartMs), estadoRaw: estado };
  simulationEngine.ingest({ vehicles: frame.vehicles, routes: frame.routes, frame, idEjecucion: ctx.idEjecucion,
    sa: ctx.sa, k: ctx.k, marcaTiempoActual: estado.marcaTiempoActual, avanzando: ctx.avanzando });
}

async function procesar(client: QueryClient, estado: EstadoOperacionDTO, ctx: Contexto, signal?: AbortSignal) {
  if (estado.idEjecucion !== ctx.idEjecucion) return;
  if (ejecucionActual !== ctx.idEjecucion) reiniciarIngesta(ctx.idEjecucion);
  const seq = estado.secuencia ?? 0;
  if (seq > 0 && seq <= ultimaSecuencia) return; // duplicado o tardío
  if (seq > 1 && ultimaSecuencia === 0) {
    // Se entra con la ejecución ya avanzada (recarga de página): los cambios de pedidos de este
    // lote no bastan, hace falta la lista completa una vez.
    client.invalidateQueries({ queryKey: ['pedidos', ctx.idEjecucion] });
  }
  if (seq > ultimaSecuencia + 1 && ultimaSecuencia > 0) {
    // Hueco: recuperar en orden los lotes que no llegaron.
    try {
      const faltantes = await estadoOperacionApi.getLotesDesde(ultimaSecuencia + 1, signal);
      for (const lote of faltantes) {
        if ((lote.secuencia ?? 0) > ultimaSecuencia && (lote.secuencia ?? 0) < seq && lote.idEjecucion === ctx.idEjecucion) {
          aplicar(client, lote, ctx);
        }
      }
      if (faltantes.length > 0 && (faltantes[0].secuencia ?? 0) > ultimaSecuencia + 1) {
        // Se perdieron más lotes de los que guarda el servidor: rehacer la lista de pedidos completa.
        client.invalidateQueries({ queryKey: ['pedidos', ctx.idEjecucion] });
      }
    } catch {
      // sin respuesta: se aplica igual el lote actual (mejor un salto que congelarse)
    }
  }
  aplicar(client, estado, ctx);
}

/** Encola un lote para ingerirlo en orden (los huecos se rellenan antes de aplicarlo). */
export function ingerirLote(client: QueryClient, estado: EstadoOperacionDTO, ctx: Contexto): Promise<void> {
  cadena = cadena.then(() => procesar(client, estado, ctx)).catch(() => undefined);
  return cadena;
}

/** Trae e ingiere todos los lotes posteriores al último conocido (arranque y respaldo sin socket). */
export async function ponerseAlDia(client: QueryClient, ctx: Contexto, signal?: AbortSignal): Promise<number> {
  if (ejecucionActual !== ctx.idEjecucion) reiniciarIngesta(ctx.idEjecucion);
  const lotes = await estadoOperacionApi.getLotesDesde(ultimaSecuencia + 1, signal);
  for (const lote of lotes) await ingerirLote(client, lote, ctx);
  return lotes.length;
}
