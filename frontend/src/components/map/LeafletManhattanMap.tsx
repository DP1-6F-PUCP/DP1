import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import { Warehouse, Vehicle, BlockedStreet, Order, Route, Point } from '../../types';
import { GRID_WIDTH_KM, GRID_HEIGHT_KM } from '../../utils/manhattan';
import { getVehicleSemaforoStatus } from '../../utils/vehicleStatus';

/**
 * Info de sincronizacion para interpolar suavemente la posicion de un vehiculo entre dos lotes
 * consecutivos.
 *
 * Bug real corregido (reporte directo: "transiciones cortadas", vehiculos que saltan de lugar,
 * se congelan y luego se ven 10-12s mas adelante de golpe): el enfoque anterior ("dead reckoning"
 * puro, extrapolar segun velocidadKmH/k) asumia que el vehiculo viaja a velocidad constante todo
 * el tiempo -- pero el tiempo de servicio al cliente (1h simulada por parada), los refrigerios y
 * cambios de turno NO mueven al vehiculo, asi que la extrapolacion se adelantaba a la posicion
 * real mientras el backend lo tenia detenido, y al llegar el siguiente lote el marcador "saltaba"
 * (adelante o atras) para corregirse. Este reemplazo NO intenta modelar fisica alguna: en vez de
 * asumir una velocidad, pauta el recorrido por el TIEMPO REAL medido entre los dos ultimos lotes
 * -- el mismo patron de interpolacion con reconciliacion de servidor que dead reckoning (misma
 * familia, ver el comentario historico de esta sesion sobre Gambetta/Valve), pero pautado por
 * tiempo transcurrido en vez de por velocidad asumida: por construccion SIEMPRE llega exacto a la
 * posicion real reportada justo cuando el siguiente lote deberia llegar, sin importar que haya
 * pasado durante el tramo (viaje, parada, avería). Como ya no depende de velocidadKmH/k/
 * distanciaEntreNodos, tambien deja de poder desincronizarse de esos valores.
 */
interface SincroVehiculo {
  origen: Point;
  destino: Point;
  /** Camino para ANIMAR el tramo origen->destino -- real y a salvo de bloqueos, reconstruido
   * recortando el caminoFuturo que ya conociamos del tick anterior (ver mas abajo). Vacio cuando
   * no hay con que reconstruirlo (primer tick del vehiculo, o la ruta cambio y destino no aparece
   * en el camino previamente conocido) -- en ese caso duracionMs queda en 0 para que el tramo se
   * muestre de inmediato en destino, sin animar un camino que no se puede garantizar libre de
   * bloqueos (bug real reportado con captura de pantalla: un puente local inventado entre origen y
   * destino cruzaba directo por encima de la linea de un bloqueo). */
  waypoints: Point[];
  /** Camino real conocido HACIA ADELANTE desde destino (RutaDTO.geometria o
   * VehiculoDTO.geometriaRetorno de ESTE tick, ya evita bloqueos vigentes -- ver
   * EnsambladorRespuestas/CalculadorDistancia) -- se guarda para que el PROXIMO tick pueda
   * reconstruir su tramo de transicion recortando este mismo camino. */
  caminoFuturo: Point[];
  inicioMs: number;
  /** 0 cuando no hay camino real conocido para este tramo (ver waypoints) -- posicionInterpolada
   * entonces devuelve destino de inmediato en vez de animar. */
  duracionMs: number;
  /** Identifica la fuente del tramo (ruta activa o "retorno") para detectar un cambio de ruta
   * aunque la posicion reportada coincida (p. ej. el vehiculo termina de entregar justo donde
   * estaba y arranca el regreso sin moverse ese instante). */
  fuenteId: string;
}

/** Duracion de respaldo (ms) para el primer tramo de un vehiculo, antes de tener una medicion real. */
const DURACION_RESPALDO_MS = 20_000;

