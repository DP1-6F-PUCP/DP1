import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { CarFront, Bike as Bicycle, MapPin } from 'lucide-react';
import { FaMotorcycle } from 'react-icons/fa';
import { renderToStaticMarkup } from 'react-dom/server';
import { Warehouse, Vehicle, BlockedStreet, Order, Route } from '../../types';
import { GRID_WIDTH_KM, GRID_HEIGHT_KM, normalizeManhattanPath } from '../../utils/manhattan';
import { getVehicleSemaforoStatus } from '../../utils/vehicleStatus';
import { useSemaforoStore } from '../../store/semaforoStore';
import { simulationEngine } from '../../engine/simulationEngine';

const getVehicleLoadStatus = (vehicle: Vehicle) => {
  const fillRatio = vehicle.capacity > 0 ? vehicle.currentLoad / vehicle.capacity : 0;

  if (fillRatio >= 0.66) {
    return { hex: '#16A34A', label: 'capacidad alta' };
  }
  if (fillRatio >= 0.33) {
    return { hex: '#EAB308', label: 'capacidad media' };
  }
  return { hex: '#DC2626', label: 'pocos productos' };
};

const ETIQUETA_ESTADO: Record<string, string> = {
  idle: 'Inactivo',
  en_route: 'En ruta',
  delivering: 'Entregando',
  on_break: 'Refrigerio',
  broken: 'Averiado',
  maintenance: 'Mantenimiento',
};

