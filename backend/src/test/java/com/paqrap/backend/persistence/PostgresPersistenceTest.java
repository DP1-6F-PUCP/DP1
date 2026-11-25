package com.paqrap.backend.persistence;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import com.paqrap.dominio.Bloqueo;
import com.paqrap.dominio.Nodo;
import com.paqrap.dominio.Pedido;
import com.paqrap.entrada.CargaArchivo;
import com.paqrap.exposicion.EstadoOperacionDTO;
import com.paqrap.exposicion.MetricasOperacionDTO;
import com.paqrap.exposicion.ReporteSimulacionDTO;
import com.paqrap.exposicion.ServicioPlanificacionImpl;
import com.paqrap.dominio.TipoAlgoritmo;
import com.paqrap.simulador.EjecucionEscenario;
import com.paqrap.simulador.EstadoEjecucion;
import com.paqrap.simulador.SolicitudOperacion;
import com.paqrap.simulador.TipoEscenario;
import com.paqrap.simulador.TipoSolicitud;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;

import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.junit.jupiter.api.Assumptions.assumeTrue;

/**
 * Pruebas de persistencia contra un PostgreSQL REAL (antes H2 en "modo PostgreSQL", que no entiende
 * {@code ON CONFLICT (col)} ni {@code JSONB}: 4 de 5 pruebas fallaban aunque el código sí funciona).
 *
 * <p>Cada prueba crea un esquema propio y le aplica la migración real {@code V1__initial_schema}
 * con Flyway (el catálogo de V2 no: cada prueba siembra el suyo, mínimo), y lo borra al terminar,
 * así no toca los datos de la aplicación aunque use la misma base. Conexión: las mismas variables
 * que la aplicación ({@code DB_HOST}, {@code DB_PORT}, {@code DB_NAME}, {@code DB_USER},
 * {@code DB_PASSWORD}) con sus mismos valores por defecto. Si no hay un PostgreSQL alcanzable, las
 * pruebas se SALTAN (no fallan): el build no depende de tener la base levantada.
 */
class PostgresPersistenceTest {

    private JdbcTemplate jdbcTemplate;
    private ObjectMapper objectMapper;
    private PostgresRepositorioOperacion repositorio;
    private PostgresCargadorRecursos cargador;
    private CatalogoPersistenceService catalogo;
    private String esquema;
    private JdbcTemplate administrador;

    private static String env(String nombre, String porDefecto) {
        String valor = System.getenv(nombre);
        return valor != null && !valor.isBlank() ? valor : porDefecto;
    }

    private static DriverManagerDataSource fuente(String parametros) {
        DriverManagerDataSource ds = new DriverManagerDataSource();
        ds.setDriverClassName("org.postgresql.Driver");
        ds.setUrl("jdbc:postgresql://" + env("DB_HOST", "localhost") + ":" + env("DB_PORT", "5432") + "/"
                + env("DB_NAME", "sysmile_db") + parametros);
        ds.setUsername(env("DB_USER", "sysmile_user"));
        ds.setPassword(env("DB_PASSWORD", "sysmile_password"));
        return ds;
    }

    @BeforeEach
    void setUp() {
        DriverManagerDataSource base = fuente("?connectTimeout=3");
        try (var conexion = base.getConnection()) {
            assumeTrue(conexion.isValid(3), "PostgreSQL no responde");
        } catch (java.sql.SQLException ex) {
            assumeTrue(false, "Sin PostgreSQL alcanzable (" + ex.getMessage() + "): se omiten las pruebas de persistencia");
        }
        administrador = new JdbcTemplate(base);

        esquema = "prueba_" + UUID.randomUUID().toString().replace("-", "");
        // Todas las migraciones (V1..última): así la prueba valida también las nuevas. El catálogo
        // oficial que siembra V2 se reemplaza abajo por uno mínimo.
        Flyway.configure()
                .dataSource(base)
                .schemas(esquema)
                .locations("classpath:db/migration")
                .load()
                .migrate();
        jdbcTemplate = new JdbcTemplate(fuente("?currentSchema=" + esquema));

        objectMapper = new ObjectMapper();
        objectMapper.registerModule(new JavaTimeModule());

        sembrarCatalogo();
        repositorio = new PostgresRepositorioOperacion(jdbcTemplate, objectMapper);
        cargador = new PostgresCargadorRecursos("data", "config", jdbcTemplate, objectMapper);
        catalogo = new CatalogoPersistenceService(jdbcTemplate);
    }

