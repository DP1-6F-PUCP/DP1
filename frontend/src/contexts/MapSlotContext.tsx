import { createContext, Dispatch, SetStateAction } from 'react';

export interface MapSlotContextValue {
  slot: HTMLDivElement | null;
  setSlot: Dispatch<SetStateAction<HTMLDivElement | null>>;
}

export const MapSlotContext = createContext<MapSlotContextValue | null>(null);
