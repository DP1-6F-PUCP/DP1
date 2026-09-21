package com.paqrap.dominio;

/**
 * Configuración de la red vial reticular sobre la que operan las unidades de transporte.
 *
 * <p>Todas las calles son de doble sentido, sin diagonales ni curvas; la distancia entre nodos
 * adyacentes es constante ({@code distanciaEntreNodos}).
 *
 * @param ancho ancho de la ciudad en kilómetros (eje X)
 * @param alto alto de la ciudad en kilómetros (eje Y)
 * @param origen nodo que representa la esquina inferior izquierda, coordenada (0, 0)
 * @param distanciaEntreNodos distancia en kilómetros entre dos nodos adyacentes
 * @param callesDobleSentido si las calles permiten tránsito en ambos sentidos
 */
public record Ciudad(int ancho, int alto, Nodo origen, int distanciaEntreNodos, boolean callesDobleSentido) {

    /**
     * Verifica si un nodo cae dentro de los límites de la ciudad.
     *
     * @param nodo nodo a validar
     * @return {@code true} si el nodo está dentro de los límites [origen, origen + (ancho, alto)]
     */
    public boolean esNodoValido(Nodo nodo) {
        int minX = origen.x();
        int minY = origen.y();
        return nodo.x() >= minX && nodo.x() <= minX + ancho
                && nodo.y() >= minY && nodo.y() <= minY + alto;
    }
}
