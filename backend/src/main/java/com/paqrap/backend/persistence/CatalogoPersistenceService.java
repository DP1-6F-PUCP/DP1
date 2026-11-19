package com.paqrap.backend.persistence;

import com.paqrap.dominio.Almacen;
import com.paqrap.dominio.AlmacenCentral;
import com.paqrap.dominio.AlmacenIntermedio;
import com.paqrap.dominio.Ciudad;
import com.paqrap.dominio.ConfiguracionOperacion;
import com.paqrap.dominio.Nodo;
import com.paqrap.dominio.TipoVehiculo;
import com.paqrap.dominio.UnidadTransporte;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * Carga el catálogo maestro (ciudad, parámetros operativos, tipos de vehículo, almacenes y flota)
 * desde PostgreSQL para inicializar la aplicación sin depender de valores hardcodeados en RAM.
 */
@Service
@RequiredArgsConstructor
public class CatalogoPersistenceService {

    private final JdbcTemplate jdbcTemplate;

    public Ciudad cargarCiudad() {
        return jdbcTemplate.queryForObject(
                "SELECT width, height, origin_x, origin_y, node_distance_km, two_way_streets "
                        + "FROM city_configs ORDER BY updated_at DESC LIMIT 1",
                (rs, rowNum) -> new Ciudad(
                        rs.getInt("width"),
                        rs.getInt("height"),
                        new Nodo(rs.getInt("origin_x"), rs.getInt("origin_y")),
                        rs.getInt("node_distance_km"),
                        rs.getBoolean("two_way_streets")));
    }

    public ConfiguracionOperacion cargarConfiguracionOperacion() {
        return jdbcTemplate.queryForObject(
                "SELECT shift_duration_hours, shift_start_hour, client_service_hours, "
                        + "break_duration_hours, break_margin_hours, warehouse_load_hours, "
                        + "transshipment_hours, max_stops_per_route "
                        + "FROM operation_configs ORDER BY updated_at DESC LIMIT 1",
                (rs, rowNum) -> new ConfiguracionOperacion(
                        rs.getDouble("shift_duration_hours"),
                        rs.getDouble("shift_start_hour"),
                        rs.getDouble("client_service_hours"),
                        rs.getDouble("break_duration_hours"),
                        rs.getDouble("break_margin_hours"),
                        rs.getDouble("warehouse_load_hours"),
                        rs.getDouble("transshipment_hours"),
                        rs.getInt("max_stops_per_route")));
    }

    public List<TipoVehiculo> cargarTiposVehiculo() {
        return jdbcTemplate.query(
                "SELECT type_code, name, capacity, speed_kmh, cost_per_km, initial_units, maintenance_duration_hours "
                        + "FROM vehicle_types WHERE deleted_at IS NULL ORDER BY capacity DESC",
                (rs, rowNum) -> new TipoVehiculo(
                        rs.getString("type_code"),
                        rs.getString("name"),
                        rs.getInt("capacity"),
                        rs.getDouble("speed_kmh"),
                        rs.getDouble("cost_per_km"),
                        rs.getInt("initial_units"),
                        rs.getDouble("maintenance_duration_hours")));
    }

    public List<Almacen> cargarAlmacenes() {
        return jdbcTemplate.query(
                "SELECT name, warehouse_type, pos_x, pos_y, max_capacity "
                        + "FROM warehouses WHERE deleted_at IS NULL ORDER BY warehouse_type, name",
                (rs, rowNum) -> {
                    Nodo posicion = new Nodo(rs.getInt("pos_x"), rs.getInt("pos_y"));
                    String tipo = rs.getString("warehouse_type");
                    if ("CENTRAL".equalsIgnoreCase(tipo)) {
                        return new AlmacenCentral(posicion);
                    }
                    int cap = rs.getInt("max_capacity");
                    return new AlmacenIntermedio(posicion, rs.getString("name"), cap, cap);
                });
    }

    public List<UnidadTransporte> cargarFlota(List<TipoVehiculo> tiposVehiculo) {
        Map<String, TipoVehiculo> porCodigo = tiposVehiculo.stream()
                .collect(Collectors.toMap(tv -> tv.getId().toUpperCase(), Function.identity()));
        LocalDateTime inicioTurno = LocalDateTime.now().withHour(7).withMinute(0).withSecond(0).withNano(0);
        return jdbcTemplate.query(
                "SELECT v.vehicle_code, vt.type_code, v.initial_pos_x, v.initial_pos_y "
                        + "FROM vehicles v "
                        + "INNER JOIN vehicle_types vt ON vt.id = v.vehicle_type_id "
                        + "WHERE v.deleted_at IS NULL AND vt.deleted_at IS NULL "
                        + "ORDER BY v.vehicle_code",
                (rs, rowNum) -> {
                    TipoVehiculo tipo = porCodigo.get(rs.getString("type_code").toUpperCase());
                    Nodo pos = new Nodo(rs.getInt("initial_pos_x"), rs.getInt("initial_pos_y"));
                    return new UnidadTransporte(rs.getString("vehicle_code"), tipo, pos, inicioTurno);
                });
    }
}
