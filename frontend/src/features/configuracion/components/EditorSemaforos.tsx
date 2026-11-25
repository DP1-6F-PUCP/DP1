import React from 'react';
import { Clock, Gauge, Package, RotateCcw, Warehouse } from 'lucide-react';
import { UMBRALES_DEFAULT, type Umbrales } from '../../../store/umbralesStore';
import { FLEET_FILL_COLORS } from '../../../utils/indicadoresGlobales';
import { WAREHOUSE_STOCK_COLORS } from '../../../utils/warehouseStock';
import { duracionCorta } from '../../../utils/estadoPedidos';
import { SEMAFORO_CARGA } from '../../../utils/filtrosMapa';
import type { ParametrosSistema } from '../useParametrosSistema';
import { CampoNumero, TEXTO, TEXTO_FUERTE, TEXTO_TENUE } from './ui';

/** Colores de los pines de pedido (mismos que el mapa). */
const PIN = { a_tiempo: '#10B981', riesgo: '#F59E0B', vencido: '#F43F5E' };

interface Tramo {
  hasta: number;
  hex: string;
  etiqueta: string;
}

interface DefFila {
  titulo: string;
  icono: React.ReactNode;
  descripcion: string;
  unidad: '%' | 'min';
  campos: Array<{ clave: keyof Umbrales; label: string }>;
  /** Tramos de izquierda a derecha (el último llega al máximo de la escala). */
  tramos: (u: Umbrales) => Tramo[];
  /** Fin de la escala de la barra. */
  maximo: (u: Umbrales) => number;
}

const fmt = (v: number, unidad: '%' | 'min') => (unidad === '%' ? `${v} %` : duracionCorta(v * 60_000));

const FILAS: DefFila[] = [
  {
    titulo: 'Stock de almacén',
    icono: <Warehouse className="h-4 w-4 text-emerald-600 dark:text-emerald-400" aria-hidden />,
    descripcion: 'Almacenes intermedios: ícono del mapa, panel, indicadores y Reportes. Más stock es mejor.',
    unidad: '%',
    campos: [{ clave: 'almacenBajo', label: 'Ámbar desde' }, { clave: 'almacenAlto', label: 'Verde desde' }],
    tramos: (u) => [
      { hasta: u.almacenBajo, hex: WAREHOUSE_STOCK_COLORS.low.hex, etiqueta: WAREHOUSE_STOCK_COLORS.low.label },
      { hasta: u.almacenAlto, hex: WAREHOUSE_STOCK_COLORS.medium.hex, etiqueta: WAREHOUSE_STOCK_COLORS.medium.label },
      { hasta: 100, hex: WAREHOUSE_STOCK_COLORS.high.hex, etiqueta: WAREHOUSE_STOCK_COLORS.high.label },
    ],
    maximo: () => 100,
  },
  {
    titulo: 'Capacidad de vehículo',
    icono: <Package className="h-4 w-4 text-cyan-600 dark:text-cyan-400" aria-hidden />,
    descripcion: 'Color de cada vehículo en el mapa según su carga a bordo: verde le queda capacidad, rojo va lleno.',
    unidad: '%',
    campos: [{ clave: 'cargaMedia', label: 'Ámbar desde' }, { clave: 'cargaAlta', label: 'Rojo desde' }],
    tramos: (u) => [
      { hasta: u.cargaMedia, hex: SEMAFORO_CARGA.baja.hex, etiqueta: SEMAFORO_CARGA.baja.label },
      { hasta: u.cargaAlta, hex: SEMAFORO_CARGA.media.hex, etiqueta: SEMAFORO_CARGA.media.label },
      { hasta: 100, hex: SEMAFORO_CARGA.alta.hex, etiqueta: SEMAFORO_CARGA.alta.label },
    ],
    maximo: () => 100,
  },
  {
    titulo: 'Llenado de flota',
    icono: <Gauge className="h-4 w-4 text-amber-600 dark:text-amber-400" aria-hidden />,
    descripcion: 'Carga a bordo sobre la capacidad de toda la flota: indicadores, Flota y Reportes. Más lleno es peor.',
    unidad: '%',
    campos: [{ clave: 'flotaAlta', label: 'Ámbar desde' }, { clave: 'flotaSaturada', label: 'Rojo desde' }],
    tramos: (u) => [
      { hasta: u.flotaAlta, hex: FLEET_FILL_COLORS.available.hex, etiqueta: FLEET_FILL_COLORS.available.label },
      { hasta: u.flotaSaturada, hex: FLEET_FILL_COLORS.high.hex, etiqueta: FLEET_FILL_COLORS.high.label },
      { hasta: 100, hex: FLEET_FILL_COLORS.saturated.hex, etiqueta: FLEET_FILL_COLORS.saturated.label },
    ],
    maximo: () => 100,
  },
  {
    titulo: 'Plazo de pedido',
    icono: <Clock className="h-4 w-4 text-rose-600 dark:text-rose-400" aria-hidden />,
    descripcion: 'Tiempo que falta para el plazo: pines del mapa, alerta del menú, indicador «Vence» y vehículos.',
    unidad: 'min',
    campos: [{ clave: 'riesgoMinutos', label: 'En riesgo si faltan' }],
    tramos: (u) => [
      { hasta: 0, hex: PIN.vencido, etiqueta: 'Vencido' },
      { hasta: u.riesgoMinutos, hex: PIN.riesgo, etiqueta: 'En riesgo' },
      { hasta: u.riesgoMinutos * 3, hex: PIN.a_tiempo, etiqueta: 'A tiempo' },
    ],
    maximo: (u) => u.riesgoMinutos * 3,
  },
];