    @AfterEach
    void tearDown() {
        if (administrador != null && esquema != null) {
            administrador.execute("DROP SCHEMA IF EXISTS " + esquema + " CASCADE");
        }
    }

    private void sembrarCatalogo() {
        jdbcTemplate.execute("TRUNCATE vehicles, vehicle_types, warehouses, city_configs, operation_configs CASCADE");
        jdbcTemplate.update("INSERT INTO city_configs (id, width, height, origin_x, origin_y, node_distance_km, two_way_streets) "
                + "VALUES ('00000000-0000-0000-0000-000000000001', 70, 50, 0, 0, 1, TRUE)");
        jdbcTemplate.update("INSERT INTO operation_configs (id, shift_duration_hours, shift_start_hour, client_service_hours, "
                + "break_duration_hours, break_margin_hours, warehouse_load_hours, transshipment_hours, max_stops_per_route) "
                + "VALUES ('00000000-0000-0000-0000-000000000002', 8, 7, 1, 1, 1, 0, 0.5, 2)");
        jdbcTemplate.update("INSERT INTO vehicle_types (id, type_code, name, capacity, speed_kmh, cost_per_km, initial_units, maintenance_duration_hours) "
                + "VALUES ('00000000-0000-0000-0000-000000000101', 'AUTO', 'Auto', 24, 40, 8, 1, 48)");
        jdbcTemplate.update("INSERT INTO warehouses (id, name, warehouse_type, pos_x, pos_y, max_capacity, reload_frequency_hours) "
                + "VALUES ('00000000-0000-0000-0000-000000000201', 'Central', 'CENTRAL', 27, 14, 0, 0)");
        jdbcTemplate.update("INSERT INTO warehouses (id, name, warehouse_type, pos_x, pos_y, max_capacity, reload_frequency_hours) "
                + "VALUES ('00000000-0000-0000-0000-000000000202', 'Este', 'INTERMEDIO', 57, 27, 1000, 24)");
        jdbcTemplate.update("INSERT INTO vehicles (id, vehicle_code, vehicle_type_id, initial_pos_x, initial_pos_y) "
                + "VALUES ('00000000-0000-0001-0000-000000000001', 'TA01', '00000000-0000-0000-0000-000000000101', 27, 14)");
    }

    @Test
    void catalogoSeCargaDesdeBaseDeDatos() {
        var ciudad = catalogo.cargarCiudad();
        var op = catalogo.cargarConfiguracionOperacion();
        var tipos = catalogo.cargarTiposVehiculo();
        var almacenes = catalogo.cargarAlmacenes();
        var flota = catalogo.cargarFlota(tipos);

        assertEquals(70, ciudad.ancho());
        assertEquals(50, ciudad.alto());
        assertEquals(2, op.maxParadasPorRuta());
        assertEquals(1, tipos.size());
        assertEquals(2, almacenes.size());
        assertEquals(1, flota.size());
        assertEquals("TA01", flota.get(0).getIdUnidad());
    }

    @Test
    void persistenciaManualYSoftDeleteFuncionan() {
        Pedido p = new Pedido("PED-2026-01-0001", "c100", new Nodo(10, 12), 4, 12,
                LocalDateTime.of(2026, 1, 1, 8, 0));
        Bloqueo b = new Bloqueo(List.of(new Nodo(5, 5), new Nodo(5, 7)),
                LocalDateTime.of(2026, 1, 1, 8, 0), LocalDateTime.of(2026, 1, 1, 12, 0));
        CargaArchivo.MantenimientoPendiente m = new CargaArchivo.MantenimientoPendiente("TA01", LocalDate.of(2026, 9, 10));

        repositorio.guardarPedidosManuales(List.of(p));
        repositorio.guardarBloqueosManuales(List.of(b));
        repositorio.guardarMantenimientosManuales(List.of(m));

        assertEquals(1, repositorio.obtenerPedidosManuales().size());
        assertEquals(1, repositorio.obtenerBloqueosManuales().size());
        assertEquals(1, repositorio.obtenerMantenimientosManuales().size());

        repositorio.limpiarDatosManuales();

        assertTrue(repositorio.obtenerPedidosManuales().isEmpty());
        assertTrue(repositorio.obtenerBloqueosManuales().isEmpty());
        assertTrue(repositorio.obtenerMantenimientosManuales().isEmpty());
    }

