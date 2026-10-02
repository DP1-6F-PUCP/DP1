import { useRef, useState, useCallback, useEffect } from 'react';
import { Point } from '../types';
import { useMapStore } from '../store/mapStore';

export const GRID_WIDTH_KM = 70;
export const GRID_HEIGHT_KM = 50;

export function useMapInstance() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [mouseCoords, setMouseCoords] = useState<Point | null>(null);
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState<Point>({ x: 0, y: 0 });

  const zoomLevel = useMapStore((s) => s.zoomLevel);
  const panOffset = useMapStore((s) => s.panOffset);
  const setZoomLevel = useMapStore((s) => s.setZoomLevel);
  const setPanOffset = useMapStore((s) => s.setPanOffset);
  const resetMapTransform = useMapStore((s) => s.resetMapTransform);

  const kmToSvgY = useCallback((kmY: number) => GRID_HEIGHT_KM - kmY, []);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button !== 0) return;
      if (
        (e.target as HTMLElement).closest('button') ||
        (e.target as HTMLElement).closest('.interactive-node')
      ) {
        return;
      }
      setIsPanning(true);
      setPanStart({ x: e.clientX - panOffset.x, y: e.clientY - panOffset.y });
    },
    [panOffset]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (isPanning) {
        setPanOffset({
          x: e.clientX - panStart.x,
          y: e.clientY - panStart.y,
        });
      }

      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        const rawX = (e.clientX - rect.left - panOffset.x) / (rect.width * zoomLevel);
        const rawY = (e.clientY - rect.top - panOffset.y) / (rect.height * zoomLevel);

        const kmX = Math.max(0, Math.min(GRID_WIDTH_KM, Math.round(rawX * GRID_WIDTH_KM * 10) / 10));
        const kmY = Math.max(0, Math.min(GRID_HEIGHT_KM, Math.round((1 - rawY) * GRID_HEIGHT_KM * 10) / 10));

        setMouseCoords({ x: kmX, y: kmY });
      }
    },
    [isPanning, panOffset, panStart, setPanOffset, zoomLevel]
  );

  const handleMouseUp = useCallback(() => {
    setIsPanning(false);
  }, []);

  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault();
      const zoomFactor = e.deltaY < 0 ? 1.15 : 0.85;
      setZoomLevel((prev) => Math.max(0.6, Math.min(4.5, prev * zoomFactor)));
    },
    [setZoomLevel]
  );

  useEffect(() => {
    const handleGlobalMouseUp = () => setIsPanning(false);
    window.addEventListener('mouseup', handleGlobalMouseUp);
    return () => window.removeEventListener('mouseup', handleGlobalMouseUp);
  }, []);

  return {
    containerRef,
    zoomLevel,
    panOffset,
    mouseCoords,
    isPanning,
    kmToSvgY,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    handleWheel,
    setZoomLevel,
    resetMapTransform,
  };
}
