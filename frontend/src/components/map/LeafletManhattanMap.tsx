import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { Warehouse, Vehicle, BlockedStreet, Order, Route } from '../../types';
import { GRID_WIDTH_KM, GRID_HEIGHT_KM, normalizeManhattanPath } from '../../utils/manhattan';
import { getVehicleSemaforoStatus } from '../../utils/vehicleStatus';
import { useSemaforoStore } from '../../store/semaforoStore';
import { simulationEngine } from '../../engine/simulationEngine';

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
  onSelectVehicle?: (vehicle: Vehicle | null) => void;
  onSelectWarehouse?: (warehouse: Warehouse | null) => void;
  onSelectBlock?: (block: BlockedStreet | null) => void;
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
  onSelectVehicle,
  onSelectWarehouse,
  onSelectBlock,
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
  // Linea de ruta del vehiculo seleccionado (feature de un teammate, portada aqui sobre el motor
  // centralizado) -- ver el efecto de suscripcion mas abajo y simulationEngine.getRutaVisible.
  const selectedRouteLineRef = useRef<L.Polyline | null>(null);
  // Marcadores del destino (anillo, punto y etiqueta) -- se mueven junto con el final de la linea.
  const selectedRouteEndMarkersRef = useRef<Array<L.Marker | L.CircleMarker>>([]);
  const selectedVehicleIdRef = useRef<string | null>(selectedVehicleId);
  selectedVehicleIdRef.current = selectedVehicleId;
  // Marcador con contador por cada punto con 2+ vehiculos detenidos (ver el efecto de
  // suscripcion). Sus miembros se sacan de la capa mientras estan agrupados.
  const groupMarkersRef = useRef<Map<string, { marker: L.Marker; firma: string; ids: string[] }>>(new Map());
  const vehiclesRef = useRef<Vehicle[]>(vehicles);
  const onSelectVehicleRef = useRef(onSelectVehicle);
  const isDarkThemeRef = useRef(isDarkTheme);
  const warehousesRef = useRef<Warehouse[]>(warehouses);
  useEffect(() => {
    warehousesRef.current = warehouses;
    vehiclesRef.current = vehicles;
    onSelectVehicleRef.current = onSelectVehicle;
    isDarkThemeRef.current = isDarkTheme;
  }, [vehicles, onSelectVehicle, isDarkTheme, warehouses]);

  // 1. Initialize Leaflet Map with L.CRS.Simple - Fixed, non-zoomable, adapted to max screen
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
      zoomControl: false,
      scrollWheelZoom: false,
      doubleClickZoom: false,
      touchZoom: false,
      boxZoom: false,
      keyboard: false,
      dragging: false, // fixed position, perfectly centered
      zoomSnap: 0, // fractional zoom to fill 100% of container
      zoomDelta: 0.1,
      // Bug real reportado ("el mapa sobrepasa la dimension de la pantalla", reproducido con Chrome
      // headless): fitBounds animado competia con invalidateSize en cada cambio de tamaño del
      // contenedor y el zoom final quedaba calculado para un tamaño viejo -- unas veces la grilla
      // se salia del contenedor, otras quedaba chica. El mapa es fijo (sin zoom ni arrastre del
      // usuario), asi que las animaciones no aportan nada: sin ellas el ajuste es inmediato y
      // determinista.
      zoomAnimation: false,
      fadeAnimation: false,
      markerZoomAnimation: false,
    });

    mapInstanceRef.current = map;

    // Clicking anywhere on map clears selection
    map.on('click', () => {
      onSelectVehicle?.(null);
      onSelectWarehouse?.(null);
      onSelectBlock?.(null);
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

  // 4. Render Projected Routes (Only shown when a vehicle is selected)
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
    selectedRouteLineRef.current = null;
    selectedRouteEndMarkersRef.current = [];

    if (!showProjectedRoutes) return;
    if (!selectedVehicleId) return;

    const selectedVehicle = vehicles.find((v) => v.id === selectedVehicleId);
    if (!selectedVehicle) return;

    // Mientras entrega no se muestra su siguiente ruta
    if (selectedVehicle.status === 'delivering') return;

    const isBroken = selectedVehicle.status === 'broken';
    const activeRoute = routes.find(
      (route) =>
        route.vehicleId === selectedVehicle.id &&
        route.status === 'in_progress'
    );

    // Camino hacia un pedido (ruta activa) o de regreso a un almacén (sin ruta activa)
    const deliveryPath = activeRoute?.waypoints ?? [];
    const returnPath = selectedVehicle.returnPath ?? [];
    const isReturning = deliveryPath.length < 2 && returnPath.length > 1;

    const geometry = deliveryPath.length > 1
      ? deliveryPath
      : isReturning
        ? returnPath
        : [];

    const fallbackDestination = selectedVehicle.destination;
    const routePath = geometry.length > 1
      ? geometry
      : fallbackDestination
        ? normalizeManhattanPath([selectedVehicle.position, fallbackDestination])
        : [];

    if (routePath.length > 1) {
      // Azul = hacia pedido, ámbar = hacia almacén, gris/rojo = averiado
      const accent = isBroken ? '#94a3b8' : isReturning ? '#f59e0b' : '#38bdf8';
      const ringAccent = isBroken ? '#ef4444' : accent;

      // La linea sale del motor (simulationEngine.getRutaVisible): continua desde la posicion
      // interpolada del marcador, por los tramos en cola, hasta el destino planificado. La
      // geometria de las props queda solo como respaldo si el motor aun no tiene tramos.
      const desdeMotor = simulationEngine.getRutaVisible(selectedVehicle.id);
      const destinationPath = desdeMotor && desdeMotor.length > 1
        ? desdeMotor
        : normalizeManhattanPath(
            routePath[0]?.x === selectedVehicle.position.x && routePath[0].y === selectedVehicle.position.y
              ? routePath
              : [selectedVehicle.position, ...routePath]
          );
      const destination = destinationPath[destinationPath.length - 1];

      const routeLine = L.polyline(
        destinationPath.map((point) => [point.y, point.x] as [number, number]),
        {
          color: accent,
          weight: 2.5,
          opacity: 0.9,
          dashArray: isReturning ? '2, 8' : '6, 8', // el regreso se ve más punteado
          lineCap: 'round',
          lineJoin: 'round',
          interactive: false,
        }
      ).addTo(group);
      selectedRouteLineRef.current = routeLine;

      // Outer dashed ring
      const anillo = L.circleMarker([destination.y, destination.x], {
        radius: 7,
        color: ringAccent,
        weight: 1.5,
        dashArray: '3, 2',
        fill: false,
        interactive: false,
      }).addTo(group);

      // Inner solid circle
      const punto = L.circleMarker([destination.y, destination.x], {
        radius: 3.5,
        color: '#ffffff',
        weight: 1,
        fillColor: ringAccent,
        fillOpacity: 1,
        interactive: false,
      }).addTo(group);

      // Bug real reportado (captura: confundia este circulo con la posicion del vehiculo --
      // "me marca el punto azul donde supuestamente deberia estar"): sin ningun texto, este
      // circulo (que marca hacia DONDE VA el vehiculo, no donde esta -- legitimo que quede lejos
      // para uno en refrigerio/entregando a mitad de ruta) es indistinguible a simple vista entre
      // muchos iconos de vehiculo parecidos. Etiqueta chica para que quede inequivoco.
      const etiqueta = L.marker([destination.y, destination.x], {
        icon: L.divIcon({
          className: 'destino-seleccionado-label',
          html: `
            <div style="
              transform: translate(10px, -8px);
              white-space: nowrap;
              font-size: 9px;
              font-family: monospace;
              font-weight: bold;
              color: ${isBroken ? '#ef4444' : '#38bdf8'};
              background: rgba(15,23,42,0.85);
              padding: 1px 4px;
              border-radius: 3px;
              pointer-events: none;
            ">Destino</div>
          `,
          iconSize: [0, 0],
        }),
        interactive: false,
      }).addTo(group);
      selectedRouteEndMarkersRef.current = [anillo, punto, etiqueta];
    }
  }, [showProjectedRoutes, vehicles, routes, selectedVehicleId]);

  // 5. Render Warehouses (No balloon popups - triggers left inspector popup on click)
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
      const isDelayedOrBroken = semaforo.state === 'delayed' || v.status === 'broken';
      // Bug real reportado: un vehiculo en refrigerio (VehiculoDTO.actividad=EN_REFRIGERIO) se
      // veia en el mapa IDENTICO a uno viajando normalmente -- el semaforo solo mira riesgo de
      // SLA, y el badge con la etiqueta "En refrigerio" vive en el panel lateral, no en el mapa.
      // Color propio (no reutiliza ninguno de los 4 del semaforo) + icono de pausa, agregado a la
      // leyenda (ver MapLegend).
      const isEnRefrigerio = v.status === 'on_break';

      // Color de la burbuja según semáforo oficial (rojo para avería/retraso, teal para
      // refrigerio, azul de selección, o color de semáforo)
      const bubbleFill = isDelayedOrBroken
        ? '#C62828'
        : isEnRefrigerio
        ? '#0D9488'
        : isSelected
        ? isDarkTheme
          ? '#38bdf8'
          : '#1F3864'
        : semaforo.hex;

      const vehicleIcon = L.divIcon({
        className: 'svg-style-vehicle-marker',
        html: `
          <svg
            width="32"
            height="36"
            viewBox="-16 -16 32 36"
            style="overflow: visible; cursor: pointer; display: block;"
          >
            <!-- Selection Indicator Ring -->
            ${
              isSelected
                ? `<circle
                    cx="0"
                    cy="0"
                    r="10"
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
                    r="8.5"
                    fill="#C62828"
                    fill-opacity="0.35"
                  />`
                : ''
            }

            <!-- Vehicle Body Bubble centered exactly at (0, 0) -->
            <circle
              cx="0"
              cy="0"
              r="5.5"
              fill="${bubbleFill}"
              stroke="#ffffff"
              stroke-width="1.5"
            />

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

            <!-- Vehicle Code Badge placed cleanly below the circle -->
            <rect
              x="-13"
              y="7.5"
              width="26"
              height="10.5"
              rx="3"
              fill="${isDarkTheme ? 'rgba(15,23,42,0.92)' : 'rgba(255,255,255,0.95)'}"
              stroke="${isDarkTheme ? '#334155' : '#cbd5e1'}"
              stroke-width="0.8"
            />
            <text
              x="0"
              y="15.5"
              text-anchor="middle"
              font-size="7.5"
              font-family="monospace"
              font-weight="bold"
              fill="${isDarkTheme ? '#f8fafc' : '#0f172a'}"
            >${v.code}</text>
          </svg>
        `,
        iconSize: [32, 36],
        iconAnchor: [16, 16],
      });

      // Con decenas de unidades detenidas en un mismo almacén, el abanico de separación queda más
      // chico que el propio marcador: una incidencia o la selección quedaban tapadas por el resto.
      const zIndexOffset = isSelected ? 2000 : isDelayedOrBroken ? 1000 : 0;

      let marker = markers.get(v.id);

      if (!marker) {
        marker = L.marker([v.position.y, v.position.x], { icon: vehicleIcon, zIndexOffset });
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
      }
    });
  }, [vehicles, selectedVehicleId, isDarkTheme, orders, simMinutes, onSelectVehicle, umbralesSemaforo]);

  // Suscripcion al motor de simulacion (engine/simulationEngine.ts): un callback por frame que
  // mueve los marcadores existentes segun la posicion ya interpolada que calcula el motor, y
  // refleja su flag `buffering` -- nunca recalcula nada aca, el componente es puro consumidor.
  // Montado una sola vez (deps []); el motor sigue corriendo (o pausado en segundo plano, ver
  // simulationEngine.ts) independientemente de si este efecto esta montado.
  //
  // Para el vehiculo seleccionado tambien redibuja su linea de ruta (simulationEngine.getRutaVisible:
  // lo que le falta recorrer de su trayectoria real + su camino planificado) y mueve el marcador
  // de destino al final de esa linea -- feature de un teammate, portada sobre el motor.
  useEffect(() => {
    let bufferingAnterior = true;
    const capa = vehiclesLayerGroupRef.current;

    const ETIQUETA_ESTADO: Record<string, string> = {
      idle: 'Inactivo',
      en_route: 'En ruta',
      delivering: 'Entregando',
      on_break: 'Refrigerio',
      broken: 'Averiado',
      maintenance: 'Mantenimiento',
    };

    const abrirListaGrupo = (clave: string, punto: { x: number; y: number }) => {
      const map = mapInstanceRef.current;
      const entrada = groupMarkersRef.current.get(clave);
      if (!map || !entrada) return;
      const oscuro = isDarkThemeRef.current;
      const porId = new Map(vehiclesRef.current.map((v) => [v.id, v]));
      const miembros = entrada.ids
        .map((id) => porId.get(id))
        .filter((v): v is Vehicle => v != null)
        .sort((a, b) => a.code.localeCompare(b.code));

      const raiz = document.createElement('div');
      raiz.style.cssText = `min-width:180px;font-family:system-ui,sans-serif;color:${oscuro ? '#e2e8f0' : '#0f172a'}`;
      const titulo = document.createElement('div');
      titulo.textContent = `${miembros.length} vehículos detenidos en (${Math.round(punto.x)}, ${Math.round(punto.y)})`;
      titulo.style.cssText = 'font-size:12px;font-weight:700;margin-bottom:6px';
      raiz.appendChild(titulo);
      const lista = document.createElement('div');
      lista.style.cssText = 'max-height:220px;overflow-y:auto;display:flex;flex-direction:column;gap:2px';
      for (const v of miembros) {
        const incidencia = v.status === 'broken' || v.status === 'maintenance';
        const fila = document.createElement('button');
        fila.type = 'button';
        fila.style.cssText = `display:flex;justify-content:space-between;gap:12px;width:100%;padding:4px 6px;border:0;border-radius:6px;cursor:pointer;font-size:12px;text-align:left;background:${oscuro ? '#1e293b' : '#f1f5f9'};color:inherit`;
        const codigo = document.createElement('span');
        codigo.textContent = v.code;
        codigo.style.cssText = 'font-family:monospace;font-weight:700';
        const estado = document.createElement('span');
        estado.textContent = ETIQUETA_ESTADO[v.status] ?? v.status;
        estado.style.color = v.status === 'broken' ? '#ef4444' : incidencia ? '#f59e0b' : oscuro ? '#94a3b8' : '#64748b';
        fila.append(codigo, estado);
        fila.addEventListener('click', (e) => {
          e.stopPropagation();
          map.closePopup();
          onSelectVehicleRef.current?.(v);
        });
        lista.appendChild(fila);
      }
      raiz.appendChild(lista);
      L.popup({ closeButton: true, autoPan: false, className: oscuro ? 'popup-grupo popup-grupo-oscuro' : 'popup-grupo' })
        .setLatLng([punto.y, punto.x])
        .setContent(raiz)
        .openOn(map);
    };

    const actualizarMarcadorGrupo = (clave: string, punto: { x: number; y: number }, ids: string[]) => {
      const porId = new Map(vehiclesRef.current.map((v) => [v.id, v]));
      const averiados = ids.filter((id) => porId.get(id)?.status === 'broken').length;
      const oscuro = isDarkThemeRef.current;
      // En un almacén el contador va como insignia arriba a la derecha, para no tapar su ícono.
      const enAlmacen = warehousesRef.current.some(
        (w) => Math.abs(w.coords.x - punto.x) < 1e-3 && Math.abs(w.coords.y - punto.y) < 1e-3
      );
      const firma = `${ids.join(',')}|${averiados}|${oscuro}|${enAlmacen}`;
      let entrada = groupMarkersRef.current.get(clave);
      if (entrada && entrada.firma === firma) return;

      const relleno = averiados > 0 ? '#C62828' : oscuro ? '#334155' : '#475569';
      const icono = L.divIcon({
        className: 'svg-style-vehicle-marker',
        html: `
          <svg width="40" height="40" viewBox="-20 -20 40 40" style="overflow: visible; cursor: pointer; display: block;">
            ${averiados > 0 ? '<circle cx="0" cy="0" r="15" fill="#C62828" fill-opacity="0.35" />' : ''}
            <circle cx="0" cy="0" r="11" fill="${relleno}" stroke="#ffffff" stroke-width="1.8" />
            <text x="0" y="4" text-anchor="middle" font-size="${ids.length > 99 ? 8 : 10}" font-family="monospace"
              font-weight="bold" fill="#ffffff">${ids.length}</text>
          </svg>`,
        iconSize: [40, 40],
        iconAnchor: enAlmacen ? [2, 38] : [20, 20],
      });

      if (!entrada) {
        const marker = L.marker([punto.y, punto.x], { icon: icono, zIndexOffset: averiados > 0 ? 1000 : 500 });
        marker.bindTooltip('', { direction: 'top', offset: [0, -14] });
        marker.on('click', (e: L.LeafletMouseEvent) => {
          L.DomEvent.stopPropagation(e);
          abrirListaGrupo(clave, punto);
        });
        capa.addLayer(marker);
        entrada = { marker, firma, ids };
        groupMarkersRef.current.set(clave, entrada);
      } else {
        entrada.marker.setIcon(icono);
        entrada.marker.setZIndexOffset(averiados > 0 ? 1000 : 500);
        entrada.firma = firma;
        entrada.ids = ids;
      }
      entrada.marker.setTooltipContent(
        `${ids.length} vehículos detenidos${averiados > 0 ? ` · ${averiados} averiado${averiados > 1 ? 's' : ''}` : ''} — clic para ver`
      );
    };

    const unsubscribe = simulationEngine.subscribe((snap) => {
      // Vehiculos detenidos en un mismo punto (2+, sin contar el seleccionado, que siempre se ve
      // solo): un marcador con contador en vez de N marcadores encimados.
      const agrupados = new Set<string>();
      const gruposVigentes = new Set<string>();
      for (const g of snap.gruposDetenidos) {
        const ids = g.ids.filter((id) => id !== selectedVehicleIdRef.current && vehicleMarkersRef.current.has(id));
        if (ids.length < 2) continue;
        ids.forEach((id) => agrupados.add(id));
        gruposVigentes.add(g.clave);
        actualizarMarcadorGrupo(g.clave, g.punto, ids);
      }
      for (const [clave, entrada] of groupMarkersRef.current) {
        if (!gruposVigentes.has(clave)) {
          capa.removeLayer(entrada.marker);
          groupMarkersRef.current.delete(clave);
        }
      }

      for (const [id, marker] of vehicleMarkersRef.current) {
        const punto = snap.vehiclePositions.get(id);
        if (punto) {
          marker.setLatLng([punto.y, punto.x]);
        }
        if (agrupados.has(id)) {
          if (capa.hasLayer(marker)) capa.removeLayer(marker);
          continue;
        }
        if (!capa.hasLayer(marker)) capa.addLayer(marker);

        if (id === selectedVehicleIdRef.current && selectedRouteLineRef.current) {
          const ruta = simulationEngine.getRutaVisible(id);
          if (ruta && ruta.length > 1) {
            selectedRouteLineRef.current.setLatLngs(ruta.map((p) => [p.y, p.x] as [number, number]));
            const fin = ruta[ruta.length - 1];
            for (const m of selectedRouteEndMarkersRef.current) m.setLatLng([fin.y, fin.x]);
          }
        }
      }
      if (snap.buffering !== bufferingAnterior) {
        bufferingAnterior = snap.buffering;
        setBuffering(snap.buffering);
      }
    });
    const grupos = groupMarkersRef.current;
    return () => {
      unsubscribe();
      for (const entrada of grupos.values()) capa.removeLayer(entrada.marker);
      grupos.clear();
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