function posicionInterpolada(sync: SincroVehiculo, ahoraMs: number): Point {
  const { origen, destino, waypoints, inicioMs, duracionMs } = sync;
  const fraccion = duracionMs > 0 ? Math.min(1, Math.max(0, (ahoraMs - inicioMs) / duracionMs)) : 1;

  if (waypoints.length < 2) {
    return { x: origen.x + (destino.x - origen.x) * fraccion, y: origen.y + (destino.y - origen.y) * fraccion };
  }

  let distanciaTotal = 0;
  const segmentos: number[] = [];
  for (let i = 0; i < waypoints.length - 1; i++) {
    const d = Math.abs(waypoints[i + 1].x - waypoints[i].x) + Math.abs(waypoints[i + 1].y - waypoints[i].y);
    segmentos.push(d);
    distanciaTotal += d;
  }
  if (distanciaTotal === 0) {
    return destino;
  }

  let objetivo = fraccion * distanciaTotal;
  for (let i = 0; i < segmentos.length; i++) {
    const largo = segmentos[i];
    if (objetivo <= largo || i === segmentos.length - 1) {
      const t = largo > 0 ? Math.min(1, objetivo / largo) : 1;
      const p0 = waypoints[i];
      const p1 = waypoints[i + 1];
      return { x: p0.x + (p1.x - p0.x) * t, y: p0.y + (p1.y - p0.y) * t };
    }
    objetivo -= largo;
  }
  return waypoints[waypoints.length - 1];
}

/** {@code true} si el segmento axis-aligned p0-p1 se superpone con algun tramo de {@code bloqueos}
 * (ambos colineales sobre la misma linea, con rango solapado). */
function segmentoBloqueado(p0: Point, p1: Point, bloqueos: BlockedStreet[]): boolean {
  const horizontal = p0.y === p1.y;
  const vertical = p0.x === p1.x;
  if (!horizontal && !vertical) return false;
  const loX = Math.min(p0.x, p1.x);
  const hiX = Math.max(p0.x, p1.x);
  const loY = Math.min(p0.y, p1.y);
  const hiY = Math.max(p0.y, p1.y);
  return bloqueos.some((b) => {
    if (horizontal && b.start.y === b.end.y && b.start.y === p0.y) {
      const bLo = Math.min(b.start.x, b.end.x);
      const bHi = Math.max(b.start.x, b.end.x);
      return bLo < hiX && bHi > loX;
    }
    if (vertical && b.start.x === b.end.x && b.start.x === p0.x) {
      const bLo = Math.min(b.start.y, b.end.y);
      const bHi = Math.max(b.start.y, b.end.y);
      return bLo < hiY && bHi > loY;
    }
    return false;
  });
}

/**
 * Puente Manhattan local (L, en cualquiera de sus dos orientaciones) entre dos puntos, para el
 * tramo de transicion cuando NO hay camino real conocido (ver hayCaminoReal mas abajo) -- a
 * diferencia del puente ingenuo anterior (bug real reportado con captura: cruzaba directo sobre un
 * bloqueo), prueba ambas orientaciones (x-luego-y, y-luego-x) contra {@code blockedStreets} y usa
 * la primera que no cruce ninguna; si ambas cruzan, devuelve {@code null} (no hay bridge seguro --
 * el llamador debe caer a un salto instantaneo en vez de mostrar un camino que sabemos cruza un
 * bloqueo).
 */
function puenteManhattanSeguro(desde: Point, hasta: Point, bloqueos: BlockedStreet[]): Point[] | null {
  if (desde.x === hasta.x && desde.y === hasta.y) {
    return [desde, hasta];
  }
  if (desde.x === hasta.x || desde.y === hasta.y) {
    return segmentoBloqueado(desde, hasta, bloqueos) ? null : [desde, hasta];
  }
  const opciones: Point[][] = [
    [desde, { x: hasta.x, y: desde.y }, hasta],
    [desde, { x: desde.x, y: hasta.y }, hasta],
  ];
  for (const opcion of opciones) {
    const bloqueada = segmentoBloqueado(opcion[0], opcion[1], bloqueos) || segmentoBloqueado(opcion[1], opcion[2], bloqueos);
    if (!bloqueada) return opcion;
  }
  return null;
}

