import React, { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Activity, ArrowDown, ArrowUp, Boxes, ChevronDown, ChevronUp, CircleCheck, CircleParking, ClipboardList,
  Gauge, GripVertical, Hourglass, Inbox, LocateFixed, Navigation, RefreshCw, Star, Timer, Truck, Warehouse as WarehouseIcon, Wrench,
} from 'lucide-react';
import { Order, Vehicle } from '../../types';
import { usePanelFlotante } from '../../hooks/usePanelFlotante';
import { useEstadoVisual } from '../../engine/useEstadoVisual';
import { useScenarioStore } from '../../store/scenarioStore';
import { useMapStore } from '../../store/mapStore';
import { getFleetFill, getWarehousesFill } from '../../utils/indicadoresGlobales';
import { WAREHOUSE_STOCK_COLORS, WarehouseStockLevel } from '../../utils/warehouseStock';

const HORA = 3_600_000;
/** Ciclo de recarga de los intermedios: múltiplos de su frecuencia desde esta época
 * (mismo criterio que OrquestadorOperacion.recargarAlmacenesSiCorrespondeMedianoche). */
const EPOCA_RECARGA_MS = Date.UTC(2000, 0, 1);

/**
 * Color del borde/valor de la tarjeta: neutro = bien, ámbar = atención, rojo = actuar.
 * Las barras NO usan este código: pintan su relleno con la misma escala que su sección de la
 * leyenda (carga del vehículo / stock del almacén), así no necesitan marcas ni explicación.
 */
type Tono = 'neutro' | 'ambar' | 'rojo';

/** Escala "Color según su carga" de la leyenda (LeyendaMapa.CARGA / LeafletManhattanMap). */

/** Escala "Color según su stock" de la leyenda (mismos cortes que utils/warehouseStock). */
const nivelStock = (stock: number, pct: number): Exclude<WarehouseStockLevel, 'central'> =>
  stock <= 0 ? 'empty' : pct >= 65 ? 'high' : pct >= 30 ? 'medium' : 'low';
const tonoStock = (nivel: Exclude<WarehouseStockLevel, 'central'>): Tono =>
  nivel === 'low' || nivel === 'empty' ? 'rojo' : nivel === 'medium' ? 'ambar' : 'neutro';

/** Compacto: "42m", "2h 58m", "1d 4h"; negativo = "vencido". */
const corto = (ms: number): string => {
  if (ms < 0) return 'vencido';
  const min = Math.floor(ms / 60_000);
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  if (h < 24) return min % 60 ? `${h}h ${min % 60}m` : `${h}h`;
  return `${Math.floor(h / 24)}d ${h % 24}h`;
};

const ESTILO_TONO: Record<Tono, { tarjeta: string; valor: string; icono: string; chip: string }> = {
  neutro: { tarjeta: 'border-transparent bg-slate-950/40', valor: 'text-slate-50', icono: 'text-slate-400', chip: 'bg-slate-600 text-white' },
  ambar: { tarjeta: 'border-amber-500/40 bg-amber-500/10', valor: 'text-amber-300', icono: 'text-amber-300', chip: 'bg-amber-500 text-slate-900' },
  rojo: { tarjeta: 'border-rose-500/50 bg-rose-500/15', valor: 'text-rose-300', icono: 'text-rose-300', chip: 'bg-rose-500 text-white' },
};

/** Denominador atenuado: "8/37". */
const De: React.FC<{ n: React.ReactNode }> = ({ n }) => (
  <span className="text-xs font-semibold text-slate-500">/{n}</span>
);

/** Mini barra 0-100 % sin marcas: el relleno toma el color de la escala de la leyenda. */
const Barra: React.FC<{ pct: number; hex: string }> = ({ pct, hex }) => (
  <div className="mt-1 h-1 rounded-full bg-slate-700/70" aria-hidden>
    <div className="h-full rounded-full" style={{ width: `${Math.max(0, Math.min(100, pct))}%`, backgroundColor: hex }} />
  </div>
);

/** Tendencia de la última hora: solo aparece si de verdad sube (rojo) o baja (verde). */
const Tendencia: React.FC<{ dir: 'sube' | 'baja' | null }> = ({ dir }) =>
  dir === 'sube' ? <ArrowUp className="h-3.5 w-3.5 text-rose-400" aria-hidden />
    : dir === 'baja' ? <ArrowDown className="h-3.5 w-3.5 text-emerald-400" aria-hidden />
      : null;

