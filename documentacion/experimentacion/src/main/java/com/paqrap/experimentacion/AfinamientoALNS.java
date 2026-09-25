package com.paqrap.experimentacion;

import com.paqrap.dominio.Bloqueo;
import com.paqrap.dominio.Pedido;
import com.paqrap.dominio.TipoAlgoritmo;
import com.paqrap.entrada.CargadorRecursos;

import java.io.IOException;
import java.io.PrintWriter;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * Fase 1 — afinamiento de ALNS: factorial 2⁴ sobre los 4 parámetros que gobiernan el mecanismo de
 * búsqueda (no el presupuesto de cómputo, que se deja fijo e igual al de IPSO para que la Fase 2
 * compare mecanismo contra mecanismo).
 *
 * <p>Factores (cada uno combina, cuando aplica, el par de parámetros de {@code ConfiguracionALNS}
 * que la literatura de ALNS trata conjuntamente — Ropke &amp; Pisinger 2006):
 * <ul>
 *   <li>Intensidad de destrucción: {@code minCantidadDestruccion}+{@code maxCantidadDestruccion}</li>
 *   <li>Velocidad de adaptación: {@code factorReaccion}+{@code intervaloActualizacion} (largo de segmento)</li>
 *   <li>Programa de enfriamiento SA: {@code temperaturaAceptacionSA}+{@code tasaEnfriamientoSA}</li>
 *   <li>{@code epsilonMejoraRVND}: único parámetro que gobierna su propio mecanismo (sensibilidad
 *       de la búsqueda local), sin pareja natural en la literatura</li>
 * </ul>
 *
 * <p>{@code maxIteraciones} se fija en 300 (igual a {@code iteracionesMaximasT} de IPSO en
 * {@link AfinamientoIPSO}) — no es un factor de este experimento.
 */
public final class AfinamientoALNS {

    // Presupuesto real, igualado entre ALNS e IPSO y con la Fase 2 (ExperimentoComparativo):
    // tras optimizar CalculadorDistancia (camino directo + A* en vez de BFS a ciegas), una
    // corrida completa de 300 iteraciones toma ~6s, así que ya no hace falta reducir el
    // presupuesto de la Fase 1 para que el factorial completo (32 corridas) sea tratable.
    private static final int PRESUPUESTO_ITERACIONES = 300;
    private static final int[][] MESES_BLOQUE = {{2026, 1}, {2027, 5}};

    private record Nivel(String nombre, Map<String, Object> valores) {
    }

    private static final Nivel[] DESTRUCCION = {
            new Nivel("-", Map.of("minCantidadDestruccion", 1, "maxCantidadDestruccion", 3)),
            new Nivel("+", Map.of("minCantidadDestruccion", 3, "maxCantidadDestruccion", 8)),
    };
    private static final Nivel[] ADAPTACION = {
            new Nivel("-", Map.of("factorReaccion", 0.1, "intervaloActualizacion", 25)),
            new Nivel("+", Map.of("factorReaccion", 0.4, "intervaloActualizacion", 10)),
    };
    private static final Nivel[] ENFRIAMIENTO = {
            new Nivel("-", Map.of("temperaturaAceptacionSA", 50.0, "tasaEnfriamientoSA", 0.99)),
            new Nivel("+", Map.of("temperaturaAceptacionSA", 150.0, "tasaEnfriamientoSA", 0.999)),
    };
    private static final Nivel[] EPSILON_RVND = {
            new Nivel("-", Map.of("epsilonMejoraRVND", 0.001)),
            new Nivel("+", Map.of("epsilonMejoraRVND", 0.05)),
    };

    private AfinamientoALNS() {
    }

    private record FilaResultado(String bloque, String destruccion, String adaptacion, String enfriamiento,
            String epsilon, MetricasCorrida metricas) {
    }

