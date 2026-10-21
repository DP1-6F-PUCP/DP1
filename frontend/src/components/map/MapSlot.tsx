import React, { useContext, useLayoutEffect, useRef } from 'react';
import { MapSlotContext } from '../../contexts/MapSlotContext';

interface MapSlotProps {
  className?: string;
}

export const MapSlot: React.FC<MapSlotProps> = ({ className }) => {
  const mapSlotContext = useContext(MapSlotContext);
  const slotRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const slot = slotRef.current;
    if (!mapSlotContext || !slot) return;
    mapSlotContext.setSlot(slot);
    return () => {
      mapSlotContext.setSlot((currentSlot) => (currentSlot === slot ? null : currentSlot));
    };
  }, [mapSlotContext]);

  return <div ref={slotRef} className={className} />;
};
