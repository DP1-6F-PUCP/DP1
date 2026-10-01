package com.paqrap.dominio;

import java.time.LocalDateTime;

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
    public void descontarStock(int cantidad, LocalDateTime instante) {
        // Inventario infinito: no afecta la disponibilidad, pero el movimiento físico sí ocurrió
        // y se traza igual.
        registrarMovimiento(TipoMovimiento.SALIDA_DESPACHO, cantidad, instante);
    }

    @Override
    public void recargar(LocalDateTime instante) {
        // Inventario infinito: nunca se agota, "recargar" no tiene sentido conceptual aquí -- no
        // se registra movimiento.
    }
}
