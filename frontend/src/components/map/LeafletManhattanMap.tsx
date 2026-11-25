import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { Coffee, MapPin } from 'lucide-react';
import { AlmacenSolido, EstrellaCentral } from './AlmacenSolido';
import { FaBicycle, FaMotorcycle } from 'react-icons/fa';
import { renderToStaticMarkup } from 'react-dom/server';
import { Warehouse, Vehicle, BlockedStreet, Order, Route } from '../../types';
import { GRID_WIDTH_KM, GRID_HEIGHT_KM, normalizeManhattanPath } from '../../utils/manhattan';
import {
  BREAKDOWN_LEVEL_CONFIGS,
  getBreakdownLevelConfig,
  VEHICLE_TYPE_META,
} from '../../utils/vehicleStatus';
import { getWarehouseStockStatus } from '../../utils/warehouseStock';
import { colorCarga } from '../../utils/filtrosMapa';
import { vehicleIdsCarryingOrder } from '../../utils/orderRoutes';
import { fixedDashOffset, routeLineKey } from '../../utils/routeLine';
import { simulationEngine } from '../../engine/simulationEngine';
import { useAveriasProgramadasStore } from '../../store/averiasProgramadasStore';

/** Acciones del mapa que usan los controles propios (ControlesMapa). */
export interface ApiMapa {
  acercar: () => void;
  alejar: () => void;
  encuadrar: () => void;
  /** Centra el mapa en un punto de la grilla (acercando si está muy lejos). */
  centrar: (x: number, y: number) => void;
}

/**
 * Hace que el cuadro (tooltip) de un marcador siempre quepa dentro del mapa: por defecto se abre
 * encima, pero si el punto está cerca del borde superior se abre debajo, y si está pegado a un
 * costado se corre hacia adentro. Antes siempre se abría encima y en la fila superior quedaba
 * recortado (el mapa oculta lo que sale de su borde).
 */
const tooltipQueCabe = (
  marker: L.Marker,
  getMapa: () => L.Map | null,
  despeje: { arriba: number; abajo: number },
) => {
  const MARGEN = 6;
  marker.on('tooltipopen', (e) => {
    const tooltip = (e as L.TooltipEvent).tooltip;
    const mapa = getMapa();
    const el = tooltip.getElement();
    if (!mapa || !el) return;
    const p = mapa.latLngToContainerPoint(marker.getLatLng());
    const anchoMapa = mapa.getSize().x;
    const abajo = p.y - despeje.arriba - el.offsetHeight < MARGEN;
    const mitad = el.offsetWidth / 2;
    const corrimiento = p.x - mitad < MARGEN ? MARGEN + mitad - p.x
      : p.x + mitad > anchoMapa - MARGEN ? anchoMapa - MARGEN - mitad - p.x : 0;
    tooltip.options.direction = abajo ? 'bottom' : 'top';
    tooltip.options.offset = L.point(corrimiento, abajo ? despeje.abajo : -despeje.arriba);
    tooltip.update();
  });
};

/**
 * Nombre del tipo sin la sigla ("Auto", "Moto", "Bici"): el código del vehículo (TA03, TM14, TB01) ya
 * la lleva, así que "TA03 · Auto · TA" la repetía.
 */
const nombreTipo = (tipo: Vehicle['type']): string =>
  (VEHICLE_TYPE_META[tipo]?.shortLabel ?? tipo).split(' · ')[0];

/**
 * Color del vehículo: semáforo de CAPACIDAD (requisito del curso; ver SEMAFORO_CARGA en
 * utils/filtrosMapa). Va invertido respecto de la carga a propósito: verde = le queda capacidad,
 * rojo = lleno. Antes era verde = mucha carga y el rojo de "poca carga" se leía como alarma.
 * Excepciones que mandan sobre el color: avería (su color propio) y regreso al almacén (gris).
 */

const ETIQUETA_ESTADO: Record<string, string> = {
  idle: 'Inactivo',
  en_route: 'Viajando',
  delivering: 'Entregando',
  on_break: 'Refrigerio',
  broken: 'Averiado',
  maintenance: 'Mantenimiento',
};

// Colores exclusivos para averías: no reutilizan los colores de carga, semáforo, almacenes
// ni estados operativos del resto de marcadores.
const BREAKDOWN_COLORS: Record<number, string> = {
  1: '#8B5CF6',
  2: '#EC4899',
  3: '#14B8A6',
};

const BREAKDOWN_LABELS: Record<number, string> = {
  1: 'Avería Tipo 1 (Menor)',
  2: 'Avería Tipo 2 (Intermedia)',
  3: 'Avería Tipo 3 (Mayor)',
};

/** Tamaño (px) del glifo del vehículo: sin burbuja de fondo, el propio vehículo es el marcador. */
const TAMANO_GLIFO = 22;
/** Taza de café del distintivo de refrigerio, centrada en (-8.5, -8.5) del marcador. Los cubiertos
 * cruzados se leían como una "X" a este tamaño; la taza con asa se distingue mejor. */
const iconoRefrigerio = renderToStaticMarkup(
  <Coffee x={-12.5} y={-12.5} size={8} strokeWidth={2.6} color="#1f2937" aria-hidden />
);

/** Extensión total del marcador de vehículo, incluidos los distintivos de avería/refrigerio (±14 px). */
const EXTENSION_VEHICULO = 28;
/** Tamaño (px) natural del ícono de almacén (solo la imagen, sin recuadro). */
const TAMANO_ALMACEN = 24;
/**
 * Regla del profesor: ningún ícono puede tapar un nodo (ni pasar de 2×2 cuadras). Un ícono de 2
 * cuadras centrado en su nodo llega justo a los 8 nodos vecinos, así que se deja margen:
 *  - centrados en su nodo (vehículo, almacén): a lo más 1.6 cuadras de lado;
 *  - pin de destino (punta en el nodo, crece hacia arriba): a lo más 0.9 cuadras de alto, para no
 *    llegar al nodo de arriba;
 *  - bolita de "N detenidos" (al lado del almacén): dentro de la cuadra vecina, sin tocar nodos.
 */
const LADO_MAX_CUADRAS = 1.6;
const ALTO_MAX_PIN_CUADRAS = 0.9;

/** Distintivo del almacén central, ya en HTML para el divIcon. */
const estrellaCentral = renderToStaticMarkup(<EstrellaCentral size={11} />);

/**
 * Escala de los íconos según el zoom: en CRS.Simple una cuadra (1 unidad) mide 2^zoom px. Al
 * alejar, el ícono se achica para respetar los topes de arriba; al acercar, nunca crece más que su
 * tamaño natural. Se publica como variables CSS en el contenedor, así no hay que regenerar los
 * íconos en cada zoom.
 */
const actualizarEscalaIconos = (map: L.Map) => {
  const pxCuadra = map.getZoomScale(map.getZoom(), 0);
  const ladoMax = LADO_MAX_CUADRAS * pxCuadra;
  const altoPinMax = ALTO_MAX_PIN_CUADRAS * pxCuadra;
  const contenedor = map.getContainer();
  contenedor.style.setProperty('--escala-vehiculo', String(Math.min(1, ladoMax / EXTENSION_VEHICULO)));
  contenedor.style.setProperty('--escala-almacen', String(Math.min(1, ladoMax / TAMANO_ALMACEN)));
  // Pin: 28 px de alto sobre su punta; seleccionado, el halo sube 40 px sobre la punta.
  contenedor.style.setProperty('--escala-pin', String(Math.min(1, altoPinMax / 28)));
  contenedor.style.setProperty('--escala-pin-sel', String(Math.min(1, altoPinMax / 40)));
  // Bolita de "N vehículos detenidos": ocupa de 4 a 33 px hacia arriba y de 12 a 36 px a la derecha
  // de su punto (anclaje); con 36 px ≤ 0.85 cuadra queda dentro de la cuadra vecina, sin tocar nodos.
  contenedor.style.setProperty('--escala-grupo', String(Math.min(1, (0.85 * pxCuadra) / 36)));
};
/**
 * Auto visto desde arriba con el frente hacia arriba (parabrisas grande arriba, luneta abajo).
 * Rotado con el rumbo apunta siempre hacia donde avanza; un auto "de frente" (CarFront) quedaba de
 * cabeza al bajar por la pantalla.
 */
