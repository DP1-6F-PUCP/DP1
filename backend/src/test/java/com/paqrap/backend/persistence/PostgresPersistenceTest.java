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

class PostgresPersistenceTest {

    private JdbcTemplate jdbcTemplate;
    private ObjectMapper objectMapper;
    private PostgresRepositorioOperacion repositorio;
    private PostgresCargadorRecursos cargador;
    private CatalogoPersistenceService catalogo;

    @BeforeEach
    void setUp() {
        String dbName = "paqrap_test_" + UUID.randomUUID().toString().replace("-", "");
        DriverManagerDataSource ds = new DriverManagerDataSource();
        ds.setDriverClassName("org.h2.Driver");
        ds.setUrl("jdbc:h2:mem:" + dbName + ";MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1");
        jdbcTemplate = new JdbcTemplate(ds);

        objectMapper = new ObjectMapper();
        objectMapper.registerModule(new JavaTimeModule());

        crearEsquemaYCatalogo();
        repositorio = new PostgresRepositorioOperacion(jdbcTemplate, objectMapper);
        cargador = new PostgresCargadorRecursos("data", "config", jdbcTemplate, objectMapper);
        catalogo = new CatalogoPersistenceService(jdbcTemplate);
    }

    private void crearEsquemaYCatalogo() {
        jdbcTemplate.execute("""
                CREATE TABLE city_configs (
                    id UUID PRIMARY KEY, width INT NOT NULL, height INT NOT NULL,
                    origin_x INT NOT NULL, origin_y INT NOT NULL,
                    node_distance_km INT NOT NULL, two_way_streets BOOLEAN NOT NULL,
                    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
                )""");
        jdbcTemplate.execute("""
                CREATE TABLE operation_configs (
                    id UUID PRIMARY KEY, shift_duration_hours NUMERIC(8,2) NOT NULL,
                    shift_start_hour NUMERIC(8,2) NOT NULL, client_service_hours NUMERIC(8,2) NOT NULL,
                    break_duration_hours NUMERIC(8,2) NOT NULL, break_margin_hours NUMERIC(8,2) NOT NULL,
                    warehouse_load_hours NUMERIC(8,2) NOT NULL, transshipment_hours NUMERIC(8,2) NOT NULL,
                    max_stops_per_route INT NOT NULL,
                    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
                )""");
        jdbcTemplate.execute("""
                CREATE TABLE vehicle_types (
                    id UUID PRIMARY KEY, type_code VARCHAR(32) NOT NULL UNIQUE, name VARCHAR(64) NOT NULL,
                    capacity INT NOT NULL, speed_kmh NUMERIC(8,2) NOT NULL, cost_per_km NUMERIC(10,2) NOT NULL,
                    initial_units INT NOT NULL, maintenance_duration_hours NUMERIC(8,2) NOT NULL,
                    deleted_at TIMESTAMP WITH TIME ZONE
                )""");
        jdbcTemplate.execute("""
                CREATE TABLE warehouses (
                    id UUID PRIMARY KEY, name VARCHAR(64) NOT NULL UNIQUE, warehouse_type VARCHAR(32) NOT NULL,
                    pos_x INT NOT NULL, pos_y INT NOT NULL, max_capacity INT NOT NULL,
                    reload_frequency_hours NUMERIC(8,2) NOT NULL, deleted_at TIMESTAMP WITH TIME ZONE
                )""");
        jdbcTemplate.execute("""
                CREATE TABLE vehicles (
                    id UUID PRIMARY KEY, vehicle_code VARCHAR(32) NOT NULL UNIQUE,
                    vehicle_type_id UUID NOT NULL, initial_pos_x INT NOT NULL, initial_pos_y INT NOT NULL,
                    deleted_at TIMESTAMP WITH TIME ZONE
                )""");
        jdbcTemplate.execute("""
                CREATE TABLE orders (
                    id UUID PRIMARY KEY, order_code VARCHAR(64) NOT NULL UNIQUE, client_code VARCHAR(64) NOT NULL,
                    dest_x INT NOT NULL, dest_y INT NOT NULL, requested_quantity INT NOT NULL, sla_hours INT NOT NULL,
                    registered_at TIMESTAMP WITH TIME ZONE NOT NULL, period_year INT NOT NULL, period_month INT NOT NULL,
                    source VARCHAR(16) NOT NULL, deleted_at TIMESTAMP WITH TIME ZONE
                )""");
        jdbcTemplate.execute("""
                CREATE TABLE street_blockages (
                    id UUID PRIMARY KEY, start_at TIMESTAMP WITH TIME ZONE NOT NULL,
                    end_at TIMESTAMP WITH TIME ZONE NOT NULL, nodes_json JSON NOT NULL,
                    period_year INT NOT NULL, period_month INT NOT NULL,
                    source VARCHAR(16) NOT NULL, deleted_at TIMESTAMP WITH TIME ZONE
                )""");
        jdbcTemplate.execute("""
                CREATE TABLE maintenance_schedules (
                    id UUID PRIMARY KEY, vehicle_code VARCHAR(32) NOT NULL, scheduled_date DATE NOT NULL,
                    template_month INT NOT NULL, template_day INT NOT NULL,
                    source VARCHAR(16) NOT NULL, deleted_at TIMESTAMP WITH TIME ZONE
                )""");
        jdbcTemplate.execute("""
                CREATE TABLE scenario_executions (
                    id UUID PRIMARY KEY, scenario_type VARCHAR(32) NOT NULL, status VARCHAR(48) NOT NULL,
                    started_at TIMESTAMP WITH TIME ZONE NOT NULL, ended_at TIMESTAMP WITH TIME ZONE,
                    simulated_start_at TIMESTAMP WITH TIME ZONE NOT NULL, simulated_end_at TIMESTAMP WITH TIME ZONE,
                    sa NUMERIC(10,4) NOT NULL, k NUMERIC(10,4) NOT NULL, stop_reason VARCHAR(32),
                    deleted_at TIMESTAMP WITH TIME ZONE
                )""");
        jdbcTemplate.execute("""
                CREATE TABLE simulation_reports (
                    id UUID PRIMARY KEY, execution_id UUID NOT NULL UNIQUE, report_payload JSON NOT NULL,
                    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
                    deleted_at TIMESTAMP WITH TIME ZONE
                )""");

        jdbcTemplate.update("INSERT INTO city_configs (id, width, height, origin_x, origin_y, node_distance_km, two_way_streets) "
                + "VALUES ('00000000-0000-0000-0000-000000000001', 70, 50, 0, 0, 1, TRUE)");
        jdbcTemplate.update("INSERT INTO operation_configs (id, shift_duration_hours, shift_start_hour, client_service_hours, "
                + "break_duration_hours, break_margin_hours, warehouse_load_hours, transshipment_hours, max_stops_per_route) "
                + "VALUES ('00000000-0000-0000-0000-000000000002', 8, 7, 1, 1, 1, 0, 0.5, 2)");
        jdbcTemplate.update("INSERT INTO vehicle_types (id, type_code, name, capacity, speed_kmh, cost_per_km, initial_units, maintenance_duration_hours) "
                + "VALUES ('00000000-0000-0000-0000-000000000101', 'AUTO', 'Auto', 24, 40, 8, 1, 48)");
        jdbcTemplate.update("INSERT INTO warehouses (id, name, warehouse_type, pos_x, pos_y, max_capacity, reload_frequency_hours) "
                + "VALUES ('00000000-0000-0000-0000-000000000201', 'Central', 'CENTRAL', 27, 14, 0, 0)");
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
        assertEquals(1, almacenes.size());
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
                new MetricasOperacionDTO(0f, 100f, 0, 0, 0, 0, 0), id);
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
}
