package com.paqrap.alns;

import com.paqrap.entrada.LectorJson;

import java.util.Map;

/** Hiperparámetros del algoritmo ALNS, cargables desde {@code config-alns.json}. */
public class ConfiguracionALNS {

    private int maxIteraciones = 350;
    private int maxSinMejora = 90;
    private int intervaloActualizacion = 15;
    private int intervaloSPP = 20;
    private double factorReaccion = 0.2;
    private int minCantidadDestruccion = 1;
    private int maxCantidadDestruccion = 5;
    private double puntajeMejorGlobal = 10.0;
    private double puntajeMejorActual = 5.0;
    private double puntajeAceptado = 2.0;
    private double temperaturaAceptacionSA = 100.0;
    private double tasaEnfriamientoSA = 0.995;
    private double pesoDistanciaShaw = 1.0;
    private double pesoTiempoShaw = 2.0;
    private double epsilonMejoraRVND = 0.01;

    /**
     * Construye una configuración a partir de un mapa de datos (típicamente el resultado de
     * parsear {@code config-alns.json} con {@link LectorJson}), usando los valores por defecto
     * para toda clave ausente.
     *
     * @param datos mapa de configuración
     * @return configuración de ALNS resultante
     */
    public static ConfiguracionALNS cargarDesde(Map<String, Object> datos) {
        ConfiguracionALNS c = new ConfiguracionALNS();
        c.maxIteraciones = LectorJson.getInt(datos, "maxIteraciones", c.maxIteraciones);
        c.maxSinMejora = LectorJson.getInt(datos, "maxSinMejora", c.maxSinMejora);
        c.intervaloActualizacion = LectorJson.getInt(datos, "intervaloActualizacion", c.intervaloActualizacion);
        c.intervaloSPP = LectorJson.getInt(datos, "intervaloSPP", c.intervaloSPP);
        c.factorReaccion = LectorJson.getDouble(datos, "factorReaccion", c.factorReaccion);
        c.minCantidadDestruccion = LectorJson.getInt(datos, "minCantidadDestruccion", c.minCantidadDestruccion);
        c.maxCantidadDestruccion = LectorJson.getInt(datos, "maxCantidadDestruccion", c.maxCantidadDestruccion);
        c.puntajeMejorGlobal = LectorJson.getDouble(datos, "puntajeMejorGlobal", c.puntajeMejorGlobal);
        c.puntajeMejorActual = LectorJson.getDouble(datos, "puntajeMejorActual", c.puntajeMejorActual);
        c.puntajeAceptado = LectorJson.getDouble(datos, "puntajeAceptado", c.puntajeAceptado);
        c.temperaturaAceptacionSA = LectorJson.getDouble(datos, "temperaturaAceptacionSA", c.temperaturaAceptacionSA);
        c.tasaEnfriamientoSA = LectorJson.getDouble(datos, "tasaEnfriamientoSA", c.tasaEnfriamientoSA);
        c.pesoDistanciaShaw = LectorJson.getDouble(datos, "pesoDistanciaShaw", c.pesoDistanciaShaw);
        c.pesoTiempoShaw = LectorJson.getDouble(datos, "pesoTiempoShaw", c.pesoTiempoShaw);
        c.epsilonMejoraRVND = LectorJson.getDouble(datos, "epsilonMejoraRVND", c.epsilonMejoraRVND);
        return c;
    }

    public int getMaxIteraciones() {
        return maxIteraciones;
    }

    public void setMaxIteraciones(int maxIteraciones) {
        this.maxIteraciones = maxIteraciones;
    }

    public int getMaxSinMejora() {
        return maxSinMejora;
    }

    public void setMaxSinMejora(int maxSinMejora) {
        this.maxSinMejora = maxSinMejora;
    }

    public int getIntervaloActualizacion() {
        return intervaloActualizacion;
    }

    public void setIntervaloActualizacion(int intervaloActualizacion) {
        this.intervaloActualizacion = intervaloActualizacion;
    }

    public int getIntervaloSPP() {
        return intervaloSPP;
    }

    public void setIntervaloSPP(int intervaloSPP) {
        this.intervaloSPP = intervaloSPP;
    }

    public double getFactorReaccion() {
        return factorReaccion;
    }

    public void setFactorReaccion(double factorReaccion) {
        this.factorReaccion = factorReaccion;
    }

    public int getMinCantidadDestruccion() {
        return minCantidadDestruccion;
    }

    public void setMinCantidadDestruccion(int minCantidadDestruccion) {
        this.minCantidadDestruccion = minCantidadDestruccion;
    }

    public int getMaxCantidadDestruccion() {
        return maxCantidadDestruccion;
    }

    public void setMaxCantidadDestruccion(int maxCantidadDestruccion) {
        this.maxCantidadDestruccion = maxCantidadDestruccion;
    }

    public double getPuntajeMejorGlobal() {
        return puntajeMejorGlobal;
    }

    public void setPuntajeMejorGlobal(double puntajeMejorGlobal) {
        this.puntajeMejorGlobal = puntajeMejorGlobal;
    }

    public double getPuntajeMejorActual() {
        return puntajeMejorActual;
    }

    public void setPuntajeMejorActual(double puntajeMejorActual) {
        this.puntajeMejorActual = puntajeMejorActual;
    }

    public double getPuntajeAceptado() {
        return puntajeAceptado;
    }

    public void setPuntajeAceptado(double puntajeAceptado) {
        this.puntajeAceptado = puntajeAceptado;
    }

    public double getTemperaturaAceptacionSA() {
        return temperaturaAceptacionSA;
    }

    public void setTemperaturaAceptacionSA(double temperaturaAceptacionSA) {
        this.temperaturaAceptacionSA = temperaturaAceptacionSA;
    }

    public double getTasaEnfriamientoSA() {
        return tasaEnfriamientoSA;
    }

    public void setTasaEnfriamientoSA(double tasaEnfriamientoSA) {
        this.tasaEnfriamientoSA = tasaEnfriamientoSA;
    }

    public double getPesoDistanciaShaw() {
        return pesoDistanciaShaw;
    }

    public void setPesoDistanciaShaw(double pesoDistanciaShaw) {
        this.pesoDistanciaShaw = pesoDistanciaShaw;
    }

    public double getPesoTiempoShaw() {
        return pesoTiempoShaw;
    }

    public void setPesoTiempoShaw(double pesoTiempoShaw) {
        this.pesoTiempoShaw = pesoTiempoShaw;
    }

    public double getEpsilonMejoraRVND() {
        return epsilonMejoraRVND;
    }

    public void setEpsilonMejoraRVND(double epsilonMejoraRVND) {
        this.epsilonMejoraRVND = epsilonMejoraRVND;
    }
}
