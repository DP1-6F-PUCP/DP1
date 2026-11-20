/**
 * Última búsqueda de la página Pedidos ("?q=…&estado=…&periodo=…&h=…"): los filtros viven en la
 * URL (el atrás del navegador los conserva) y los enlaces a Pedidos desde otras partes ("Ver todos
 * los pedidos →", la barra de secciones) vuelven con ellos. Solo dura la sesión de la pestaña.
 */
let ultimaBusqueda = '';

export function recordarBusquedaPedidos(search: string): void {
  ultimaBusqueda = search && search !== '?' ? search : '';
}

export const rutaPedidos = (): string => `/pedidos${ultimaBusqueda}`;
