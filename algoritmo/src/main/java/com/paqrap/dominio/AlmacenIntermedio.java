package com.paqrap.dominio;

import java.time.LocalDateTime;

/** Almacén con capacidad máxima limitada, recargado instantáneamente cada día a las 23:59:59. */
public class AlmacenIntermedio extends Almacen {

    private final String nombre;
    // No final: TipoSolicitud.CAMBIO_CAPACIDAD_ALMACEN permite ajustarla en caliente.
    private int capacidadMaxima;
    private int stockActual;
    // No final: TipoSolicitud.CAMBIO_FRECUENCIA_RECARGA permite ajustarla en caliente. Default 24h
    // reproduce el comportamiento original (recarga diaria a medianoche).
    private double frecuenciaRecargaHoras = 24.0;

    public AlmacenIntermedio(Nodo posicion, String nombre, int capacidadMaxima, int stockActual) {
        super(posicion);
        this.nombre = nombre;
        this.capacidadMaxima = capacidadMaxima;
        this.stockActual = stockActual;
    }

    public double getFrecuenciaRecargaHoras() {
        return frecuenciaRecargaHoras;
    }

    public void setFrecuenciaRecargaHoras(double frecuenciaRecargaHoras) {
        this.frecuenciaRecargaHoras = frecuenciaRecargaHoras;
    }

    public String getNombre() {
        return nombre;
    }

    public int getCapacidadMaxima() {
        return capacidadMaxima;
    }

    public void setCapacidadMaxima(int capacidadMaxima) {
        this.capacidadMaxima = capacidadMaxima;
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
