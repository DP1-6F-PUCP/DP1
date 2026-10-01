package com.paqrap.dominio;

import java.time.LocalDateTime;

/** Almacén con capacidad máxima limitada, recargado instantáneamente cada día a las 23:59:59. */
public class AlmacenIntermedio extends Almacen {

    private final String nombre;
    private final int capacidadMaxima;
    private int stockActual;

    public AlmacenIntermedio(Nodo posicion, String nombre, int capacidadMaxima, int stockActual) {
        super(posicion);
        this.nombre = nombre;
        this.capacidadMaxima = capacidadMaxima;
        this.stockActual = stockActual;
    }

    public String getNombre() {
        return nombre;
    }

    public int getCapacidadMaxima() {
        return capacidadMaxima;
    }

    public int getStockActual() {
        return stockActual;
    }

    @Override
    public boolean tieneStock(int cantidad) {
        return stockActual >= cantidad;
    }

    @Override
    public void descontarStock(int cantidad, LocalDateTime instante) {
        if (cantidad > stockActual) {
            throw new IllegalStateException(
                    "El almacén " + nombre + " no tiene stock suficiente: solicitado " + cantidad
                            + ", disponible " + stockActual);
        }
        stockActual -= cantidad;
        registrarMovimiento(TipoMovimiento.SALIDA_DESPACHO, cantidad, instante);
    }

    @Override
    public void recargar(LocalDateTime instante) {
        int cantidadRecargada = capacidadMaxima - stockActual;
        stockActual = capacidadMaxima;
        if (cantidadRecargada > 0) {
            registrarMovimiento(TipoMovimiento.ENTRADA_RECARGA, cantidadRecargada, instante);
        }
    }
}
