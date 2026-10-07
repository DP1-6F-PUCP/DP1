import React, { useContext, useLayoutEffect, useRef } from 'react';
import { MapSlotContext } from '../../contexts/MapSlotContext';

interface MapSlotProps {
  className?: string;
}

/**
 * Dashboard/Rutas/Seguimiento antes montaban cada una su PROPIA instancia de LeafletManhattanMap
 * -- al navegar, el mapa viejo se destruia por completo y el nuevo se creaba desde cero, perdiendo
 * el estado de la animacion en tiempo real (vehicleMarkersRef/vehicleSyncRef viven DENTRO del
 * componente del mapa). Se sentia como si la simulacion se reiniciara, aunque el backend nunca se
 * tocaba.
 *
 * Este componente no renderiza el mapa: reparenta (appendChild, no clona) el nodo DOM real del
 * mapa -- montado UNA sola vez en RootLayout -- hacia el lugar exacto donde esta pagina lo quiere.
 * useLayoutEffect corre sincronicamente antes de que el navegador pinte, asi que la reubicacion es
 * invisible; el nodo nunca se destruye, solo cambia de padre.
 */
export const MapSlot: React.FC<MapSlotProps> = ({ className }) => {
  const mapHostRef = useContext(MapSlotContext);
  const slotRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const host = mapHostRef?.current;
    const slot = slotRef.current;
    if (!host || !slot) return;
    // El host arranca con className="hidden" en RootLayout (para no destellar en su posicion
    // original antes de ser reclamado) -- se descubre apenas una pagina lo adopta.
    host.classList.remove('hidden');
    slot.appendChild(host);
  });

  return <div ref={slotRef} className={className} />;
};
