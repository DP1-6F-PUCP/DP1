package com.paqrap.experimentacion;

import com.paqrap.dominio.Almacen;
import com.paqrap.dominio.AlmacenCentral;
import com.paqrap.dominio.AlmacenIntermedio;
import com.paqrap.dominio.Bloqueo;
import com.paqrap.dominio.Ciudad;
import com.paqrap.dominio.ConfiguracionOperacion;
import com.paqrap.dominio.ContextoProblema;
import com.paqrap.dominio.Nodo;
import com.paqrap.dominio.Pedido;
import com.paqrap.dominio.Planificador;
import com.paqrap.dominio.Ruta;
import com.paqrap.dominio.TipoAlgoritmo;
import com.paqrap.dominio.TipoVehiculo;
import com.paqrap.dominio.UnidadTransporte;
import com.paqrap.PlanificadorFactory;
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
 * Prueba de escalamiento de flota (NO forma parte de la selección de configuración de producción
 * de {@link AfinamientoIPSO}) — responde una pregunta de negocio distinta: si PaqRap escala su
 * flota a vehículos de mayor capacidad (los tipos de vehículo son configurables en tiempo de
 * ejecución vía {@code TipoVehiculoDTO}, no hardcodeados), ¿los hiperparámetros de IPSO empiezan a
 * importar?
 *
 * <p>Con las capacidades reales del curso (auto=24, pedido promedio≈5.66), el lote más grande por
 * vehículo se satura en ~6 pedidos — un TSP casi trivial donde cualquier configuración converge
 * al mismo óptimo (ver {@code afinamiento_ipso.csv}). Aquí se duplican las capacidades (auto→48,
 * moto→16, bici→8) para verificar si, con sub-problemas más grandes, sí aparece una configuración
 * ganadora — y así decidir si IPSO sería una recomendación condicionada a un crecimiento futuro de
 * flota, no a la flota actual.
 */
public final class AfinamientoIPSOFlotaEscalada {

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

    private AfinamientoIPSOFlotaEscalada() {
    }

    private record FilaResultado(String bloque, String poblacion, String inercia, String aceleracion, String cruce,
            MetricasCorrida metricas) {
    }

    public static void main(String[] args) throws IOException {
        CargadorRecursos cargador = new CargadorRecursos("../backend/data", "../backend/config");
        List<FilaResultado> resultados = new ArrayList<>();

        for (int[] mesBloque : MESES_BLOQUE) {
            String nombreBloque = String.format("%04d-%02d", mesBloque[0], mesBloque[1]);
            List<Pedido> pedidosBase = EntornoEstandar.primerosPedidos(
                    cargador.cargarPedidos(mesBloque[0], mesBloque[1]).getPedidos());
            List<Bloqueo> bloqueos = EntornoEstandar.bloqueosRelevantes(
                    cargador.cargarBloqueos(mesBloque[0], mesBloque[1]).getBloqueos(), pedidosBase);
            System.out.printf(Locale.US, "Instancia %s: %d pedidos%n", nombreBloque, pedidosBase.size());

            for (Nivel poblacion : POBLACION) {
                for (Nivel inercia : INERCIA) {
                    for (Nivel aceleracion : ACELERACION) {
                        for (Nivel cruce : CRUCE) {
                            Map<String, Object> config = construirConfig(poblacion, inercia, aceleracion, cruce);
                            MetricasCorrida metricas = correr(config, pedidosBase, bloqueos);
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

        exportarCsv(resultados, "resultados/afinamiento_ipso_flota_escalada.csv");
        System.out.println("\nResultados exportados a resultados/afinamiento_ipso_flota_escalada.csv");
    }

    private static MetricasCorrida correr(Map<String, Object> config, List<Pedido> pedidosBase,
            List<Bloqueo> bloqueos) {
        List<Pedido> pedidos = EntornoEstandar.clonarPedidos(pedidosBase);
        Ciudad ciudad = EntornoEstandar.ciudad();
        ConfiguracionOperacion operacion = EntornoEstandar.operacion();
        List<Almacen> almacenes = EntornoEstandar.almacenes();
        List<UnidadTransporte> flota = flotaCapacidadDuplicada();

        LocalDateTime instante = pedidos.isEmpty()
                ? LocalDateTime.of(2026, 1, 1, 7, 0)
                : pedidos.get(0).getFechaIngreso().withHour(7).withMinute(0).withSecond(0).withNano(0);

        ContextoProblema contexto = new ContextoProblema(instante, pedidos, bloqueos, List.of(), almacenes, flota,
                ciudad, operacion);

        Planificador planificador = PlanificadorFactory.crear(TipoAlgoritmo.IPSO, config);

        long inicioMs = System.currentTimeMillis();
        List<Ruta> rutas = planificador.planificarRutas(contexto);
        long tiempoComputoMs = System.currentTimeMillis() - inicioMs;

        double iteracionMejora = ((PlanificadorIPSO) planificador).getPromedioIteracionMejora();

        return MetricasCorrida.medir(rutas, ciudad, bloqueos, operacion, tiempoComputoMs, iteracionMejora);
    }

    /** Misma composición de flota que {@link EntornoEstandar#flota()}, con capacidad duplicada por tipo. */
    private static List<UnidadTransporte> flotaCapacidadDuplicada() {
        TipoVehiculo auto = new TipoVehiculo("AUTO", "Auto", 48, 40.0, 8.0, 10, 48);
        TipoVehiculo moto = new TipoVehiculo("MOTO", "Moto", 16, 25.0, 6.0, 15, 24);
        TipoVehiculo bici = new TipoVehiculo("BICI", "Bicicleta", 8, 12.0, 3.0, 12, 8);
        Nodo central = new Nodo(27, 14);
        LocalDateTime inicioTurno = LocalDateTime.of(2026, 1, 1, 7, 0);

        List<UnidadTransporte> flota = new ArrayList<>();
        for (int i = 1; i <= 10; i++) {
            flota.add(new UnidadTransporte(String.format("TA%02d", i), auto, central, inicioTurno));
        }
        for (int i = 1; i <= 15; i++) {
            flota.add(new UnidadTransporte(String.format("TM%02d", i), moto, central, inicioTurno));
        }
        for (int i = 1; i <= 12; i++) {
            flota.add(new UnidadTransporte(String.format("TB%02d", i), bici, central, inicioTurno));
        }
        return flota;
    }

    private static Map<String, Object> construirConfig(Nivel poblacion, Nivel inercia, Nivel aceleracion,
            Nivel cruce) {
        Map<String, Object> config = new HashMap<>();
        config.put("iteracionesMaximasT", PRESUPUESTO_ITERACIONES);
        config.put("umbralEstancamiento", 1.0e-4);
        config.put("semillaAleatoria", 42.0);
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