/**
 * Ayuda al pasar el mouse (o enfocar con teclado). Reemplaza al `title` nativo: el panel se vuelve a
 * dibujar varias veces por segundo y, cada vez que el texto cambiaba (p. ej. "vence en 2h 15m"), el
 * navegador cerraba o hacía parpadear su globo. Este queda abierto mientras el puntero esté encima,
 * con el texto al día, en letra legible, y no tapa nada del panel: va en un portal sobre la página,
 * arriba de la tarjeta (o debajo si no cabe), ajustado a los bordes de la ventana. No captura el
 * puntero, así que no puede "robarse" el hover y cerrarse solo.
 */
function useAyuda(texto: string, contenido?: React.ReactNode) {
  const id = useId();
  const ancla = useRef<HTMLElement | null>(null);
  const globo = useRef<HTMLDivElement | null>(null);
  const espera = useRef<number | undefined>(undefined);
  const [abierta, setAbierta] = useState(false);

  const abrir = () => { window.clearTimeout(espera.current); espera.current = window.setTimeout(() => setAbierta(true), 250); };
  const cerrar = () => { window.clearTimeout(espera.current); setAbierta(false); };
  useEffect(() => () => window.clearTimeout(espera.current), []);

  // Se reubica en cada dibujo (el texto puede cambiar de largo); sin estado, para no provocar otro dibujo.
  useLayoutEffect(() => {
    if (!abierta || !ancla.current || !globo.current) return;
    const a = ancla.current.getBoundingClientRect();
    const g = globo.current.getBoundingClientRect();
    const margen = 8;
    const left = Math.min(Math.max(margen, a.left + a.width / 2 - g.width / 2), window.innerWidth - g.width - margen);
    const arriba = a.top - g.height - 6;
    const top = arriba >= margen ? arriba : Math.min(a.bottom + 6, window.innerHeight - g.height - margen);
    globo.current.style.left = `${left}px`;
    globo.current.style.top = `${top}px`;
    globo.current.style.visibility = 'visible';
  });

  const props = {
    ref: (el: HTMLElement | null) => { ancla.current = el; },
    onPointerEnter: abrir,
    onPointerLeave: cerrar,
    onFocus: abrir,
    onBlur: cerrar,
    'aria-describedby': abierta ? id : undefined,
  };
  const nodo = abierta && texto
    ? createPortal(
      <div
        ref={globo}
        id={id}
        role="tooltip"
        style={{ position: 'fixed', left: 0, top: 0, visibility: 'hidden' }}
        className="pointer-events-none z-[3000] max-w-[230px] space-y-0.5 rounded-lg border border-slate-600 bg-slate-900 px-2.5 py-1.5 text-xs leading-snug shadow-xl"
      >
        {contenido ?? texto.split('\n').map((linea, i) => (
          <div key={i} className={i === 0 ? 'font-semibold text-slate-50' : 'text-slate-300'}>{linea}</div>
        ))}
      </div>,
      document.body,
    )
    : null;
  return { props, nodo };
}

/**
 * Una métrica: ícono + valor grande + rótulo de 1-2 palabras (+ barra opcional). El color solo
 * cambia cuando hay alarma; la explicación completa va en el título y en el aria-label.
 */
const Tarjeta: React.FC<{
  icono: React.ElementType;
  valor: React.ReactNode;
  rotulo: React.ReactNode;
  ayuda: string;
  tono?: Tono;
  extra?: React.ReactNode;
  barra?: React.ReactNode;
  pulso?: boolean;
  /** Contenido propio del globo (p. ej. con íconos); si falta, se arma con las líneas de yuda. */
  globo?: React.ReactNode;
  /** Fila de 4 (Pedidos): valor y márgenes algo menores para que quepa. */
  compacta?: boolean;
  onClick?: () => void;
}> = ({ icono: Icono, valor, rotulo, ayuda, tono = 'neutro', extra, barra, pulso, globo, compacta, onClick }) => {
  const e = ESTILO_TONO[tono];
  const ayudaFlotante = useAyuda(ayuda, globo);
  const cuerpo = (
    <>
      <div className="flex items-center justify-between gap-1">
        <Icono className={`h-3.5 w-3.5 shrink-0 ${e.icono} ${pulso ? 'animate-pulse' : ''}`} aria-hidden />
        {extra}
      </div>
      <div className={`mt-0.5 flex items-center truncate font-mono-code font-bold leading-tight ${compacta ? 'text-sm' : 'text-base'} ${e.valor}`}>{valor}</div>
      <div className="truncate text-[10px] leading-tight text-slate-400">{rotulo}</div>
      {barra}
    </>
  );
  const clase = `min-w-0 rounded-lg border ${compacta ? 'px-1.5' : 'px-2'} py-1.5 text-left ${e.tarjeta}`;
  return (
    <>
      {onClick ? (
        <button type="button" onClick={onClick} aria-label={ayuda} {...ayudaFlotante.props}
          className={`${clase} group cursor-pointer transition hover:brightness-125 hover:ring-1 hover:ring-cyan-400/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-400`}>
          {cuerpo}
        </button>
      ) : (
        <div className={clase} aria-label={ayuda} role="group" {...ayudaFlotante.props}>{cuerpo}</div>
      )}
      {ayudaFlotante.nodo}
    </>
  );
};

