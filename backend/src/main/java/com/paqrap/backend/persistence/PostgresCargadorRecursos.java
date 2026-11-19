package com.paqrap.backend.persistence;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.paqrap.dominio.Bloqueo;
import com.paqrap.dominio.Mantenimiento;
import com.paqrap.dominio.Nodo;
import com.paqrap.dominio.Pedido;
import com.paqrap.dominio.TipoArchivo;
import com.paqrap.dominio.UnidadTransporte;
import com.paqrap.entrada.CargaArchivo;
import com.paqrap.entrada.CargadorRecursos;
import lombok.extern.slf4j.Slf4j;
import org.springframework.jdbc.core.JdbcTemplate;

import java.io.IOException;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.YearMonth;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Objects;

/**
 * Implementación de {@link CargadorRecursos} respaldada por PostgreSQL.
 *
 * <p>Reemplaza la precarga y retención de todos los archivos 2026–2028 en RAM por consultas
 * indexadas por período ({@code period_year}, {@code period_month}), devolviendo únicamente los
 * datos necesarios para el mes solicitado por {@code OrquestadorOperacion}.
 */
@Slf4j
public class PostgresCargadorRecursos extends CargadorRecursos {

    private static final TypeReference<List<NodoJson>> NODO_LIST_TYPE = new TypeReference<>() {};

    private final JdbcTemplate jdbcTemplate;
    private final ObjectMapper objectMapper;

    public PostgresCargadorRecursos(String carpetaDatos, String carpetaConfig, JdbcTemplate jdbcTemplate,
            ObjectMapper objectMapper) {
        super(carpetaDatos, carpetaConfig);
        this.jdbcTemplate = jdbcTemplate;
        this.objectMapper = objectMapper;
    }

    @Override
    public void precargarTodo() {
        // No-op: los datos oficiales viven en PostgreSQL (sembrados por DatabaseSeederRunner)
        // y no se mantienen precargados en RAM.
        log.debug("precargarTodo() omitido: los datos oficiales se consultan bajo demanda desde PostgreSQL.");
    }

    @Override
    public CargaArchivo cargarPedidos(int anio, int mes) throws IOException {
        YearMonth ym = YearMonth.of(anio, mes);
        String nombre = String.format("ventas.%04d%02d.txt", anio, mes);
        CargaArchivo carga = new CargaArchivo(nombre, TipoArchivo.PEDIDOS, ym);

        List<Pedido> pedidos = jdbcTemplate.query(
                "SELECT order_code, client_code, dest_x, dest_y, requested_quantity, sla_hours, registered_at "
                        + "FROM orders "
                        + "WHERE period_year = ? AND period_month = ? AND source = 'OFFICIAL' AND deleted_at IS NULL "
                        + "ORDER BY registered_at ASC, order_code ASC",
                (rs, rowNum) -> {
                    LocalDateTime fechaIngreso = rs.getTimestamp("registered_at").toInstant()
                            .atZone(ZoneOffset.UTC).toLocalDateTime();
                    return new Pedido(
                            rs.getString("order_code"),
                            rs.getString("client_code"),
                            new Nodo(rs.getInt("dest_x"), rs.getInt("dest_y")),
                            rs.getInt("requested_quantity"),
                            rs.getInt("sla_hours"),
                            fechaIngreso);
                },
                anio, mes);

        carga.getPedidos().addAll(pedidos);
        return carga;
    }

    @Override
    public CargaArchivo cargarBloqueos(int anio, int mes) throws IOException {
        YearMonth ym = YearMonth.of(anio, mes);
        int anioDisponible = anioBloqueoDisponible(anio);
        int desplazamientoAnios = anio - anioDisponible;
        String nombre = String.format("bloqueo.%02d%02d.txt", anioDisponible % 100, mes);
        CargaArchivo carga = new CargaArchivo(nombre, TipoArchivo.BLOQUEOS, ym);

        List<Bloqueo> bloqueos = jdbcTemplate.query(
                "SELECT start_at, end_at, nodes_json "
                        + "FROM street_blockages "
                        + "WHERE period_year = ? AND period_month = ? AND source = 'OFFICIAL' AND deleted_at IS NULL "
                        + "ORDER BY start_at ASC",
                (rs, rowNum) -> {
                    LocalDateTime inicio = rs.getTimestamp("start_at").toInstant()
                            .atZone(ZoneOffset.UTC).toLocalDateTime().plusYears(desplazamientoAnios);
                    LocalDateTime fin = rs.getTimestamp("end_at").toInstant()
                            .atZone(ZoneOffset.UTC).toLocalDateTime().plusYears(desplazamientoAnios);
                    List<Nodo> nodos = deserializarNodos(rs.getString("nodes_json"));
                    return new Bloqueo(nodos, inicio, fin);
                },
                anioDisponible, mes);

        carga.getBloqueos().addAll(bloqueos);
        return carga;
    }

    @Override
    public List<Mantenimiento> cargarMantenimiento(int anio, int mes1, int mes2, List<UnidadTransporte> flota)
            throws IOException {
        List<CargaArchivo.MantenimientoPendiente> pendientes = jdbcTemplate.query(
                "SELECT vehicle_code, scheduled_date "
                        + "FROM maintenance_schedules "
                        + "WHERE source = 'OFFICIAL' AND deleted_at IS NULL "
                        + "ORDER BY scheduled_date ASC, vehicle_code ASC",
                (rs, rowNum) -> new CargaArchivo.MantenimientoPendiente(
                        rs.getString("vehicle_code"),
                        rs.getObject("scheduled_date", LocalDate.class)));

        return pendientes.stream()
                .map(p -> resolverMantenimiento(p, flota, anio, mes1, mes2))
                .filter(Objects::nonNull)
                .toList();
    }

    private List<Nodo> deserializarNodos(String json) {
        try {
            List<NodoJson> nodos = objectMapper.readValue(json, NODO_LIST_TYPE);
            return nodos.stream().map(n -> new Nodo(n.x(), n.y())).toList();
        } catch (Exception ex) {
            throw new IllegalStateException("Error deserializando nodes_json de bloqueo", ex);
        }
    }

    public record NodoJson(int x, int y) {
    }
}
