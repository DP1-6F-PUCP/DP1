import { createContext, RefObject } from 'react';

/**
 * El valor del contexto es la ref al nodo DOM "host" del mapa (montado una sola vez en
 * RootLayout, siempre presente). Cada pagina (Dashboard/Rutas/Seguimiento), via MapSlot, REPARENTA
 * ese mismo nodo con appendChild -- manipulacion de DOM nativa en vez de depender de que
 * createPortal reconcilie el cambio de contenedor entre renders.
 *
 * Bug real corregido: la version anterior usaba createPortal con el contenedor en un useState,
 * seteado a null al desmontar la pagina vieja -- ese null transitorio desmontaba el mapa entero
 * (Leaflet + animacion) antes de que la pagina nueva reclamara un contenedor nuevo. appendChild
 * sobre un nodo que YA esta en el documento simplemente lo MUEVE (nunca lo clona ni lo destruye),
 * y useLayoutEffect corre sincronicamente antes de que el navegador pinte, asi que la reubicacion
 * es invisible -- el nodo real nunca deja de existir, solo cambia de padre.
 */
export const MapSlotContext = createContext<RefObject<HTMLDivElement | null> | null>(null);