/** Luminancia aproximada (0-1) de un color #rrggbb: decide si los vidrios del auto van oscuros o claros. */
const esColorClaro = (hex: string) => {
  const n = parseInt(hex.replace('#', ''), 16);
  return (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255 > 0.6;
};

const autoVistaSuperior = (color: string) => {
  // Vidrios en contraste con la carrocería: claros sobre un auto oscuro (modo claro, avería) y
  // oscuros sobre uno claro (modo oscuro). Antes siempre eran celeste claro y, con la carrocería
  // clara del modo oscuro, el auto se veía como un rectángulo liso.
  const vidrio = esColorClaro(color) ? '#334155' : '#e0f2fe';
  return `
  <svg xmlns="http://www.w3.org/2000/svg" width="${TAMANO_GLIFO}" height="${TAMANO_GLIFO}" viewBox="0 0 24 24" aria-hidden="true">
    <rect x="4.3" y="5.2" width="2.2" height="4.2" rx="1" fill="#1f2937"/>
    <rect x="17.5" y="5.2" width="2.2" height="4.2" rx="1" fill="#1f2937"/>
    <rect x="4.3" y="14.8" width="2.2" height="4.2" rx="1" fill="#1f2937"/>
    <rect x="17.5" y="14.8" width="2.2" height="4.2" rx="1" fill="#1f2937"/>
    <path d="M8.2 2.2h7.6a2.6 2.6 0 0 1 2.6 2.6v14.4a2.6 2.6 0 0 1-2.6 2.6H8.2a2.6 2.6 0 0 1-2.6-2.6V4.8a2.6 2.6 0 0 1 2.6-2.6z"
      fill="${color}"/>
    <path d="M7.9 8.4Q12 6.7 16.1 8.4L15.3 10.9Q12 10 8.7 10.9Z" fill="${vidrio}"/>
    <path d="M8.9 17.3Q12 18.1 15.1 17.3L15.5 18.9Q12 19.7 8.5 18.9Z" fill="${vidrio}" opacity="0.85"/>
  </svg>`;
};

/** Unidades del marcador por cuadra cuando el tope (LADO_MAX_CUADRAS) manda sobre la escala. */
const UNIDADES_POR_CUADRA = EXTENSION_VEHICULO / LADO_MAX_CUADRAS;
/**
 * Largo de moto y bici en cuadras (elegido por el equipo); el auto conserva su tamaño natural. Son
 * dibujos de trazo fino y de perfil: al mismo tamaño que el auto (una mancha llena) se ven más
 * chicos. La bici queda menor que la moto, que ayuda a distinguirlas.
 */
const CUADRAS_MOTO = 1.3;
const CUADRAS_BICI = 1.1;
const ESCALA_TIPO: Record<Vehicle['type'], number> = {
  car: 1,
  motorcycle: (CUADRAS_MOTO * UNIDADES_POR_CUADRA) / TAMANO_GLIFO,
  bicycle: (CUADRAS_BICI * UNIDADES_POR_CUADRA) / TAMANO_GLIFO,
};
/** Lado mayor del dibujo a escala 1 (unidades del marcador): el auto no llena su recuadro de 22. */
const LADO_GLIFO: Record<Vehicle['type'], number> = { car: 18, motorcycle: TAMANO_GLIFO, bicycle: TAMANO_GLIFO };
/**
 * Cuánto crece el latido de "entregando" (ver parpadeo-entrega en global.css). EXTENSION_VEHICULO
 * equivale a LADO_MAX_CUADRAS, así que ni en el pico del latido el ícono pasa de ese tope.
 */
const PULSO_MAX = 1.35;
const pulsoDe = (tipo: Vehicle['type']): number =>
  Math.max(1, Math.min(PULSO_MAX, EXTENSION_VEHICULO / ((LADO_GLIFO[tipo] ?? TAMANO_GLIFO) * (ESCALA_TIPO[tipo] ?? 1))));

const getVehicleIconMarkup = (vehicle: Vehicle, color: string) => {
  const iconProps = {
    size: TAMANO_GLIFO,
    strokeWidth: 2.4,
    color,
    'aria-hidden': true,
  } as const;

  if (vehicle.type === 'bicycle') {
    return renderToStaticMarkup(<FaBicycle {...iconProps} />);
  }
  if (vehicle.type === 'motorcycle') {
    return renderToStaticMarkup(<FaMotorcycle {...iconProps} />);
  }
  return autoVistaSuperior(color);
};

export interface LeafletManhattanMapProps {
  warehouses?: Warehouse[];
  vehicles?: Vehicle[];
  blockedStreets?: BlockedStreet[];
  orders?: Order[];
  /** Geometria real de cada ruta (RutaDTO.geometria via adaptRuta) -- usada por la linea de ruta
   * del vehiculo seleccionado (ver efecto "Render Projected Routes"), no por la animacion (eso
   * vive en simulationEngine). */
  routes?: Route[];
  selectedVehicleId?: string | null;
  selectedWarehouseId?: string | null;
  selectedBlockId?: string | null;
  selectedOrderId?: string | null;
  onSelectVehicle?: (vehicle: Vehicle | null) => void;
  onSelectWarehouse?: (warehouse: Warehouse | null) => void;
  onSelectBlock?: (block: BlockedStreet | null) => void;
  onSelectOrder?: (order: Order | null) => void;
  /** Clic derecho sobre un vehículo (para inducir una avería); `punto` en px del contenedor del mapa. */
  onVehicleContextMenu?: (vehicleId: string, punto: { x: number; y: number }) => void;
  /** Acciones para los controles del mapa (se dibujan fuera, en la capa de los paneles flotantes). */
  onApiMapa?: (api: ApiMapa) => void;
  showBlockedStreets?: boolean;
  showProjectedRoutes?: boolean;
  showCoverageZones?: boolean;
  showOrders?: boolean;
  showGridLines?: boolean;
  isDarkTheme?: boolean;
  simMinutes?: number;
  onCreateBreakdownForVehicle?: (vehicleId: string) => void;
  /** Dimensiones reales de CiudadDTO.ancho/alto (GET /api/configuracion). Si no llegan todavía
   * (primer render antes de que resuelva la query), se usan GRID_WIDTH_KM/HEIGHT_KM como fallback
   * -- coinciden con la ciudad real de producción, pero ya no es la única fuente de verdad. */
  cityWidth?: number;
  cityHeight?: number;
  className?: string;
}

export const LeafletManhattanMap: React.FC<LeafletManhattanMapProps> = ({
  warehouses = [],
  vehicles = [],
  blockedStreets = [],
  orders = [],
  routes = [],
  selectedVehicleId = null,
  selectedWarehouseId = null,
  selectedBlockId = null,
  selectedOrderId = null,
  onSelectVehicle,
  onSelectWarehouse,
  onSelectBlock,
  onSelectOrder,
  onVehicleContextMenu,
  onApiMapa,
  showBlockedStreets = true,
  showProjectedRoutes = true,
  showOrders = false,
  showGridLines = true,
  isDarkTheme = true,
  simMinutes = 0,
  cityWidth = GRID_WIDTH_KM,
  cityHeight = GRID_HEIGHT_KM,
  className = '',
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);

  // Layer groups matching SVG layer structure
  const gridLayerGroupRef = useRef<L.LayerGroup>(L.layerGroup());
  const blockedLayerGroupRef = useRef<L.LayerGroup>(L.layerGroup());
  const routesLayerGroupRef = useRef<L.LayerGroup>(L.layerGroup());
  const ordersLayerGroupRef = useRef<L.LayerGroup>(L.layerGroup());
  const warehousesLayerGroupRef = useRef<L.LayerGroup>(L.layerGroup());
  const parkedLayerGroupRef = useRef<L.LayerGroup>(L.layerGroup());
  const parkedMarkersRef = useRef<Map<string, L.Marker>>(new Map());
  const vehiclesLayerGroupRef = useRef<L.LayerGroup>(L.layerGroup());

  // Marcadores de vehiculo persistentes entre renders (en vez de destruir y recrear cada vez que
  // llegan datos nuevos) -- necesario para poder animar su posicion en vez de que "salten". La
  // posicion de cada uno ya NO se calcula aca: la provee simulationEngine (ver el efecto de
  // suscripcion mas abajo), que es ahora la unica fuente de verdad del buffer de interpolacion.
  const vehicleMarkersRef = useRef<Map<string, L.Marker>>(new Map());
  // Mientras el motor no tenga su primer tramo completo para empezar a interpolar, se tapa el
  // mapa con un loader en vez de dejar ver el estado transitorio (vehiculos "regresando" a la
  // posicion de la ejecucion anterior, etc.) -- ver el efecto de suscripcion mas abajo.
  const [buffering, setBuffering] = useState(true);
  const routeLinesRef = useRef<Map<string, L.Polyline>>(new Map());
  const routeLineKeysRef = useRef<Map<string, string>>(new Map());
  const orderPinsRef = useRef<Map<string, { marker: L.Marker; signature: string }>>(new Map());
  const ordersRef = useRef<Order[]>(orders);
  const selectedOrderIdRef = useRef(selectedOrderId);
  const onSelectOrderRef = useRef(onSelectOrder);
  const vehiclesRef = useRef<Vehicle[]>(vehicles);
  // Marcadores de almacén persistentes (se actualizan, no se recrean) y lo que lee su click.
  const warehouseMarkersRef = useRef(new Map<string, L.Marker>());
  const warehousesRef = useRef(warehouses);
  warehousesRef.current = warehouses;
  const selectedWarehouseIdRef = useRef(selectedWarehouseId);
  selectedWarehouseIdRef.current = selectedWarehouseId;
  const onSelectWarehouseRef = useRef(onSelectWarehouse);
  onSelectWarehouseRef.current = onSelectWarehouse;
  /** Vuelve a mostrar toda la ciudad (botón "Ver toda la ciudad"). */
  const encuadrarRef = useRef<() => void>(() => {});
  // El handler del marcador se registra una sola vez al crearlo: se lee el callback vigente de aquí.
  const menuContextualRef = useRef(onVehicleContextMenu);
  menuContextualRef.current = onVehicleContextMenu;
  const onSelectVehicleRef = useRef(onSelectVehicle);
  const isDarkThemeRef = useRef(isDarkTheme);
  const averiasProgramadas = useAveriasProgramadasStore((s) => s.pendientes);
  useEffect(() => {
    vehiclesRef.current = vehicles;
    onSelectVehicleRef.current = onSelectVehicle;
    ordersRef.current = orders;
    selectedOrderIdRef.current = selectedOrderId;
    onSelectOrderRef.current = onSelectOrder;
    isDarkThemeRef.current = isDarkTheme;
  }, [vehicles, onSelectVehicle, isDarkTheme]);

  // 1. Initialize Leaflet Map with L.CRS.Simple. Fractional zoom keeps wheel/touch
  // navigation smooth while fitBounds provides a useful initial view.
  useEffect(() => {
    if (!mapContainerRef.current) return;

    // Bounds in Leaflet CRS.Simple: [[yMin, xMin], [yMax, xMax]]
    // (0,0) is bottom-left, (70, 50) is top-right
    const southWest = L.latLng(0, 0);
    const northEast = L.latLng(cityHeight, cityWidth);
    const bounds = L.latLngBounds(southWest, northEast);

    const map = L.map(mapContainerRef.current, {
      crs: L.CRS.Simple,
      attributionControl: false,
      zoomControl: false, // controles propios con el estilo de la app (ver ControlesMapa)
      scrollWheelZoom: true,
      doubleClickZoom: true,
      touchZoom: true,
      boxZoom: true,
      keyboard: true,
      dragging: true,
      zoomSnap: 0, // fractional zoom to fill 100% of container
      zoomDelta: 0.1,
      zoomAnimation: true,
      fadeAnimation: true,
      markerZoomAnimation: true,
    });

    // El almacén conserva prioridad incluso sobre un vehículo seleccionado o averiado.
    map.createPane('warehouseMarkers').style.zIndex = '625';
    mapInstanceRef.current = map;

    // Clicking anywhere on map clears selection
    map.on('click', () => {
      onSelectVehicle?.(null);
      onSelectWarehouse?.(null);
      onSelectBlock?.(null);
      onSelectOrder?.(null);
    });

    // Add layer groups to map in correct visual stacking order
    gridLayerGroupRef.current.addTo(map);
    blockedLayerGroupRef.current.addTo(map);
    routesLayerGroupRef.current.addTo(map);
    ordersLayerGroupRef.current.addTo(map);
    parkedLayerGroupRef.current.addTo(map);
    warehousesLayerGroupRef.current.addTo(map);
    vehiclesLayerGroupRef.current.addTo(map);

    // Ajuste a la grilla completa, sin animacion (ver opciones del mapa). Un pequeño margen evita
    // que los marcadores del borde (x=70, y=50) queden cortados a la mitad.
    // Mientras nadie movió la vista, cada cambio de tamaño vuelve a encuadrar la ciudad. Una vez que
    // el usuario acercó, arrastró o centró algo (p. ej. el pedido de los indicadores, que además abre
    // la barra lateral y achica el mapa), el cambio de tamaño conserva el centro: antes el
    // ResizeObserver reencuadraba toda la ciudad y deshacía el centrado.
    let vistaManual = false;
    // Margen del encuadre según los paneles flotantes visibles (data-panel-mapa: controles a la
    // izquierda; relojes e indicadores a la derecha): antes era 12 px parejo y el borde este quedaba
    // bajo los relojes/indicadores y el oeste bajo los controles. Cada panel que tapa el mapa empuja
    // el lado al que está más cerca; tope del 35 % del ancho para que la ciudad no quede diminuta.
    const margenesEncuadre = (): L.FitBoundsOptions => {
      const MARGEN = 12;
      let izquierda = MARGEN;
      let derecha = MARGEN;
      const contenedor = mapContainerRef.current;
      if (contenedor) {
        const r = contenedor.getBoundingClientRect();
        document.querySelectorAll<HTMLElement>('[data-panel-mapa]').forEach((panel) => {
          const p = panel.getBoundingClientRect();
          if (p.width === 0 || p.right <= r.left || p.left >= r.right || p.bottom <= r.top || p.top >= r.bottom) return;
          if ((p.left + p.right) / 2 > r.left + r.width / 2) derecha = Math.max(derecha, r.right - p.left + 8);
          else izquierda = Math.max(izquierda, p.right - r.left + 8);
        });
        const tope = r.width * 0.35;
        izquierda = Math.min(izquierda, tope);
        derecha = Math.min(derecha, tope);
      }
      return { paddingTopLeft: L.point(izquierda, MARGEN), paddingBottomRight: L.point(derecha, MARGEN) };
    };
    const ajustar = () => {
      const m = mapInstanceRef.current;
      if (!m) return;
      if (vistaManual) {
        m.invalidateSize({ animate: false, pan: false });
        if (destinoCentrado) m.setView(destinoCentrado, m.getZoom(), { animate: false });
        return;
      }
      m.invalidateSize({ animate: false });
      m.fitBounds(bounds, { ...margenesEncuadre(), animate: false });
    };
    // Último punto pedido con "centrar": se mantiene en el medio si el mapa cambia de tamaño justo
    // después (la barra lateral se abre con animación); lo suelta en cuanto el usuario mueve la vista.
    let destinoCentrado: L.LatLngExpression | null = null;
    const tomarControl = () => { vistaManual = true; destinoCentrado = null; };
    map.on('dragstart dblclick', tomarControl);
    mapContainerRef.current.addEventListener('keydown', tomarControl);
    mapContainerRef.current.addEventListener('wheel', tomarControl, { passive: true });
    encuadrarRef.current = () => {
      vistaManual = false;
      destinoCentrado = null;
      mapInstanceRef.current?.fitBounds(bounds, { ...margenesEncuadre(), animate: true });
    };
    // Paso de zoom completo en los botones: la rueda usa 0.1 (zoomDelta) y con eso cada clic en
    // +/− acercaba apenas un 7 % y no se notaba.
    onApiMapa?.({
      acercar: () => { tomarControl(); mapInstanceRef.current?.zoomIn(1); },
      alejar: () => { tomarControl(); mapInstanceRef.current?.zoomOut(1); },
      encuadrar: () => encuadrarRef.current(),
      centrar: (x, y) => {
        const mm = mapInstanceRef.current;
        if (!mm) return;
        vistaManual = true;
        destinoCentrado = [y, x];
        mm.setView([y, x], Math.max(mm.getZoom(), 4.5), { animate: true }); // ~22 px por cuadra
      },
    });
    ajustar();
    actualizarEscalaIconos(map);
    // 'zoom' se dispara también durante la animación y al reajustar por cambio de tamaño.
    map.on('zoom zoomend', () => actualizarEscalaIconos(map));

    // Ensure map bounds are maximized on next tick
    const fitTimer = setTimeout(ajustar, 60);

    // Resize observer to always adapt fixed map to container changes
    const markerCache = vehicleMarkersRef.current;
    const layerGroups = [gridLayerGroupRef.current, blockedLayerGroupRef.current, routesLayerGroupRef.current,
      ordersLayerGroupRef.current, warehousesLayerGroupRef.current, vehiclesLayerGroupRef.current, parkedLayerGroupRef.current];
    const resizeObserver = new ResizeObserver(ajustar);
    resizeObserver.observe(mapContainerRef.current);

    return () => {
      clearTimeout(fitTimer);
      resizeObserver.disconnect();
      markerCache.clear();
      parkedMarkersRef.current.clear();
      layerGroups.forEach((group) => group.clearLayers());
      map.remove();
      mapInstanceRef.current = null;
    };
  }, [cityWidth, cityHeight]);

  // 2. Render Literal 70x50 Manhattan Grid (Matches SVG Canvas)
  useEffect(() => {
    const group = gridLayerGroupRef.current;
    group.clearLayers();

    if (!showGridLines) return;

    // Background rectangle matching SVG background
    const bgFill = isDarkTheme ? '#0B111E' : '#F5F6F8';
    const borderStroke = isDarkTheme ? '#334155' : '#cbd5e1';
    const gridLineColor = isDarkTheme ? '#1e293b' : '#cbd5e1';

    // Base background plate
    L.rectangle(
      [
        [0, 0],
        [cityHeight, cityWidth],
      ],
      {
        color: borderStroke,
        weight: 1,
        fillColor: bgFill,
        fillOpacity: 1,
        interactive: false,
      }
    ).addTo(group);

    // 71 Vertical Lines (x = 0 to 70) matching SVG strokeWidth 0.06
    for (let x = 0; x <= cityWidth; x++) {
      L.polyline(
        [
          [0, x],
          [cityHeight, x],
        ],
        {
          color: gridLineColor,
          weight: 0.6,
          opacity: isDarkTheme ? 0.5 : 0.65,
          interactive: false,
        }
      ).addTo(group);
    }

    // 51 Horizontal Lines (y = 0 to 50) matching SVG strokeWidth 0.06
    for (let y = 0; y <= cityHeight; y++) {
      L.polyline(
        [
          [y, 0],
          [y, cityWidth],
        ],
        {
          color: gridLineColor,
          weight: 0.6,
          opacity: isDarkTheme ? 0.5 : 0.65,
          interactive: false,
        }
      ).addTo(group);
    }
  }, [showGridLines, isDarkTheme, cityWidth, cityHeight]);

  // 3. Render Blocked Streets (No balloon popups - triggers left inspector popup on click)
  useEffect(() => {
    const group = blockedLayerGroupRef.current;
    group.clearLayers();

    if (!showBlockedStreets) return;

    blockedStreets.forEach((block) => {
      const isSelected = selectedBlockId === block.id;

      // Glow line if selected
      if (isSelected) {
        L.polyline(
          [
            [block.start.y, block.start.x],
            [block.end.y, block.end.x],
          ],
          {
            color: '#f87171',
            weight: 6,
            opacity: 0.5,
            lineCap: 'round',
            interactive: false,
          }
        ).addTo(group);
      }

      // Invisible wider hit area line for comfortable clicking
      const hitLine = L.polyline(
        [
          [block.start.y, block.start.x],
          [block.end.y, block.end.x],
        ],
        {
          color: 'transparent',
          weight: 12,
          interactive: true,
        }
      );

      // Core red street line matching SVG
      const coreLine = L.polyline(
        [
          [block.start.y, block.start.x],
          [block.end.y, block.end.x],
        ],
        {
          color: 'var(--color-danger, #C62828)',
          weight: isSelected ? 4.5 : 3.2,
          opacity: 1,
          lineCap: 'round',
          interactive: true,
        }
      );

      const handleBlockClick = (e: L.LeafletMouseEvent) => {
        L.DomEvent.stopPropagation(e);
        if (selectedBlockId === block.id) {
          onSelectBlock?.(null);
        } else {
          onSelectBlock?.(block);
        }
      };

      hitLine.on('click', handleBlockClick);
      coreLine.on('click', handleBlockClick);

      hitLine.addTo(group);
      coreLine.addTo(group);
    });
  }, [showBlockedStreets, blockedStreets, selectedBlockId, onSelectBlock, cityWidth, cityHeight]);

  // 4. Render order destinations
  //
  // Corre con cada cambio del estado visible, varias veces por segundo: reutiliza cada pin y solo
  // rehace su icono si cambió algo que se ve, para no recrear todos los marcadores cada vez.
  useEffect(() => {
    const group = ordersLayerGroupRef.current;
    const pinesVigentes = new Set<string>();

    const statusColors: Record<Order['status'], string> = {
      on_time: '#10B981',
      at_risk: '#F59E0B',
      delayed: '#F43F5E',
      delivered: '#3B82F6',
      collapsed: '#991B1B',
    };
    const statusLabels: Record<Order['status'], string> = {
      on_time: 'A tiempo',
      at_risk: 'En riesgo',
      delayed: 'Retrasado',
      delivered: 'Entregado',
      collapsed: 'Colapsado',
    };

    if (showOrders) orders.forEach((order) => {
      // Conservar el historial en las listas; retirar del mapa los destinos ya atendidos.
      if (order.status === 'delivered') return;
      pinesVigentes.add(order.id);
      const isSelected = selectedOrderId === order.id;
      const signature = JSON.stringify([order.status, isSelected, order.destination.x, order.destination.y, order.clientId]);

      let pin = orderPinsRef.current.get(order.id);
      if (pin && !group.hasLayer(pin.marker)) pin = undefined;
      if (pin && pin.signature === signature) return;

      const color = statusColors[order.status] || '#3B82F6';
      const pinMarkup = renderToStaticMarkup(
        <MapPin
          size={isSelected ? 34 : 28}
          strokeWidth={isSelected ? 2.2 : 1.8}
          color="#ffffff"
          fill={color}
          aria-hidden
        />
      );

      // Mismo tope que vehículos y almacenes (2×2 cuadras): se escala desde la punta del pin (su
      // ancla), así sigue marcando exactamente la esquina de entrega.
      const html = isSelected
        ? `<div style="position: relative; width: 44px; height: 48px; display: flex; align-items: center; justify-content: center; cursor: pointer;
              transform: scale(var(--escala-pin-sel, 1)); transform-origin: 22px 40px;">
            <div style="position: absolute; width: 38px; height: 38px; border-radius: 50%; background: #38bdf8; opacity: 0.35; filter: blur(2px);"></div>
            <div style="position: absolute; width: 42px; height: 42px; border-radius: 50%; border: 2px dashed #38bdf8;"></div>
            <div style="position: relative; z-index: 2; display: flex; align-items: center; justify-content: center; filter: drop-shadow(0 4px 6px rgba(0,0,0,0.5));">
              ${pinMarkup}
            </div>
          </div>`
        : `<div style="width: 28px; height: 28px; cursor: pointer; display: flex; align-items: center; justify-content: center; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.4));
              transform: scale(var(--escala-pin, 1)); transform-origin: 14px 28px;">
            ${pinMarkup}
          </div>`;
      const icon = L.divIcon({
        className: 'order-destination-marker',
        html,
        iconSize: isSelected ? [44, 48] : [28, 28],
        iconAnchor: isSelected ? [22, 40] : [14, 28],
      });
      const zIndexOffset = isSelected ? 3000 : 100;

      let marker = pin?.marker;
      if (marker) {
        marker.setLatLng([order.destination.y, order.destination.x]);
        marker.setIcon(icon);
        marker.setZIndexOffset(zIndexOffset);
        marker.unbindTooltip();
      } else {
        marker = L.marker([order.destination.y, order.destination.x], { icon, zIndexOffset });
        // Pin: la punta está en el punto y el ícono crece hacia arriba.
        tooltipQueCabe(marker, () => mapInstanceRef.current, { arriba: 28, abajo: 8 });
        marker.on('click', (e: L.LeafletMouseEvent) => {
          L.DomEvent.stopPropagation(e);
          const actual = ordersRef.current.find((item) => item.id === order.id);
          onSelectOrderRef.current?.(selectedOrderIdRef.current === order.id ? null : actual ?? null);
        });
        marker.addTo(group);
      }

      marker.bindTooltip(
        // Con rótulos: sin ellos el código del cliente (c4995) parecía parte del código del pedido.
        `<strong>${order.code}</strong><br />`
          + `<strong>Cliente:</strong> ${order.clientId || 'no informado'}<br />`
          + `<strong>Estado:</strong> ${statusLabels[order.status]}<br />`
          + `<strong>Destino:</strong> (${order.destination.x}, ${order.destination.y})`,
        {
          direction: 'top',
          offset: [0, isSelected ? -36 : -28],
          opacity: 0.95,
        }
      );
      orderPinsRef.current.set(order.id, { marker, signature });
    });

    for (const [id, pin] of orderPinsRef.current) {
      if (pinesVigentes.has(id)) continue;
      group.removeLayer(pin.marker);
      orderPinsRef.current.delete(id);
    }
  }, [orders, showOrders, selectedOrderId, cityWidth, cityHeight]);

  // 4. Render projected routes for every vehicle
  //
  // Solo vehiculos en camino a entregar un pedido: ruta activa (in_progress) -> geometria de
  // activeRoute.waypoints. Un vehiculo regresando a un almacen no lleva linea: la Ruta ya quedo
  // FINALIZADA, asi que no hay ruta activa ni entregas pendientes en su trayectoria.
  // Vehicle.returnPath solo cubre el caso sin trayectoria visible: no viene si vuelve dentro del lote.
  //
  // El fallback directo solo cubre estados sin geometria.
  //
  // Este efecto corre cada vez que un vehiculo cambia de nodo, asi que reutiliza las lineas en vez
  // de recrearlas: borrarlas todas y redibujarlas con la geometria del final del lote hacia parpadear
  // el mapa hasta el siguiente frame, que las devolvia a la ruta visible.
  useEffect(() => {
    const group = routesLayerGroupRef.current;
    const lineasVigentes = new Set<string>();

    const retirarLineasNoVigentes = () => {
      for (const [id, line] of routeLinesRef.current) {
        if (lineasVigentes.has(id)) continue;
        group.removeLayer(line);
        routeLinesRef.current.delete(id);
        routeLineKeysRef.current.delete(id);
      }
    };

    if (!showProjectedRoutes) {
      retirarLineasNoVigentes();
      return;
    }

    // Rutas del envío seleccionado (rúbrica F03): siguen resaltadas mientras su unidad atiende otra parada.
    const selectedOrder = selectedOrderId ? orders.find((order) => order.id === selectedOrderId) : undefined;
    const orderVehicleIds = selectedOrder ? vehicleIdsCarryingOrder(selectedOrder, routes) : new Set<string>();

    vehicles.forEach((vehicle) => {
      const carriesSelectedOrder = orderVehicleIds.has(vehicle.id);
      const activeRoute = routes.find(
        (route) =>
          route.vehicleId === vehicle.id &&
          route.status === 'in_progress'
      );
      const rutaVisible = simulationEngine.getRutaVisible(vehicle.id);
      const hasVisiblePath = Boolean(rutaVisible && rutaVisible.length > 1);

      const deliveryPath = activeRoute?.waypoints ?? [];
      const returnPath = vehicle.returnPath ?? [];
      // Con trayectoria, manda lo que hace el vehículo en el instante visible (regreso o camino a
      // cargar): sin línea de reparto hasta que sale cargado del almacén.
      const isReturning = vehicle.returningVisible ?? (deliveryPath.length < 2 && (
        hasVisiblePath ? simulationEngine.sinEntregasPendientes(vehicle.id) : returnPath.length > 1
      ));
      if (isReturning || (vehicle.status !== 'en_route' && !carriesSelectedOrder)) return;

      const isSelected = selectedVehicleId === vehicle.id || carriesSelectedOrder;
      const geometry = deliveryPath.length > 1 ? deliveryPath : [];
      const fallbackDestination = vehicle.destination;
      const routePath = geometry.length > 1
        ? geometry
        : fallbackDestination
          ? normalizeManhattanPath([vehicle.position, fallbackDestination])
          : [];

      if (routePath.length <= 1) return;

      // La ruta seleccionada se resalta.
      const accent = isSelected ? '#38bdf8' : '#64748b';

      const destinationPath = normalizeManhattanPath(
        routePath[0]?.x === vehicle.position.x && routePath[0].y === vehicle.position.y
          ? routePath
          : [vehicle.position, ...routePath]
      );
      // El motor puede devolver un punto interpolado seguido de un nodo de otro
      // segmento (por ejemplo, al cambiar de lote). Normalizar la linea final
      // evita que Leaflet una esos puntos con una diagonal.
      const manhattanDestinationPath = normalizeManhattanPath(destinationPath);
      const path = rutaVisible && hasVisiblePath ? normalizeManhattanPath(rutaVisible) : manhattanDestinationPath;
      const key = routeLineKey(path);
      const latLngs = path.map((point) => [point.y, point.x] as [number, number]);
      const style = {
        color: accent,
        weight: isSelected ? 4 : 2.5,
        opacity: isSelected ? 0.9 : 0.55,
        dashArray: isSelected ? undefined : '6, 8',
      };

      let routeLine = routeLinesRef.current.get(vehicle.id);
      if (routeLine && group.hasLayer(routeLine)) {
        const actual = routeLine.options;
        if (actual.color !== style.color || actual.weight !== style.weight || actual.dashArray !== style.dashArray) {
          routeLine.setStyle(style);
        }
        if (routeLineKeysRef.current.get(vehicle.id) !== key) routeLine.setLatLngs(latLngs);
      } else {
        routeLine = L.polyline(latLngs, { ...style, lineCap: 'round', lineJoin: 'round', interactive: false }).addTo(group);
        routeLinesRef.current.set(vehicle.id, routeLine);
      }
      routeLineKeysRef.current.set(vehicle.id, key);
      lineasVigentes.add(vehicle.id);
      if (carriesSelectedOrder) routeLine.bringToFront();
    });

    retirarLineasNoVigentes();
  }, [showProjectedRoutes, vehicles, routes, orders, selectedVehicleId, selectedOrderId, cityWidth, cityHeight]);

  // 5. Render Warehouses (tooltip on hover, left inspector popup on click)
  //
  // Bug real corregido (reporte: "al pasar el mouse sobre un almacén el cuadrito parpadea"): antes
  // se borraban y recreaban TODOS los marcadores en cada actualización (varias por segundo mientras
  // se mueven los vehículos), lo que cerraba y reabría el tooltip. Ahora cada marcador se crea una
  // vez y solo se actualiza lo que cambió (ícono, contenido del tooltip, posición).
  useEffect(() => {
    const group = warehousesLayerGroupRef.current;
    const marcadores = warehouseMarkersRef.current;
    const vigentes = new Set(warehouses.map((w) => w.id));
    for (const [id, marcador] of marcadores) {
      if (!vigentes.has(id)) {
        group.removeLayer(marcador);
        marcadores.delete(id);
      }
    }

    warehouses.forEach((w) => {
      const isSelected = selectedWarehouseId === w.id;
      const isInfinite = !Number.isFinite(w.capacity);
      // Semáforo de stock (+ vacío) compartido con la lista de almacenes del panel. El % sale de
      // w.occupancyPct (AlmacenDTO.nivelOcupacion), no se recalcula aqui con currentStock/capacity.
      const stock = getWarehouseStockStatus(w);
      const pct = stock.pct;
      const isEmpty = stock.level === 'empty';

      // Solo la imagen, sin recuadro ni contorno (igual que los vehículos). El glifo lleva el color
      // del semáforo de stock (gris si está vacío) y la selección se marca con un resplandor.
      const glyphColor = stock.hex;
      const glyph = renderToStaticMarkup(<AlmacenSolido color={glyphColor} size={TAMANO_ALMACEN} />);
      const resplandor = isSelected
        ? `drop-shadow(0 0 2px ${isDarkTheme ? '#38bdf8' : '#1F3864'}) drop-shadow(0 0 4px ${isDarkTheme ? '#38bdf8' : '#1F3864'})`
        : 'none';
      const warehouseIcon = L.divIcon({
        className: 'svg-style-warehouse-marker',
        html: `
          <div style="
            position: relative;
            width: ${TAMANO_ALMACEN}px;
            height: ${TAMANO_ALMACEN}px;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            opacity: ${isEmpty && !isSelected ? 0.75 : 1};
            filter: ${resplandor};
            transform: scale(var(--escala-almacen, 1));
            transform-origin: center;
          ">
            ${glyph}
            ${isInfinite ? `<span style="position: absolute; top: -1px; right: -1px; z-index: 1; display: flex; line-height: 0;">${estrellaCentral}</span>` : ''}
          </div>
        `,
        iconSize: [TAMANO_ALMACEN, TAMANO_ALMACEN],
        iconAnchor: [TAMANO_ALMACEN / 2, TAMANO_ALMACEN / 2],
      });

      const tooltipContent = isInfinite
        ? '<div style="font-family: system-ui, -apple-system, sans-serif; font-size: 11px; line-height: 1.4; padding: 2px 4px;"><strong>Oficina principal</strong><br/><strong>Stock:</strong> ilimitado</div>'
        : `
          <div style="font-family: system-ui, -apple-system, sans-serif; font-size: 11px; line-height: 1.4; padding: 2px 4px; min-width: 120px;">
            <div style="font-weight: 700; font-size: 12px; margin-bottom: 2px;">${w.name}</div>
            <div><strong>Stock:</strong> ${w.currentStock} / ${w.capacity} paq</div>
            <div><strong>Ocupación:</strong> ${pct}% · <span style="color: ${stock.hex}; font-weight: 700;">${stock.label}</span></div>
            <div><strong>En tránsito:</strong> ${w.inTransit} paq</div>
          </div>
        `;
      const existente = marcadores.get(w.id);
      if (existente && group.hasLayer(existente)) {
        // Solo lo que cambió: el tooltip abierto se actualiza en su lugar, sin cerrarse.
        const pos = existente.getLatLng();
        if (pos.lat !== w.coords.y || pos.lng !== w.coords.x) existente.setLatLng([w.coords.y, w.coords.x]);
        if ((existente.getIcon().options as L.DivIconOptions).html !== warehouseIcon.options.html) existente.setIcon(warehouseIcon);
        if (existente.getTooltip()?.getContent() !== tooltipContent) existente.setTooltipContent(tooltipContent);
        return;
      }

      const marker = L.marker([w.coords.y, w.coords.x], { icon: warehouseIcon, pane: 'warehouseMarkers' });
      tooltipQueCabe(marker, () => mapInstanceRef.current, { arriba: 14, abajo: 14 });
      marker.bindTooltip(tooltipContent, {
        direction: 'top',
        offset: [0, -14],
        opacity: 0.95,
      });
      // Se registra una sola vez: lee la selección y el callback vigentes desde refs.
      marker.on('click', (e: L.LeafletMouseEvent) => {
        L.DomEvent.stopPropagation(e);
        const actual = warehousesRef.current.find((x) => x.id === w.id) ?? w;
        onSelectWarehouseRef.current?.(selectedWarehouseIdRef.current === w.id ? null : actual);
      });
      marker.addTo(group);
      marcadores.set(w.id, marker);
    });  }, [warehouses, selectedWarehouseId, isDarkTheme, onSelectWarehouse, cityWidth, cityHeight]);

  // 6. Render Vehicles (No balloon popups - triggers left inspector popup on click)
  //
  // Crea/actualiza el icono de cada marcador (color de semaforo, seleccion, averia, refrigerio) y
  // registra el click handler. La POSICION ya no se calcula aca -- vive en simulationEngine (ver
  // engine/simulationEngine.ts), que es ahora la unica fuente de verdad del buffer de
  // interpolacion/reloj retrasado para toda la app (antes vivia duplicada, con su propia logica,
  // en este mismo efecto). Este componente solo crea los L.Marker y los deja quietos hasta que el
  // efecto de suscripcion (mas abajo) les asigne una posicion.
  useEffect(() => {
    const group = vehiclesLayerGroupRef.current;
    const markers = vehicleMarkersRef.current;

    const idsActuales = new Set(vehicles.map((v) => v.id));
    for (const [id, marker] of markers) {
      if (!idsActuales.has(id)) {
        group.removeLayer(marker);
        markers.delete(id);
      }
    }

    vehicles.forEach((v) => {
      const isSelected = selectedVehicleId === v.id;
      // Semáforo de capacidad salvo excepción (avería, va al almacén): ver SEMAFORO_CARGA. El plazo se
      // ve en el pin de cada pedido; el distintivo de esta esquina queda solo para las averías.
      const isBroken = v.status === 'broken';
      const activeRoute = routes.find(
        (route) => route.vehicleId === v.id && route.status === 'in_progress'
      );
      // Gris mientras va hacia un almacén sin repartir, según su trayectoria en el instante visible
      // (no según el estado del final del lote, que cambiaba el color cuadras antes de llegar).
      const isReturning = v.returningVisible ?? (
        v.status === 'en_route' &&
        (activeRoute?.waypoints?.length ?? 0) < 2 &&
        (v.returnPath?.length ?? 0) > 1);
      // Bug real reportado: un vehiculo en refrigerio (VehiculoDTO.actividad=EN_REFRIGERIO) se
      // veia en el mapa IDENTICO a uno viajando normalmente -- el semaforo solo mira riesgo de
      // SLA, y el badge con la etiqueta "En refrigerio" vive en el panel lateral, no en el mapa.
      // Color propio (no reutiliza ninguno de los 4 del semaforo) + icono de pausa, agregado a la
      // leyenda (ver MapLegend).
      const isEnRefrigerio = v.status === 'on_break';

      // El color del círculo comunica la carga disponible; la selección se mantiene con el aro
      // exterior y los estados operativos con sus acentos para no ocultar esta información.
      const breakdownType = v.status === 'broken' ? v.breakdownType : undefined;
      const breakdownBadge = breakdownType ? `A${breakdownType}` : '!';
      const breakdownColor = breakdownType ? BREAKDOWN_COLORS[breakdownType] : '#6B21A8';
      const bubbleFill = v.status === 'broken'
        ? breakdownColor
        : isReturning
          ? '#6B7280'
          : colorCarga(v);
      const vehicleIconMarkup = getVehicleIconMarkup(v, bubbleFill);
      // Solo la imagen (pedido del profesor: sin burbuja, halo ni contorno). La selección se marca
      // con un resplandor, que es lo único que distingue al vehículo elegido en el mapa.
      const contornoGlifo = isSelected
        ? `drop-shadow(0 0 2px ${isDarkTheme ? '#38bdf8' : '#1F3864'}) drop-shadow(0 0 4px ${isDarkTheme ? '#38bdf8' : '#1F3864'})`
        : 'none';

      const vehicleIcon = L.divIcon({
        className: 'svg-style-vehicle-marker',
        html: `
          <svg
            width="44"
            height="46"
            viewBox="-22 -22 44 46"
            class="${v.status === 'delivering' ? 'vehiculo-entregando' : ''}"
            style="overflow: visible; cursor: pointer; display: block; filter: ${contornoGlifo};
              transform: scale(var(--escala-vehiculo, 1)); transform-origin: 22px 22px;"
          >
            <title>${v.code}: ${v.currentLoad}/${v.capacity} paquetes</title>

            <!-- El propio vehículo es el marcador. El bucle de frames rota este grupo con el
                 rumbo: el auto se ve desde arriba (avanza "hacia arriba"); moto y bici se ven de
                 perfil (avanzan "hacia la derecha") y se reflejan al ir hacia el oeste. -->
            <g class="vehicle-glyph" data-adelante="${v.type === 'car' ? 'arriba' : 'derecha'}">
              <g transform="scale(${ESCALA_TIPO[v.type] ?? 1}) translate(${-TAMANO_GLIFO / 2} ${-TAMANO_GLIFO / 2})">
                <!-- Grupo propio para el pulso de "entregando": la rotación usa el atributo transform
                     de .vehicle-glyph y un transform CSS ahí la pisaría. -->
                <g class="glifo-pulso" style="--pulso: ${pulsoDe(v.type).toFixed(3)}">${vehicleIconMarkup}</g>
              </g>
            </g>

            <!-- Distintivo de avería (A1/A2/A3 con el color de su tipo), esquina superior derecha -->
            ${
              isBroken
                ? `<circle cx="8.2" cy="-8.2" r="5.8" fill="#ffffff" stroke="${breakdownColor}" stroke-width="1.5" />
                   <text x="8.2" y="-7.7" text-anchor="middle" dominant-baseline="middle"
                     font-family="system-ui, -apple-system, sans-serif" font-size="5.6" font-weight="800"
                     fill="${breakdownColor}">${breakdownBadge}</text>`
                : ''
            }
            <!-- Refrigerio: taza de café sobre un círculo ámbar, en la esquina superior izquierda -->
            ${
              !isBroken && isEnRefrigerio
                ? `<circle cx="-8.5" cy="-8.5" r="5.5" fill="#FBBF24" stroke="#ffffff" stroke-width="0.9" />
                   ${iconoRefrigerio}`
                : ''
            }

          </svg>
        `,
        iconSize: [44, 44],
        iconAnchor: [22, 22],
      });

      // Con decenas de unidades detenidas en un mismo almacén, el abanico de separación queda más
      // chico que el propio marcador: una incidencia o la selección quedaban tapadas por el resto.
      const zIndexOffset = isSelected ? 2000 : isBroken ? 1000 : 0;

      const fillRatio = v.capacity > 0 ? v.currentLoad / v.capacity : 0;
      const pct = Math.round(fillRatio * 100);
      const estadoTexto = isReturning ? 'Regresando al almacén' : ETIQUETA_ESTADO[v.status] ?? v.status;
      // Solo el tipo y cuánto tiempo no estará disponible: el detalle completo (tiempo en el sitio,
      // turno de retorno) está en su card del panel. Con todo junto la tooltip tapaba el mapa.
      // Solo el tipo ("Avería tipo 3"): la duración y el detalle están en la card del panel.
      // Avería pedida por el operador que el backend aplicará al cerrar el siguiente lote.
      const programada = v.status !== 'broken' ? averiasProgramadas[v.id] : undefined;
      const averiaTexto = v.status === 'broken'
        ? (breakdownType ? `Avería tipo ${breakdownType}` : 'Avería: tipo no informado')
        : '';
      // Las tooltips de Leaflet no parten líneas (white-space: nowrap): se limita el ancho y se
      // permite el salto de línea para que un texto largo no estire la tooltip sobre el mapa.
      const tooltipContent = `
        <div style="font-family: system-ui, -apple-system, sans-serif; font-size: 11px; line-height: 1.4; padding: 2px 4px; min-width: 145px; max-width: 200px; white-space: normal;">
          <div style="font-weight: 700; font-size: 12px; margin-bottom: 2px;">${v.code} · ${nombreTipo(v.type)}</div>
          <div><strong>Ocupación:</strong> ${v.currentLoad} / ${v.capacity} paq (${pct}%)</div>
          <div><strong>Estado:</strong> ${estadoTexto}</div>
          ${averiaTexto ? `<div style="margin-top:2px;color:${breakdownColor};"><strong>${averiaTexto}</strong></div>` : ''}
          ${programada ? `<div style="margin-top:2px;color:${BREAKDOWN_COLORS[programada.tipo]};"><strong>⏳ Avería tipo ${programada.tipo} programada</strong> · en segundos</div>` : ''}
        </div>
      `;

      let marker = markers.get(v.id);

      if (!marker) {
        marker = L.marker([v.position.y, v.position.x], { icon: vehicleIcon, zIndexOffset });
        tooltipQueCabe(marker, () => mapInstanceRef.current, { arriba: 14, abajo: 14 });
        marker.bindTooltip(tooltipContent, {
          direction: 'top',
          offset: [0, -14],
          opacity: 0.95,
        });
        // Clic derecho: menú para inducir una avería (pedido del profesor), en vez del menú del navegador.
        marker.on('contextmenu', (e: L.LeafletMouseEvent) => {
          L.DomEvent.stopPropagation(e);
          e.originalEvent.preventDefault();
          menuContextualRef.current?.(v.id, { x: e.containerPoint.x, y: e.containerPoint.y });
        });
        marker.on('click', (e: L.LeafletMouseEvent) => {
          L.DomEvent.stopPropagation(e);
          if (selectedVehicleId === v.id) {
            onSelectVehicle?.(null);
          } else {
            onSelectVehicle?.(v);
          }
        });
        marker.addTo(group);
        markers.set(v.id, marker);
      } else {
        // El icono se refresca siempre (color de semaforo, seleccion, averia pueden cambiar
        // aunque la posicion no cambie).
        if ((marker.getIcon().options as L.DivIconOptions).html !== vehicleIcon.options.html) {
          marker.setIcon(vehicleIcon);
        }
        marker.setZIndexOffset(zIndexOffset);
        marker.setTooltipContent(tooltipContent);
      }
    });
  }, [vehicles, routes, selectedVehicleId, isDarkTheme, orders, simMinutes, onSelectVehicle, cityWidth, cityHeight, averiasProgramadas]);

  // Suscripcion al motor de simulacion (engine/simulationEngine.ts): un callback por frame que
  // mueve los marcadores existentes segun la posicion ya interpolada que calcula el motor, y
  // refleja su flag `buffering` -- nunca recalcula nada aca, el componente es puro consumidor.
  // Montado una sola vez (deps []); el motor sigue corriendo (o pausado en segundo plano, ver
  // simulationEngine.ts) independientemente de si este efecto esta montado.
  useEffect(() => {
    let bufferingAnterior = true;
    const capa = vehiclesLayerGroupRef.current;

    const unsubscribe = simulationEngine.subscribe((snap) => {
      const groupedIds = new Set(snap.gruposDetenidos.flatMap((group) => group.ids));
      const activeGroups = new Set(snap.gruposDetenidos.map((group) => group.clave));
      for (const [key, groupMarker] of parkedMarkersRef.current) {
        if (!activeGroups.has(key)) {
          parkedLayerGroupRef.current.removeLayer(groupMarker);
          parkedMarkersRef.current.delete(key);
        }
      }
      for (const group of snap.gruposDetenidos) {
        const members = group.ids.map((id) => vehiclesRef.current.find((v) => v.id === id))
          .filter((v): v is Vehicle => Boolean(v));
        if (members.length < 2) continue;
        let groupMarker = parkedMarkersRef.current.get(group.clave);
        if (!groupMarker) {
          groupMarker = L.marker([group.punto.y, group.punto.x], {
            zIndexOffset: 1500,
            keyboard: true,
            // La bolita queda al lado del almacén, sin tapar su icono ni su tooltip.
            icon: L.divIcon({ className: 'parked-vehicles-marker', html: '', iconSize: [24, 24], iconAnchor: [-12, 28] }),
          });
          groupMarker.bindPopup('', { className: 'popup-grupo', maxWidth: 320, minWidth: 260, closeOnClick: false, autoClose: false });
          groupMarker.addTo(parkedLayerGroupRef.current);
          parkedMarkersRef.current.set(group.clave, groupMarker);
        }
        const brokenMembers = members.filter((m) => m.status === 'broken');
        const topBreakdownType = brokenMembers.reduce<number | undefined>(
          (max, m) => (m.breakdownType && (!max || m.breakdownType > max) ? m.breakdownType : max),
          undefined
        );
        const groupBorderColor = brokenMembers.length > 0
          ? (topBreakdownType ? BREAKDOWN_COLORS[topBreakdownType] : '#EF4444')
          : '#ffffff';
        const label = brokenMembers.length > 0
          ? `${members.length} vehículos detenidos (${brokenMembers.length} con avería)`
          : `${members.length} vehículos detenidos`;
        const html = `<div title="${label}" aria-label="${label}" style="transform:scale(var(--escala-grupo, 1));transform-origin:-12px 28px;position:relative;display:flex;align-items:center;justify-content:center;width:24px;height:24px;border-radius:50%;background:#1F3864;border:2.5px solid ${groupBorderColor};color:#ffffff;font:700 11px system-ui;box-shadow:0 2px 5px #0006;cursor:pointer">${members.length}${brokenMembers.length > 0 ? `<span style="position:absolute;top:-5px;right:-6px;background:${groupBorderColor};color:#fff;border-radius:999px;padding:0 3.5px;font:800 8px system-ui;line-height:12px;border:1px solid #fff">!${brokenMembers.length}</span>` : ''}</div>`;
        if ((groupMarker.getIcon().options as L.DivIconOptions).html !== html) {
          groupMarker.setIcon(L.divIcon({ className: 'parked-vehicles-marker', html, iconSize: [24, 24], iconAnchor: [-12, 28] }));
        }
        const groupPosition = groupMarker.getLatLng();
        if (groupPosition.lat !== group.punto.y || groupPosition.lng !== group.punto.x) {
          groupMarker.setLatLng([group.punto.y, group.punto.x]);
        }
        const signature = JSON.stringify([isDarkThemeRef.current, members.map((v) => [v.id, v.type, v.status, v.currentLoad, v.capacity, v.breakdownType])]);
        const popup = groupMarker.getPopup()!;
        const oldContent = popup.getContent();
        if (!(oldContent instanceof HTMLElement) || oldContent.dataset.signature !== signature) {
          const content = document.createElement('div');
          content.dataset.signature = signature;
          content.style.cssText = `font:12px system-ui;max-height:260px;overflow-y:auto;color:${isDarkThemeRef.current ? '#e2e8f0' : '#1e293b'}`;
          const title = document.createElement('strong');
          title.textContent = brokenMembers.length > 0
            ? `Vehículos detenidos (${members.length} · ${brokenMembers.length} averiado${brokenMembers.length > 1 ? 's' : ''})`
            : `Vehículos detenidos (${members.length})`;
          title.style.cssText = 'display:block;margin-bottom:8px';
          content.appendChild(title);
          for (const vehicle of members) {
            const button = document.createElement('button');
            button.type = 'button';
            const vTypeLabel = nombreTipo(vehicle.type);
            const bCfg = vehicle.status === 'broken' ? getBreakdownLevelConfig(vehicle.breakdownType) : null;
            const state = bCfg
              ? `${bCfg.code} · ${bCfg.label}`
              : vehicle.status === 'broken'
                ? 'Averiado'
                : ETIQUETA_ESTADO[vehicle.status];
            button.textContent = `${vehicle.code} · ${vTypeLabel} · ${state} · ${vehicle.currentLoad}/${vehicle.capacity} paq`;
            button.style.cssText = `display:block;width:100%;text-align:left;padding:8px;border:0;border-bottom:1px solid #64748b55;background:transparent;color:${bCfg ? bCfg.hex : 'inherit'};font-weight:${vehicle.status === 'broken' ? '700' : '400'};cursor:pointer;font-family:inherit;font-size:11.5px`;
            button.addEventListener('click', () => {
              const current = vehiclesRef.current.find((v) => v.id === vehicle.id);
              if (current) onSelectVehicleRef.current?.(current);
              mapInstanceRef.current?.closePopup();
            });
            content.appendChild(button);
          }
          popup.options.className = `popup-grupo ${isDarkThemeRef.current ? 'popup-grupo-oscuro' : ''}`;
          groupMarker.setPopupContent(content);
        }
      }
      for (const [id, marker] of vehicleMarkersRef.current) {
        const punto = snap.vehiclePositions.get(id);
        if (punto) {
          marker.setLatLng([punto.y, punto.x]);
        }
        // Rumbo: CRS.Simple tiene +y hacia arriba y el SVG rota en sentido horario, asi que el
        // angulo desde el norte se aplica tal cual. Detenido conserva el ultimo rumbo, atenuado.
        const rumbo = snap.vehicleHeadings?.get(id);
        const glifo = marker.getElement()?.querySelector<SVGGElement>('.vehicle-glyph');
        if (glifo && rumbo !== undefined) {
          const r = Math.round(rumbo);
          // Un icono de perfil se refleja al ir hacia el oeste en vez de quedar de cabeza.
          const transform = glifo.dataset.adelante === 'arriba'
            ? `rotate(${r})`
            : r >= 0 && r <= 180
              ? `rotate(${r - 90})`
              : `rotate(${r + 90}) scale(-1 1)`;
          if (glifo.getAttribute('transform') !== transform) glifo.setAttribute('transform', transform);
        }
        const flecha = marker.getElement()?.querySelector<SVGGElement>('.vehicle-heading');
        if (flecha) {
          const estado = rumbo === undefined
            ? 'oculto'
            : `${Math.round(rumbo)}|${snap.vehiclesMoving?.has(id) ? 1 : 0}`;
          if (flecha.dataset.estado !== estado) {
            flecha.dataset.estado = estado;
            if (rumbo === undefined) {
              flecha.setAttribute('display', 'none');
            } else {
              flecha.setAttribute('display', 'inline');
              flecha.setAttribute('transform', `rotate(${Math.round(rumbo)})`);
              flecha.setAttribute('opacity', snap.vehiclesMoving?.has(id) ? '1' : '0.45');
            }
          }
        }
        if (groupedIds.has(id)) {
          if (capa.hasLayer(marker)) capa.removeLayer(marker);
        } else if (!capa.hasLayer(marker)) capa.addLayer(marker);

        const routeLine = routeLinesRef.current.get(id);
        const ruta = simulationEngine.getRutaVisible(id);
        if (routeLine && ruta && ruta.length > 1) {
          const manhattanRuta = normalizeManhattanPath(ruta);
          const key = routeLineKey(manhattanRuta);
          if (routeLineKeysRef.current.get(id) !== key) {
            routeLineKeysRef.current.set(id, key);
            routeLine.setLatLngs(manhattanRuta.map((p) => [p.y, p.x] as [number, number]));
          }
          // Se reaplica cada frame: cambia al hacer zoom, y setStyle lo borra del elemento.
          const dashArray = routeLine.options.dashArray;
          const map = mapInstanceRef.current;
          if (typeof dashArray === 'string' && map) {
            const offset = fixedDashOffset(manhattanRuta, map.getZoomScale(map.getZoom(), 0), dashArray);
            const offsetAttr = offset === null ? null : offset.toFixed(2);
            const element = routeLine.getElement();
            if (element && offsetAttr !== null && element.getAttribute('stroke-dashoffset') !== offsetAttr) {
              element.setAttribute('stroke-dashoffset', offsetAttr);
            }
          } else {
            routeLine.getElement()?.removeAttribute('stroke-dashoffset');
          }
        }
      }
      if (snap.buffering !== bufferingAnterior) {
        bufferingAnterior = snap.buffering;
        setBuffering(snap.buffering);
      }
    });

    return () => {
      unsubscribe();
    };
  }, []);

  return (
    <div className={`relative z-0 isolate w-full h-full overflow-hidden select-none ${className}`}>
      {/* Contenedor del Mapa Leaflet con fondo y estilo exacto a la Malla SVG y stacking context aislado z-0 */}
      <div
        ref={mapContainerRef}
        className="w-full h-full relative z-0"
        style={{
          backgroundColor: isDarkTheme ? '#0B111E' : '#F5F6F8',
        }}
      />
      {buffering && (
        <div
          className="absolute inset-0 z-1000 flex flex-col items-center justify-center gap-3"
          style={{ backgroundColor: isDarkTheme ? 'rgba(11,17,30,0.92)' : 'rgba(245,246,248,0.92)' }}
        >
          <div
            className="h-10 w-10 animate-spin rounded-full border-4 border-t-transparent"
            style={{ borderColor: isDarkTheme ? '#38bdf8' : '#1F3864', borderTopColor: 'transparent' }}
          />
          <p className={`text-sm font-medium ${isDarkTheme ? 'text-slate-200' : 'text-slate-700'}`}>
            Cargando simulación...
          </p>
        </div>
      )}
    </div>
  );
};