/** Barra con los tramos del semáforo a escala: se ve al instante qué color cae en cada rango. */
const BarraTramos: React.FC<{ tramos: Tramo[]; maximo: number; unidad: '%' | 'min' }> = ({ tramos, maximo, unidad }) => {
  let desde = 0;
  const partes = tramos.map((t) => {
    const ini = Math.max(0, Math.min(desde, maximo));
    const fin = Math.max(ini, Math.min(t.hasta, maximo));
    desde = t.hasta;
    return { ...t, ini, fin };
  });
  const rango = (p: (typeof partes)[number], i: number) => {
    if (unidad === 'min') {
      // Tiempo que falta: el primer tramo (hasta 0) es el plazo ya pasado.
      if (p.hasta <= 0) return 'plazo pasado';
      return i === partes.length - 1 ? `> ${fmt(p.ini, unidad)}` : `≤ ${fmt(p.fin, unidad)}`;
    }
    if (i === 0) return `< ${fmt(p.fin, unidad)}`;
    if (i === partes.length - 1) return unidad === '%' ? `≥ ${fmt(p.ini, unidad)}` : `> ${fmt(p.ini, unidad)}`;
    return unidad === '%' ? `${p.ini}–${p.fin - 1} %` : `${fmt(p.ini, unidad)} – ${fmt(p.fin, unidad)}`;
  };
  // Un tramo "hasta 0" (plazo ya pasado) no tiene ancho a escala: se le da un tramo fijo al inicio
  // para que su color se vea, y el resto se reparte en lo que queda.
  const TRAMO_FIJO = 10;
  const fijos = partes.filter((p) => p.hasta <= 0).length;
  const escala = 100 - fijos * TRAMO_FIJO;
  const ancho = (p: (typeof partes)[number]) =>
    p.hasta <= 0 ? TRAMO_FIJO : maximo > 0 ? ((p.fin - p.ini) / maximo) * escala : 0;
  return (
    <div>
      <div className="flex h-2.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800" aria-hidden>
        {partes.map((p) => (
          <div key={p.etiqueta} style={{ width: `${ancho(p)}%`, backgroundColor: p.hex }} />
        ))}
      </div>
      <ul className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-xs">
        {partes.map((p, i) => (
          <li key={p.etiqueta} className={`inline-flex items-center gap-1.5 ${TEXTO}`}>
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: p.hex }} aria-hidden />
            {p.etiqueta} <span className={`font-mono-code ${TEXTO_TENUE}`}>{rango(p, i)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
};

/**
 * Cortes de los semáforos (Configuración → Apariencia). Borrador en useParametrosSistema: se
 * guardan con "Guardar" y "Descartar" los revierte, como el tema.
 */
export const EditorSemaforos: React.FC<{ p: ParametrosSistema }> = ({ p }) => {
  const { umbrales, umbralesGuardados, erroresUmbrales, updateUmbral, restaurarUmbrales } = p;
  return (
    <div className="divide-y divide-slate-200 dark:divide-slate-700/70">
      {FILAS.map((f) => {
        const claves = f.campos.map((c) => c.clave);
        const porDefecto = claves.every((k) => umbrales[k] === UMBRALES_DEFAULT[k]);
        const invalida = claves.some((k) => erroresUmbrales[k]);
        return (
          <div key={f.titulo} className="py-4 first:pt-0 last:pb-0">
            <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <h4 className={`flex items-center gap-2 text-sm font-semibold ${TEXTO_FUERTE}`}>{f.icono}{f.titulo}</h4>
                <p className={`mt-0.5 text-xs ${TEXTO_TENUE}`}>{f.descripcion}</p>
              </div>
              {!porDefecto && (
                <button type="button" onClick={() => restaurarUmbrales(claves)}
                  className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium ${TEXTO} hover:bg-slate-500/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500`}
                  title={`Volver a ${claves.map((k) => fmt(UMBRALES_DEFAULT[k], f.unidad)).join(' y ')}`}>
                  <RotateCcw className="h-3.5 w-3.5" aria-hidden />Restaurar
                </button>
              )}
            </div>
            <div className="grid grid-cols-1 items-start gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.6fr)]">
              {f.campos.map((c) => (
                <CampoNumero key={c.clave} label={c.label} unidad={f.unidad} min={1} max={f.unidad === '%' ? 100 : 1440} paso={1}
                  value={Number.isFinite(umbrales[c.clave]) ? String(umbrales[c.clave]) : ''}
                  onChange={(v) => updateUmbral(c.clave, v.trim() === '' ? NaN : Number(v))}
                  error={erroresUmbrales[c.clave]}
                  modificado={umbrales[c.clave] !== umbralesGuardados[c.clave]}
                  ayuda={`Estándar: ${fmt(UMBRALES_DEFAULT[c.clave], f.unidad)}`} />
              ))}
              <div className={`md:pt-6 ${f.campos.length === 1 ? 'md:col-span-2' : ''}`}>
                {invalida
                  ? <p className={`text-xs ${TEXTO_TENUE}`}>Corrige los valores para ver la escala.</p>
                  : <BarraTramos tramos={f.tramos(umbrales)} maximo={f.maximo(umbrales)} unidad={f.unidad} />}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};