/** Texto con la misma ayuda flotante (encabezados de nivel y cifras del panel colapsado). */
const ConAyuda: React.FC<{ ayuda?: string; className?: string; onClick?: () => void; children: React.ReactNode }> = (
  { ayuda, className, onClick, children },
) => {
  const ayudaFlotante = useAyuda(ayuda ?? '');
  return (
    <>
      {onClick ? (
        // Botón: además de accionar, queda fuera del arrastre del panel (usePanelFlotante ignora botones).
        <button type="button" onClick={onClick} aria-label={ayuda} {...ayudaFlotante.props}
          className={`${className ?? ''} cursor-pointer rounded px-0.5 hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-400`}>
          {children}
        </button>
      ) : (
        <span className={className} {...ayudaFlotante.props}>{children}</span>
      )}
      {ayudaFlotante.nodo}
    </>
  );
};

const PESO_TONO: Record<Tono, number> = { neutro: 0, ambar: 1, rojo: 2 };
/** El tono más grave de un nivel: tiñe su encabezado para saber dónde mirar sin leer las tarjetas. */
const peor = (...tonos: Tono[]): Tono => tonos.reduce((a, b) => (PESO_TONO[b] > PESO_TONO[a] ? b : a), 'neutro');
const COLOR_ENCABEZADO: Record<Tono, string> = { neutro: 'text-slate-400', ambar: 'text-amber-300', rojo: 'text-rose-300' };

/** Un nivel (Pedidos, Flota, Almacenes): encabezado mínimo + sus tarjetas en una fila. */
const Nivel: React.FC<{ icono: React.ElementType; titulo: string; tono: Tono; columnas: 2 | 3 | 4; ayuda?: string; children: React.ReactNode }> = (
  { icono: Icono, titulo, tono, columnas, ayuda, children },
) => (
  <section className="px-2 pb-1.5" aria-label={titulo}>
    <h3 className={`px-0.5 pb-1 text-[10px] font-semibold uppercase tracking-wide ${COLOR_ENCABEZADO[tono]}`}>
      <ConAyuda ayuda={ayuda} className="inline-flex items-center gap-1">
        <Icono className="h-3 w-3" aria-hidden />{titulo}
        {tono !== 'neutro' && <span className={`ml-0.5 h-1.5 w-1.5 rounded-full ${tono === 'rojo' ? 'bg-rose-400' : 'bg-amber-300'}`} aria-label="con alertas" />}
      </ConAyuda>
    </h3>
    <div className={`grid gap-1.5 ${columnas === 4 ? 'grid-cols-4' : columnas === 3 ? 'grid-cols-3' : 'grid-cols-2'}`}>{children}</div>
  </section>
);

/**
 * Indicadores del operador sobre el mapa: un resumen para leer de un vistazo, en tres niveles por
 * entidad (el modelo mental del operador y, más adelante, una pantalla de detalle por nivel):
 *   Pedidos   → próximo vencimiento (+N que también vencen en < 3 h; clic: lo centra) · sin asignar ·
 *               última hora (entran / entregados)
 *   Flota     → disponibles · en ruta · fuera de servicio (el llenado G01/G02 va en la ayuda del nivel)
 *   Almacenes → cada almacén (central incluido; ∞ si no tiene límite): stock, barra y próxima recarga (el total G04 va en la ayuda del nivel)
 * El encabezado de cada nivel toma el color de su tarjeta más grave.
 * Todo sale del estado visible (mismo instante que el mapa). Panel flotante: se mueve y se colapsa.
 */
