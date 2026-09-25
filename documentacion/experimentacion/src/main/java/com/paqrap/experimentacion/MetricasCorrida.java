package com.paqrap.experimentacion;

import com.paqrap.alns.VerificadorRestricciones;
import com.paqrap.dominio.Bloqueo;
import com.paqrap.dominio.Ciudad;
import com.paqrap.dominio.ConfiguracionOperacion;
import com.paqrap.dominio.ParadaPlanificada;
import com.paqrap.dominio.Ruta;

import java.util.List;

/**
 * Métricas de una corrida individual (una instancia, un algoritmo, una configuración de
 * hiperparámetros), medidas de forma homogénea para todos los experimentos de este módulo.
 *
 * @param costoTotal suma de {@link Ruta#getCostoEstimado()} de todas las rutas devueltas
 * @param pctATiempo porcentaje de paradas cuya llegada estimada no supera la fecha límite del pedido
 * @param tiempoComputoMs milisegundos reales que tomó {@code planificarRutas(...)}
 * @param rutasFactibles cantidad de rutas que cumplen {@link VerificadorRestricciones#esRutaFactible}
 *         (restricción dura: capacidad, ventanas de tiempo, refrigerio, fin de turno)
 * @param rutasTotales cantidad total de rutas devueltas
 * @param iteracionMejora velocidad de convergencia: iteración (ALNS) o promedio entre lotes
 *         (IPSO) en la que se encontró la última mejora de la mejor solución — distingue
 *         configuraciones incluso cuando todas convergen al mismo costo final
 */
record MetricasCorrida(double costoTotal, double pctATiempo, long tiempoComputoMs, int rutasFactibles,
        int rutasTotales, double iteracionMejora) {

    static MetricasCorrida medir(List<Ruta> rutas, Ciudad ciudad, List<Bloqueo> bloqueos,
            ConfiguracionOperacion operacion, long tiempoComputoMs, double iteracionMejora) {
        double costoTotal = rutas.stream().mapToDouble(Ruta::getCostoEstimado).sum();

        int totalParadas = 0;
        int paradasATiempo = 0;
        int rutasFactibles = 0;
        for (Ruta ruta : rutas) {
            if (VerificadorRestricciones.esRutaFactible(ruta, ciudad, bloqueos, operacion)) {
                rutasFactibles++;
            }
            for (ParadaPlanificada parada : ruta.getSecuenciaParadas()) {
                totalParadas++;
                if (parada.getFechaEntregada() != null
                        && !parada.getFechaEntregada().isAfter(parada.getPedido().getFechaLimite())) {
                    paradasATiempo++;
                }
            }
        }
        double pctATiempo = totalParadas == 0 ? 100.0 : (100.0 * paradasATiempo / totalParadas);

        return new MetricasCorrida(costoTotal, pctATiempo, tiempoComputoMs, rutasFactibles, rutas.size(),
                iteracionMejora);
    }
}