export interface LeafletManhattanMapProps {
  warehouses?: Warehouse[];
  vehicles?: Vehicle[];
  blockedStreets?: BlockedStreet[];
  orders?: Order[];
  /** Geometria real de cada ruta (RutaDTO.geometria via adaptRuta) -- permite animar cada
   * vehiculo por su camino real en vez de saltar directo entre posiciones. */
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
  /** EjecucionEscenarioDTO.idEjecucion de la ejecución activa. Al cambiar (una ejecución nueva
   * reemplaza a la anterior, misma flota de IDs reutilizados) se limpian los marcadores y la
   * sincronización de animación -- ver el comentario del efecto que lo consume. */
  idEjecucion?: string;
  /** EjecucionEscenarioDTO.sa (minutos reales nominales entre lotes) -- pauta la animacion de
   * cada tramo (ver duracionMs en el efecto de sincronizacion). Se prefiere sobre MEDIR el
   * intervalo real entre los dos ultimos lotes porque scheduleAtFixedRate dispara a intervalos
   * fijos de sa SIN IMPORTAR cuanto tarde el computo de cada lote (ALNS no es constante) -- medir
   * el gap anterior para predecir el siguiente fallaba cuando un lote tardaba mas que el previo
   * (reporte directo: el vehiculo llegaba a destino y se quedaba quieto esperando el dato real). */
  sa?: number;
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
  idEjecucion,
  sa,
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
  const vehiclesLayerGroupRef = useRef<L.LayerGroup>(L.layerGroup());

  // Marcadores de vehiculo persistentes entre renders (en vez de destruir y recrear cada vez que
  // llegan datos nuevos) -- necesario para poder animar su posicion en vez de que "salten".
  const vehicleMarkersRef = useRef<Map<string, L.Marker>>(new Map());
  // Punto de sincronizacion de cada vehiculo (tramo origen->destino + ventana de tiempo real para
  // recorrerlo), usado por el bucle continuo de abajo (ver posicionInterpolada) -- no se anima
  // aqui directamente, solo se registra el tramo para que el bucle (efecto aparte, corre siempre)
  // lo use.
  const vehicleSyncRef = useRef<Map<string, SincroVehiculo>>(new Map());
  // undefined = todavia no se vio ningun id REAL (ni en el primer render ni durante el hueco
  // null entre detener una ejecucion e iniciar la siguiente -- solo se escribe con ids reales,
  // nunca se vuelve a poner en undefined, ver el efecto que lo consume).
  const idEjecucionAnteriorRef = useRef<string | undefined>(undefined);

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

    // Fit bounds with zero padding to fill entire container
    map.fitBounds(bounds, { padding: [0, 0] });