const getVehicleIconMarkup = (vehicle: Vehicle) => {
  const iconProps = {
    size: 15,
    strokeWidth: 2.3,
    color: '#ffffff',
    'aria-hidden': true,
  } as const;

  if (vehicle.type === 'bicycle') {
    return renderToStaticMarkup(<Bicycle {...iconProps} />);
  }
  if (vehicle.type === 'motorcycle') {
    return renderToStaticMarkup(<FaMotorcycle {...iconProps} />);
  }
  return renderToStaticMarkup(<CarFront {...iconProps} />);
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
  const umbralesSemaforo = useSemaforoStore((s) => s.umbrales);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);

  // Layer groups matching SVG layer structure
  const gridLayerGroupRef = useRef<L.LayerGroup>(L.layerGroup());
  const blockedLayerGroupRef = useRef<L.LayerGroup>(L.layerGroup());
  const routesLayerGroupRef = useRef<L.LayerGroup>(L.layerGroup());
  const ordersLayerGroupRef = useRef<L.LayerGroup>(L.layerGroup());
  const warehousesLayerGroupRef = useRef<L.LayerGroup>(L.layerGroup());
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
  const vehiclesRef = useRef<Vehicle[]>(vehicles);
  const onSelectVehicleRef = useRef(onSelectVehicle);
  const isDarkThemeRef = useRef(isDarkTheme);
  useEffect(() => {
    vehiclesRef.current = vehicles;
    onSelectVehicleRef.current = onSelectVehicle;
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
      zoomControl: true,
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
    warehousesLayerGroupRef.current.addTo(map);
    vehiclesLayerGroupRef.current.addTo(map);

    // Ajuste a la grilla completa, sin animacion (ver opciones del mapa). Un pequeño margen evita
    // que los marcadores del borde (x=70, y=50) queden cortados a la mitad.
    const ajustar = () => {
      const m = mapInstanceRef.current;
      if (!m) return;
      m.invalidateSize({ animate: false });
      m.fitBounds(bounds, { padding: [12, 12], animate: false });
    };
    ajustar();

    // Ensure map bounds are maximized on next tick
    const fitTimer = setTimeout(ajustar, 60);

    // Resize observer to always adapt fixed map to container changes
    const resizeObserver = new ResizeObserver(ajustar);
    resizeObserver.observe(mapContainerRef.current);

    return () => {
      clearTimeout(fitTimer);
      resizeObserver.disconnect();
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
  }, [showBlockedStreets, blockedStreets, selectedBlockId, onSelectBlock]);

  // 4. Render order destinations
  useEffect(() => {
    const group = ordersLayerGroupRef.current;
    group.clearLayers();

    if (!showOrders) return;

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

    orders.forEach((order) => {
      const isSelected = selectedOrderId === order.id;
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

      const html = isSelected
        ? `<div style="position: relative; width: 44px; height: 48px; display: flex; align-items: center; justify-content: center; cursor: pointer;">
            <div style="position: absolute; width: 38px; height: 38px; border-radius: 50%; background: #38bdf8; opacity: 0.35; filter: blur(2px);"></div>
            <div style="position: absolute; width: 42px; height: 42px; border-radius: 50%; border: 2px dashed #38bdf8;"></div>
            <div style="position: relative; z-index: 2; display: flex; align-items: center; justify-content: center; filter: drop-shadow(0 4px 6px rgba(0,0,0,0.5));">
              ${pinMarkup}
            </div>
          </div>`
        : `<div style="cursor: pointer; display: flex; align-items: center; justify-content: center; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.4));">
            ${pinMarkup}
          </div>`;

      const marker = L.marker([order.destination.y, order.destination.x], {
        icon: L.divIcon({
          className: 'order-destination-marker',
          html,
          iconSize: isSelected ? [44, 48] : [28, 28],
          iconAnchor: isSelected ? [22, 40] : [14, 28],
        }),
        zIndexOffset: isSelected ? 3000 : 100,
      });

      marker.bindTooltip(
        `<strong>${order.code}</strong><br />${order.clientId || 'Cliente no informado'}<br />${statusLabels[order.status]}<br />(${order.destination.x}, ${order.destination.y})`,
        {
          direction: 'top',
          offset: [0, isSelected ? -36 : -28],
          opacity: 0.95,
        }
      );

      marker.on('click', (e: L.LeafletMouseEvent) => {
        L.DomEvent.stopPropagation(e);
        if (selectedOrderId === order.id) {
          onSelectOrder?.(null);
        } else {
          onSelectOrder?.(order);
        }
      });

      marker.addTo(group);
    });
  }, [orders, showOrders, selectedOrderId, onSelectOrder]);

  // 4. Render projected routes for every vehicle
  //
  // Dos casos:
  //  - Vehiculo en camino a entregar un pedido: ruta activa (in_progress) -> geometria de
  //    activeRoute.waypoints, en azul.
  //  - Vehiculo regresando a un almacen: la Ruta ya quedo FINALIZADA, asi que no hay ruta activa;
  //    se usa Vehicle.returnPath (VehiculoDTO.geometriaRetorno), en ambar y mas punteado.
  //
  // El fallback directo solo cubre estados sin geometria.
  useEffect(() => {
    const group = routesLayerGroupRef.current;
    group.clearLayers();
    routeLinesRef.current.clear();

    if (!showProjectedRoutes) return;

    vehicles.forEach((vehicle) => {
      if (vehicle.status !== 'en_route') return;

      const isSelected = selectedVehicleId === vehicle.id;
      const activeRoute = routes.find(
        (route) =>
          route.vehicleId === vehicle.id &&
          route.status === 'in_progress'
      );

      const deliveryPath = activeRoute?.waypoints ?? [];
      const returnPath = vehicle.returnPath ?? [];
      const isReturning = deliveryPath.length < 2 && returnPath.length > 1;
      const geometry = deliveryPath.length > 1 ? deliveryPath : isReturning ? returnPath : [];
      const fallbackDestination = vehicle.destination;
      const routePath = geometry.length > 1
        ? geometry
        : fallbackDestination
          ? normalizeManhattanPath([vehicle.position, fallbackDestination])
          : [];

      if (routePath.length <= 1) return;

      // La ruta seleccionada se resalta; el regreso conserva su semántica con un tono violeta.
      const accent = isSelected
        ? isReturning
          ? '#c084fc'
          : '#38bdf8'
        : isReturning
          ? '#f59e0b'
          : '#64748b';

      const destinationPath = normalizeManhattanPath(
        routePath[0]?.x === vehicle.position.x && routePath[0].y === vehicle.position.y
          ? routePath
          : [vehicle.position, ...routePath]
      );
      // El motor puede devolver un punto interpolado seguido de un nodo de otro
      // segmento (por ejemplo, al cambiar de lote). Normalizar la linea final
      // evita que Leaflet una esos puntos con una diagonal.
      const manhattanDestinationPath = normalizeManhattanPath(destinationPath);
      const routeLine = L.polyline(
        manhattanDestinationPath.map((point) => [point.y, point.x] as [number, number]),
        {
          color: accent,
          weight: isSelected ? 4 : 2.5,
          opacity: isSelected ? 0.9 : 0.55,
          dashArray: isReturning ? '2, 8' : isSelected ? undefined : '6, 8',
          lineCap: 'round',
          lineJoin: 'round',
          interactive: false,
        }
      ).addTo(group);
      routeLinesRef.current.set(vehicle.id, routeLine);
    });
  }, [showProjectedRoutes, vehicles, routes, selectedVehicleId]);

  // 5. Render Warehouses (tooltip on hover, left inspector popup on click)
  useEffect(() => {
    const group = warehousesLayerGroupRef.current;
    group.clearLayers();

    warehouses.forEach((w) => {
      const isSelected = selectedWarehouseId === w.id;
      const isInfinite = !Number.isFinite(w.capacity);
      // w.occupancyPct viene de AlmacenDTO.nivelOcupacion (el backend ya lo calcula) -- antes se
      // recalculaba aqui mismo con currentStock/capacity, una formula paralela que podia divergir
      // de la real si alguna vez cambia el criterio del backend (p. ej. redondeo).
      const pct = Math.round(w.occupancyPct);
      const isDanger = !isInfinite && pct > 85;

      const borderColor = isSelected ? '#38bdf8' : isDanger ? '#ef4444' : w.color;
      const baseFill = isDarkTheme ? '#0f172a' : '#ffffff';

      // Exact replica of the SVG Warehouse Building Icon
      const warehouseIcon = L.divIcon({
        className: 'svg-style-warehouse-marker',
        html: `
          <svg
            width="24"
            height="24"
            viewBox="-1.8 -1.8 3.6 3.6"
            style="cursor: pointer; filter: drop-shadow(0 2px 5px rgba(0,0,0,0.3)); display: block;"
          >
            <!-- Warehouse Base Card -->
            <rect
              x="-1.5"
              y="-1.5"
              width="3"
              height="3"
              rx="0.6"
              fill="${baseFill}"
              stroke="${borderColor}"
              stroke-width="${isSelected ? '0.32' : '0.2'}"
            />
            <!-- Hub Icon Graphic -->
            <rect
              x="-1"
              y="-1"
              width="2"
              height="2"
              rx="0.35"
              fill="${w.color}"
              fill-opacity="0.2"
            />
            <path
              d="M -0.75 0.5 L -0.75 -0.4 L 0 -0.85 L 0.75 -0.4 L 0.75 0.5 Z"
              fill="${w.color}"
            />
            <rect x="-0.25" y="0.05" width="0.5" height="0.45" fill="#ffffff" />
          </svg>
        `,
        iconSize: [24, 24],
        iconAnchor: [12, 12],
      });

      const marker = L.marker([w.coords.y, w.coords.x], { icon: warehouseIcon });
      const tooltipContent = isInfinite
        ? '<div style="font-family: system-ui, -apple-system, sans-serif; font-size: 11px; line-height: 1.4; padding: 2px 4px;"><strong>Stock:</strong> ilimitado</div>'
        : `
          <div style="font-family: system-ui, -apple-system, sans-serif; font-size: 11px; line-height: 1.4; padding: 2px 4px; min-width: 120px;">
            <div style="font-weight: 700; font-size: 12px; margin-bottom: 2px;">${w.name}</div>
            <div><strong>Stock:</strong> ${w.currentStock} / ${w.capacity} paq</div>
            <div><strong>Ocupación:</strong> ${pct}%</div>
            <div><strong>En tránsito:</strong> ${w.inTransit} paq</div>
          </div>
        `;
      marker.bindTooltip(tooltipContent, {
        direction: 'top',
        offset: [0, -14],
        opacity: 0.95,
      });

      marker.on('click', (e: L.LeafletMouseEvent) => {
        L.DomEvent.stopPropagation(e);
        if (selectedWarehouseId === w.id) {
          onSelectWarehouse?.(null);
        } else {
          onSelectWarehouse?.(w);
        }
      });

      marker.addTo(group);
    });
  }, [warehouses, selectedWarehouseId, isDarkTheme, onSelectWarehouse]);

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
      const semaforo = getVehicleSemaforoStatus(v, orders, simMinutes, umbralesSemaforo);
      const loadStatus = getVehicleLoadStatus(v);
      const isDelayedOrBroken = semaforo.state === 'delayed' || v.status === 'broken';
      const activeRoute = routes.find(
        (route) => route.vehicleId === v.id && route.status === 'in_progress'
      );
      const isReturning =
        v.status === 'en_route' &&
        (activeRoute?.waypoints?.length ?? 0) < 2 &&
        (v.returnPath?.length ?? 0) > 1;
      // Bug real reportado: un vehiculo en refrigerio (VehiculoDTO.actividad=EN_REFRIGERIO) se
      // veia en el mapa IDENTICO a uno viajando normalmente -- el semaforo solo mira riesgo de
      // SLA, y el badge con la etiqueta "En refrigerio" vive en el panel lateral, no en el mapa.
      // Color propio (no reutiliza ninguno de los 4 del semaforo) + icono de pausa, agregado a la
      // leyenda (ver MapLegend).
      const isEnRefrigerio = v.status === 'on_break';

      // El color del círculo comunica la carga disponible; la selección se mantiene con el aro
      // exterior y los estados operativos con sus acentos para no ocultar esta información.
      const bubbleFill = isReturning ? '#6B7280' : loadStatus.hex;
      const vehicleIconMarkup = getVehicleIconMarkup(v);

      const vehicleIcon = L.divIcon({
        className: 'svg-style-vehicle-marker',
        html: `
          <svg
            width="44"
            height="46"
            viewBox="-22 -22 44 46"
            style="overflow: visible; cursor: pointer; display: block;"
          >
            <title>${v.code}: ${v.currentLoad}/${v.capacity} paquetes, ${loadStatus.label}</title>
            <!-- Selection Indicator Ring -->
            ${
              isSelected
                ? `<circle
                    cx="0"
                    cy="0"
                    r="14"
                    fill="none"
                    stroke="${isDarkTheme ? '#38bdf8' : '#1F3864'}"
                    stroke-width="1.8"
                    stroke-dasharray="3, 2"
                  />`
                : ''
            }

            <!-- Status halo for delayed or broken vehicles -->
            ${
              isDelayedOrBroken
                ? `<circle
                    cx="0"
                    cy="0"
                    r="10"
                    fill="#C62828"
                    fill-opacity="0.35"
                  />`
                : ''
            }

            <!-- Vehicle Body Bubble centered exactly at (0, 0) -->
            <circle
              cx="0"
              cy="0"
              r="10.5"
              fill="${bubbleFill}"
              stroke="#ffffff"
              stroke-width="1.7"
            />

            <!-- Vehicle icon inside the capacity circle -->
            <g transform="translate(-7.5 -7.5)">
              ${vehicleIconMarkup}
            </g>

            <!-- Geometric accent for delayed / broken -->
            ${
              isDelayedOrBroken
                ? `<rect
                    x="-1.8"
                    y="-1.8"
                    width="3.6"
                    height="3.6"
                    rx="0.4"
                    fill="#ffffff"
                    transform="rotate(45)"
                  />`
                : ''
            }

            <!-- Icono de pausa para refrigerio (dos barras verticales) -->
            ${
              !isDelayedOrBroken && isEnRefrigerio
                ? `<rect x="-2" y="-2" width="1.4" height="4" rx="0.3" fill="#ffffff" />
                   <rect x="0.6" y="-2" width="1.4" height="4" rx="0.3" fill="#ffffff" />`
                : ''
            }

          </svg>
        `,
        iconSize: [44, 44],
        iconAnchor: [22, 22],
      });

      // Con decenas de unidades detenidas en un mismo almacén, el abanico de separación queda más
      // chico que el propio marcador: una incidencia o la selección quedaban tapadas por el resto.
      const zIndexOffset = isSelected ? 2000 : isDelayedOrBroken ? 1000 : 0;

      const fillRatio = v.capacity > 0 ? v.currentLoad / v.capacity : 0;
      const pct = Math.round(fillRatio * 100);
      const estadoTexto = isReturning ? 'Regresando al almacén' : ETIQUETA_ESTADO[v.status] ?? v.status;
      const tooltipContent = `
        <div style="font-family: system-ui, -apple-system, sans-serif; font-size: 11px; line-height: 1.4; padding: 2px 4px; min-width: 120px;">
          <div style="font-weight: 700; font-size: 12px; margin-bottom: 2px;">${v.code}</div>
          <div><strong>Ocupación:</strong> ${v.currentLoad} / ${v.capacity} paq (${pct}%)</div>
          <div><strong>Estado:</strong> ${estadoTexto}</div>
        </div>
      `;

      let marker = markers.get(v.id);

      if (!marker) {
        marker = L.marker([v.position.y, v.position.x], { icon: vehicleIcon, zIndexOffset });
        marker.bindTooltip(tooltipContent, {
          direction: 'top',
          offset: [0, -14],
          opacity: 0.95,
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
        marker.setIcon(vehicleIcon);
        marker.setZIndexOffset(zIndexOffset);
        marker.setTooltipContent(tooltipContent);
      }
    });
  }, [vehicles, routes, selectedVehicleId, isDarkTheme, orders, simMinutes, onSelectVehicle, umbralesSemaforo]);

  // Suscripcion al motor de simulacion (engine/simulationEngine.ts): un callback por frame que
  // mueve los marcadores existentes segun la posicion ya interpolada que calcula el motor, y
  // refleja su flag `buffering` -- nunca recalcula nada aca, el componente es puro consumidor.
  // Montado una sola vez (deps []); el motor sigue corriendo (o pausado en segundo plano, ver
  // simulationEngine.ts) independientemente de si este efecto esta montado.
  useEffect(() => {
    let bufferingAnterior = true;
    const capa = vehiclesLayerGroupRef.current;

    const unsubscribe = simulationEngine.subscribe((snap) => {
      for (const [id, marker] of vehicleMarkersRef.current) {
        const punto = snap.vehiclePositions.get(id);
        if (punto) {
          marker.setLatLng([punto.y, punto.x]);
        }
        if (!capa.hasLayer(marker)) capa.addLayer(marker);

        const routeLine = routeLinesRef.current.get(id);
        const ruta = simulationEngine.getRutaVisible(id);
        if (routeLine && ruta && ruta.length > 1) {
          const manhattanRuta = normalizeManhattanPath(ruta);
          routeLine.setLatLngs(manhattanRuta.map((p) => [p.y, p.x] as [number, number]));
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