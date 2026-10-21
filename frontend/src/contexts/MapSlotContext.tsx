import { createContext, RefObject } from 'react';

/**
 * El valor del contexto es la ref al nodo DOM "host" del mapa (montado una sola vez en
 * RootLayout, siempre presente). Cada pagina (Dashboard/Seguimiento), via MapSlot, REPARENTA ese
 * mismo nodo con appendChild -- manipulacion de DOM nativa en vez de depender de que createPortal
 * reconcilie el cambio de contenedor entre renders.
 *
 * Bug real corregido (reintroducido por una fusion con un cambio de otro teammate que volvio a
 * usar createPortal con el contenedor en un useState -- exactamente el mismo patron que esta nota
 * ya documentaba como roto): el contenedor en useState queda en null transitoriamente entre que
 * una pagina lo suelta y la siguiente lo reclama, y ese null desmonta el mapa entero (Leaflet +
 * el motor de simulacion, con su suscripcion de animacion) antes de que la pagina nueva reclame
 * un contenedor nuevo. appendChild sobre un nodo que YA esta en el documento simplemente lo MUEVE
 * (nunca lo clona ni lo destruye), y useLayoutEffect corre sincronicamente antes de que el
 * navegador pinte, asi que la reubicacion es invisible -- el nodo real nunca deja de existir,
 * solo cambia de padre.
 */
export const MapSlotContext = createContext<RefObject<HTMLDivElement | null> | null>(null);
