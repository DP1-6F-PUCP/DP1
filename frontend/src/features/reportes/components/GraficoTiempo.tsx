import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Table2 } from 'lucide-react';
import { useThemeStore } from '../../../store/themeStore';
import { formatBackendSimulatedTime24, formatFechaHoraCorta } from '../../../utils/backendTime';
import { colorDe, ParColor, tinta } from '../paleta';

export interface SerieGrafico {
  clave: string;
  nombre: string;
  color: ParColor;
}

export interface PuntoGrafico {
  /** Instante simulado (ms). En barras, inicio del intervalo. */
  t: number;
  valores: Record<string, number | null>;
}

export interface Umbral {
  valor: number;
  etiqueta: string;
  color: string;
}

interface Props {
  titulo: string;
  subtitulo?: React.ReactNode;
  series: SerieGrafico[];
  puntos: PuntoGrafico[];
  /** lineas: tendencias comparables · apilado: partes de un total · barras: conteos por intervalo. */
  tipo: 'lineas' | 'apilado' | 'barras';
  /** Ancho del intervalo de cada barra (ms). */
  anchoMs?: number;
  /** Máximo fijo del eje Y (p. ej. 100 para porcentajes). */
  yMax?: number;
  umbrales?: Umbral[];
  formato?: (n: number) => string;
  unidad?: string;
  alto?: number;
  /** Texto cuando no hay datos. */
  vacio: string;
  /** Acción extra en la cabecera (p. ej. un enlace). */
  accion?: React.ReactNode;
}

const MARGEN = { izq: 44, der: 14, arr: 10, aba: 26 };
const PASOS_X = [5, 10, 15, 30, 60, 120, 180, 360, 720, 1440, 2880].map((m) => m * 60_000);

const formatoBase = (n: number) => n.toLocaleString('es-PE', { maximumFractionDigits: 0 });

/** Máximo "redondo" y 4 marcas para el eje Y. */
function ejeY(max: number, enteros: boolean): number[] {
  if (max <= 0) return [0, 1];
  const crudo = max / 4;
  const pot = 10 ** Math.floor(Math.log10(crudo));
  const pasoBase = [1, 2, 2.5, 5, 10].map((f) => f * pot).find((p) => p >= crudo) ?? crudo;
  // Conteos: nunca marcas fraccionarias (0, 0,5, 1… se leían "0, 1, 1").
  const paso = enteros ? Math.max(1, Math.ceil(pasoBase)) : pasoBase;
  const marcas: number[] = [];
  for (let v = 0; v <= max + paso * 0.001; v += paso) marcas.push(v);
  if (marcas[marcas.length - 1] < max) marcas.push(marcas[marcas.length - 1] + paso);
  return marcas;
}

function hora(ms: number, conFecha: boolean) {
  return conFecha ? formatFechaHoraCorta(ms) : formatBackendSimulatedTime24(ms, false);
}

/** Borde superior redondeado (4 px como máximo) anclado a la base. */
function barraRedondeada(x: number, y: number, w: number, h: number): string {
  if (h <= 0 || w <= 0) return '';
  const r = Math.min(4, w / 2, h);
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}

/**
 * Gráfico de evolución en el tiempo simulado, en SVG nativo: ejes recesivos, línea de 2 px,
 * leyenda arriba (con el último valor), globo con cruz al pasar el mouse (o con ← → desde el
 * teclado) y tabla alternativa.
 */
