import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import { Warehouse, Vehicle, BlockedStreet, Order } from '../../types';
import { GRID_WIDTH_KM, GRID_HEIGHT_KM, generateManhattanPath } from '../../utils/manhattan';
import { getVehicleSemaforoStatus } from '../../utils/vehicleStatus';

export interface LeafletManhattanMapProps {
  warehouses?: Warehouse[];
  vehicles?: Vehicle[];
  blockedStreets?: BlockedStreet[];
  orders?: Order[];
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
  className?: string;
}

export const LeafletManhattanMap: React.FC<LeafletManhattanMapProps> = ({
  warehouses = [],
  vehicles = [],
  blockedStreets = [],
  orders = [],
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

  // 1. Initialize Leaflet Map with L.CRS.Simple - Fixed, non-zoomable, adapted to max screen
  useEffect(() => {
    if (!mapContainerRef.current) return;

    // Bounds in Leaflet CRS.Simple: [[yMin, xMin], [yMax, xMax]]
    // (0,0) is bottom-left, (70, 50) is top-right
    const southWest = L.latLng(0, 0);
    const northEast = L.latLng(GRID_HEIGHT_KM, GRID_WIDTH_KM);
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
  }, []);

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
        [GRID_HEIGHT_KM, GRID_WIDTH_KM],
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
    for (let x = 0; x <= GRID_WIDTH_KM; x++) {
      L.polyline(
        [
          [0, x],
          [GRID_HEIGHT_KM, x],
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
    for (let y = 0; y <= GRID_HEIGHT_KM; y++) {
      L.polyline(
        [
          [y, 0],
          [y, GRID_WIDTH_KM],
        ],
        {
          color: gridLineColor,
          weight: 0.6,
          opacity: isDarkTheme ? 0.5 : 0.65,
          interactive: false,
        }
      ).addTo(group);
    }
  }, [showGridLines, isDarkTheme]);

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
  useEffect(() => {
    const group = routesLayerGroupRef.current;
    group.clearLayers();

    if (!showProjectedRoutes) return;

    // Solo mostrar la línea proyectada al destino cuando el vehículo esté seleccionado
    if (!selectedVehicleId) return;

    const selectedVehicle = vehicles.find((v) => v.id === selectedVehicleId);
    if (!selectedVehicle) return;

    let fullPath = [selectedVehicle.position, ...(selectedVehicle.plannedPath || [])];
    if (fullPath.length < 2 && selectedVehicle.destination) {
      fullPath = generateManhattanPath(
        selectedVehicle.position,
        selectedVehicle.destination,
        blockedStreets
      );
    }
    if (fullPath.length < 2) return;

    const latLngs = fullPath.map((p) => [p.y, p.x] as [number, number]);
    const isBroken = selectedVehicle.status === 'broken';

    const routeColor = isBroken
      ? '#ef4444'
      : selectedVehicle.type === 'car'
      ? '#38bdf8'
      : selectedVehicle.type === 'motorcycle'
      ? '#a78bfa'
      : '#34d399';

    // High-visibility outer glow (matches SVG outer glow)
    L.polyline(latLngs, {
      color: isBroken ? '#f87171' : '#38bdf8',
      weight: 5,
      opacity: 0.35,
      lineCap: 'round',
      lineJoin: 'round',
      interactive: false,
    }).addTo(group);

    // Manhattan Planned Route (Dashed line on grid, matches SVG)
    L.polyline(latLngs, {
      color: routeColor,
      weight: 2.5,
      dashArray: '6, 4',
      opacity: isBroken ? 0.7 : 1,
      lineCap: 'round',
      lineJoin: 'round',
    }).addTo(group);

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
      const pct = isInfinite ? 0 : Math.round((w.currentStock / w.capacity) * 100);
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

      marker.on('click', (e) => {
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
  useEffect(() => {
    const group = vehiclesLayerGroupRef.current;
    group.clearLayers();

    vehicles.forEach((v) => {
      const isSelected = selectedVehicleId === v.id;
      const semaforo = getVehicleSemaforoStatus(v, orders, simMinutes);
      const isDelayedOrBroken = semaforo.state === 'delayed' || v.status === 'broken';

      // Color de la burbuja según semáforo oficial (rojo para avería/retraso, azul de selección, o color de semáforo)
      const bubbleFill = isDelayedOrBroken
        ? '#C62828'
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

      const marker = L.marker([v.position.y, v.position.x], { icon: vehicleIcon });

      marker.on('click', (e) => {
        L.DomEvent.stopPropagation(e);
        if (selectedVehicleId === v.id) {
          onSelectVehicle?.(null);
        } else {
          onSelectVehicle?.(v);
        }
      });

      marker.addTo(group);
    });
  }, [vehicles, selectedVehicleId, isDarkTheme, orders, simMinutes, onSelectVehicle]);

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
