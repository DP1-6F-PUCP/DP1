import { create } from 'zustand';
import { Point } from '../types';

export interface MapLayersState {
  projectedRoutes: boolean;
  blockedStreets: boolean;
  coverageZones: boolean;
  orderPins: boolean;
}

interface MapState {
  selectedVehicleId: string | null;
  selectedWarehouseId: string | null;
  selectedRouteId: string | null;
  activeLayers: MapLayersState;
  realtimePositions: Record<string, Point>;
  zoomLevel: number;
  panOffset: Point;

  // Acciones (siempre inmutables)
  setSelectedVehicleId: (id: string | null) => void;
  setSelectedWarehouseId: (id: string | null) => void;
  setSelectedRouteId: (id: string | null) => void;
  toggleLayer: (layer: keyof MapLayersState) => void;
  setLayer: (layer: keyof MapLayersState, active: boolean) => void;
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
  activeLayers: {
    projectedRoutes: true,
    blockedStreets: true,
    coverageZones: true,
    orderPins: true,
  },
  realtimePositions: {},
  zoomLevel: 1,
  panOffset: { x: 0, y: 0 },

  setSelectedVehicleId: (id) =>
    set({
      selectedVehicleId: id,
      selectedWarehouseId: id ? null : undefined,
    }),

  setSelectedWarehouseId: (id) =>
    set({
      selectedWarehouseId: id,
      selectedVehicleId: id ? null : undefined,
    }),

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
