package com.paqrap.ipso.nucleo;

import com.paqrap.entrada.LectorJson;

import java.util.Map;

/**
 * Parámetros de entrada del algoritmo IPSO, según el pseudocódigo del informe de selección de
 * algoritmos: tamaño de población N, iteraciones máximas T_max, coeficientes c1/c2, tasa de
 * cruce p_c. Se añaden inercia y umbral de estancamiento como parámetros de calibración
 * empírica.
 */
public class IPSOConfig {

    private int tamanoPoblacionN = 40;
    private int iteracionesMaximasT = 300;
    private double c1 = 1.5;
    private double c2 = 1.5;
    private double tasaCruceP_c = 0.30;
    private double inercia = 0.35;
    private double umbralEstancamiento = 1.0e-4;
    private long semillaAleatoria = System.nanoTime();

    /**
     * Construye una configuración a partir de un mapa de datos (típicamente el resultado de
     * parsear {@code config-ipso.json} con {@link LectorJson}), usando los valores por defecto
     * para toda clave ausente.
     *
     * @param datos mapa de configuración
     * @return configuración de IPSO resultante
     */
    public static IPSOConfig cargarDesde(Map<String, Object> datos) {
        IPSOConfig c = new IPSOConfig();
        c.tamanoPoblacionN = LectorJson.getInt(datos, "tamanoPoblacionN", c.tamanoPoblacionN);
        c.iteracionesMaximasT = LectorJson.getInt(datos, "iteracionesMaximasT", c.iteracionesMaximasT);
        c.c1 = LectorJson.getDouble(datos, "c1", c.c1);
        c.c2 = LectorJson.getDouble(datos, "c2", c.c2);
        c.tasaCruceP_c = LectorJson.getDouble(datos, "tasaCruceP_c", c.tasaCruceP_c);
        c.inercia = LectorJson.getDouble(datos, "inercia", c.inercia);
        c.umbralEstancamiento = LectorJson.getDouble(datos, "umbralEstancamiento", c.umbralEstancamiento);
        c.semillaAleatoria = (long) LectorJson.getDouble(datos, "semillaAleatoria", c.semillaAleatoria);
        return c;
    }

    public int getTamanoPoblacionN() {
        return tamanoPoblacionN;
    }

    public IPSOConfig setTamanoPoblacionN(int n) {
        this.tamanoPoblacionN = n;
        return this;
    }

    public int getIteracionesMaximasT() {
        return iteracionesMaximasT;
    }

    public IPSOConfig setIteracionesMaximasT(int t) {
        this.iteracionesMaximasT = t;
        return this;
    }

    public double getC1() {
        return c1;
    }

    public IPSOConfig setC1(double c1) {
        this.c1 = c1;
        return this;
    }

    public double getC2() {
        return c2;
    }

    public IPSOConfig setC2(double c2) {
        this.c2 = c2;
        return this;
    }

    public double getTasaCruceP_c() {
        return tasaCruceP_c;
    }

    public IPSOConfig setTasaCruceP_c(double p) {
        this.tasaCruceP_c = p;
        return this;
    }

    public double getInercia() {
        return inercia;
    }

    public IPSOConfig setInercia(double inercia) {
        this.inercia = inercia;
        return this;
    }

    public double getUmbralEstancamiento() {
        return umbralEstancamiento;
    }

    public IPSOConfig setUmbralEstancamiento(double umbral) {
        this.umbralEstancamiento = umbral;
        return this;
    }

    public long getSemillaAleatoria() {
        return semillaAleatoria;
    }

    public IPSOConfig setSemillaAleatoria(long semilla) {
        this.semillaAleatoria = semilla;
        return this;
    }
}