    @Test
    void ejecucionYReporteFinalSePersistenYRecuperan() {
        String id = UUID.randomUUID().toString();
        LocalDateTime simInicio = LocalDateTime.of(2026, 1, 1, 7, 0);
        EjecucionEscenario ej = new EjecucionEscenario(id, TipoEscenario.CINCO_DIAS, simInicio, 0.5f, 150f);
        ej.iniciar();

        repositorio.registrarInicioEjecucion(ej);
        ej.setEstado(EstadoEjecucion.FINALIZADA);
        ej.registrarFin();
        repositorio.registrarActualizacionEjecucion(ej, "PERIODO_COMPLETADO", simInicio.plusDays(5));

        EstadoOperacionDTO estado = new EstadoOperacionDTO(simInicio.plusDays(5), List.of(), List.of(),
                List.of(), List.of(), List.of(),
                new MetricasOperacionDTO(0f, 100f, 0, 0, 0, 0, 0)).conEjecucion(id);
        ReporteSimulacionDTO reporte = new ReporteSimulacionDTO(id, "CINCO_DIAS", "PERIODO_COMPLETADO",
                Instant.now().minusSeconds(10), Instant.now(), 10000L,
                simInicio, simInicio.plusDays(5), 432000000L, estado, List.of(), estado, List.of());

        repositorio.guardarReporteFinal(id, reporte);

        var recuperado = repositorio.consultarReporteFinal(id);
        assertTrue(recuperado.isPresent());
        assertEquals("PERIODO_COMPLETADO", recuperado.get().motivoFinalizacion());
        assertEquals(id, recuperado.get().idEjecucion());

        var ejHist = repositorio.consultarEjecucionHistorica(id);
        assertTrue(ejHist.isPresent());
        assertEquals(EstadoEjecucion.FINALIZADA, ejHist.get().getEstado());
    }

    @Test
    void cargadorConsultaPorPeriodoYReciclaAnioEnBloqueos() throws Exception {
        jdbcTemplate.update(
                "INSERT INTO orders (id, order_code, client_code, dest_x, dest_y, requested_quantity, sla_hours, registered_at, period_year, period_month, source) "
                        + "VALUES (?, 'PED-2026-01-9999', 'c999', 15, 20, 2, 24, '2026-01-05 10:00:00+00', 2026, 1, 'OFFICIAL')",
                UUID.randomUUID());
        jdbcTemplate.update(
                "INSERT INTO street_blockages (id, start_at, end_at, nodes_json, period_year, period_month, source) "
                        + "VALUES (?, '2026-01-05 08:00:00+00', '2026-01-05 14:00:00+00', '[{\"x\":1,\"y\":1},{\"x\":1,\"y\":2}]', 2026, 1, 'OFFICIAL')",
                UUID.randomUUID());

        var cargaPedidos = cargador.cargarPedidos(2026, 1);
        assertEquals(1, cargaPedidos.getPedidos().size());
        assertEquals("PED-2026-01-9999", cargaPedidos.getPedidos().get(0).getIdPedido());

        var cargaBloqueos2029 = cargador.cargarBloqueos(2029, 1);
        assertEquals(1, cargaBloqueos2029.getBloqueos().size());
        assertEquals(2029, cargaBloqueos2029.getBloqueos().get(0).getFechaInicio().getYear());
    }