    public static void main(String[] args) throws IOException {
        CargadorRecursos cargador = new CargadorRecursos("../backend/data", "../backend/config");
        List<FilaResultado> resultados = new ArrayList<>();

        for (int[] mesBloque : MESES_BLOQUE) {
            String nombreBloque = String.format("%04d-%02d", mesBloque[0], mesBloque[1]);
            List<Pedido> pedidos = EntornoEstandar.primerosPedidos(
                    cargador.cargarPedidos(mesBloque[0], mesBloque[1]).getPedidos());
            List<Bloqueo> bloqueos = EntornoEstandar.bloqueosRelevantes(
                    cargador.cargarBloqueos(mesBloque[0], mesBloque[1]).getBloqueos(), pedidos);
            System.out.printf(Locale.US, "Instancia %s: %d pedidos%n", nombreBloque, pedidos.size());

            for (Nivel destruccion : DESTRUCCION) {
                for (Nivel adaptacion : ADAPTACION) {
                    for (Nivel enfriamiento : ENFRIAMIENTO) {
                        for (Nivel epsilon : EPSILON_RVND) {
                            Map<String, Object> config = construirConfig(destruccion, adaptacion, enfriamiento, epsilon);
                            MetricasCorrida metricas = ExperimentoComparativo.correr(TipoAlgoritmo.ALNS, config,
                                    pedidos, bloqueos);
                            resultados.add(new FilaResultado(nombreBloque, destruccion.nombre(), adaptacion.nombre(),
                                    enfriamiento.nombre(), epsilon.nombre(), metricas));
                            System.out.printf(Locale.US, "  destr=%s adapt=%s enfr=%s eps=%s -> costo=%.2f iterMejora=%.1f%n",
                                    destruccion.nombre(), adaptacion.nombre(), enfriamiento.nombre(), epsilon.nombre(),
                                    metricas.costoTotal(), metricas.iteracionMejora());
                        }
                    }
                }
            }
        }

        exportarCsv(resultados, "resultados/afinamiento_alns.csv");
        System.out.println("\nResultados exportados a resultados/afinamiento_alns.csv");
    }

    private static Map<String, Object> construirConfig(Nivel destruccion, Nivel adaptacion, Nivel enfriamiento,
            Nivel epsilon) {
        Map<String, Object> config = new HashMap<>();
        // Presupuesto de cómputo fijo, no es factor de este experimento.
        config.put("maxIteraciones", PRESUPUESTO_ITERACIONES);
        config.put("maxSinMejora", PRESUPUESTO_ITERACIONES);
        config.put("intervaloSPP", 20);
        config.put("puntajeMejorGlobal", 10.0);
        config.put("puntajeMejorActual", 5.0);
        config.put("puntajeAceptado", 2.0);
        config.put("pesoDistanciaShaw", 1.0);
        config.put("pesoTiempoShaw", 2.0);
        // Factores del experimento.
        config.putAll(destruccion.valores());
        config.putAll(adaptacion.valores());
        config.putAll(enfriamiento.valores());
        config.putAll(epsilon.valores());
        return config;
    }

    private static void exportarCsv(List<FilaResultado> resultados, String rutaArchivo) throws IOException {
        Path path = Path.of(rutaArchivo);
        if (path.getParent() != null) {
            Files.createDirectories(path.getParent());
        }
        try (PrintWriter pw = new PrintWriter(Files.newBufferedWriter(path, StandardCharsets.UTF_8))) {
            pw.println("bloque,destruccion,adaptacion,enfriamiento,epsilonRVND,costoTotal,pctATiempo,"
                    + "tiempoComputoMs,rutasFactibles,rutasTotales,iteracionMejora");
            for (FilaResultado fila : resultados) {
                MetricasCorrida m = fila.metricas();
                pw.printf(Locale.US, "%s,%s,%s,%s,%s,%.2f,%.2f,%d,%d,%d,%.2f%n", fila.bloque(), fila.destruccion(),
                        fila.adaptacion(), fila.enfriamiento(), fila.epsilon(), m.costoTotal(), m.pctATiempo(),
                        m.tiempoComputoMs(), m.rutasFactibles(), m.rutasTotales(), m.iteracionMejora());
            }
        }
    }
}
