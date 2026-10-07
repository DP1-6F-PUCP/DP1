package com.paqrap.dominio;

/**
 * Catálogo de un tipo de vehículo de la flota (auto, moto o bicicleta).
 *
 * <p>{@code velocidadKmH}/{@code capacidad} son mutables porque el sistema debe permitir
 * cambiarlas "en caliente" por tipo de vehículo (parámetros configurables en tiempo de
 * ejecución, ver {@code TipoSolicitud.CAMBIO_VELOCIDAD}/{@code CAMBIO_CAPACIDAD}); el cambio
 * aplica a partir de la siguiente iteración de planificación.
 */
public class TipoVehiculo {

    private final String id;
    private final String nombre;
    private int capacidad;
    private double velocidadKmH;
    private final double costoPorKm;
    private final int cantidadUnidades;
    private final double duracionMantenimientoHoras;

    public TipoVehiculo(String id, String nombre, int capacidad, double velocidadKmH, double costoPorKm,
            int cantidadUnidades, double duracionMantenimientoHoras) {
        this.id = id;
        this.nombre = nombre;
        this.capacidad = capacidad;
        this.velocidadKmH = velocidadKmH;
        this.costoPorKm = costoPorKm;
        this.cantidadUnidades = cantidadUnidades;
        this.duracionMantenimientoHoras = duracionMantenimientoHoras;
    }

    public String getId() {
        return id;
    }

    public String getNombre() {
        return nombre;
    }

    public int getCapacidad() {
        return capacidad;
    }

    public void setCapacidad(int capacidad) {
        this.capacidad = capacidad;
    }

    public double getVelocidadKmH() {
        return velocidadKmH;
    }

    public void setVelocidadKmH(double velocidadKmH) {
        this.velocidadKmH = velocidadKmH;
    }

    public double getCostoPorKm() {
        return costoPorKm;
    }

    public int getCantidadUnidades() {
        return cantidadUnidades;
    }

    public double getDuracionMantenimientoHoras() {
        return duracionMantenimientoHoras;
    }

    @Override
    public String toString() {
        return id;
    }
}
