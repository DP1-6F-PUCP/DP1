package com.paqrap.simulador;

/** Métricas de desempeño acumuladas por {@link OrquestadorOperacion} a lo largo de una ejecución. */
public class ReporteDesempeno {

    private float costoTotalAcumulado;
    private int contadorEntregados;
    private int contadorIncumplidos;
    private int contadorParadasReasignadas;
    private int contadorAverias;
    private int contadorInterferenciasBloqueo;

    public float getCostoTotalAcumulado() {
        return costoTotalAcumulado;
    }

    public void sumarCosto(double costo) {
        this.costoTotalAcumulado += costo;
    }

    public int getContadorEntregados() {
        return contadorEntregados;
    }

    public void incrementarEntregados(int cantidad) {
        this.contadorEntregados += cantidad;
    }

    public int getContadorIncumplidos() {
        return contadorIncumplidos;
    }

    public void incrementarIncumplidos(int cantidad) {
        this.contadorIncumplidos += cantidad;
    }

    public int getContadorParadasReasignadas() {
        return contadorParadasReasignadas;
    }

    public void incrementarParadasReasignadas(int cantidad) {
        this.contadorParadasReasignadas += cantidad;
    }

    public int getContadorAverias() {
        return contadorAverias;
    }

    public void incrementarAverias() {
        this.contadorAverias++;
    }

    public int getContadorInterferenciasBloqueo() {
        return contadorInterferenciasBloqueo;
    }

    public void incrementarInterferenciasBloqueo() {
        this.contadorInterferenciasBloqueo++;
    }

    /**
     * Calcula el porcentaje de pedidos entregados a tiempo sobre el total de pedidos resueltos
     * (entregados + incumplidos).
     *
     * @return porcentaje en [0, 100]; 100 si aún no se ha resuelto ningún pedido
     */
    public float porcentajeEntregasATiempo() {
        int totalResueltos = contadorEntregados + contadorIncumplidos;
        if (totalResueltos == 0) {
            return 100.0f;
        }
        return 100.0f * contadorEntregados / totalResueltos;
    }
}
