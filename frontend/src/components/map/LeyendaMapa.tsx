import React from 'react';
import { Car, CircleParking, Coffee, Eye, EyeOff, Filter, Layers, MapPin, Navigation, Wrench, X } from 'lucide-react';
import { AlmacenSolido, EstrellaCentral } from './AlmacenSolido';
import { FaBicycle, FaMotorcycle } from 'react-icons/fa';
import { WAREHOUSE_STOCK_COLORS } from '../../utils/warehouseStock';
import { useEstadoVisual } from '../../engine/useEstadoVisual';
import { MapLayersState, useMapStore } from '../../store/mapStore';
import { useAyuda } from './useAyuda';
import { useUmbrales } from '../../store/umbralesStore';
import { estadoVehiculo, GrupoFiltro, hayFiltros, nivelAlmacen, nivelCarga } from '../../utils/filtrosMapa';

/*
 * Colores tomados de LeafletManhattanMap (marcadores, rutas y bloqueos) y de warehouseStock: si
 * cambian allá, hay que actualizarlos aquí.
 */
// La carga ya no es un color en el mapa (los vehículos son neutros, ver LeafletManhattanMap
// COLOR_VEHICULO): aquí queda solo como filtro, con barras de nivel en vez de colores de semáforo.
const CARGA = [
  { valor: 'alta', barras: 3, label: 'Alta' },
  { valor: 'media', barras: 2, label: 'Media' },
  { valor: 'baja', barras: 1, label: 'Baja' },
];
const GRIS_ALMACEN = '#6B7280';
// Descripción de cada tipo para la ayuda al pasar el mouse (mismas reglas que
// utils/vehicleBreakdown.BREAKDOWN_LEVEL_CONFIGS, en versión corta).
const AVERIAS = [
  {
    valor: 'averia1', hex: '#8B5CF6', texto: 'A1', label: 'Tipo 1', titulo: 'Avería tipo 1 · menor',
    lineas: ['Se repara en el lugar: 2 h detenido', 'Luego sigue con su ruta'],
  },
  {
    valor: 'averia2', hex: '#EC4899', texto: 'A2', label: 'Tipo 2', titulo: 'Avería tipo 2 · intermedia',
    lineas: ['Hasta 4 h en el lugar; luego pasa al almacén central',
      'Vuelve al final del siguiente turno'],
  },
  {
    valor: 'averia3', hex: '#14B8A6', texto: 'A3', label: 'Tipo 3', titulo: 'Avería tipo 3 · mayor',
    lineas: ['4 h en el lugar; luego pasa al almacén central',
      'Fuera de servicio al menos 2 días'],
  },
];
const PEDIDOS = [
  { valor: 'on_time', hex: '#10B981', label: 'A tiempo' },
  { valor: 'at_risk', hex: '#F59E0B', label: 'En riesgo' },
  { valor: 'delayed', hex: '#F43F5E', label: 'Retrasado' },
  { valor: 'collapsed', hex: '#991B1B', label: 'Colapsado' },
];
const ALMACENES = (['high', 'medium', 'low', 'empty'] as const).map((nivel) => ({ valor: nivel, ...WAREHOUSE_STOCK_COLORS[nivel] }));

/**
 * Bloque de la leyenda: título y sus filas, separado del anterior por una línea. Con `capas`, el
 * título es además un interruptor: un click oculta en el mapa todo lo de esa sección (el título se
 * tacha y el bloque se atenúa), como las capas de calles; otro click lo vuelve a mostrar.
 */
const Seccion: React.FC<{ titulo: string; capas?: Array<keyof MapLayersState>; children: React.ReactNode }> = (
  { titulo, capas, children },
) => {
  const activeLayers = useMapStore((s) => s.activeLayers);
  const setLayer = useMapStore((s) => s.setLayer);
  const visible = !capas || capas.some((c) => activeLayers[c]);
  return (
    <section className="space-y-1.5 border-t border-[var(--color-sidebar-border)] pt-2 first:border-t-0 first:pt-0">
      {capas ? (
        <h3>
          <button
            type="button"
            aria-pressed={visible}
            onClick={() => capas.forEach((c) => setLayer(c, !visible))}
            title={visible ? `Click: ocultar ${titulo.toLowerCase()} en el mapa` : `Click: mostrar ${titulo.toLowerCase()} en el mapa`}
            className={`flex items-center gap-1.5 rounded px-0.5 text-[11px] font-semibold uppercase tracking-wide transition hover:text-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-400 ${
              visible ? 'text-slate-400' : 'text-slate-500 line-through'}`}
          >
            {visible ? <Eye className="h-3 w-3" aria-hidden /> : <EyeOff className="h-3 w-3" aria-hidden />}
            {titulo}
          </button>
        </h3>
      ) : (
        <h3 className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{titulo}</h3>
      )}
      <div className={`space-y-1.5 ${visible ? '' : 'pointer-events-none opacity-30'}`}>{children}</div>
    </section>
  );
};

