import React, { useRef } from 'react';
import { useAyuda } from './useAyuda';
import {
  Activity, AlertTriangle, ArrowDown, ArrowUp, Boxes, ChevronDown, ChevronUp, CircleCheck, CircleParking, ClipboardList,
  Gauge, GripVertical, Hourglass, Inbox, LocateFixed, Navigation, RefreshCw, Star, Timer, Truck, Warehouse as WarehouseIcon, Wrench,
} from 'lucide-react';
import { Order, Vehicle } from '../../types';
import { usePanelFlotante } from '../../hooks/usePanelFlotante';
import { useEstadoVisual } from '../../engine/useEstadoVisual';
import { useMapStore } from '../../store/mapStore';
import { getFleetFill, getWarehousesFill } from '../../utils/indicadoresGlobales';
import { nivelStock, WAREHOUSE_STOCK_COLORS, WarehouseStockLevel } from '../../utils/warehouseStock';
import { useUmbrales } from '../../store/umbralesStore';
import { duracionCorta, haceCorto, pedidosPorVencer } from '../../utils/estadoPedidos';
import { estadoVehiculo } from '../../utils/filtrosMapa';

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

/** Escala "Color según su stock" de la leyenda: nivelStock (utils/warehouseStock). */
const tonoStock = (nivel: Exclude<WarehouseStockLevel, 'central'>): Tono =>
  nivel === 'low' || nivel === 'empty' ? 'rojo' : nivel === 'medium' ? 'ambar' : 'neutro';

/** Compacto: "42m", "2h 58m", "1d 4h" (compartido con la columna "Faltan" de Pedidos). */
const corto = duracionCorta;

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
 *   Pedidos   → próximo vencimiento (+N más en riesgo o vencidos; clic: lo centra) · sin asignar ·
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
  const { riesgoMinutos } = useUmbrales();
  const RIESGO = riesgoMinutos * 60_000;
  const setSelectedOrderId = useMapStore((s) => s.setSelectedOrderId);
  const setSelectedWarehouseId = useMapStore((s) => s.setSelectedWarehouseId);
  const historial = useRef<Array<{ t: number; n: number }>>([]);

  const ahora = marcaVisibleMs;
  const pendientes = ahora == null ? [] : orders.filter((o) => o.status !== 'delivered');

  // Riesgo: los VENCIDOS primero (pendientes con el límite ya pasado al instante visible, no en
  // servicio: el backend recién lo marca y detiene la operación al cierre del lote) y luego el
  // próximo vencimiento; "+N" = cuántos MÁS están vencidos o en riesgo (excluye al mostrado).
  // Misma escala que los pines: rojo = vencido, ámbar = en riesgo (≤ riesgoMinutos, configurable).
  // Mismo criterio que el filtro "Vence el plazo" de Pedidos (pedidosPorVencer con vencidos).
  const porVencer = pedidosPorVencer(orders, vehicles, ahora, { incluirVencidos: true });
  const proximo: Order | null = porVencer[0]?.order ?? null;
  const proximoMs = porVencer[0]?.restoMs ?? Infinity;
  const vencido = proximo != null && proximoMs <= 0;
  const enRiesgoOVencidos = porVencer.filter((p) => p.restoMs <= RIESGO).length;
  const vencidos = porVencer.filter((p) => p.restoMs <= 0).length;
  const tonoProximo: Tono = vencido ? 'rojo' : proximoMs <= RIESGO ? 'ambar' : 'neutro';
  const otros3h = Math.max(0, enRiesgoOVencidos - (proximoMs <= RIESGO ? 1 : 0));
  const otrosVencidos = Math.max(0, vencidos - (vencido ? 1 : 0));
  const tonoOtros: Tono = otrosVencidos > 0 ? 'rojo' : 'ambar';
  const idProximo = proximo ? (proximo.code.length > 8 ? `#${proximo.code.slice(-4)}` : proximo.code) : '';
  const valorProximo = !proximo ? '—' : vencido ? haceCorto(proximoMs) : corto(proximoMs);
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

  // Vehículos en tres grupos que suman la flota: disponibles (status 'idle', sin ruta), en ruta y fuera
  // de servicio (averiados o en mantenimiento). "En ruta" agrupa los estados de la leyenda Viajando,
  // Entregando, Refrigerio y Va al almacén (mismo criterio: estadoVehiculo), así las cuentas coinciden.
  const libres = vehicles.filter((v) => v.status === 'idle');
  const nEstado = (e: ReturnType<typeof estadoVehiculo>) => vehicles.filter((v) => estadoVehiculo(v) === e).length;
  const viajando = nEstado('en_ruta');
  const entregando = nEstado('entregando');
  const enRefrigerio = nEstado('refrigerio');
  const regresando = nEstado('almacen');
  const enRuta = viajando + entregando + enRefrigerio + regresando;
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
      vencido ? 'Pedido con el plazo VENCIDO' : 'Próximo pedido en vencer',
      vencido ? `${proximo.code} · venció ${haceCorto(proximoMs)}` : proximo.code,
      vencido && vencidos > 1 ? `${vencidos} vencidos en total` : '',
      vencido ? 'La operación se detendrá en segundos' : '',
      otros3h > 0 ? `+${otros3h} más en riesgo o vencidos${otrosVencidos > 0 ? ` (${otrosVencidos} vencidos)` : ''}` : '',
      `Ámbar: faltan ≤ ${duracionCorta(RIESGO)} · rojo: vencido`,
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
      data-panel-mapa
      className={`tema-panel absolute z-[1000] ${panel.colapsado ? '' : 'w-[316px]'} rounded-xl border border-[var(--color-sidebar-border)] bg-[var(--color-sidebar-background)]/95 text-slate-100 shadow-xl backdrop-blur-sm select-none`}
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
              <ClipboardList className={`h-3.5 w-3.5 ${vencido ? 'animate-pulse' : ''}`} aria-hidden />{!proximo ? '—' : vencido ? `-${corto(-proximoMs)}` : corto(proximoMs)}
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
              icono={vencido ? AlertTriangle : Timer}
              valor={valorProximo}
              rotulo={proximo ? `${vencido ? 'Vencido' : 'Vence'} ${idProximo}` : 'Sin pend.'}
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
              ayuda={`Vehículos en ruta (estados de la leyenda)\nViajando: ${viajando}\nEntregando: ${entregando}\nRefrigerio: ${enRefrigerio}\nVa al almacén: ${regresando}`}
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
