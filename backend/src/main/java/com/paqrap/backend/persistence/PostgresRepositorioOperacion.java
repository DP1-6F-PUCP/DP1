package com.paqrap.backend.persistence;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.paqrap.dominio.Almacen;
import com.paqrap.dominio.AlmacenIntermedio;
import com.paqrap.dominio.Bloqueo;
import com.paqrap.dominio.Ciudad;
import com.paqrap.dominio.ConfiguracionOperacion;
import com.paqrap.dominio.Nodo;
import com.paqrap.dominio.Pedido;
import com.paqrap.dominio.TipoVehiculo;
import com.paqrap.dominio.UnidadTransporte;
import com.paqrap.entrada.CargaArchivo;
import com.paqrap.exposicion.AveriaRegistroDTO;
import com.paqrap.exposicion.ConfiguracionActualDTO;
import com.paqrap.exposicion.PedidoDTO;
import com.paqrap.exposicion.ReporteSimulacionDTO;
import com.paqrap.exposicion.RepositorioOperacion;
import com.paqrap.exposicion.ResumenEjecucionDTO;
import com.paqrap.exposicion.SolicitudRegistroDTO;
import com.paqrap.simulador.EjecucionEscenario;
import com.paqrap.simulador.EstadoEjecucion;
import com.paqrap.simulador.TipoEscenario;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

import java.sql.Date;
import java.sql.Timestamp;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * Implementación PostgreSQL de {@link RepositorioOperacion} usando {@link JdbcTemplate}.
 * Cumple con {@code 63.std.db.v01.pdf}: claves UUID, timestamps UTC ({@code timestamptz}),
 * {@code JSONB} para estructuras de reporte y polilíneas, y eliminación lógica ({@code deleted_at}).
 */
@Slf4j
@Repository
@RequiredArgsConstructor
public class PostgresRepositorioOperacion implements RepositorioOperacion {

    private static final int BATCH_SIZE = 500;
    private static final TypeReference<List<PostgresCargadorRecursos.NodoJson>> NODO_LIST_TYPE = new TypeReference<>() {};

    private final JdbcTemplate jdbcTemplate;
    private final ObjectMapper objectMapper;

    @Override
    @Transactional
    public void guardarImportacionManual(ImportacionArchivo importacion, List<Pedido> pedidos, List<Bloqueo> bloqueos,
            List<CargaArchivo.MantenimientoPendiente> mantenimientos) {
        jdbcTemplate.update(
                "INSERT INTO data_imports (id, source, file_type, file_name, period_year, period_month, sha256, row_count) "
                        + "VALUES (?, 'MANUAL', ?, ?, ?, ?, ?, ?)",
                UUID.fromString(importacion.id()), importacion.tipoArchivo(), recortar(importacion.nombreArchivo(), 128),
                importacion.anio(), importacion.mes(), importacion.sha256(), importacion.filas());
        guardarPedidosManuales(pedidos, importacion.id());
        guardarBloqueosManuales(bloqueos, importacion.id());
        guardarMantenimientosManuales(mantenimientos, importacion.id());
    }