/** Fila de elementos del mismo tipo (una escala o un conjunto), en columnas iguales y en orden. */
const Fila: React.FC<{ columnas: 1 | 2 | 3; rotulo?: string; children: React.ReactNode }> = ({ columnas, rotulo, children }) => (
  <div>
    {rotulo && <div className="mb-0.5 text-[10px] text-slate-500">{rotulo}</div>}
    <ul className={`grid gap-x-1 gap-y-0.5 ${columnas === 3 ? 'grid-cols-3' : columnas === 2 ? 'grid-cols-2' : 'grid-cols-1'}`}>
      {children}
    </ul>
  </div>
);

/**
 * Elemento de la leyenda. Con `grupo`/`valor` (o `capa`) es además un filtro del mapa: un click
 * deja ver solo eso (se suman los que se marquen del mismo grupo); lo que queda oculto se atenúa.
 * Sin ellos es solo explicativo.
 */
const Item: React.FC<{
  simbolo: React.ReactNode;
  children: React.ReactNode;
  grupo?: GrupoFiltro;
  valor?: string;
  capa?: keyof MapLayersState;
  cantidad?: number;
  /** Ayuda propia al pasar el mouse (reemplaza la del filtro). */
  globo?: React.ReactNode;
}> = ({ simbolo, children, grupo, valor, capa, cantidad, globo }) => {
  const filtros = useMapStore((s) => s.filtros);
  const activeLayers = useMapStore((s) => s.activeLayers);
  const alternarFiltro = useMapStore((s) => s.alternarFiltro);
  const toggleLayer = useMapStore((s) => s.toggleLayer);
  const ayuda = useAyuda(globo ? 'ayuda' : '', globo);

  const contenido = (
    <>
      <span className="flex h-4 w-4 shrink-0 items-center justify-center" aria-hidden>{simbolo}</span>
      <span className="truncate">{children}</span>
      {cantidad != null && <span className="ml-auto pl-1 font-mono-code text-[10px] text-slate-400">{cantidad}</span>}
    </>
  );
  const base = 'flex w-full min-w-0 items-center gap-1.5 rounded-md px-1 py-0.5 text-left text-[11px] text-slate-200';

  if (grupo && valor) {
    const marcados = filtros[grupo];
    const activo = marcados.includes(valor);
    const oculto = marcados.length > 0 && !activo;
    return (
      <li>
        <button
          type="button"
          aria-pressed={activo}
          onClick={() => alternarFiltro(grupo, valor)}
          title={globo ? undefined : activo ? 'Click: quitar este filtro' : 'Click: mostrar solo esto en el mapa'}
          {...(globo ? ayuda.props : {})}
          className={`${base} transition hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-400 ${
            activo ? 'bg-cyan-500/15 ring-1 ring-cyan-400/70' : ''} ${oculto ? 'opacity-40' : ''}`}
        >
          {contenido}
        </button>
        {ayuda.nodo}
      </li>
    );
  }
  if (capa) {
    const visible = activeLayers[capa];
    return (
      <li>
        <button
          type="button"
          aria-pressed={visible}
          onClick={() => toggleLayer(capa)}
          title={visible ? 'Click: ocultar en el mapa' : 'Click: mostrar en el mapa'}
          className={`${base} transition hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-400 ${
            visible ? '' : 'opacity-40 line-through'}`}
        >
          {contenido}
        </button>
      </li>
    );
  }
  return <li className={`${base}`}>{contenido}</li>;
};

const Punto: React.FC<{ hex: string }> = ({ hex }) => (
  <span className="block h-3 w-3 rounded-[3px]" style={{ backgroundColor: hex }} />
);

/** Nivel de carga como 3 barras ascendentes (las llenas = cuánto lleva), sin color de alarma. */
const NivelCarga: React.FC<{ barras: number }> = ({ barras }) => (
  <svg width="14" height="12" viewBox="0 0 14 12" aria-hidden>
    {[0, 1, 2].map((i) => (
      <rect key={i} x={1 + i * 4.5} y={8 - i * 3} width="3" height={4 + i * 3} rx="0.8"
        fill={i < barras ? '#E2E8F0' : 'none'} stroke="#94A3B8" strokeWidth="0.8" />
    ))}
  </svg>
);

