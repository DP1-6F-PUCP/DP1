package com.paqrap.exposicion;

import java.time.LocalDateTime;

/**
 * Un punto del recorrido real de un vehículo en el último lote (ver
 * {@code UnidadTransporte.PuntoTrayectoria}): desde {@code instante} hasta el punto siguiente, el
 * vehículo hace {@code actividad} -- si el punto siguiente está en otro nodo, viaja hacia él.
 *
 * @param retorno el tramo que empieza aquí es un viaje hacia un almacén sin repartir (regreso, o
 *         camino a cargar): el mapa lo pinta gris hasta que llega
 * @param cargaABordo paquetes que lleva físicamente en ese tramo (el mapa lo usa durante el regreso,
 *         cuando el estado del final del lote ya puede mostrarla cargada para la ruta siguiente)
 */
public record PuntoTrayectoriaDTO(int x, int y, LocalDateTime instante, String actividad, boolean retorno,
        int cargaABordo) {
}
