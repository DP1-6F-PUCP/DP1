import { create } from 'zustand';
import { Point } from '../types';
import { FILTROS_VACIOS, FiltrosMapa, GrupoFiltro } from '../utils/filtrosMapa';

export interface MapLayersState {
  projectedRoutes: boolean;
  blockedStreets: boolean;
  coverageZones: boolean;
  orderPins: boolean;
  vehicles: boolean;
  warehouses: boolean;
}

interface MapState {
  selectedVehicleId: string | null;
  selectedWarehouseId: string | null;
  selectedRouteId: string | null;
  selectedOrderId: string | null;
  /** Pedido desde el que se fue a su vehículo (botón de vehículo en Pedidos o en la ficha): la
   * tarjeta del vehículo lo resalta. Se borra al seleccionar otro vehículo. */
  pedidoOrigenId: string | null;
  activeLayers: MapLayersState;
  /** Filtros que se aplican desde la leyenda (ver utils/filtrosMapa). */
  filtros: FiltrosMapa;
  /** Pedido de centrar el mapa en un punto, hecho desde otra página (p. ej. "Ver en el mapa" de
   * Pedidos); `n` cambia en cada pedido para que se atienda aunque se repita el punto. */
  solicitudCentrado: { x: number; y: number; n: number } | null;
  /** Pedido de abrir el panel de detalle en una pestaña, hecho desde otra página (p. ej. Flota
   * mientras su lista sigue en el panel); el panel lo atiende al montarse y lo limpia. */
  solicitudPanel: 'operation' | 'fleet' | 'shipments' | null;
  realtimePositions: Record<string, Point>;
  zoomLevel: number;
  panOffset: Point;
  // Acciones (siempre inmutables)
  setSelectedVehicleId: (id: string | null) => void;
  /** Selecciona el vehículo que lleva (o entregó) un pedido y recuerda ese pedido (pedidoOrigenId). */
  irAVehiculoDePedido: (vehicleId: string, orderId: string) => void;
  setSelectedWarehouseId: (id: string | null) => void;
  setSelectedRouteId: (id: string | null) => void;
  setSelectedOrderId: (id: string | null) => void;
  toggleLayer: (layer: keyof MapLayersState) => void;
  setLayer: (layer: keyof MapLayersState, active: boolean) => void;
  alternarFiltro: (grupo: GrupoFiltro, valor: string) => void;
  limpiarFiltros: () => void;
  centrarEn: (x: number, y: number) => void;
  abrirPanel: (pestana: 'operation' | 'fleet' | 'shipments') => void;
  limpiarSolicitudPanel: () => void;
  updateRealtimePosition: (vehicleId: string, position: Point) => void;
  updateBatchPositions: (positions: Record<string, Point>) => void;
  setZoomLevel: (zoom: number | ((prev: number) => number)) => void;
  setPanOffset: (offset: Point | ((prev: Point) => Point)) => void;
  resetMapTransform: () => void;
}

export const useMapStore = create<MapState>((set) => ({
  selectedVehicleId: null,
  selectedWarehouseId: null,
  selectedRouteId: null,
  selectedOrderId: null,
  pedidoOrigenId: null,
  activeLayers: {
    projectedRoutes: true,
    blockedStreets: true,
    coverageZones: true,
    orderPins: true,
    vehicles: true,
    warehouses: true,
  },
  filtros: FILTROS_VACIOS,
  solicitudCentrado: null,
  solicitudPanel: null,
  realtimePositions: {},
  zoomLevel: 1,
  panOffset: { x: 0, y: 0 },
  setSelectedVehicleId: (id) =>
    set((state) => ({
      selectedVehicleId: id,
      selectedWarehouseId: id ? null : state.selectedWarehouseId,
      selectedOrderId: id ? null : state.selectedOrderId,
      pedidoOrigenId: id === state.selectedVehicleId ? state.pedidoOrigenId : null,
    })),

  irAVehiculoDePedido: (vehicleId, orderId) =>
    set({ selectedVehicleId: vehicleId, selectedWarehouseId: null, selectedOrderId: null, pedidoOrigenId: orderId }),

  setSelectedWarehouseId: (id) =>
    set((state) => ({
      selectedWarehouseId: id,
      selectedVehicleId: id ? null : state.selectedVehicleId,
      selectedOrderId: id ? null : state.selectedOrderId,
    })),

  setSelectedOrderId: (id) =>
    set((state) => ({
      selectedOrderId: id,
      selectedVehicleId: id ? null : state.selectedVehicleId,
      selectedWarehouseId: id ? null : state.selectedWarehouseId,
    })),

  setSelectedRouteId: (id) => set({ selectedRouteId: id }),

  toggleLayer: (layer) =>
    set((state) => ({
      activeLayers: {
        ...state.activeLayers,
        [layer]: !state.activeLayers[layer],
      },
    })),

  setLayer: (layer, active) =>
    set((state) => ({
      activeLayers: {
        ...state.activeLayers,
        [layer]: active,
      },
    })),

  alternarFiltro: (grupo, valor) =>
    set((state) => {
      const actuales = state.filtros[grupo];
      const valores = actuales.includes(valor) ? actuales.filter((v) => v !== valor) : [...actuales, valor];
      return { filtros: { ...state.filtros, [grupo]: valores } };
    }),

  limpiarFiltros: () =>
    set((state) => ({
      filtros: FILTROS_VACIOS,
      activeLayers: { ...state.activeLayers, projectedRoutes: true, blockedStreets: true, orderPins: true, vehicles: true, warehouses: true },
    })),

  abrirPanel: (pestana) => set({ solicitudPanel: pestana }),
  limpiarSolicitudPanel: () => set({ solicitudPanel: null }),

  centrarEn: (x, y) =>
    set((state) => ({ solicitudCentrado: { x, y, n: (state.solicitudCentrado?.n ?? 0) + 1 } })),

  updateRealtimePosition: (vehicleId, position) =>
    set((state) => ({
      realtimePositions: {
        ...state.realtimePositions,
        [vehicleId]: position,
      },
    })),

  updateBatchPositions: (positions) =>
    set((state) => ({
      realtimePositions: {
        ...state.realtimePositions,
        ...positions,
      },
    })),

  setZoomLevel: (zoomOrUpdater) =>
    set((state) => ({
      zoomLevel:
        typeof zoomOrUpdater === 'function' ? zoomOrUpdater(state.zoomLevel) : zoomOrUpdater,
    })),

  setPanOffset: (offsetOrUpdater) =>
    set((state) => ({
      panOffset:
        typeof offsetOrUpdater === 'function'
          ? offsetOrUpdater(state.panOffset)
          : offsetOrUpdater,
    })),

  resetMapTransform: () => set({ zoomLevel: 1, panOffset: { x: 0, y: 0 } }),
}));