const Linea: React.FC<{ color: string; punteada?: boolean; grosor?: number }> = ({ color, punteada, grosor = 2.5 }) => (
  <svg width="16" height="8" viewBox="0 0 16 8">
    <line x1="1" y1="4" x2="15" y2="4" stroke={color} strokeWidth={grosor} strokeLinecap="round"
      strokeDasharray={punteada ? '3 3' : undefined} />
  </svg>
);

const contar = <T,>(lista: T[], clave: (x: T) => string): Record<string, number> => {
  const c: Record<string, number> = {};
  for (const x of lista) { const k = clave(x); c[k] = (c[k] ?? 0) + 1; }
  return c;
};

/**
 * Leyenda del mapa, que además lo filtra: qué significa cada color y símbolo (vehículos, pedidos,
 * almacenes, rutas y bloqueos), cuántos hay de cada uno; con un click en un elemento se deja ver
 * solo eso y con un click en el título de una sección se oculta toda. Se abre desde el botón Capas
 * de los controles del mapa (ver ControlesMapa).
 */
export const LeyendaCapas: React.FC = () => {
  const { vehicles, orders, warehouses } = useEstadoVisual();
  const filtros = useMapStore((s) => s.filtros);
  const activeLayers = useMapStore((s) => s.activeLayers);
  const limpiarFiltros = useMapStore((s) => s.limpiarFiltros);
  const umbrales = useUmbrales();
  const filtrando = hayFiltros(filtros) || Object.values(activeLayers).some((v) => !v);

  const nTipo = contar(vehicles, (v) => v.type);
  const nCarga = contar(vehicles, nivelCarga);
  const nEstado = contar(vehicles, estadoVehiculo);
  const nPedido = contar(orders.filter((o) => o.status !== 'delivered'), (o) => o.status);
  const nAlmacen = contar(warehouses, nivelAlmacen);

  return (
    <div className="select-none text-slate-100">
      <div className="flex items-center gap-1.5 px-3 pb-1 pt-2.5">
        <Layers className="h-4 w-4 shrink-0 text-cyan-400" aria-hidden />
        <span className="text-xs font-semibold text-slate-200">Capas y leyenda</span>
        {filtrando && (
          <button
            type="button"
            onClick={limpiarFiltros}
            title="Hay capas ocultas o filtros activos. Click: mostrar todo"
            className="ml-auto inline-flex items-center gap-1 rounded-full bg-amber-400/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber-300 ring-1 ring-amber-400/50 hover:bg-amber-400/25"
          >
            <Filter className="h-2.5 w-2.5" aria-hidden />Mostrar todo<X className="h-2.5 w-2.5" aria-hidden />
          </button>
        )}
      </div>
      {/* Alto máximo: lo que queda de pantalla bajo el botón Capas; si no alcanza, se desplaza por dentro. */}
      <div className="max-h-[max(200px,calc(100vh-240px))] space-y-2 overflow-y-auto px-3 pb-2.5">
        <p className="text-[10px] leading-snug text-slate-500">
          Click en un título para ocultar la sección · en un elemento para ver solo eso
        </p>          <Seccion titulo="Vehículos" capas={['vehicles']}>
            <Fila columnas={3} rotulo="Tipo">
              <Item grupo="vehTipo" valor="car" cantidad={nTipo.car ?? 0} simbolo={<Car className="h-3.5 w-3.5 text-slate-300" />}>Auto</Item>
              <Item grupo="vehTipo" valor="motorcycle" cantidad={nTipo.motorcycle ?? 0} simbolo={<FaMotorcycle className="h-3.5 w-3.5 text-slate-300" />}>Moto</Item>
              <Item grupo="vehTipo" valor="bicycle" cantidad={nTipo.bicycle ?? 0} simbolo={<FaBicycle className="h-3.5 w-3.5 text-slate-300" />}>Bici</Item>
            </Fila>
            <Fila columnas={3} rotulo={`Carga (alta ≥ ${umbrales.cargaAlta} %, baja < ${umbrales.cargaMedia} %)`}>
              {CARGA.map((c) => (
                <Item key={c.valor} grupo="vehCarga" valor={c.valor} cantidad={nCarga[c.valor] ?? 0} simbolo={<NivelCarga barras={c.barras} />}>{c.label}</Item>
              ))}
            </Fila>
            <Fila columnas={2} rotulo="Estado">
              <Item grupo="vehEstado" valor="en_ruta" cantidad={nEstado.en_ruta ?? 0} simbolo={<Navigation className="h-3 w-3 text-slate-300" />}>Viajando</Item>
              <Item grupo="vehEstado" valor="entregando" cantidad={nEstado.entregando ?? 0} simbolo={
                <span className="vehiculo-entregando"><span className="glifo-pulso block h-3 w-3 rounded-[3px] bg-slate-300" /></span>
              }>Entregando</Item>
              <Item grupo="vehEstado" valor="almacen" cantidad={nEstado.almacen ?? 0} simbolo={<Punto hex={GRIS_ALMACEN} />}>Va al almacén</Item>
              <Item grupo="vehEstado" valor="refrigerio" cantidad={nEstado.refrigerio ?? 0} simbolo={
                <span className="flex h-4 w-4 items-center justify-center rounded-full border border-white bg-[#FBBF24]">
                  <Coffee className="h-2.5 w-2.5 text-slate-800" strokeWidth={2.8} />
                </span>
              }>Refrigerio</Item>
              <Item grupo="vehEstado" valor="disponible" cantidad={nEstado.disponible ?? 0} simbolo={<CircleParking className="h-3.5 w-3.5 text-slate-300" />}>Disponible</Item>
              <Item grupo="vehEstado" valor="mantenimiento" cantidad={nEstado.mantenimiento ?? 0} simbolo={<Wrench className="h-3 w-3 text-slate-300" />}>Mantenimiento</Item>
              <Item simbolo={
                <span className="flex h-4 w-4 items-center justify-center rounded-full border-[1.5px] border-white bg-[#1F3864] text-[8px] font-bold text-white">3</span>
              }>Detenidos juntos</Item>
            </Fila>
            <Fila columnas={3} rotulo="Avería">
              {AVERIAS.map((a) => (
                <Item key={a.valor} grupo="vehEstado" valor={a.valor} cantidad={nEstado[a.valor] ?? 0} simbolo={
                  <span className="flex h-4 w-4 items-center justify-center rounded-full border-[1.5px] bg-white text-[7px] font-extrabold"
                    style={{ borderColor: a.hex, color: a.hex }}>{a.texto}</span>
                } globo={
                  <>
                    <div className="font-semibold" style={{ color: a.hex }}>{a.titulo}</div>
                    {a.lineas.map((linea) => <div key={linea} className="text-slate-300">{linea}</div>)}
                    <div className="pt-0.5 text-slate-400">Click: mostrar solo estos en el mapa</div>
                  </>
                }>{a.label}</Item>
              ))}
            </Fila>
          </Seccion>

          <Seccion titulo="Pedidos" capas={['orderPins']}>
            <Fila columnas={2}>
              {PEDIDOS.map((p) => (
                <Item key={p.valor} grupo="pedido" valor={p.valor} cantidad={nPedido[p.valor] ?? 0}
                  simbolo={<MapPin className="h-4 w-4" fill={p.hex} color="#ffffff" strokeWidth={1.8} />}>{p.label}</Item>
              ))}
            </Fila>
          </Seccion>

          <Seccion titulo="Almacenes" capas={['warehouses']}>
            <Fila columnas={2} rotulo="Color según su stock">
              {ALMACENES.map((a) => (
                <Item key={a.valor} grupo="almacen" valor={a.valor} cantidad={nAlmacen[a.valor] ?? 0}
                  simbolo={<AlmacenSolido color={a.hex} size={15} />}>{a.label}</Item>
              ))}
              <Item grupo="almacen" valor="central" cantidad={nAlmacen.central ?? 0} simbolo={<EstrellaCentral size={14} />}>Central</Item>
            </Fila>
          </Seccion>

          <Seccion titulo="Calles" capas={['projectedRoutes', 'blockedStreets']}>
            <Fila columnas={1}>
              <Item capa="projectedRoutes" simbolo={<Linea color="#64748b" punteada />}>Ruta planificada de un vehículo</Item>
              <Item simbolo={<Linea color="#38bdf8" grosor={3.5} />}>Ruta del vehículo o pedido seleccionado</Item>
              <Item capa="blockedStreets" simbolo={<Linea color="#C62828" grosor={3.2} />}>Calle bloqueada</Item>
            </Fila>
          </Seccion>
      </div>
    </div>
  );
};