    @Override
    public boolean existeImportacionManual(String sha256) {
        Integer n = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM data_imports WHERE source = 'MANUAL' AND sha256 = ? AND deleted_at IS NULL",
                Integer.class, sha256);
        return n != null && n > 0;
    }

    @Override
    public void guardarPedidosManuales(List<Pedido> pedidos, String idImportacion) {
        if (pedidos == null || pedidos.isEmpty()) return;
        // Sin ON CONFLICT DO NOTHING: un choque de código (ya no esperable, cada carga manual usa su
        // propio prefijo) debe fallar y avisar, no descartar pedidos en silencio como antes.
        String sql = "INSERT INTO orders (id, order_code, client_code, dest_x, dest_y, requested_quantity, "
                + "sla_hours, registered_at, period_year, period_month, source, import_id) "
                + "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'MANUAL', ?)";
        UUID importId = idImportacion != null ? UUID.fromString(idImportacion) : null;
        jdbcTemplate.batchUpdate(sql, pedidos, BATCH_SIZE, (ps, p) -> {
            ps.setObject(11, importId, java.sql.Types.OTHER);
            ps.setObject(1, UUID.randomUUID());
            ps.setString(2, p.getIdPedido());
            ps.setString(3, p.getIdCliente());
            ps.setInt(4, p.getDestino().x());
            ps.setInt(5, p.getDestino().y());
            ps.setInt(6, p.getCantidadSolicitada());
            ps.setInt(7, p.getHorasLimite());
            ps.setTimestamp(8, toUtcTimestamp(p.getFechaIngreso()));
            ps.setInt(9, p.getFechaIngreso().getYear());
            ps.setInt(10, p.getFechaIngreso().getMonthValue());
        });
    }

    @Override
    public void guardarBloqueosManuales(List<Bloqueo> bloqueos, String idImportacion) {
        if (bloqueos == null || bloqueos.isEmpty()) return;
        String sql = "INSERT INTO street_blockages (id, start_at, end_at, nodes_json, period_year, period_month, source, import_id) "
                + "VALUES (?, ?, ?, CAST(? AS JSONB), ?, ?, 'MANUAL', ?)";
        UUID importId = idImportacion != null ? UUID.fromString(idImportacion) : null;
        jdbcTemplate.batchUpdate(sql, bloqueos, BATCH_SIZE, (ps, b) -> {
            ps.setObject(7, importId, java.sql.Types.OTHER);
            ps.setObject(1, UUID.randomUUID());
            ps.setTimestamp(2, toUtcTimestamp(b.getFechaInicio()));
            ps.setTimestamp(3, toUtcTimestamp(b.getFechaFin()));
            ps.setString(4, serializarNodos(b.getSecuenciaNodos()));
            ps.setInt(5, b.getFechaInicio().getYear());
            ps.setInt(6, b.getFechaInicio().getMonthValue());
        });
    }

    @Override
    public void guardarMantenimientosManuales(List<CargaArchivo.MantenimientoPendiente> mantenimientos,
            String idImportacion) {
        if (mantenimientos == null || mantenimientos.isEmpty()) return;
        String sql = "INSERT INTO maintenance_schedules (id, vehicle_code, scheduled_date, template_month, template_day, source, import_id) "
                + "VALUES (?, ?, ?, ?, ?, 'MANUAL', ?)";
        UUID importId = idImportacion != null ? UUID.fromString(idImportacion) : null;
        jdbcTemplate.batchUpdate(sql, mantenimientos, BATCH_SIZE, (ps, m) -> {
            ps.setObject(6, importId, java.sql.Types.OTHER);
            ps.setObject(1, UUID.randomUUID());
            ps.setString(2, m.idUnidad());
            ps.setDate(3, Date.valueOf(m.fecha()));
            ps.setInt(4, m.fecha().getMonthValue());
            ps.setInt(5, m.fecha().getDayOfMonth());
        });
    }

    @Override
    public List<Pedido> obtenerPedidosManuales() {
        return jdbcTemplate.query(
                "SELECT order_code, client_code, dest_x, dest_y, requested_quantity, sla_hours, registered_at "
                        + "FROM orders WHERE source = 'MANUAL' AND deleted_at IS NULL "
                        + "ORDER BY registered_at ASC, order_code ASC",
                (rs, rowNum) -> new Pedido(
                        rs.getString("order_code"),
                        rs.getString("client_code"),
                        new Nodo(rs.getInt("dest_x"), rs.getInt("dest_y")),
                        rs.getInt("requested_quantity"),
                        rs.getInt("sla_hours"),
                        fromUtcTimestamp(rs.getTimestamp("registered_at"))));
    }

    @Override
    public List<Bloqueo> obtenerBloqueosManuales() {
        return jdbcTemplate.query(
                "SELECT start_at, end_at, nodes_json "
                        + "FROM street_blockages WHERE source = 'MANUAL' AND deleted_at IS NULL "
                        + "ORDER BY start_at ASC",
                (rs, rowNum) -> new Bloqueo(
                        deserializarNodos(rs.getString("nodes_json")),
                        fromUtcTimestamp(rs.getTimestamp("start_at")),
                        fromUtcTimestamp(rs.getTimestamp("end_at"))));
    }

    @Override
    public List<CargaArchivo.MantenimientoPendiente> obtenerMantenimientosManuales() {
        return jdbcTemplate.query(
                "SELECT vehicle_code, scheduled_date "
                        + "FROM maintenance_schedules WHERE source = 'MANUAL' AND deleted_at IS NULL "
                        + "ORDER BY scheduled_date ASC",
                (rs, rowNum) -> new CargaArchivo.MantenimientoPendiente(
                        rs.getString("vehicle_code"),
                        rs.getObject("scheduled_date", LocalDate.class)));
    }

    @Override
    @Transactional
    public void limpiarDatosManuales() {
        // Soft delete per 63.std.db sección 7.3
        jdbcTemplate.update("UPDATE orders SET deleted_at = NOW() WHERE source = 'MANUAL' AND deleted_at IS NULL");
        jdbcTemplate.update("UPDATE street_blockages SET deleted_at = NOW() WHERE source = 'MANUAL' AND deleted_at IS NULL");
        jdbcTemplate.update("UPDATE maintenance_schedules SET deleted_at = NOW() WHERE source = 'MANUAL' AND deleted_at IS NULL");
        jdbcTemplate.update("UPDATE data_imports SET deleted_at = NOW() WHERE source = 'MANUAL' AND deleted_at IS NULL");
    }

    @Override
    public List<ImportacionVigente> listarImportaciones() {
        return jdbcTemplate.query(
                "SELECT id, source, file_type, file_name, period_year, period_month, row_count, imported_at "
                        + "FROM data_imports WHERE deleted_at IS NULL "
                        + "ORDER BY source, file_type, period_year NULLS FIRST, period_month NULLS FIRST, file_name",
                (rs, n) -> new ImportacionVigente(rs.getString("id"), rs.getString("source"),
                        rs.getString("file_type"), rs.getString("file_name"),
                        (Integer) rs.getObject("period_year"), (Integer) rs.getObject("period_month"),
                        rs.getInt("row_count"), rs.getTimestamp("imported_at").toInstant()));
    }

    @Override
    @org.springframework.transaction.annotation.Transactional
    public String borrarImportacion(String idImportacion) {
        UUID id;
        try {
            id = UUID.fromString(idImportacion);
        } catch (IllegalArgumentException ex) {
            return null;
        }
        // Solo cargas MANUALES: los datos estándar se borran todos juntos («Borrar todo») y se
        // recuperan con «Cargar»; no archivo por archivo.
        List<String> origen = jdbcTemplate.queryForList(
                "SELECT source FROM data_imports WHERE id = ? AND source = 'MANUAL' AND deleted_at IS NULL",
                String.class, id);
        if (origen.isEmpty()) {
            return null;
        }
        // Borrado lógico de la carga y de sus filas.
        jdbcTemplate.update("UPDATE orders SET deleted_at = NOW() WHERE import_id = ? AND deleted_at IS NULL", id);
        jdbcTemplate.update("UPDATE street_blockages SET deleted_at = NOW() WHERE import_id = ? AND deleted_at IS NULL", id);
        jdbcTemplate.update("UPDATE maintenance_schedules SET deleted_at = NOW() WHERE import_id = ? AND deleted_at IS NULL", id);
        jdbcTemplate.update("UPDATE data_imports SET deleted_at = NOW() WHERE id = ?", id);
        return origen.get(0);
    }

    @Override
    @org.springframework.transaction.annotation.Transactional
    public void limpiarTodosLosDatos() {
        // Borrado lógico también de los estándar (OFFICIAL): al quedar su data_imports borrado, la
        // próxima sincronización (arranque o "Restaurar") los vuelve a cargar desde los archivos.
        jdbcTemplate.update("UPDATE orders SET deleted_at = NOW() WHERE deleted_at IS NULL");
        jdbcTemplate.update("UPDATE street_blockages SET deleted_at = NOW() WHERE deleted_at IS NULL");
        jdbcTemplate.update("UPDATE maintenance_schedules SET deleted_at = NOW() WHERE deleted_at IS NULL");
        jdbcTemplate.update("UPDATE data_imports SET deleted_at = NOW() WHERE deleted_at IS NULL");
    }

    @Override
    public void registrarInicioEjecucion(EjecucionEscenario ejecucion) {
        registrarInicioEjecucion(ejecucion, Float.NaN, null, null);
    }

    @Override
    public void registrarInicioEjecucion(EjecucionEscenario ejecucion, float ta, String algoritmo,
            ConfiguracionActualDTO configuracion) {
        String foto = null;
        if (configuracion != null) {
            try {
                foto = objectMapper.writeValueAsString(configuracion);
            } catch (Exception ex) {
                log.warn("No se pudo serializar la configuración de la ejecución {}: {}", ejecucion.getIdEjecucion(),
                        ex.getMessage());
            }
        }
        jdbcTemplate.update(
                "INSERT INTO scenario_executions (id, scenario_type, status, started_at, simulated_start_at, sa, k, "
                        + "ta, algorithm, config_snapshot, last_heartbeat_at, simulated_now_at) "
                        + "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CAST(? AS JSONB), NOW(), ?) ON CONFLICT (id) DO NOTHING",
                UUID.fromString(ejecucion.getIdEjecucion()),
                ejecucion.getTipoEscenario().name(),
                ejecucion.getEstado().name(),
                Timestamp.from(ejecucion.getInicioReal()),
                toUtcTimestamp(ejecucion.getFechaInicioSimulada()),
                ejecucion.getSa(),
                ejecucion.getK(),
                Float.isNaN(ta) ? null : ta,
                algoritmo,
                foto,
                toUtcTimestamp(ejecucion.getFechaInicioSimulada()));
    }

    @Override
    public void registrarLatido(String idEjecucion, LocalDateTime instanteSimulado) {
        jdbcTemplate.update(
                "UPDATE scenario_executions SET last_heartbeat_at = NOW(), simulated_now_at = ? WHERE id = ?",
                instanteSimulado != null ? toUtcTimestamp(instanteSimulado) : null, UUID.fromString(idEjecucion));
    }

    @Override
    public int marcarEjecucionesHuerfanas() {
        // ended_at = último latido (lo más cercano a cuándo murió el proceso); el fin simulado es
        // hasta donde llegó el último lote registrado.
        return jdbcTemplate.update(
                "UPDATE scenario_executions SET status = 'INTERRUMPIDA', stop_reason = 'REINICIO_SERVIDOR', "
                        + "ended_at = COALESCE(last_heartbeat_at, started_at), "
                        + "simulated_end_at = COALESCE(simulated_now_at, simulated_start_at) "
                        + "WHERE status IN ('INICIADA', 'EN_CURSO', 'PAUSADA') AND deleted_at IS NULL");
    }

    @Override
    @Transactional
    public void finalizarEjecucion(EjecucionEscenario ejecucion, String motivoFinalizacion, LocalDateTime finSimulado,
            ReporteSimulacionDTO reporte) {
        registrarActualizacionEjecucion(ejecucion, motivoFinalizacion, finSimulado);
        insertarReporte(ejecucion.getIdEjecucion(), reporte);
    }

    @Override
    public void registrarAveria(String idEjecucion, AveriaRegistroDTO averia) {
        jdbcTemplate.update(
                "INSERT INTO execution_breakdowns (id, execution_id, vehicle_code, vehicle_type, breakdown_type, "
                        + "sim_start_at, sim_end_est_at, transfer_at, pos_x, pos_y) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                UUID.randomUUID(), UUID.fromString(idEjecucion), averia.idUnidad(), averia.tipoVehiculo(),
                averia.tipoAveria(), toUtcTimestamp(averia.inicio()),
                averia.finEstimado() != null ? toUtcTimestamp(averia.finEstimado()) : null,
                averia.trasladoAlmacen() != null ? toUtcTimestamp(averia.trasladoAlmacen()) : null,
                averia.x(), averia.y());
    }

    @Override
    public void registrarSolicitud(String idEjecucion, SolicitudRegistroDTO s) {
        jdbcTemplate.update(
                "INSERT INTO execution_requests (id, execution_id, request_type, target, old_value, new_value, "
                        + "sim_scheduled_at, status, detail, applied_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                UUID.fromString(s.id()), UUID.fromString(idEjecucion), s.tipoSolicitud(), recortar(s.entidadObjetivo(), 64),
                recortar(s.valorAnterior(), 128), recortar(s.valorNuevo(), 128), toUtcTimestamp(s.tiempoProgramado()),
                s.estado(), recortar(s.detalle(), 255), s.aplicadaEn() != null ? toUtcTimestamp(s.aplicadaEn()) : null);
    }

    @Override
    public void actualizarSolicitud(SolicitudRegistroDTO s) {
        jdbcTemplate.update("UPDATE execution_requests SET status = ?, detail = ?, applied_at = ? WHERE id = ?",
                s.estado(), recortar(s.detalle(), 255), s.aplicadaEn() != null ? toUtcTimestamp(s.aplicadaEn()) : null,
                UUID.fromString(s.id()));
    }

    /** Averías registradas de una ejecución (para pruebas y consultas de auditoría). */
    public List<AveriaRegistroDTO> consultarAverias(String idEjecucion) {
        return jdbcTemplate.query(
                "SELECT vehicle_code, vehicle_type, breakdown_type, sim_start_at, sim_end_est_at, transfer_at, pos_x, pos_y "
                        + "FROM execution_breakdowns WHERE execution_id = ? ORDER BY sim_start_at",
                (rs, rowNum) -> new AveriaRegistroDTO(rs.getString("vehicle_code"), rs.getString("vehicle_type"),
                        rs.getString("breakdown_type"), fromUtcTimestamp(rs.getTimestamp("sim_start_at")),
                        fromUtcTimestampNullable(rs.getTimestamp("sim_end_est_at")),
                        fromUtcTimestampNullable(rs.getTimestamp("transfer_at")), rs.getInt("pos_x"), rs.getInt("pos_y")),
                UUID.fromString(idEjecucion));
    }

    /** Solicitudes registradas de una ejecución (para pruebas y consultas de auditoría). */
    public List<SolicitudRegistroDTO> consultarSolicitudes(String idEjecucion) {
        return jdbcTemplate.query(
                "SELECT id, request_type, target, old_value, new_value, sim_scheduled_at, status, detail, applied_at "
                        + "FROM execution_requests WHERE execution_id = ? ORDER BY sim_scheduled_at, recorded_at",
                (rs, rowNum) -> new SolicitudRegistroDTO(rs.getObject("id", UUID.class).toString(),
                        rs.getString("request_type"), rs.getString("target"), rs.getString("old_value"),
                        rs.getString("new_value"), fromUtcTimestamp(rs.getTimestamp("sim_scheduled_at")),
                        rs.getString("status"), rs.getString("detail"),
                        fromUtcTimestampNullable(rs.getTimestamp("applied_at"))),
                UUID.fromString(idEjecucion));
    }

    @Override
    public List<ResumenEjecucionDTO> listarEjecuciones(int pagina, int tamano) {
        return jdbcTemplate.query(
                "SELECT e.id, e.scenario_type, e.status, e.stop_reason, e.started_at, e.ended_at, "
                        + "e.simulated_start_at, e.simulated_end_at, r.total_orders, r.delivered_count, r.late_count, "
                        + "(r.id IS NOT NULL) AS tiene_reporte "
                        + "FROM scenario_executions e "
                        + "LEFT JOIN simulation_reports r ON r.execution_id = e.id AND r.deleted_at IS NULL "
                        + "WHERE e.deleted_at IS NULL ORDER BY e.started_at DESC LIMIT ? OFFSET ?",
                (rs, rowNum) -> new ResumenEjecucionDTO(rs.getObject("id", UUID.class).toString(),
                        rs.getString("scenario_type"), rs.getString("status"), rs.getString("stop_reason"),
                        rs.getTimestamp("started_at").toInstant(),
                        rs.getTimestamp("ended_at") != null ? rs.getTimestamp("ended_at").toInstant() : null,
                        fromUtcTimestamp(rs.getTimestamp("simulated_start_at")),
                        fromUtcTimestampNullable(rs.getTimestamp("simulated_end_at")),
                        (Integer) rs.getObject("total_orders"), (Integer) rs.getObject("delivered_count"),
                        (Integer) rs.getObject("late_count"), rs.getBoolean("tiene_reporte")),
                tamano, (long) pagina * tamano);
    }

    @Override
    public void registrarActualizacionEjecucion(EjecucionEscenario ejecucion, String motivoFinalizacion,
            LocalDateTime finSimulado) {
        jdbcTemplate.update(
                "UPDATE scenario_executions "
                        + "SET status = ?, ended_at = ?, simulated_end_at = ?, stop_reason = ? "
                        + "WHERE id = ?",
                ejecucion.getEstado().name(),
                ejecucion.getFinReal() != null ? Timestamp.from(ejecucion.getFinReal()) : null,
                finSimulado != null ? toUtcTimestamp(finSimulado) : null,
                motivoFinalizacion,
                UUID.fromString(ejecucion.getIdEjecucion()));
    }

    @Override
    public void guardarReporteFinal(String idEjecucion, ReporteSimulacionDTO reporte) {
        insertarReporte(idEjecucion, reporte);
    }

    /** Propaga cualquier error (antes se tragaba con un log): el servicio lo reintenta. */
    private void insertarReporte(String idEjecucion, ReporteSimulacionDTO reporte) {
        String json;
        try {
            json = objectMapper.writeValueAsString(reporte);
        } catch (Exception ex) {
            throw new IllegalStateException("No se pudo serializar el reporte final de " + idEjecucion, ex);
        }
        List<PedidoDTO> pedidos = reporte.pedidosFinales() != null ? reporte.pedidosFinales() : List.of();
        jdbcTemplate.update(
                "INSERT INTO simulation_reports (id, execution_id, report_payload, total_orders, delivered_count, "
                        + "late_count, stop_reason, sim_duration_ms) "
                        + "VALUES (?, ?, CAST(? AS JSONB), ?, ?, ?, ?, ?) ON CONFLICT (execution_id) DO NOTHING",
                UUID.randomUUID(),
                UUID.fromString(idEjecucion),
                json,
                pedidos.size(),
                (int) pedidos.stream().filter(p -> "ENTREGADA".equals(p.estado())).count(),
                (int) pedidos.stream().filter(p -> "INCUMPLIDA".equals(p.estado())).count(),
                reporte.motivoFinalizacion(),
                reporte.duracionSimuladaMs());
    }

    @Override
    public Optional<ReporteSimulacionDTO> consultarReporteFinal(String idEjecucion) {
        UUID execId;
        try {
            execId = UUID.fromString(idEjecucion);
        } catch (IllegalArgumentException ex) {
            return Optional.empty();
        }
        List<String> payloads = jdbcTemplate.query(
                "SELECT report_payload FROM simulation_reports WHERE execution_id = ? AND deleted_at IS NULL",
                (rs, rowNum) -> rs.getString(1),
                execId);
        if (payloads.isEmpty()) {
            return Optional.empty();
        }
        try {
            return Optional.of(objectMapper.readValue(payloads.get(0), ReporteSimulacionDTO.class));
        } catch (Exception ex) {
            log.error("Error deserializando reporte final {}: {}", idEjecucion, ex.getMessage());
            return Optional.empty();
        }
    }

    @Override
    public Optional<EjecucionEscenario> consultarEjecucionHistorica(String idEjecucion) {
        UUID execId;
        try {
            execId = UUID.fromString(idEjecucion);
        } catch (IllegalArgumentException ex) {
            return Optional.empty();
        }
        List<EjecucionEscenario> lista = jdbcTemplate.query(
                "SELECT id, scenario_type, status, started_at, ended_at, simulated_start_at, sa, k "
                        + "FROM scenario_executions WHERE id = ? AND deleted_at IS NULL",
                // Con sus instantes reales: antes se reconstruía con inicio = "ahora" y sin fin.
                (rs, rowNum) -> EjecucionEscenario.restaurar(
                        rs.getObject("id", UUID.class).toString(),
                        TipoEscenario.valueOf(rs.getString("scenario_type")),
                        fromUtcTimestamp(rs.getTimestamp("simulated_start_at")),
                        rs.getFloat("sa"),
                        rs.getFloat("k"),
                        EstadoEjecucion.valueOf(rs.getString("status")),
                        rs.getTimestamp("started_at").toInstant(),
                        rs.getTimestamp("ended_at") != null ? rs.getTimestamp("ended_at").toInstant() : null),
                execId);
        return lista.stream().findFirst();
    }

    @Override
    @Transactional
    public void guardarConfiguracionMaestra(Ciudad ciudad, ConfiguracionOperacion operacion,
            List<TipoVehiculo> tiposVehiculo, List<Almacen> almacenes, List<UnidadTransporte> flota) {
        jdbcTemplate.update(
                // Registro único (índice ux_city_configs_singleton, V8); el WHERE lo deja explícito.
                "UPDATE city_configs SET width = ?, height = ?, origin_x = ?, origin_y = ?, "
                        + "node_distance_km = ?, two_way_streets = ?, updated_at = NOW() "
                        + "WHERE id = (SELECT id FROM city_configs LIMIT 1)",
                ciudad.ancho(), ciudad.alto(), ciudad.origen().x(), ciudad.origen().y(),
                ciudad.distanciaEntreNodos(), ciudad.callesDobleSentido());

        jdbcTemplate.update(
                "UPDATE operation_configs SET shift_duration_hours = ?, shift_start_hour = ?, "
                        + "client_service_hours = ?, break_duration_hours = ?, break_margin_hours = ?, "
                        + "warehouse_load_hours = ?, transshipment_hours = ?, max_stops_per_route = ?, updated_at = NOW() "
                        + "WHERE id = (SELECT id FROM operation_configs LIMIT 1)",
                operacion.duracionTurnoHoras(), operacion.horaInicioTurno(), operacion.tiempoServicioClienteHoras(),
                operacion.duracionRefrigerioHoras(), operacion.margenRefrigerioHoras(),
                operacion.tiempoCargaAlmacenHoras(), operacion.tiempoTrasvaseHoras(), operacion.maxParadasPorRuta());

        for (TipoVehiculo tv : tiposVehiculo) {
            int unidades = (int) flota.stream()
                    .filter(u -> u.getTipoVehiculo().getId().equalsIgnoreCase(tv.getId()))
                    .count();
            jdbcTemplate.update(
                    "UPDATE vehicle_types SET capacity = ?, speed_kmh = ?, cost_per_km = ?, "
                            + "initial_units = ?, maintenance_duration_hours = ? WHERE type_code = ?",
                    tv.getCapacidad(), tv.getVelocidadKmH(), tv.getCostoPorKm(),
                    unidades, tv.getDuracionMantenimientoHoras(), tv.getId());
        }

        for (Almacen almacen : almacenes) {
            if (almacen instanceof AlmacenIntermedio intermedio) {
                jdbcTemplate.update(
                        "UPDATE warehouses SET pos_x = ?, pos_y = ?, max_capacity = ?, reload_frequency_hours = ? "
                                + "WHERE name = ?",
                        almacen.getPosicion().x(), almacen.getPosicion().y(),
                        intermedio.getCapacidadMaxima(), intermedio.getFrecuenciaRecargaHoras(),
                        intermedio.getNombre());
            } else {
                jdbcTemplate.update(
                        "UPDATE warehouses SET pos_x = ?, pos_y = ? WHERE warehouse_type = 'CENTRAL'",
                        almacen.getPosicion().x(), almacen.getPosicion().y());
            }
        }

        // Sincronizar flota: soft-delete previo y reactivación/inserción de unidades vigentes
        Nodo posicionCentral = almacenes.stream()
                .filter(a -> !(a instanceof AlmacenIntermedio))
                .findFirst()
                .map(Almacen::getPosicion)
                .orElse(new Nodo(27, 14));
        jdbcTemplate.update("UPDATE vehicles SET deleted_at = NOW() WHERE deleted_at IS NULL");
        for (UnidadTransporte u : flota) {
            UUID typeId = jdbcTemplate.queryForObject(
                    "SELECT id FROM vehicle_types WHERE type_code = ?",
                    UUID.class, u.getTipoVehiculo().getId());
            int updated = jdbcTemplate.update(
                    "UPDATE vehicles SET vehicle_type_id = ?, initial_pos_x = ?, initial_pos_y = ?, deleted_at = NULL "
                            + "WHERE vehicle_code = ?",
                    typeId, posicionCentral.x(), posicionCentral.y(), u.getIdUnidad());
            if (updated == 0) {
                jdbcTemplate.update(
                        "INSERT INTO vehicles (id, vehicle_code, vehicle_type_id, initial_pos_x, initial_pos_y) "
                                + "VALUES (?, ?, ?, ?, ?)",
                        UUID.randomUUID(), u.getIdUnidad(), typeId,
                        posicionCentral.x(), posicionCentral.y());
            }
        }
    }

    private Timestamp toUtcTimestamp(LocalDateTime ldt) {
        return Timestamp.from(ldt.toInstant(ZoneOffset.UTC));
    }

    private LocalDateTime fromUtcTimestamp(Timestamp ts) {
        return ts.toInstant().atZone(ZoneOffset.UTC).toLocalDateTime();
    }

    private LocalDateTime fromUtcTimestampNullable(Timestamp ts) {
        return ts != null ? fromUtcTimestamp(ts) : null;
    }

    private static String recortar(String valor, int largo) {
        return valor == null || valor.length() <= largo ? valor : valor.substring(0, largo);
    }

    private String serializarNodos(List<Nodo> nodos) {
        try {
            List<PostgresCargadorRecursos.NodoJson> lista = nodos.stream()
                    .map(n -> new PostgresCargadorRecursos.NodoJson(n.x(), n.y()))
                    .toList();
            return objectMapper.writeValueAsString(lista);
        } catch (Exception ex) {
            throw new IllegalStateException("Error serializando nodos de bloqueo a JSON", ex);
        }
    }

    private List<Nodo> deserializarNodos(String json) {
        try {
            List<PostgresCargadorRecursos.NodoJson> lista = objectMapper.readValue(json, NODO_LIST_TYPE);
            return lista.stream().map(n -> new Nodo(n.x(), n.y())).toList();
        } catch (Exception ex) {
            throw new IllegalStateException("Error deserializando nodes_json de bloqueo", ex);
        }
    }
}
