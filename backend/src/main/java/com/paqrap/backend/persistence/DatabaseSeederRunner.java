package com.paqrap.backend.persistence;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.paqrap.dominio.Bloqueo;
import com.paqrap.dominio.Pedido;
import com.paqrap.dominio.TipoArchivo;
import com.paqrap.entrada.CargaArchivo;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Date;
import java.sql.Timestamp;
import java.time.YearMonth;
import java.time.ZoneOffset;
import java.util.Comparator;
import java.util.List;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Stream;

/**
 * Sincronizador automático al arranque: en cada inicio/release del backend reescribe los datos
 * oficiales ({@code source = 'OFFICIAL'}) en {@code orders}, {@code street_blockages} y
 * {@code maintenance_schedules} con el contenido de los archivos {@code .txt} empaquetados en la
 * imagen ({@code /app/data} o {@code algoritmo/data}), preservando ejecuciones, reportes y
 * configuración maestra.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class DatabaseSeederRunner implements ApplicationRunner {

    private static final int BATCH_SIZE = 1000;
    private static final Pattern PATRON_VENTAS = Pattern.compile("^ventas\\.(\\d{4})(\\d{2})\\.txt$");
    private static final Pattern PATRON_BLOQUEOS = Pattern.compile("^bloqueo\\.(\\d{2})(\\d{2})\\.txt$");
    private static final Pattern PATRON_MANTENIMIENTO = Pattern.compile("^mant\\.preventivo.*\\.txt$");

    private final JdbcTemplate jdbcTemplate;
    private final ObjectMapper objectMapper;

    @Value("${paqrap.datos.carpeta:data}")
    private String carpetaDatosConfig;

    @Value("${paqrap.seeder.enabled:true}")
    private boolean seederEnabled;

    @Override
    @Transactional
    public void run(ApplicationArguments args) {
        if (!seederEnabled) {
            return;
        }
        Path carpetaDatos = resolverCarpetaDatos(carpetaDatosConfig);
        if (!Files.isDirectory(carpetaDatos)) {
            log.warn("No se encontró carpeta de datos oficiales en {}; se omite la carga de archivos .txt.", carpetaDatos);
            return;
        }
        reemplazarPedidosOficiales(carpetaDatos);
        reemplazarBloqueosOficiales(carpetaDatos);
        reemplazarMantenimientoOficial(carpetaDatos);
    }

    private void reemplazarPedidosOficiales(Path carpetaDatos) {
        Path dirVentas = carpetaDatos.resolve("ventas");
        if (!Files.isDirectory(dirVentas)) {
            return;
        }
        long inicio = System.currentTimeMillis();
        jdbcTemplate.update("DELETE FROM orders WHERE source = 'OFFICIAL'");

        int archivos = 0;
        int totalInsertados = 0;
        String sql = "INSERT INTO orders (id, order_code, client_code, dest_x, dest_y, requested_quantity, "
                + "sla_hours, registered_at, period_year, period_month, source) "
                + "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'OFFICIAL') "
                + "ON CONFLICT (order_code) DO NOTHING";

        try (Stream<Path> stream = Files.list(dirVentas)) {
            List<Path> lista = stream.filter(Files::isRegularFile)
                    .sorted(Comparator.comparing(p -> p.getFileName().toString()))
                    .toList();
            for (Path archivo : lista) {
                String nombre = archivo.getFileName().toString();
                Matcher m = PATRON_VENTAS.matcher(nombre);
                if (!m.matches()) continue;

                int anio = Integer.parseInt(m.group(1));
                int mes = Integer.parseInt(m.group(2));
                CargaArchivo carga = new CargaArchivo(nombre, TipoArchivo.PEDIDOS, YearMonth.of(anio, mes));
                carga.procesarArchivo(Files.readString(archivo, StandardCharsets.UTF_8));
                List<Pedido> pedidos = carga.getPedidos();
                jdbcTemplate.batchUpdate(sql, pedidos, BATCH_SIZE, (ps, p) -> {
                    ps.setObject(1, UUID.randomUUID());
                    ps.setString(2, p.getIdPedido());
                    ps.setString(3, p.getIdCliente());
                    ps.setInt(4, p.getDestino().x());
                    ps.setInt(5, p.getDestino().y());
                    ps.setInt(6, p.getCantidadSolicitada());
                    ps.setInt(7, p.getHorasLimite());
                    ps.setTimestamp(8, Timestamp.from(p.getFechaIngreso().toInstant(ZoneOffset.UTC)));
                    ps.setInt(9, anio);
                    ps.setInt(10, mes);
                });
                archivos++;
                totalInsertados += pedidos.size();
            }
        } catch (IOException ex) {
            log.error("Error escaneando archivos de ventas en {}: {}", dirVentas, ex.getMessage());
        }
        log.info("Sincronización de pedidos oficiales completada en {} ms ({} archivos, {} registros).",
                System.currentTimeMillis() - inicio, archivos, totalInsertados);
    }

    private void reemplazarBloqueosOficiales(Path carpetaDatos) {
        Path dirBloqueos = carpetaDatos.resolve("bloqueos");
        if (!Files.isDirectory(dirBloqueos)) {
            return;
        }
        long inicio = System.currentTimeMillis();
        jdbcTemplate.update("DELETE FROM street_blockages WHERE source = 'OFFICIAL'");

        int archivos = 0;
        int totalInsertados = 0;
        String sql = "INSERT INTO street_blockages (id, start_at, end_at, nodes_json, period_year, period_month, source) "
                + "VALUES (?, ?, ?, CAST(? AS JSONB), ?, ?, 'OFFICIAL')";

        try (Stream<Path> stream = Files.list(dirBloqueos)) {
            List<Path> lista = stream.filter(Files::isRegularFile)
                    .sorted(Comparator.comparing(p -> p.getFileName().toString()))
                    .toList();
            for (Path archivo : lista) {
                String nombre = archivo.getFileName().toString();
                Matcher m = PATRON_BLOQUEOS.matcher(nombre);
                if (!m.matches()) continue;

                int anio = 2000 + Integer.parseInt(m.group(1));
                int mes = Integer.parseInt(m.group(2));
                CargaArchivo carga = new CargaArchivo(nombre, TipoArchivo.BLOQUEOS, YearMonth.of(anio, mes));
                carga.procesarArchivo(Files.readString(archivo, StandardCharsets.UTF_8));
                List<Bloqueo> bloqueos = carga.getBloqueos();
                jdbcTemplate.batchUpdate(sql, bloqueos, BATCH_SIZE, (ps, b) -> {
                    ps.setObject(1, UUID.randomUUID());
                    ps.setTimestamp(2, Timestamp.from(b.getFechaInicio().toInstant(ZoneOffset.UTC)));
                    ps.setTimestamp(3, Timestamp.from(b.getFechaFin().toInstant(ZoneOffset.UTC)));
                    ps.setString(4, serializarNodos(b));
                    ps.setInt(5, anio);
                    ps.setInt(6, mes);
                });
                archivos++;
                totalInsertados += bloqueos.size();
            }
        } catch (IOException ex) {
            log.error("Error escaneando archivos de bloqueos en {}: {}", dirBloqueos, ex.getMessage());
        }
        log.info("Sincronización de bloqueos oficiales completada en {} ms ({} archivos, {} registros).",
                System.currentTimeMillis() - inicio, archivos, totalInsertados);
    }

    private void reemplazarMantenimientoOficial(Path carpetaDatos) {
        jdbcTemplate.update("DELETE FROM maintenance_schedules WHERE source = 'OFFICIAL'");

        String sql = "INSERT INTO maintenance_schedules (id, vehicle_code, scheduled_date, template_month, template_day, source) "
                + "VALUES (?, ?, ?, ?, ?, 'OFFICIAL')";

        try (Stream<Path> stream = Files.list(carpetaDatos)) {
            List<Path> lista = stream.filter(Files::isRegularFile)
                    .filter(p -> PATRON_MANTENIMIENTO.matcher(p.getFileName().toString()).matches())
                    .sorted(Comparator.comparing(p -> p.getFileName().toString()))
                    .toList();
            int totalInsertados = 0;
            for (Path archivo : lista) {
                String nombre = archivo.getFileName().toString();
                CargaArchivo carga = new CargaArchivo(nombre, TipoArchivo.MANTENIMIENTO, YearMonth.of(2026, 9));
                carga.procesarArchivo(Files.readString(archivo, StandardCharsets.UTF_8));
                jdbcTemplate.batchUpdate(sql, carga.getMantenimientosPendientes(), BATCH_SIZE, (ps, m) -> {
                    ps.setObject(1, UUID.randomUUID());
                    ps.setString(2, m.idUnidad());
                    ps.setDate(3, Date.valueOf(m.fecha()));
                    ps.setInt(4, m.fecha().getMonthValue());
                    ps.setInt(5, m.fecha().getDayOfMonth());
                });
                totalInsertados += carga.getMantenimientosPendientes().size();
            }
            log.info("Sincronización de mantenimiento oficial completada ({} registros).", totalInsertados);
        } catch (IOException ex) {
            log.error("Error escaneando archivos de mantenimiento en {}: {}", carpetaDatos, ex.getMessage());
        }
    }

    private String serializarNodos(Bloqueo bloqueo) {
        try {
            List<PostgresCargadorRecursos.NodoJson> nodos = bloqueo.getSecuenciaNodos().stream()
                    .map(n -> new PostgresCargadorRecursos.NodoJson(n.x(), n.y()))
                    .toList();
            return objectMapper.writeValueAsString(nodos);
        } catch (Exception ex) {
            throw new IllegalStateException("Error serializando nodos de bloqueo en seeder", ex);
        }
    }

    static Path resolverCarpetaDatos(String carpetaDatos) {
        if ("data".equals(carpetaDatos) && !Files.isDirectory(Path.of(carpetaDatos))) {
            for (String candidata : List.of("algoritmo/data", "../algoritmo/data")) {
                if (Files.isDirectory(Path.of(candidata))) {
                    return Path.of(candidata);
                }
            }
        }
        return Path.of(carpetaDatos);
    }
}
