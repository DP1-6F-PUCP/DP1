package com.paqrap.dominio;

/** Almacén con inventario infinito; punto de partida obligatorio de toda unidad al inicio de un escenario. */
public class AlmacenCentral extends Almacen {

    public AlmacenCentral(Nodo posicion) {
        super(posicion);
    }

    @Override
    public boolean tieneStock(int cantidad) {
        return true;
    }

    @Override
    public void descontarStock(int cantidad) {
        // inventario infinito: no-op
    }

    @Override
    public void recargar() {
        // inventario infinito: no-op
    }
}