    @Test
    void ajustesDeParametrosYRestauracionAValoresOficialesPersistenEnBd() {
        var tipos = catalogo.cargarTiposVehiculo();
        var almacenes = catalogo.cargarAlmacenes();
        var flota = catalogo.cargarFlota(tipos);
        var servicio = new ServicioPlanificacionImpl(
                catalogo.cargarCiudad(), catalogo.cargarConfiguracionOperacion(),
                tipos, almacenes, flota, TipoAlgoritmo.IPSO, java.util.Map.of(), "logs", cargador, repositorio);

        LocalDateTime inicio = LocalDateTime.of(2026, 1, 1, 7, 0);
        // 1. Modificar parámetros desde "Parámetros del sistema" (ajustesIniciales)
        var ej1 = servicio.seleccionarEscenario(TipoEscenario.DIA_A_DIA, inicio, List.of(
                new SolicitudOperacion(inicio, TipoSolicitud.CAMBIO_VELOCIDAD, "AUTO", "60"),
                new SolicitudOperacion(inicio, TipoSolicitud.CAMBIO_CANTIDAD_VEHICULOS, "AUTO", "3"),
                new SolicitudOperacion(inicio, TipoSolicitud.CAMBIO_CONFIGURACION_OPERACION, "maxParadasPorRuta", "5")));
        servicio.detenerEjecucion(ej1.getIdEjecucion());

        assertEquals(60.0, catalogo.cargarTiposVehiculo().get(0).getVelocidadKmH());
        assertEquals(3, catalogo.cargarFlota(catalogo.cargarTiposVehiculo()).size());
        assertEquals(5, catalogo.cargarConfiguracionOperacion().maxParadasPorRuta());

        // 2. Restaurar con "Valores oficiales del caso" (40 km/h, 1 unidad inicial en el test, maxParadas=2)
        var ej2 = servicio.seleccionarEscenario(TipoEscenario.DIA_A_DIA, inicio, List.of(
                new SolicitudOperacion(inicio, TipoSolicitud.CAMBIO_VELOCIDAD, "AUTO", "40"),
                new SolicitudOperacion(inicio, TipoSolicitud.CAMBIO_CANTIDAD_VEHICULOS, "AUTO", "1"),
                new SolicitudOperacion(inicio, TipoSolicitud.CAMBIO_CONFIGURACION_OPERACION, "maxParadasPorRuta", "2")));
        servicio.detenerEjecucion(ej2.getIdEjecucion());

        assertEquals(40.0, catalogo.cargarTiposVehiculo().get(0).getVelocidadKmH());
        assertEquals(1, catalogo.cargarFlota(catalogo.cargarTiposVehiculo()).size());
        assertEquals(2, catalogo.cargarConfiguracionOperacion().maxParadasPorRuta());
    }

    private ServicioPlanificacionImpl servicio() {
        var tipos = catalogo.cargarTiposVehiculo();
        var almacenes = catalogo.cargarAlmacenes();
        return new ServicioPlanificacionImpl(catalogo.cargarCiudad(), catalogo.cargarConfiguracionOperacion(),
                tipos, almacenes, catalogo.cargarFlota(tipos), TipoAlgoritmo.IPSO, java.util.Map.of(), "logs",
                cargador, repositorio);
    }

