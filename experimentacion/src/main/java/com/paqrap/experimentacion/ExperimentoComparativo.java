package com.paqrap.experimentacion;

import com.paqrap.PlanificadorFactory;
import com.paqrap.alns.SolucionadorALNS;
import com.paqrap.dominio.Bloqueo;
import com.paqrap.dominio.Ciudad;
import com.paqrap.dominio.ConfiguracionOperacion;
import com.paqrap.dominio.ContextoProblema;
import com.paqrap.dominio.Pedido;
import com.paqrap.dominio.Planificador;
import com.paqrap.dominio.Ruta;
import com.paqrap.dominio.TipoAlgoritmo;
import com.paqrap.entrada.CargadorRecursos;
import com.paqrap.ipso.PlanificadorIPSO;

import java.io.IOException;
import java.io.PrintWriter;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * Fase 2 — la competencia: corre ALNS e IPSO, cada uno en su MEJOR configuración de
 * hiperparámetros (según la Fase 1, ver {@link AfinamientoALNS}/{@link AfinamientoIPSO}), sobre
 * las mismas instancias reales del problema (bloques) y exporta los resultados en el formato que
 * requiere un Diseño en Bloques Completos al Azar (DBCA) — bloque = instancia de problema (mes),
 * tratamiento = algoritmo — para analizarse con {@code aov(respuesta ~ bloque + tratamiento)}.
 *
 * <p><b>No forma parte del sistema PaqRap</b>: no aparece en el diagrama de clases canónico, y
 * vive deliberadamente en un módulo Maven separado de {@code backend/}.
 *
 * <p>{@code configAlns} usa la configuración ganadora de {@link AfinamientoALNS} (efectos
 * principales sobre el bloque 2027-05, el único que discriminó en la Fase 1: mayor intensidad de
 * destrucción, adaptación rápida, enfriamiento SA lento, épsilon RVND estricto) sobre la base de
 * {@code config-alns.json}. {@code configIpso} se queda en los valores por defecto de
 * {@code config-ipso.json}: la Fase 1 no encontró ninguna configuración que superara de forma
 * demostrable a otra (los lotes por vehículo son TSPs casi triviales dado el tamaño real de la
 * flota — ver {@code afinamiento_ipso.csv} y la prueba de escalamiento de flota en
 * {@link AfinamientoIPSOFlotaEscalada}), así que no había base para elegir un config distinto al
 * por defecto.
 *
 * <p>Cada instancia usa los primeros {@link EntornoEstandar#PEDIDOS_POR_INSTANCIA} pedidos
 * (en orden cronológico) del mes correspondiente y los bloqueos vigentes de ese mismo mes.
 */
public final class ExperimentoComparativo {

    private static final int[][] MESES_BLOQUE = {
            {2026, 1}, {2026, 5}, {2026, 9},
            {2027, 1}, {2027, 5}, {2027, 9},
            {2028, 1}, {2028, 5},
    };

    private ExperimentoComparativo() {
    }

    private record FilaResultado(String bloque, String tratamiento, MetricasCorrida metricas) {
    }

    public static void main(String[] args) throws IOException {
        CargadorRecursos cargador = new CargadorRecursos("../backend/data", "../backend/config");
        Map<String, Object> configAlns = new HashMap<>(cargador.cargarConfigAlns());
        configAlns.putAll(Map.of(
                "minCantidadDestruccion", 3, "maxCantidadDestruccion", 8,
                "factorReaccion", 0.4, "intervaloActualizacion", 10,
                "temperaturaAceptacionSA", 150.0, "tasaEnfriamientoSA", 0.999,
                "epsilonMejoraRVND", 0.001));
        Map<String, Object> configIpso = cargador.cargarConfigIpso();

        List<FilaResultado> resultados = new ArrayList<>();

        for (int[] mesBloque : MESES_BLOQUE) {
            int anio = mesBloque[0];
            int mes = mesBloque[1];
            String nombreBloque = String.format("%04d-%02d", anio, mes);

            List<Pedido> pedidosInstancia = EntornoEstandar.primerosPedidos(cargador.cargarPedidos(anio, mes).getPedidos());
            List<Bloqueo> bloqueosInstancia = EntornoEstandar.bloqueosRelevantes(
                    cargador.cargarBloqueos(anio, mes).getBloqueos(), pedidosInstancia);

            System.out.printf(Locale.US, "Instancia %s: %d pedidos, %d bloqueos%n", nombreBloque,
                    pedidosInstancia.size(), bloqueosInstancia.size());

            resultados.add(new FilaResultado(nombreBloque, TipoAlgoritmo.ALNS.name(),
                    correr(TipoAlgoritmo.ALNS, configAlns, pedidosInstancia, bloqueosInstancia)));
            resultados.add(new FilaResultado(nombreBloque, TipoAlgoritmo.IPSO.name(),
                    correr(TipoAlgoritmo.IPSO, configIpso, pedidosInstancia, bloqueosInstancia)));
        }

        exportarCsv(resultados, "resultados/experimento_comparativo.csv");
        System.out.println("\nResultados exportados a resultados/experimento_comparativo.csv");
        resultados.forEach(System.out::println);
    }

    static MetricasCorrida correr(TipoAlgoritmo tipo, Map<String, Object> config, List<Pedido> pedidosInstancia,
            List<Bloqueo> bloqueosInstancia) {
        // Cada corrida recibe sus propios Pedido/UnidadTransporte/Almacen frescos: ambos
        // algoritmos mutan estado y no deben contaminarse entre sí ni entre bloques.
        List<Pedido> pedidos = EntornoEstandar.clonarPedidos(pedidosInstancia);
        Ciudad ciudad = EntornoEstandar.ciudad();
        ConfiguracionOperacion operacion = EntornoEstandar.operacion();

        LocalDateTime instante = pedidos.isEmpty()
                ? LocalDateTime.of(2026, 1, 1, 7, 0)
                : pedidos.get(0).getFechaIngreso().withHour(7).withMinute(0).withSecond(0).withNano(0);

        ContextoProblema contexto = new ContextoProblema(instante, pedidos, bloqueosInstancia, List.of(),
                EntornoEstandar.almacenes(), EntornoEstandar.flota(), ciudad, operacion);

        Planificador planificador = PlanificadorFactory.crear(tipo, config);

        long inicioMs = System.currentTimeMillis();
        List<Ruta> rutas = planificador.planificarRutas(contexto);
        long tiempoComputoMs = System.currentTimeMillis() - inicioMs;

        double iteracionMejora = switch (planificador) {
            case SolucionadorALNS alns -> alns.getUltimaIteracionMejora();
            case PlanificadorIPSO ipso -> ipso.getPromedioIteracionMejora();
            default -> -1.0;
        };

        return MetricasCorrida.medir(rutas, ciudad, bloqueosInstancia, operacion, tiempoComputoMs, iteracionMejora);
    }

    private static void exportarCsv(List<FilaResultado> resultados, String rutaArchivo) throws IOException {
        Path path = Path.of(rutaArchivo);
        if (path.getParent() != null) {
            Files.createDirectories(path.getParent());
        }
        try (PrintWriter pw = new PrintWriter(Files.newBufferedWriter(path, StandardCharsets.UTF_8))) {
            pw.println("bloque,tratamiento,costoTotal,pctATiempo,tiempoComputoMs,rutasFactibles,rutasTotales,"
                    + "iteracionMejora");
            for (FilaResultado fila : resultados) {
                MetricasCorrida m = fila.metricas();
                pw.printf(Locale.US, "%s,%s,%.2f,%.2f,%d,%d,%d,%.2f%n", fila.bloque(), fila.tratamiento(), m.costoTotal(),
                        m.pctATiempo(), m.tiempoComputoMs(), m.rutasFactibles(), m.rutasTotales(), m.iteracionMejora());
            }
        }
    }
}
