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
import com.paqrap.exposicion.ReporteSimulacionDTO;
import com.paqrap.exposicion.RepositorioOperacion;
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
    public void guardarPedidosManuales(List<Pedido> pedidos) {
        if (pedidos == null || pedidos.isEmpty()) return;
        String sql = "INSERT INTO orders (id, order_code, client_code, dest_x, dest_y, requested_quantity, "
                + "sla_hours, registered_at, period_year, period_month, source) "
                + "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'MANUAL') "
                + "ON CONFLICT (order_code) DO NOTHING";
        jdbcTemplate.batchUpdate(sql, pedidos, BATCH_SIZE, (ps, p) -> {
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
    public void guardarBloqueosManuales(List<Bloqueo> bloqueos) {
        if (bloqueos == null || bloqueos.isEmpty()) return;
        String sql = "INSERT INTO street_blockages (id, start_at, end_at, nodes_json, period_year, period_month, source) "
                + "VALUES (?, ?, ?, CAST(? AS JSONB), ?, ?, 'MANUAL')";
        jdbcTemplate.batchUpdate(sql, bloqueos, BATCH_SIZE, (ps, b) -> {
            ps.setObject(1, UUID.randomUUID());
            ps.setTimestamp(2, toUtcTimestamp(b.getFechaInicio()));
            ps.setTimestamp(3, toUtcTimestamp(b.getFechaFin()));
            ps.setString(4, serializarNodos(b.getSecuenciaNodos()));
            ps.setInt(5, b.getFechaInicio().getYear());
            ps.setInt(6, b.getFechaInicio().getMonthValue());
        });
    }

    @Override
    public void guardarMantenimientosManuales(List<CargaArchivo.MantenimientoPendiente> mantenimientos) {
        if (mantenimientos == null || mantenimientos.isEmpty()) return;
        String sql = "INSERT INTO maintenance_schedules (id, vehicle_code, scheduled_date, template_month, template_day, source) "
                + "VALUES (?, ?, ?, ?, ?, 'MANUAL')";
        jdbcTemplate.batchUpdate(sql, mantenimientos, BATCH_SIZE, (ps, m) -> {
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
    public void limpiarDatosManuales() {
        // Soft delete per 63.std.db sección 7.3
        jdbcTemplate.update("UPDATE orders SET deleted_at = NOW() WHERE source = 'MANUAL' AND deleted_at IS NULL");
        jdbcTemplate.update("UPDATE street_blockages SET deleted_at = NOW() WHERE source = 'MANUAL' AND deleted_at IS NULL");
        jdbcTemplate.update("UPDATE maintenance_schedules SET deleted_at = NOW() WHERE source = 'MANUAL' AND deleted_at IS NULL");
    }

    @Override
    public void registrarInicioEjecucion(EjecucionEscenario ejecucion) {
        jdbcTemplate.update(
                "INSERT INTO scenario_executions (id, scenario_type, status, started_at, simulated_start_at, sa, k) "
                        + "VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT (id) DO NOTHING",
                UUID.fromString(ejecucion.getIdEjecucion()),
                ejecucion.getTipoEscenario().name(),
                ejecucion.getEstado().name(),
                Timestamp.from(ejecucion.getInicioReal()),
                toUtcTimestamp(ejecucion.getFechaInicioSimulada()),
                ejecucion.getSa(),
                ejecucion.getK());
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
        try {
            String json = objectMapper.writeValueAsString(reporte);
            jdbcTemplate.update(
                    "INSERT INTO simulation_reports (id, execution_id, report_payload) "
                            + "VALUES (?, ?, CAST(? AS JSONB)) ON CONFLICT (execution_id) DO NOTHING",
                    UUID.randomUUID(),
                    UUID.fromString(idEjecucion),
                    json);
        } catch (Exception ex) {
            log.error("No se pudo persistir el reporte final de la ejecución {}: {}", idEjecucion, ex.getMessage());
        }
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
                "SELECT id, scenario_type, status, simulated_start_at, sa, k "
                        + "FROM scenario_executions WHERE id = ? AND deleted_at IS NULL",
                (rs, rowNum) -> {
                    EjecucionEscenario ej = new EjecucionEscenario(
                            rs.getObject("id", UUID.class).toString(),
                            TipoEscenario.valueOf(rs.getString("scenario_type")),
                            fromUtcTimestamp(rs.getTimestamp("simulated_start_at")),
                            rs.getFloat("sa"),
                            rs.getFloat("k"));
                    ej.setEstado(EstadoEjecucion.valueOf(rs.getString("status")));
                    return ej;
                },
                execId);
        return lista.stream().findFirst();
    }

    @Override
    @Transactional
    public void guardarConfiguracionMaestra(Ciudad ciudad, ConfiguracionOperacion operacion,
            List<TipoVehiculo> tiposVehiculo, List<Almacen> almacenes, List<UnidadTransporte> flota) {
        jdbcTemplate.update(
                "UPDATE city_configs SET width = ?, height = ?, origin_x = ?, origin_y = ?, "
                        + "node_distance_km = ?, two_way_streets = ?, updated_at = NOW()",
                ciudad.ancho(), ciudad.alto(), ciudad.origen().x(), ciudad.origen().y(),
                ciudad.distanciaEntreNodos(), ciudad.callesDobleSentido());

        jdbcTemplate.update(
                "UPDATE operation_configs SET shift_duration_hours = ?, shift_start_hour = ?, "
                        + "client_service_hours = ?, break_duration_hours = ?, break_margin_hours = ?, "
                        + "warehouse_load_hours = ?, transshipment_hours = ?, max_stops_per_route = ?, updated_at = NOW()",
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