    @Test
    void pedidoManualConMismoCodigoQueUnoOficialYaNoSeDescarta() {
        // Antes: los manuales se llamaban PED-2026-09-0001 igual que los oficiales, order_code era
        // único global y ON CONFLICT DO NOTHING los descartaba sin avisar.
        jdbcTemplate.update("INSERT INTO orders (id, order_code, client_code, dest_x, dest_y, requested_quantity, sla_hours, "
                + "registered_at, period_year, period_month, source) VALUES (?, 'PED-2026-09-0001', 'c1', 1, 1, 1, 4, "
                + "'2026-09-01 00:00:00+00', 2026, 9, 'OFFICIAL')", UUID.randomUUID());
        var servicio = servicio();
        var archivo = new com.paqrap.exposicion.ArchivoEntrada("ventas.202609.txt", "01d00h00m:4,4,c1,1,4");

        servicio.recibirArchivo(archivo);
        var manuales = repositorio.obtenerPedidosManuales();
        assertEquals(1, manuales.size());
        assertTrue(manuales.get(0).getIdPedido().startsWith("MAN-"), manuales.get(0).getIdPedido());

        // El mismo contenido dos veces se rechaza con un mensaje (antes los bloqueos se duplicaban).
        assertThrows(IllegalArgumentException.class, () -> servicio.recibirArchivo(archivo));

        // Tras limpiar, volver a subirlo SÍ guarda (antes chocaba con la fila borrada lógicamente).
        servicio.limpiarArchivosCargados();
        assertTrue(repositorio.obtenerPedidosManuales().isEmpty());
        servicio.recibirArchivo(archivo);
        assertEquals(1, repositorio.obtenerPedidosManuales().size());
        assertEquals(1, jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM data_imports WHERE source = 'MANUAL' AND deleted_at IS NULL", Integer.class));
    }

    @Test
    void frecuenciaDeRecargaGuardadaSobreviveAlReinicio() {
        var tipos = catalogo.cargarTiposVehiculo();
        var almacenes = catalogo.cargarAlmacenes();
        var este = (com.paqrap.dominio.AlmacenIntermedio) almacenes.stream()
                .filter(a -> a instanceof com.paqrap.dominio.AlmacenIntermedio).findFirst().orElseThrow();
        este.setFrecuenciaRecargaHoras(12);
        repositorio.guardarConfiguracionMaestra(catalogo.cargarCiudad(), catalogo.cargarConfiguracionOperacion(), tipos,
                almacenes, catalogo.cargarFlota(tipos));

        // "Reinicio": se vuelve a leer el catálogo desde la BD.
        var recargado = (com.paqrap.dominio.AlmacenIntermedio) catalogo.cargarAlmacenes().stream()
                .filter(a -> a instanceof com.paqrap.dominio.AlmacenIntermedio).findFirst().orElseThrow();
        assertEquals(12.0, recargado.getFrecuenciaRecargaHoras());
    }

    @Test
    void ejecucionHuerfanaSeMarcaInterrumpidaAlArrancar() {
        String id = UUID.randomUUID().toString();
        LocalDateTime simInicio = LocalDateTime.of(2026, 1, 1, 7, 0);
        EjecucionEscenario ej = new EjecucionEscenario(id, TipoEscenario.COLAPSO_LOGISTICO, simInicio, 0.1f, 600f);
        ej.iniciar();
        repositorio.registrarInicioEjecucion(ej, 0.03f, "IPSO", null);
        repositorio.registrarLatido(id, simInicio.plusHours(3));

        assertEquals(1, repositorio.marcarEjecucionesHuerfanas());
        assertEquals(0, repositorio.marcarEjecucionesHuerfanas());

        var historica = repositorio.consultarEjecucionHistorica(id).orElseThrow();
        assertEquals(EstadoEjecucion.INTERRUMPIDA, historica.getEstado());
        assertEquals(ej.getInicioReal().toEpochMilli() / 1000, historica.getInicioReal().toEpochMilli() / 1000);
        assertNotNull(historica.getFinReal());
        var fila = repositorio.listarEjecuciones(0, 10).get(0);
        assertEquals("REINICIO_SERVIDOR", fila.motivoFinalizacion());
        assertEquals(simInicio.plusHours(3), fila.finSimulado());
        assertFalse(fila.tieneReporte());
    }

    private void esperar(java.util.function.BooleanSupplier condicion) throws InterruptedException {
        long limite = System.nanoTime() + 10_000_000_000L;
        while (!condicion.getAsBoolean() && System.nanoTime() < limite) Thread.sleep(20);
        assertTrue(condicion.getAsBoolean(), "La condición no se cumplió a tiempo");
    }

    @Test
    void averiasYSolicitudesQuedanRegistradasYEnElReporte() throws Exception {
        var servicio = servicio();
        LocalDateTime inicio = LocalDateTime.of(2026, 1, 1, 7, 0);
        var ej = servicio.seleccionarEscenario(TipoEscenario.DIA_A_DIA, inicio, 0.001f, 0.0001f, 1f, 1f, List.of(
                new SolicitudOperacion(inicio, TipoSolicitud.AVERIA, "TA01", "TIPO_1"),
                new SolicitudOperacion(inicio, TipoSolicitud.CAMBIO_VELOCIDAD, "AUTO", "50")));
        String id = ej.getIdEjecucion();
        try {
            servicio.programarSolicitud(ej, inicio, TipoSolicitud.CAMBIO_CAPACIDAD, "AUTO", "30");
            esperar(() -> repositorio.consultarSolicitudes(id).stream()
                    .anyMatch(s -> "CAMBIO_CAPACIDAD".equals(s.tipoSolicitud()) && "APLICADA".equals(s.estado())));
            // La configuración maestra se guarda cuando el cambio se aplica, no al programarlo.
            esperar(() -> catalogo.cargarTiposVehiculo().get(0).getCapacidad() == 30);
        } finally {
            servicio.detenerEjecucion(id);
        }

        var averias = repositorio.consultarAverias(id);
        assertEquals(1, averias.size());
        assertEquals("TA01", averias.get(0).idUnidad());
        var solicitudes = repositorio.consultarSolicitudes(id);
        assertEquals(3, solicitudes.size());
        var capacidad = solicitudes.stream().filter(s -> "CAMBIO_CAPACIDAD".equals(s.tipoSolicitud())).findFirst()
                .orElseThrow();
        assertEquals("24", capacidad.valorAnterior());
        assertEquals("30", capacidad.valorNuevo());
        var velocidad = solicitudes.stream().filter(s -> "CAMBIO_VELOCIDAD".equals(s.tipoSolicitud())).findFirst()
                .orElseThrow();
        assertEquals("APLICADA", velocidad.estado());
        assertEquals("40.0", velocidad.valorAnterior());

        var reporte = repositorio.consultarReporteFinal(id).orElseThrow();
        assertEquals(1, reporte.averias().size());
        assertEquals(3, reporte.solicitudes().size());
        assertNotNull(jdbcTemplate.queryForObject("SELECT total_orders FROM simulation_reports WHERE execution_id = ?",
                Integer.class, UUID.fromString(id)));
        assertNotNull(jdbcTemplate.queryForObject("SELECT config_snapshot::text FROM scenario_executions WHERE id = ?",
                String.class, UUID.fromString(id)));
    }

    @Test
    void apagadoOrdenadoGuardaReporteComoInterrumpida() throws Exception {
        var servicio = servicio();
        LocalDateTime inicio = LocalDateTime.of(2026, 1, 1, 7, 0);
        var ej = servicio.seleccionarEscenario(TipoEscenario.CINCO_DIAS, inicio, 0.001f, 0.0001f, 1f, 1f, List.of());
        servicio.detenerPorApagado();

        var reporte = repositorio.consultarReporteFinal(ej.getIdEjecucion()).orElseThrow();
        assertEquals("REINICIO_SERVIDOR", reporte.motivoFinalizacion());
        assertEquals(EstadoEjecucion.INTERRUMPIDA,
                repositorio.consultarEjecucionHistorica(ej.getIdEjecucion()).orElseThrow().getEstado());
        assertNull(servicio.consultarEjecucionActiva());
        // Al arrancar de nuevo no queda nada huérfano.
        assertEquals(0, repositorio.marcarEjecucionesHuerfanas());
    }

    @Test
    void seederNoRecargaArchivosSinCambios(@org.junit.jupiter.api.io.TempDir java.nio.file.Path datos) throws Exception {
        var ventas = java.nio.file.Files.createDirectories(datos.resolve("ventas"));
        var archivo = ventas.resolve("ventas.202601.txt");
        java.nio.file.Files.writeString(archivo, "01d00h00m:4,4,c1,1,4\n01d01h00m:5,5,c2,2,4\n");
        var seeder = new DatabaseSeederRunner(jdbcTemplate, objectMapper);

        seeder.sincronizar(datos);
        var idsAntes = jdbcTemplate.queryForList("SELECT id::text FROM orders WHERE source = 'OFFICIAL' ORDER BY order_code",
                String.class);
        assertEquals(2, idsAntes.size());

        // Sin cambios: no se borra ni se reinserta nada (los UUID se mantienen).
        seeder.sincronizar(datos);
        assertEquals(idsAntes, jdbcTemplate.queryForList(
                "SELECT id::text FROM orders WHERE source = 'OFFICIAL' ORDER BY order_code", String.class));

        // Con cambios: se reemplaza solo ese período.
        java.nio.file.Files.writeString(archivo, "01d00h00m:4,4,c1,1,4\n");
        seeder.sincronizar(datos);
        assertEquals(1, jdbcTemplate.queryForObject("SELECT COUNT(*) FROM orders WHERE source = 'OFFICIAL'", Integer.class));
        assertEquals(1, jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM data_imports WHERE source = 'OFFICIAL' AND deleted_at IS NULL", Integer.class));
    }
}