export const IndicadoresGlobalesMapa: React.FC<{
  onIrAPedido?: (pedido: Order) => void;
  /** Centra el mapa en un punto de la grilla (clic en un almacén). */
  onIrAPunto?: (x: number, y: number) => void;
}> = ({ onIrAPedido, onIrAPunto }) => {
  const panel = usePanelFlotante('paqrap.panel.indicadores', { derecha: 12, vertical: 12 }, 'abajo');
  const { orders, vehicles, warehouses, estadoRaw, marcaVisibleMs } = useEstadoVisual();
  const scenarioStartMs = useScenarioStore((s) => s.scenarioStartMs());
  const setSelectedOrderId = useMapStore((s) => s.setSelectedOrderId);
  const setSelectedWarehouseId = useMapStore((s) => s.setSelectedWarehouseId);
  const historial = useRef<Array<{ t: number; n: number }>>([]);

  const ahora = marcaVisibleMs;
  const plazo = (o: Order) => (scenarioStartMs != null ? scenarioStartMs + o.deadlineMinute * 60_000 : NaN);
  const pendientes = ahora == null ? [] : orders.filter((o) => o.status !== 'delivered');

  // Pedidos en servicio: su vehículo ya llegó y está entregando en su destino. El plazo se cumple con
  // la LLEGADA (el backend evalúa contra el inicio del servicio, que dura tiempoServicioClienteHoras),
  // así que ya no pueden vencer aunque el servicio termine después del plazo.
  const enServicio = new Set<string>();
  for (const v of vehicles) {
    if (v.status !== 'delivering') continue;
    for (const o of pendientes) {
      if (o.assignedVehicleId === v.id
        && Math.round(o.destination.x) === Math.round(v.position.x)
        && Math.round(o.destination.y) === Math.round(v.position.y)) enServicio.add(o.id);
    }
  }
  // Riesgo: el próximo vencimiento y cuántos MÁS vencen en < 3 h (el "+N" excluye al próximo).
  let proximo: Order | null = null;
  let proximoMs = Infinity;
  let riesgo1h = 0;
  let riesgo3h = 0;
  for (const o of pendientes) {
    if (enServicio.has(o.id)) continue;
    const resto = plazo(o) - (ahora ?? 0);
    if (!Number.isFinite(resto)) continue;
    if (resto < proximoMs) { proximoMs = resto; proximo = o; }
    if (resto <= HORA) riesgo1h++;
    if (resto <= 3 * HORA) riesgo3h++;
  }
  const tonoProximo: Tono = proximoMs <= HORA ? 'rojo' : proximoMs <= 3 * HORA ? 'ambar' : 'neutro';
  const otros3h = Math.max(0, riesgo3h - (proximoMs <= 3 * HORA ? 1 : 0));
  const otros1h = Math.max(0, riesgo1h - (proximoMs <= HORA ? 1 : 0));
  const tonoOtros: Tono = otros1h > 0 ? 'rojo' : 'ambar';
  const idProximo = proximo ? (proximo.code.length > 8 ? `#${proximo.code.slice(-4)}` : proximo.code) : '';
  const chipOtros = otros3h > 0 ? (
    <span className={`rounded-full px-1 text-[10px] font-bold leading-[14px] ${ESTILO_TONO[tonoOtros].chip}`}>+{otros3h}</span>
  ) : null;

  // Demanda: tendencia de "sin asignar" contra el valor de hace ~1 h simulada.
  const sinAsignar = pendientes.filter((o) => !o.assignedVehicleId).length;
  if (ahora != null) {
    const h = historial.current;
    if (h.length > 0 && ahora < h[h.length - 1].t) h.length = 0; // nueva ejecución
    if (h.length === 0 || h[h.length - 1].t !== ahora) h.push({ t: ahora, n: sinAsignar });
    while (h.length > 2 && h[1].t <= ahora - HORA) h.shift();
  }
  const delta = historial.current[0] ? sinAsignar - historial.current[0].n : 0;
  const tendencia: 'sube' | 'baja' | null = delta >= 2 ? 'sube' : delta <= -2 ? 'baja' : null;
  const tonoSinAsignar: Tono = tendencia === 'sube' && sinAsignar > 0 ? 'rojo' : 'neutro';
  const enUltimaHora = (ms: number | undefined) => ahora != null && ms != null && ms > ahora - HORA && ms <= ahora;
  const entran = orders.filter((o) => enUltimaHora(o.arrivalSimMs)).length;
  const salen = orders.filter((o) => enUltimaHora(o.deliveredSimMs)).length;
  const tonoFlujo: Tono = entran > salen + 2 ? 'ambar' : 'neutro';

  // Vehículos en tres grupos que suman la flota: disponibles (status 'idle', sin ruta), en ruta (viajando,
  // entregando o en refrigerio a mitad de ruta) y fuera de servicio (averiados o en mantenimiento).
  const libres = vehicles.filter((v) => v.status === 'idle');
  const viajando = vehicles.filter((v) => v.status === 'en_route').length;
  const entregando = vehicles.filter((v) => v.status === 'delivering').length;
  const enRefrigerio = vehicles.filter((v) => v.status === 'on_break').length;
  const enRuta = viajando + entregando + enRefrigerio;
  const porTipo = (t: Vehicle['type']) => libres.filter((v) => v.type === t).length;
  const averiados = vehicles.filter((v) => v.status === 'broken').length;
  const mantenimiento = vehicles.filter((v) => v.status === 'maintenance').length;
  const fueraServicio = averiados + mantenimiento;
  const tonoLibres: Tono = libres.length <= 1 ? 'rojo' : 'neutro';
  const tonoFuera: Tono = fueraServicio > 0 ? 'ambar' : 'neutro';

  // Almacenes: todos (el central primero, luego por nombre: cada uno siempre en el mismo lugar), con su
  // stock en la escala de la leyenda y su próxima recarga. Capacidad 0 = ilimitado (el central de esta
  // simulación); si en operación tiene capacidad finita, se muestra y alarma como cualquier otro.
  const listaAlmacenes = [...(estadoRaw?.almacenes ?? [])]
    .sort((a, b) => Number(b.esCentral) - Number(a.esCentral) || a.nombre.localeCompare(b.nombre))
    .map((a) => {
      const infinito = a.capacidadMaxima <= 0;
      const pct = infinito ? 100 : Math.round((a.stockActual / a.capacidadMaxima) * 100);
      const nivel: Exclude<WarehouseStockLevel, 'central'> = infinito ? 'high' : nivelStock(a.stockActual, pct);
      let recargaEn: number | null = null;
      if (ahora != null && a.frecuenciaRecargaHoras > 0) {
        const ciclo = a.frecuenciaRecargaHoras * HORA;
        recargaEn = EPOCA_RECARGA_MS + (Math.floor((ahora - EPOCA_RECARGA_MS) / ciclo) + 1) * ciclo - ahora;
      }
      const recargaCorta = recargaEn == null ? '' : recargaEn < HORA ? corto(recargaEn) : `${Math.floor(recargaEn / HORA)}h`;
      return { a, infinito, pct, nivel, tono: infinito ? 'neutro' as Tono : tonoStock(nivel), recargaEn, recargaCorta };
    });
  const masBajo = listaAlmacenes.filter((x) => !x.infinito).reduce<typeof listaAlmacenes[number] | null>((m, x) => (!m || x.pct < m.pct ? x : m), null);
  // Llenado de flota (rúbrica G01/G02) y total de almacenes (G04): quedan en la ayuda de su nivel.
  const flota = getFleetFill(vehicles);
  const almacenes = getWarehousesFill(warehouses);


  const tonoPedidos = peor(tonoProximo, otros3h > 0 ? tonoOtros : 'neutro', tonoSinAsignar, tonoFlujo);
  const tonoFlota = peor(tonoLibres, tonoFuera);
  const tonoAlmacenesNivel = peor('neutro', ...listaAlmacenes.map((x) => x.tono));

  const irAlProximo = () => {
    if (!proximo) return;
    setSelectedOrderId(proximo.id);
    onIrAPedido?.(proximo);
  };

  // Ayudas: la 1ª línea (destacada) dice QUÉ mide la tarjeta; debajo, una línea por dato y solo lo
  // que la tarjeta no muestra.
  const ayudaProximo = proximo
    ? [
      'Próximo pedido en vencer',
      proximo.code,
      otros3h > 0 ? `+${otros3h} más vencen en < 3 h${otros1h > 0 ? ` (${otros1h} en < 1 h)` : ''}` : '',
      'Ámbar < 3 h · rojo < 1 h',
      'Click: verlo en el mapa',
    ].filter(Boolean).join('\n')
    : 'Próximo pedido en vencer\nNo hay pedidos pendientes';
  const ayudaSinAsignar = ['Pedidos sin vehículo asignado',
    tendencia === 'sube' ? '↑ Subiendo respecto de hace 1 h' : tendencia === 'baja' ? '↓ Bajando respecto de hace 1 h' : '',
  ].filter(Boolean).join('\n');

  return (
    <section
      ref={panel.ref}
      style={panel.style}
      aria-label="Indicadores de la operación"
      className={`absolute z-[1000] ${panel.colapsado ? '' : 'w-[316px]'} rounded-xl border border-[var(--color-sidebar-border)] bg-[var(--color-sidebar-background)]/95 text-slate-100 shadow-xl backdrop-blur-sm select-none`}
    >
      <div
        {...panel.manejadoresArrastre}
        className="flex cursor-grab touch-none items-center gap-1.5 px-2 py-1.5 active:cursor-grabbing"
      >
        <span title="Arrastra para mover"><GripVertical className="h-4 w-4 shrink-0 text-slate-500" aria-hidden /></span>
        <Gauge className="h-4 w-4 shrink-0 text-cyan-400" aria-hidden />
        {panel.colapsado ? (
          // Colapsado: una cifra por nivel, con el color de su peor estado.
          <span className="flex items-center gap-2.5 font-mono-code text-sm font-bold">
            <ConAyuda className={`flex items-center gap-1 ${ESTILO_TONO[tonoPedidos].valor}`} ayuda={ayudaProximo} onClick={proximo ? irAlProximo : undefined}>
              <ClipboardList className="h-3.5 w-3.5" aria-hidden />{proximo ? corto(proximoMs) : '—'}
            </ConAyuda>
            <ConAyuda className={`flex items-center gap-1 ${ESTILO_TONO[tonoFlota].valor}`} ayuda={`Vehículos disponibles\n${libres.length} de ${vehicles.length}`}>
              <Truck className="h-3.5 w-3.5" aria-hidden />{libres.length}/{vehicles.length}
            </ConAyuda>
            <ConAyuda className={`flex items-center gap-1 ${ESTILO_TONO[tonoAlmacenesNivel].valor}`} ayuda={masBajo ? `Almacén con menos stock\n${masBajo.a.nombre} · ${masBajo.pct}%\nClick: verlo en el mapa` : 'Almacenes\nSin límite de stock'}
              onClick={masBajo ? () => { setSelectedWarehouseId(masBajo.a.nombre); onIrAPunto?.(masBajo.a.posX, masBajo.a.posY); } : undefined}>
              <WarehouseIcon className="h-3.5 w-3.5" aria-hidden />{masBajo ? `${masBajo.pct}%` : '—'}
            </ConAyuda>
          </span>
        ) : (
          <span className="text-xs font-semibold text-slate-200">Indicadores</span>
        )}
        <button
          type="button"
          onClick={panel.alternar}
          aria-expanded={!panel.colapsado}
          aria-label={panel.colapsado ? 'Mostrar indicadores' : 'Colapsar indicadores'}
          className="ml-auto rounded p-0.5 text-slate-400 hover:text-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-400"
        >
          {panel.colapsado ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
        </button>
      </div>

      {!panel.colapsado && (
        <div className="pb-0.5">
          <Nivel icono={ClipboardList} titulo="Pedidos" tono={tonoPedidos} columnas={3}>
            <Tarjeta
              icono={Timer}
              valor={proximo ? corto(proximoMs) : '—'}
              rotulo={proximo ? `Vence ${idProximo}` : 'Sin pend.'}
              ayuda={ayudaProximo}
              tono={tonoProximo}
              pulso={tonoProximo === 'rojo'}
              extra={proximo ? (
                <span className="flex items-center gap-0.5">
                  {chipOtros}
                  <LocateFixed className="h-3 w-3 text-cyan-400 group-hover:text-cyan-300" aria-hidden />
                </span>
              ) : undefined}
              onClick={proximo ? irAlProximo : undefined}
            />
            <Tarjeta
              icono={Hourglass}
              valor={<>{sinAsignar}<Tendencia dir={tendencia} /></>}
              rotulo="Sin asignar"
              ayuda={ayudaSinAsignar}
              tono={tonoSinAsignar}
            />
            <Tarjeta
              icono={Activity}
              valor={
                <span className="flex items-center gap-1">
                  <span className="flex items-center"><Inbox className="h-3 w-3 text-sky-400" aria-hidden />{entran}</span>
                  <span className="flex items-center"><CircleCheck className="h-3 w-3 text-slate-400" aria-hidden />{salen}</span>
                </span>
              }
              rotulo="Última hora"
              ayuda={`Pedidos de la última hora: ${entran} recibidos y ${salen} entregados${tonoFlujo === 'ambar' ? '. Entran más de los que se entregan' : ''}`}
              globo={
                <>
                  <div className="font-semibold text-slate-50">Pedidos de la última hora</div>
                  <div className="flex items-center gap-1.5 text-slate-300"><Inbox className="h-3.5 w-3.5 text-sky-400" aria-hidden />Recibidos (nuevos)</div>
                  <div className="flex items-center gap-1.5 text-slate-300"><CircleCheck className="h-3.5 w-3.5 text-slate-400" aria-hidden />Entregados</div>
                  {tonoFlujo === 'ambar' && <div className="text-amber-300">Entran más de los que se entregan</div>}
                </>
              }
              tono={tonoFlujo}
            />
          </Nivel>

          <Nivel
            icono={Truck}
            titulo="Flota"
            tono={tonoFlota}
            columnas={3}
            ayuda={`Llenado de la flota\n${flota.pct}% · ${flota.load} de ${flota.capacity} paquetes`}
          >
            <Tarjeta
              icono={CircleParking}
              valor={<>{libres.length}<De n={vehicles.length} /></>}
              rotulo="Disponibles"
              ayuda={`Vehículos disponibles\nSin ruta, listos para salir\n${porTipo('car')} autos · ${porTipo('motorcycle')} motos · ${porTipo('bicycle')} bicis`}
              tono={tonoLibres}
            />
            <Tarjeta
              icono={Navigation}
              valor={enRuta}
              rotulo="En ruta"
              ayuda={`Vehículos en ruta\n${viajando} viajando\n${entregando} entregando\n${enRefrigerio} en refrigerio`}
            />
            <Tarjeta
              icono={Wrench}
              valor={fueraServicio}
              rotulo="Fuera serv."
              ayuda={`Vehículos fuera de servicio\n${averiados} averiados\n${mantenimiento} en mantenimiento`}
              tono={tonoFuera}
            />
          </Nivel>

          <Nivel
            icono={WarehouseIcon}
            titulo="Almacenes"
            tono={tonoAlmacenesNivel}
            columnas={Math.min(4, Math.max(2, listaAlmacenes.length)) as 2 | 3 | 4}
            ayuda={`Stock total de intermedios\n${almacenes.pct}% · ${almacenes.stock} de ${almacenes.capacity} paquetes`}
          >
            {listaAlmacenes.map(({ a, infinito, pct, nivel, tono, recargaEn, recargaCorta }) => (
              <Tarjeta
                key={a.nombre}
                icono={a.esCentral ? Star : Boxes}
                valor={infinito ? <span className="text-xl leading-none">∞</span> : <>{a.stockActual}<De n={a.capacidadMaxima} /></>}
                rotulo={a.nombre}
                ayuda={`Almacén ${a.nombre}\n${infinito ? 'Stock sin límite' : `${pct}% · ${WAREHOUSE_STOCK_COLORS[nivel].label}`}${a.frecuenciaRecargaHoras > 0 ? `\nRecarga cada ${a.frecuenciaRecargaHoras} h` : ''}\nClick: verlo en el mapa`}
                onClick={() => { setSelectedWarehouseId(a.nombre); onIrAPunto?.(a.posX, a.posY); }}
                tono={tono}
                extra={recargaEn != null ? (
                  <span className="inline-flex items-center gap-0.5 truncate text-[10px] font-semibold text-slate-300">
                    <RefreshCw className="h-2.5 w-2.5 shrink-0" aria-hidden />{recargaCorta}
                  </span>
                ) : undefined}
                barra={infinito ? undefined : <Barra pct={pct} hex={WAREHOUSE_STOCK_COLORS[nivel].hex} />}
              />
            ))}
          </Nivel>
        </div>
      )}
    </section>
  );
};