    // Ensure map bounds are maximized on next tick
    const fitTimer = setTimeout(() => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.invalidateSize();
        mapInstanceRef.current.fitBounds(bounds, { padding: [0, 0] });
      }
    }, 60);

    // Resize observer to always adapt fixed map to container changes
    const resizeObserver = new ResizeObserver(() => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.invalidateSize();
        mapInstanceRef.current.fitBounds(bounds, { padding: [0, 0] });
      }
    });
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
  // Bug real corregido (reporte directo): la linea punteada hacia el destino se construia con
  // generateManhattanPath, una aproximacion local -- no el camino que el backend realmente eligio
  // para ese vehiculo (CalculadorDistancia, que evade bloqueos via A*). Cuando ambos difieren se ve
  // como ruido visual: una linea que cruza por donde el vehiculo NO va a pasar. Se quita la linea;
  // el circulo de destino se mantiene (es solo un punto, selectedVehicle.destination ya es un dato
  // real, no una aproximacion).
  useEffect(() => {
    const group = routesLayerGroupRef.current;
    group.clearLayers();

    if (!showProjectedRoutes) return;
    if (!selectedVehicleId) return;

    const selectedVehicle = vehicles.find((v) => v.id === selectedVehicleId);
    if (!selectedVehicle) return;

    const isBroken = selectedVehicle.status === 'broken';

    // Destination Marker on the Grid (Concentric circle matching SVG)
    if (selectedVehicle.destination) {
      // Outer dashed ring
      L.circleMarker([selectedVehicle.destination.y, selectedVehicle.destination.x], {
        radius: 7,
        color: isBroken ? '#ef4444' : '#38bdf8',
        weight: 1.5,
        dashArray: '3, 2',
        fill: false,
        interactive: false,
      }).addTo(group);

      // Inner solid circle
      L.circleMarker([selectedVehicle.destination.y, selectedVehicle.destination.x], {
        radius: 3.5,
        color: '#ffffff',
        weight: 1,
        fillColor: isBroken ? '#ef4444' : '#38bdf8',
        fillOpacity: 1,
        interactive: false,
      }).addTo(group);
    }
  }, [showProjectedRoutes, vehicles, selectedVehicleId]);

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
  // Antes esta capa se borraba y reconstruia entera en cada render (igual que grilla/almacenes/
  // bloqueos, que no necesitan animarse). Para vehiculos eso significaba que cada lote nuevo hacia
  // "saltar" el marcador directo a la posicion nueva -- el mapa nunca se veia como una simulacion
  // en vivo, sino como una foto fija que cambiaba de golpe cada sa minutos.
  //
  // Esta investigacion confirmo que el patron estandar de tracking de flotas en tiempo real es
  // "dead reckoning": extrapolar continuamente la posicion segun la velocidad real del vehiculo
  // entre lecturas conocidas, no solo animar un tween cuando llega un dato nuevo. Por eso este
  // efecto SOLO registra el punto de sincronizacion (posicion conocida + instante real) en
  // vehicleSyncRef -- el movimiento real lo hace el bucle continuo de mas abajo (efecto aparte),
  // que corre en todo momento, no solo cuando este efecto se dispara.
  useEffect(() => {
    const group = vehiclesLayerGroupRef.current;
    const markers = vehicleMarkersRef.current;
    const sync = vehicleSyncRef.current;

    // Bug real corregido (reporte directo: "veo que hace regresar a los vehiculos" al detener una
    // ejecucion y arrancar otra): la MISMA flota de ids (TA01, TM01, ...) existe en toda ejecucion
    // nueva, asi que la limpieza de abajo (por id ausente) nunca los tocaba -- vehicleSyncRef
    // seguia con el tramo de la ejecucion VIEJA, y la interpolacion animaba suavemente desde la
    // posicion donde quedo esa ejecucion (a mitad de ruta) hasta la posicion de arranque de la
    // nueva (el almacen central, por reiniciarFlotaYAlmacenes) -- una animacion "de vuelta" valida
    // segun los datos, pero una ejecucion nueva debe verse como un reinicio limpio, no como una
    // transicion. Al detectar que cambio idEjecucion se limpia todo de una (capas + estado de
    // sincronizacion) antes de reconstruir con los datos de la ejecucion nueva.
    //
    // Bug real corregido (reporte directo, con captura: seguia pasando despues del fix anterior):
    // entre detener una ejecucion e iniciar la siguiente, idEjecucion pasa por un estado
    // intermedio undefined (mientras SeleccionarEscenarioGate muestra el picker, con
    // scenarioStore.ejecucion en null) -- la version anterior de este chequeo trataba CUALQUIER
    // undefined como "primera vez, nada que limpiar" y sobreescribia la referencia con undefined,
    // asi que cuando llegaba el id de la ejecucion REALMENTE nueva, ya no tenia con que compararlo
    // (penso que tambien era "la primera vez") y nunca disparaba la limpieza. Ahora el ref solo se
    // actualiza cuando idEjecucion es un id real -- sobrevive el hueco undefined intacto, asi que
    // la comparacion contra el siguiente id real sigue siendo correcta.
    const huboResetDeEjecucion = Boolean(idEjecucion)
      && idEjecucionAnteriorRef.current != null
      && idEjecucionAnteriorRef.current !== idEjecucion;
    if (huboResetDeEjecucion) {
      for (const marker of markers.values()) {
        group.removeLayer(marker);
      }
      markers.clear();
      sync.clear();
    }
    if (idEjecucion) {
      idEjecucionAnteriorRef.current = idEjecucion;
    }

    // Bug real corregido (reporte directo, con captura: vehiculos dispersos e inactivos justo al
    // arrancar una ejecucion nueva -- deberian aparecer todos en el almacen central). Causa:
    // condicion de carrera entre el store (idEjecucion se actualiza sincronico en
    // iniciarMutation.onSuccess) y React Query (invalidateQueries dispara un refetch ASINCRONO) --
    // este efecto se disparaba de inmediato por el cambio de idEjecucion, pero `vehicles` todavia
    // traia los datos VIEJOS (el refetch no habia resuelto aun), asi que los marcadores se
    // reconstruian en las posiciones de la ejecucion anterior. En vez de reconstruir con datos que
    // podrian ser viejos, se corta aqui (ya quedaron limpios los marcadores arriba) y se espera a
    // que `vehicles` cambie de verdad -- WS o el poll de 3s van a traer el estado real reseteado en
    // breve y disparar este mismo efecto de nuevo (esta en los deps).
    if (huboResetDeEjecucion) {
      return;
    }

    const idsActuales = new Set(vehicles.map((v) => v.id));
    for (const [id, marker] of markers) {
      if (!idsActuales.has(id)) {
        group.removeLayer(marker);
        markers.delete(id);
        sync.delete(id);
      }
    }

    vehicles.forEach((v) => {
      const isSelected = selectedVehicleId === v.id;
      const semaforo = getVehicleSemaforoStatus(v, orders, simMinutes);
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

      let marker = markers.get(v.id);
      const syncAnterior = sync.get(v.id);

      if (!marker) {
        marker = L.marker([v.position.y, v.position.x], { icon: vehicleIcon });
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
      }

      // Ruta activa de este vehiculo, si tiene una -- identifica de donde sale el tramo (una ruta
      // en ejecucion, o el regreso al almacen si ya entrego todo: Ruta queda FINALIZADA apenas
      // termina de entregar, por eso no aparece como "en ejecucion" aunque el vehiculo se siga
      // moviendo de verdad).
      const rutaActiva = routes.find((r) => r.vehicleId === v.id && r.status === 'in_progress');
      const fuenteId = rutaActiva ? rutaActiva.id : 'retorno';

      // Bug real reportado (persistia despues del intento anterior de "saltar" via duracionMs=0
      // en la logica de sincronizacion normal -- esa ruta comparte codigo con el resto de
      // transiciones y puede arrastrar un origen a mitad de camino si algo mas fallo en el tick
      // anterior). Esto es un bypass directo, sin pasar por posicionInterpolada en absoluto: si el
      // backend dice que el vehiculo esta ENTREGANDO o EN_REFRIGERIO, el marcador se clava en su
      // posicion real de una, siempre, sin excepciones ni dependencia del estado previo. Se
      // sacrifica la animacion del ultimo tramo a cambio de que la etiqueta y el punto en el mapa
      // NUNCA puedan quedar inconsistentes.
      if (v.status === 'delivering' || v.status === 'on_break') {
        marker.setLatLng([v.position.y, v.position.x]);
        sync.set(v.id, {
          origen: v.position,
          destino: v.position,
          waypoints: [],
          caminoFuturo: rutaActiva?.waypoints ?? v.returnPath,
          inicioMs: performance.now(),
          duracionMs: 0,
          fuenteId,
        });
        return;
      }

      const sinCambios = syncAnterior && syncAnterior.destino.x === v.position.x
        && syncAnterior.destino.y === v.position.y && syncAnterior.fuenteId === fuenteId;
      if (sinCambios) {
        return; // mismo tramo que ya se esta animando, nada que resincronizar
      }

      const ahora = performance.now();
      // Continuidad: el nuevo tramo arranca donde el marcador esta VISUALMENTE ahora (no donde
      // decia el ultimo dato del backend), para que nunca haya un salto visible al resincronizar.
      const origen = syncAnterior ? posicionInterpolada(syncAnterior, ahora) : v.position;
      // Pautado por el sa NOMINAL (declarado por el backend), no por el intervalo real medido --
      // ver el comentario de la prop sa. PERO si este vehiculo paso varios lotes sin resincronizar
      // (sinCambios=true repetido -- se quedo detenido sirviendo un pedido o en refrigerio), la
      // distancia acumulada entre origen y destino puede representar VARIOS lotes de avance, no
      // uno solo. Animar esa distancia en una sola ventana de sa lo haria verse correr demasiado
      // rapido (bug real reportado: "algunos vehiculos avanzan mas rapido en ciertos momentos").
      // Se redondea el tiempo real transcurrido al multiplo de sa mas cercano -- cancela el jitter
      // normal de un solo lote (la razon original de usar sa fijo en vez de medir) mientras sigue
      // escalando correctamente cuando se saltaron varios lotes de verdad.
      const saMs = sa && sa > 0 ? sa * 60_000 : DURACION_RESPALDO_MS;
      const lotesTranscurridos = syncAnterior
        ? Math.max(1, Math.round((ahora - syncAnterior.inicioMs) / saMs))
        : 1;
      const duracionMs = lotesTranscurridos * saMs;

      // Camino real para este tramo: el caminoFuturo que YA conociamos desde el tick anterior
      // arranca exactamente en origen (es geometria del backend calculada desde la posicion del
      // vehiculo en ese momento, ver EnsambladorRespuestas.calcularGeometriaRuta/Retorno) y evita
      // bloqueos -- si la posicion nueva (destino) aparece en ese camino, se recorta ahi y se
      // reusa tal cual. Si no aparece (la ruta cambio, hubo averia/replanificacion, o -- el caso
      // mas comun -- es la primera vez que este vehiculo recibe una ruta, p. ej. acaba de salir del
      // almacen) no hay forma de saber el camino real que siguio; antes esto saltaba sin animar
      // SIEMPRE, pero ese caso es demasiado frecuente (reporte directo: vehiculos "apareciendo"
      // instantaneos en cada lote sin verse salir del almacen) -- ahora se intenta un puente local
      // en L que SI consulta blockedStreets (ver puenteManhattanSeguro) antes de usarse, y solo se
      // salta sin animar si ninguna de las dos orientaciones del puente es segura.
      const caminoFuturoAnterior = syncAnterior?.caminoFuturo ?? [];
      const idxDestino = caminoFuturoAnterior.findIndex((p) => p.x === v.position.x && p.y === v.position.y);
      const hayCaminoReal = idxDestino > 0;
      const puenteSeguro = hayCaminoReal ? null : puenteManhattanSeguro(origen, v.position, blockedStreets);
      const waypoints = hayCaminoReal ? caminoFuturoAnterior.slice(0, idxDestino + 1) : puenteSeguro ?? [];

      const caminoFuturo = rutaActiva?.waypoints ?? v.returnPath;

      // Nota: entregando/en_refrigerio ya se resolvieron arriba (bypass directo, ver el bloque que
      // hace return antes de llegar aqui) -- de aqui en adelante solo quedan viajando/inactivo,
      // que si se benefician de la animacion normal.
      sync.set(v.id, {
        origen,
        destino: v.position,
        waypoints,
        caminoFuturo,
        inicioMs: ahora,
        duracionMs: hayCaminoReal || puenteSeguro ? duracionMs : 0,
        fuenteId,
      });
    });
  }, [vehicles, routes, selectedVehicleId, isDarkTheme, orders, simMinutes, onSelectVehicle, idEjecucion, sa, blockedStreets]);

  // Bucle continuo de interpolacion: corre en todo momento, no solo cuando llegan datos nuevos,
  // moviendo cada marcador segun posicionInterpolada. Montado una sola vez (deps []); lee
  // vehicleSyncRef, que el otro efecto mantiene al dia.
  useEffect(() => {
    let frameId: number;
    const tick = () => {
      const ahora = performance.now();
      for (const [id, marker] of vehicleMarkersRef.current) {
        const syncVehiculo = vehicleSyncRef.current.get(id);
        if (!syncVehiculo) continue;
        const punto = posicionInterpolada(syncVehiculo, ahora);
        marker.setLatLng([punto.y, punto.x]);
      }
      frameId = requestAnimationFrame(tick);
    };
    frameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameId);
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
    </div>
  );
};
