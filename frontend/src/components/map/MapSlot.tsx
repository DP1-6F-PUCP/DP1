import React, { useContext, useLayoutEffect, useRef } from 'react';
import { MapSlotContext } from '../../contexts/MapSlotContext';

interface MapSlotProps {
  className?: string;
}

export const MapSlot: React.FC<MapSlotProps> = ({ className }) => {
  const mapSlotContext = useContext(MapSlotContext);
  const setSlot = mapSlotContext?.setSlot;
  const slotRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const slot = slotRef.current;
    if (!setSlot || !slot) return;
    setSlot(slot);
    return () => {
      setSlot((currentSlot) => (currentSlot === slot ? null : currentSlot));
    };
  }, [setSlot]);

  return <div ref={slotRef} className={className} />;
};