export const GraficoTiempo: React.FC<Props> = ({
  titulo, subtitulo, series, puntos, tipo, anchoMs = 0, yMax, umbrales = [], formato = formatoBase,
  unidad = '', alto = 210, vacio, accion,
}) => {
  const oscuro = useThemeStore((s) => s.isDark);
  const t = tinta(oscuro);
  const idTitulo = useId();
  const contenedor = useRef<HTMLDivElement>(null);
  const [ancho, setAncho] = useState(600);
  const [indice, setIndice] = useState<number | null>(null);
  const [verTabla, setVerTabla] = useState(false);

  useEffect(() => {
    const el = contenedor.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setAncho(Math.max(240, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const geo = useMemo(() => {
    if (puntos.length < (tipo === 'barras' ? 1 : 2)) return null;
    const x0 = puntos[0].t;
    const x1Raw = puntos[puntos.length - 1].t + (tipo === 'barras' ? anchoMs : 0);
    const x1 = x1Raw > x0 ? x1Raw : x0 + 60_000;
    const totales = puntos.map((p) => (tipo === 'apilado'
      ? series.reduce((s, se) => s + (p.valores[se.clave] ?? 0), 0)
      : Math.max(0, ...series.map((se) => p.valores[se.clave] ?? 0))));
    const maxDatos = Math.max(0, ...totales, ...umbrales.map((u) => u.valor));
    const marcasY = yMax != null ? [0, yMax / 4, yMax / 2, (3 * yMax) / 4, yMax] : ejeY(maxDatos, unidad === '');
    const yTope = marcasY[marcasY.length - 1] || 1;
    const anchoPlot = ancho - MARGEN.izq - MARGEN.der;
    const altoPlot = alto - MARGEN.arr - MARGEN.aba;
    const sx = (ms: number) => MARGEN.izq + ((ms - x0) / (x1 - x0)) * anchoPlot;
    const sy = (v: number) => MARGEN.arr + altoPlot - (Math.min(v, yTope) / yTope) * altoPlot;
    const paso = PASOS_X.find((p) => (x1 - x0) / p <= Math.max(2, Math.floor(anchoPlot / 90))) ?? PASOS_X[PASOS_X.length - 1];
    const marcasX: number[] = [];
    for (let m = Math.ceil(x0 / paso) * paso; m <= x1; m += paso) marcasX.push(m);
    const variosDias = new Date(x0).getUTCDate() !== new Date(x1).getUTCDate() || x1 - x0 > 86_400_000;
    return { x0, x1, sx, sy, marcasY, marcasX, anchoPlot, altoPlot, yTope, variosDias, paso };
  }, [puntos, series, tipo, anchoMs, yMax, umbrales, ancho, alto]);

  const ultimo = puntos[puntos.length - 1];
  const fmt = (v: number | null | undefined) => (v == null ? '—' : `${formato(v)}${unidad}`);

  const marcas = (() => {
    if (!geo) return null;
    const { sx, sy } = geo;
    if (tipo === 'lineas') {
      return series.map((se) => {
        let d = '';
        let abierto = false;
        for (const p of puntos) {
          const v = p.valores[se.clave];
          if (v == null) { abierto = false; continue; }
          d += `${abierto ? 'L' : 'M'}${sx(p.t).toFixed(1)},${sy(v).toFixed(1)}`;
          abierto = true;
        }
        return <path key={se.clave} d={d} fill="none" stroke={colorDe(se.color, oscuro)} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />;
      });
    }
    if (tipo === 'apilado') {
      const base = puntos.map(() => 0);
      return series.map((se) => {
        const abajo = [...base];
        puntos.forEach((p, i) => { base[i] += p.valores[se.clave] ?? 0; });
        const arriba = puntos.map((p, i) => `${sx(p.t).toFixed(1)},${sy(base[i]).toFixed(1)}`);
        const vuelta = puntos.map((p, i) => `${sx(p.t).toFixed(1)},${sy(abajo[i]).toFixed(1)}`).reverse();
        // Borde superior del color de la superficie: separa las capas (2 px entre rellenos).
        return (
          <g key={se.clave}>
            <polygon points={[...arriba, ...vuelta].join(' ')} fill={colorDe(se.color, oscuro)} fillOpacity={0.88} />
            <polyline points={arriba.join(' ')} fill="none" stroke={t.superficie} strokeWidth={1.5} />
          </g>
        );
      });
    }
    // Barras agrupadas por intervalo, 2 px entre barras del mismo grupo.
    const anchoGrupo = (sx(geo.x0 + anchoMs) - sx(geo.x0)) * 0.78;
    const anchoBarra = Math.max(1, (anchoGrupo - 2 * (series.length - 1)) / series.length);
    return puntos.flatMap((p, i) => series.map((se, j) => {
      const v = p.valores[se.clave] ?? 0;
      const x = sx(p.t) + (sx(p.t + anchoMs) - sx(p.t) - anchoGrupo) / 2 + j * (anchoBarra + 2);
      const y = sy(v);
      return <path key={`${i}-${se.clave}`} d={barraRedondeada(x, y, anchoBarra, sy(0) - y)} fill={colorDe(se.color, oscuro)}
        opacity={indice == null || indice === i ? 1 : 0.45} />;
    }));
  })();

  const alMover = (e: React.PointerEvent<SVGRectElement>) => {
    if (!geo) return;
    const caja = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect();
    const x = ((e.clientX - caja.left) / caja.width) * ancho;
    const ms = geo.x0 + ((x - MARGEN.izq) / geo.anchoPlot) * (geo.x1 - geo.x0) - (tipo === 'barras' ? anchoMs / 2 : 0);
    let mejor = 0;
    for (let i = 1; i < puntos.length; i++) if (Math.abs(puntos[i].t - ms) < Math.abs(puntos[mejor].t - ms)) mejor = i;
    setIndice(mejor);
  };
  const alTecla = (e: React.KeyboardEvent) => {
    if (!puntos.length) return;
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      setIndice((i) => {
        const base = i ?? puntos.length - 1;
        return Math.max(0, Math.min(puntos.length - 1, base + (e.key === 'ArrowRight' ? 1 : -1)));
      });
    } else if (e.key === 'Escape') setIndice(null);
  };

  const sel = indice != null ? puntos[indice] ?? null : null;
  const rotuloSel = sel ? (tipo === 'barras'
    ? `${hora(sel.t, true)} – ${hora(sel.t + anchoMs, false)}`
    : hora(sel.t, true)) : '';
  const xSel = sel && geo ? geo.sx(sel.t + (tipo === 'barras' ? anchoMs / 2 : 0)) : 0;
  const totalSel = sel && tipo === 'apilado' ? series.reduce((s, se) => s + (sel.valores[se.clave] ?? 0), 0) : null;

  const resumenAria = ultimo
    ? `${titulo}. ${puntos.length} puntos desde ${hora(puntos[0].t, true)} hasta ${hora(ultimo.t, true)}. Último: ${series.map((se) => `${se.nombre} ${fmt(ultimo.valores[se.clave])}`).join(', ')}.`
    : `${titulo}. ${vacio}`;

  return (
    <section className="flex min-w-0 flex-col rounded-xl border border-slate-200 bg-[var(--color-surface)] p-4 shadow-sm dark:border-slate-700/70" aria-labelledby={idTitulo}>
      <header className="mb-2 flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 id={idTitulo} className="text-sm font-semibold text-slate-900 dark:text-slate-100">{titulo}</h2>
          {subtitulo && <p className="text-xs text-slate-500 dark:text-slate-400">{subtitulo}</p>}
        </div>
        <div className="flex items-center gap-1">
          {accion}
          {puntos.length > 0 && (
            <button type="button" onClick={() => setVerTabla((v) => !v)} aria-pressed={verTabla}
              className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium transition ${verTabla
                ? 'border-cyan-600 bg-cyan-50 text-cyan-800 dark:border-cyan-500 dark:bg-cyan-500/15 dark:text-cyan-200'
                : 'border-slate-200 text-slate-600 hover:border-slate-400 dark:border-slate-700 dark:text-slate-300 dark:hover:border-slate-500'}`}>
              <Table2 className="h-3 w-3" aria-hidden />{verTabla ? 'Gráfico' : 'Tabla'}
            </button>
          )}
        </div>
      </header>

      {/* Leyenda: siempre presente con 2+ series; con el último valor (la identidad nunca depende solo del color). */}
      {series.length > 1 && (
        <ul className="mb-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-700 dark:text-slate-300" aria-label="Leyenda">
          {series.map((se) => (
            <li key={se.clave} className="inline-flex items-center gap-1.5">
              <span className={`inline-block ${tipo === 'lineas' ? 'h-0.5 w-3.5' : 'h-2.5 w-2.5 rounded-sm'}`} style={{ backgroundColor: colorDe(se.color, oscuro) }} aria-hidden />
              {se.nombre}
              {ultimo && (
                <span className="font-mono-code font-semibold text-slate-900 dark:text-slate-100">
                  {/* Barras (conteos por intervalo): sin cursor, el TOTAL del rango; el último intervalo
                      suele estar en curso y su valor (a menudo 0) parecía "no entra nada". */}
                  {fmt(sel ? sel.valores[se.clave]
                    : tipo === 'barras' ? puntos.reduce((s, p) => s + (p.valores[se.clave] ?? 0), 0)
                      : ultimo.valores[se.clave])}
                </span>
              )}
            </li>
          ))}
          {tipo === 'barras' && !sel && ultimo && <li className="text-slate-500 dark:text-slate-400">total del rango</li>}
        </ul>
      )}

      <div ref={contenedor} className="relative w-full">
        {!geo ? (
          <div className="flex items-center justify-center rounded-lg border border-dashed border-slate-200 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400" style={{ height: alto }}>
            <p className="max-w-xs px-4">{vacio}</p>
          </div>
        ) : verTabla ? (
          <div className="overflow-auto rounded-lg border border-slate-200 dark:border-slate-700" style={{ maxHeight: alto + 40 }}>
            <table className="w-full text-left text-xs">
              <caption className="sr-only">{titulo}</caption>
              <thead className="sticky top-0 bg-slate-100 text-slate-600 dark:bg-slate-900 dark:text-slate-400">
                <tr>
                  <th scope="col" className="px-2 py-1.5 font-semibold">{tipo === 'barras' ? 'Intervalo' : 'Hora'}</th>
                  {series.map((se) => <th key={se.clave} scope="col" className="px-2 py-1.5 text-right font-semibold">{se.nombre}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 font-mono-code text-slate-800 dark:divide-slate-800 dark:text-slate-200">
                {[...puntos].reverse().map((p) => (
                  <tr key={p.t}>
                    <td className="px-2 py-1">{hora(p.t, true)}</td>
                    {series.map((se) => <td key={se.clave} className="px-2 py-1 text-right">{fmt(p.valores[se.clave])}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <>
            <svg width={ancho} height={alto} viewBox={`0 0 ${ancho} ${alto}`} role="img" aria-label={resumenAria}
              tabIndex={0} onKeyDown={alTecla} onBlur={() => setIndice(null)}
              className="block select-none rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-500">
              <title>{resumenAria}</title>
              {/* Rejilla y eje Y */}
              {geo.marcasY.map((v) => (
                <g key={v}>
                  <line x1={MARGEN.izq} x2={ancho - MARGEN.der} y1={geo.sy(v)} y2={geo.sy(v)} stroke={v === 0 ? t.eje : t.rejilla} strokeWidth={1} />
                  <text x={MARGEN.izq - 6} y={geo.sy(v)} dy="0.32em" textAnchor="end" fontSize={10} fill={t.rotulo} style={{ fontVariantNumeric: 'tabular-nums' }}>
                    {formato(v)}{unidad}
                  </text>
                </g>
              ))}
              {/* Eje X */}
              {geo.marcasX.map((m) => {
                const conFecha = geo.variosDias && (geo.paso >= 86_400_000 || new Date(m).getUTCHours() === 0 && new Date(m).getUTCMinutes() === 0);
                return (
                  <text key={m} x={geo.sx(m)} y={alto - 8} textAnchor="middle" fontSize={10} fill={t.rotulo} style={{ fontVariantNumeric: 'tabular-nums' }}>
                    {conFecha ? formatFechaHoraCorta(m).split(' ')[0] : hora(m, false)}
                  </text>
                );
              })}
              {marcas}
              {/* Umbrales (cortes del semáforo) */}
              {umbrales.map((u) => (
                <g key={u.etiqueta}>
                  <line x1={MARGEN.izq} x2={ancho - MARGEN.der} y1={geo.sy(u.valor)} y2={geo.sy(u.valor)} stroke={u.color} strokeWidth={1} strokeDasharray="4 3" />
                  <text x={ancho - MARGEN.der - 2} y={geo.sy(u.valor) - 3} textAnchor="end" fontSize={9.5} fill={t.rotulo}>{u.etiqueta}</text>
                </g>
              ))}
              {/* Cruz y puntos del instante señalado */}
              {sel && (
                <g pointerEvents="none">
                  {tipo !== 'barras' && <line x1={xSel} x2={xSel} y1={MARGEN.arr} y2={MARGEN.arr + geo.altoPlot} stroke={t.rotulo} strokeWidth={1} />}
                  {tipo === 'lineas' && series.map((se) => {
                    const v = sel.valores[se.clave];
                    return v == null ? null : (
                      <circle key={se.clave} cx={xSel} cy={geo.sy(v)} r={4} fill={colorDe(se.color, oscuro)} stroke={t.superficie} strokeWidth={2} />
                    );
                  })}
                </g>
              )}
              <rect x={MARGEN.izq} y={MARGEN.arr} width={geo.anchoPlot} height={geo.altoPlot} fill="transparent"
                onPointerMove={alMover} onPointerLeave={() => setIndice(null)} />
            </svg>
            {sel && (
              <div role="status" aria-live="polite"
                className="pointer-events-none absolute top-1 z-10 min-w-[140px] rounded-lg border border-slate-200 bg-white/95 px-2.5 py-1.5 text-xs shadow-lg backdrop-blur dark:border-slate-600 dark:bg-slate-900/95"
                style={xSel > ancho / 2 ? { right: ancho - xSel + 10 } : { left: xSel + 10 }}>
                <p className="mb-0.5 font-mono-code font-semibold text-slate-900 dark:text-slate-100">{rotuloSel}</p>
                {series.map((se) => (
                  <p key={se.clave} className="flex items-center justify-between gap-3 text-slate-600 dark:text-slate-300">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-sm" style={{ backgroundColor: colorDe(se.color, oscuro) }} aria-hidden />{se.nombre}
                    </span>
                    <span className="font-mono-code font-semibold text-slate-900 dark:text-slate-100">{fmt(sel.valores[se.clave])}</span>
                  </p>
                ))}
                {totalSel != null && (
                  <p className="mt-0.5 flex justify-between gap-3 border-t border-slate-200 pt-0.5 text-slate-600 dark:border-slate-700 dark:text-slate-300">
                    Total<span className="font-mono-code font-semibold text-slate-900 dark:text-slate-100">{fmt(totalSel)}</span>
                  </p>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
};
