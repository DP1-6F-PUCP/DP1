import React, { useContext, useLayoutEffect, useRef } from 'react';
import { MapSlotContext } from '../../contexts/MapSlotContext';

interface MapSlotProps {
  className?: string;
}

/** Reparenta el nodo host del mapa (ver MapSlotContext) hacia este slot con appendChild nativo --
 * nunca lo clona ni lo destruye, solo lo mueve. Ver el comentario de MapSlotContext para el porque
 * de este diseño en vez de createPortal+useState. */
export const MapSlot: React.FC<MapSlotProps> = ({ className }) => {
  const mapHostRef = useContext(MapSlotContext);
  const containerRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const container = containerRef.current;
    const host = mapHostRef?.current;
    if (!container || !host) return;
    container.appendChild(host);
    host.classList.remove('hidden');
  }, [mapHostRef]);

  return <div ref={containerRef} className={className} />;
};
