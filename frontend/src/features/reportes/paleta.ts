/**
 * Colores de los gráficos de Reportes. Paleta categórica validada (skill dataviz,
 * scripts/validate_palette.js) contra las superficies reales de la app: claro #FFFFFF y oscuro
 * #131D31 (--color-surface). En claro, aqua y amarillo quedan bajo 3:1 contra el fondo: por eso
 * cada gráfico lleva leyenda, valores en el globo y su tabla alternativa.
 *
 * El color sigue a la ENTIDAD, nunca al orden: "Entregados" es siempre azul (como el estado
 * "Entregado" de Pedidos), "Recibidos" aqua, etc. Los colores de semáforo (verde/ámbar/rojo) se
 * reservan para estados y siempre van con texto o ícono.
 */
export interface ParColor { claro: string; oscuro: string }

const par = (claro: string, oscuro: string): ParColor => ({ claro, oscuro });

/** Orden fijo de la paleta categórica (no se recicla: un 9.º elemento no recibe color nuevo). */
export const CATEGORICA: ParColor[] = [
  par('#2a78d6', '#3987e5'), // 1 azul
  par('#eb6834', '#d95926'), // 2 naranja
  par('#1baf7a', '#199e70'), // 3 aqua
  par('#eda100', '#c98500'), // 4 amarillo
  par('#e87ba4', '#d55181'), // 5 magenta
  par('#008300', '#0ca30c'), // 6 verde
  par('#6250d6', '#9085e9'), // 7 violeta
  par('#e34948', '#e66767'), // 8 rojo
];

export const SERIE = {
  entregados: CATEGORICA[0],
  recibidos: CATEGORICA[2],
  conVehiculo: CATEGORICA[0],
  sinAsignar: CATEGORICA[1],
  enRuta: CATEGORICA[0],
  refrigerio: CATEGORICA[1],
  disponible: CATEGORICA[2],
  fueraServicio: CATEGORICA[6],
} as const;

/** Semáforo (mismos tonos que indicadoresGlobales / warehouseStock). */
export const SEMAFORO = {
  bien: '#16A34A',
  atencion: '#EAB308',
  critico: '#DC2626',
} as const;

export const colorDe = (c: ParColor, oscuro: boolean) => (oscuro ? c.oscuro : c.claro);

/** Tinta de ejes, rejilla y rótulos (recesivos). */
export const tinta = (oscuro: boolean) => ({
  rejilla: oscuro ? '#1f2a40' : '#e5e7eb',
  eje: oscuro ? '#334155' : '#cbd5e1',
  rotulo: oscuro ? '#94a3b8' : '#64748b',
  fuerte: oscuro ? '#e2e8f0' : '#0f172a',
  superficie: oscuro ? '#131D31' : '#ffffff',
});
