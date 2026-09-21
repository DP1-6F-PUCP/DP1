package com.paqrap.dominio;

/** Punto de abastecimiento del producto P, central o intermedio. */
public abstract class Almacen {

    private final Nodo posicion;

    protected Almacen(Nodo posicion) {
        this.posicion = posicion;
    }

    public Nodo getPosicion() {
        return posicion;
    }

    /**
     * Verifica si el almacén puede despachar la cantidad solicitada.
     *
     * @param cantidad unidades de producto P requeridas
     * @return {@code true} si el almacén tiene stock suficiente
     */
    public abstract boolean tieneStock(int cantidad);

    /**
     * Descuenta stock del almacén tras un despacho.
     *
     * @param cantidad unidades de producto P despachadas
     */
    public abstract void descontarStock(int cantidad);

    /** Repone el stock del almacén a su capacidad máxima (recarga diaria a las 23:59:59). */
    public abstract void recargar();
}
