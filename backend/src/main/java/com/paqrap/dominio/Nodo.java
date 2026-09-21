package com.paqrap.dominio;

/**
 * Punto de intersección (esquina) de la red reticular de la ciudad.
 *
 * @param x coordenada horizontal, en kilómetros desde el origen
 * @param y coordenada vertical, en kilómetros desde el origen
 */
public record Nodo(int x, int y) {

    @Override
    public String toString() {
        return "(" + x + ", " + y + ")";
    }
}
