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
 * Fase 1 — afinamiento de IPSO: factorial 2⁴ sobre los 4 parámetros que gobiernan el mecanismo de
 * búsqueda (no el presupuesto de cómputo, fijo e igual al de ALNS en {@link AfinamientoALNS}).
 *
 * <p>Factores:
 * <ul>
 *   <li>{@code tamanoPoblacionN}: tamaño del enjambre</li>
 *   <li>{@code inercia}: retención de velocidad (momentum)</li>
 *   <li>{@code c} (=c1=c2 combinados): en la literatura clásica de PSO (Shi &amp; Eberhart 1998,
 *       Clerc &amp; Kennedy 2002) los coeficientes cognitivo y social casi nunca se estudian por
 *       separado — se combinan porque es su balance conjunto el que gobierna exploración vs.
 *       explotación</li>
 *   <li>{@code tasaCruceP_c}: diversidad inyectada vía cruce de orden</li>
 * </ul>
 *
 * <p>{@code iteracionesMaximasT} se fija en 300 (igual a {@code maxIteraciones} de ALNS) — no es
 * un factor de este experimento.
 */
public final class AfinamientoIPSO {

    // Ver nota en AfinamientoALNS: presupuesto real de 300, igualado entre ALNS e IPSO y con la
    // Fase 2 — ya no hace falta reducirlo tras optimizar CalculadorDistancia.
    private static final int PRESUPUESTO_ITERACIONES = 300;
    private static final int[][] MESES_BLOQUE = {{2026, 1}, {2027, 5}};

    private record Nivel(String nombre, Map<String, Object> valores) {
    }

    private static final Nivel[] POBLACION = {
            new Nivel("-", Map.of("tamanoPoblacionN", 20)),
            new Nivel("+", Map.of("tamanoPoblacionN", 60)),
    };
    private static final Nivel[] INERCIA = {
            new Nivel("-", Map.of("inercia", 0.2)),
            new Nivel("+", Map.of("inercia", 0.5)),
    };
    private static final Nivel[] ACELERACION = {
            new Nivel("-", Map.of("c1", 1.0, "c2", 1.0)),
            new Nivel("+", Map.of("c1", 2.0, "c2", 2.0)),
    };
    private static final Nivel[] CRUCE = {
            new Nivel("-", Map.of("tasaCruceP_c", 0.15)),
            new Nivel("+", Map.of("tasaCruceP_c", 0.45)),
    };

    private AfinamientoIPSO() {
    }

    private record FilaResultado(String bloque, String poblacion, String inercia, String aceleracion, String cruce,
            MetricasCorrida metricas) {
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

            for (Nivel poblacion : POBLACION) {
                for (Nivel inercia : INERCIA) {
                    for (Nivel aceleracion : ACELERACION) {
                        for (Nivel cruce : CRUCE) {
                            Map<String, Object> config = construirConfig(poblacion, inercia, aceleracion, cruce);
                            MetricasCorrida metricas = ExperimentoComparativo.correr(TipoAlgoritmo.IPSO, config,
                                    pedidos, bloqueos);
                            resultados.add(new FilaResultado(nombreBloque, poblacion.nombre(), inercia.nombre(),
                                    aceleracion.nombre(), cruce.nombre(), metricas));
                            System.out.printf(Locale.US, "  pobl=%s iner=%s acel=%s cruce=%s -> costo=%.2f iterMejora=%.1f%n",
                                    poblacion.nombre(), inercia.nombre(), aceleracion.nombre(), cruce.nombre(),
                                    metricas.costoTotal(), metricas.iteracionMejora());
                        }
                    }
                }
            }
        }

        exportarCsv(resultados, "resultados/afinamiento_ipso.csv");
        System.out.println("\nResultados exportados a resultados/afinamiento_ipso.csv");
    }

    private static Map<String, Object> construirConfig(Nivel poblacion, Nivel inercia, Nivel aceleracion,
            Nivel cruce) {
        Map<String, Object> config = new HashMap<>();
        // Presupuesto de cómputo fijo, no es factor de este experimento.
        config.put("iteracionesMaximasT", PRESUPUESTO_ITERACIONES);
        config.put("umbralEstancamiento", 1.0e-4);
        config.put("semillaAleatoria", 42.0);
        // Factores del experimento.
        config.putAll(poblacion.valores());
        config.putAll(inercia.valores());
        config.putAll(aceleracion.valores());
        config.putAll(cruce.valores());
        return config;
    }

    private static void exportarCsv(List<FilaResultado> resultados, String rutaArchivo) throws IOException {
        Path path = Path.of(rutaArchivo);
        if (path.getParent() != null) {
            Files.createDirectories(path.getParent());
        }
        try (PrintWriter pw = new PrintWriter(Files.newBufferedWriter(path, StandardCharsets.UTF_8))) {
            pw.println("bloque,poblacion,inercia,aceleracion,cruce,costoTotal,pctATiempo,tiempoComputoMs,"
                    + "rutasFactibles,rutasTotales,iteracionMejora");
            for (FilaResultado fila : resultados) {
                MetricasCorrida m = fila.metricas();
                pw.printf(Locale.US, "%s,%s,%s,%s,%s,%.2f,%.2f,%d,%d,%d,%.2f%n", fila.bloque(), fila.poblacion(),
                        fila.inercia(), fila.aceleracion(), fila.cruce(), m.costoTotal(), m.pctATiempo(),
                        m.tiempoComputoMs(), m.rutasFactibles(), m.rutasTotales(), m.iteracionMejora());
            }
        }
    }
}
