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
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.sql.Date;
import java.sql.Timestamp;
import java.time.YearMonth;
import java.time.ZoneOffset;
import java.util.Comparator;
import java.util.HexFormat;
import java.util.List;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Stream;

/**
 * Sincronizador automático al arranque de los datos oficiales ({@code source = 'OFFICIAL'}) en
 * {@code orders}, {@code street_blockages} y {@code maintenance_schedules} con los archivos
 * {@code .txt} empaquetados en la imagen ({@code /app/data} o {@code algoritmo/data}), preservando
 * ejecuciones, reportes, configuración maestra y datos manuales.
 *
 * <p>Idempotente: cada archivo se registra en {@code data_imports} con su SHA-256. Si ya hay una
 * carga oficial vigente con el mismo nombre y contenido, el archivo no se toca (antes se borraban y
 * reinsertaban ~160 000 pedidos en cada arranque: arranque lento, tabla inflada de filas muertas y
 * UUID nuevos cada vez). Si el contenido cambió, se reemplaza solo el período de ese archivo.
 * El borrado de las filas oficiales reemplazadas es físico a propósito: son una réplica de los
 * archivos, no datos de negocio.
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

    /**
     * Una sola sincronización a la vez: «Cargar» pulsado mientras corre la del arranque chocaba con
     * ella (las dos insertaban los mismos pedidos: clave duplicada).
     */
    private final java.util.concurrent.atomic.AtomicBoolean sincronizando = new java.util.concurrent.atomic.AtomicBoolean();

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
        if (!sincronizando.compareAndSet(false, true)) {
            return;
        }
        try {
            sincronizar(carpetaDatos);
        } finally {
            sincronizando.set(false);
        }
    }

    /**
     * Vuelve a cargar los datos estándar desde los archivos empaquetados (Configuración → Datos →
     * «Restaurar», tras «Borrar todo»). Solo recarga los archivos cuya carga no esté vigente.
     */
    @Transactional
    public void restaurarEstandar() {
        Path carpetaDatos = resolverCarpetaDatos(carpetaDatosConfig);
        if (!Files.isDirectory(carpetaDatos)) {
            throw new IllegalStateException("No se encontraron los archivos de datos estándar.");
        }
        if (!sincronizando.compareAndSet(false, true)) {
            throw new IllegalStateException("Los datos estándar ya se están cargando. Espera unos segundos.");
        }
        try {
            sincronizar(carpetaDatos);
        } finally {
            sincronizando.set(false);
        }
    }

    /** Visible para pruebas: sincroniza la carpeta dada (sin depender de las propiedades de Spring). */
    @Transactional
    public void sincronizar(Path carpetaDatos) {
        long inicio = System.currentTimeMillis();
        int[] conteo = {0, 0};
        procesarCarpeta(carpetaDatos.resolve("ventas"), PATRON_VENTAS, (archivo, m) -> sincronizarVentas(archivo, m), conteo);
        procesarCarpeta(carpetaDatos.resolve("bloqueos"), PATRON_BLOQUEOS, (archivo, m) -> sincronizarBloqueos(archivo, m), conteo);
        procesarCarpeta(carpetaDatos, PATRON_MANTENIMIENTO, (archivo, m) -> sincronizarMantenimiento(archivo), conteo);
        log.info("Sincronización de datos oficiales en {} ms: {} archivo(s) recargados, {} sin cambios.",
                System.currentTimeMillis() - inicio, conteo[0], conteo[1]);
    }

    @FunctionalInterface
    private interface Sincronizador {
        boolean sincronizar(Path archivo, Matcher nombre) throws IOException;
    }

    private void procesarCarpeta(Path carpeta, Pattern patron, Sincronizador sincronizador, int[] conteo) {
        if (!Files.isDirectory(carpeta)) {
            return;
        }
        try (Stream<Path> stream = Files.list(carpeta)) {
            List<Path> lista = stream.filter(Files::isRegularFile)
                    .sorted(Comparator.comparing(p -> p.getFileName().toString()))
                    .toList();
            for (Path archivo : lista) {
                Matcher m = patron.matcher(archivo.getFileName().toString());
                if (!m.matches()) continue;
                if (sincronizador.sincronizar(archivo, m)) conteo[0]++;
                else conteo[1]++;
            }
        } catch (IOException ex) {
            log.error("Error escaneando archivos oficiales en {}: {}", carpeta, ex.getMessage());
        }
    }

    /**
     * Registra la carga del archivo si su contenido cambió.
     *
     * @return el id de la carga nueva, o {@code null} si ya estaba cargado igual (no hay que hacer nada)
     */
    private UUID registrarSiCambio(String nombre, TipoArchivo tipo, Integer anio, Integer mes, String contenido,
            int filas) {
        String sha = sha256(contenido);
        Integer vigentes = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM data_imports WHERE source = 'OFFICIAL' AND file_name = ? AND sha256 = ? "
                        + "AND deleted_at IS NULL",
                Integer.class, nombre, sha);
        if (vigentes != null && vigentes > 0) {
            return null;
        }
        jdbcTemplate.update("UPDATE data_imports SET deleted_at = NOW() WHERE source = 'OFFICIAL' AND file_name = ? "
                + "AND deleted_at IS NULL", nombre);
        UUID id = UUID.randomUUID();
        jdbcTemplate.update(
                "INSERT INTO data_imports (id, source, file_type, file_name, period_year, period_month, sha256, row_count) "
                        + "VALUES (?, 'OFFICIAL', ?, ?, ?, ?, ?, ?)",
                id, tipo.name(), nombre, anio, mes, sha, filas);
        return id;
    }

    private boolean sincronizarVentas(Path archivo, Matcher m) throws IOException {
        String nombre = archivo.getFileName().toString();
        int anio = Integer.parseInt(m.group(1));
        int mes = Integer.parseInt(m.group(2));
        String contenido = Files.readString(archivo, StandardCharsets.UTF_8);
        CargaArchivo carga = new CargaArchivo(nombre, TipoArchivo.PEDIDOS, YearMonth.of(anio, mes));
        carga.procesarArchivo(contenido);
        List<Pedido> pedidos = carga.getPedidos();
        UUID importId = registrarSiCambio(nombre, TipoArchivo.PEDIDOS, anio, mes, contenido, pedidos.size());
        if (importId == null) {
            return false;
        }
        jdbcTemplate.update("DELETE FROM orders WHERE source = 'OFFICIAL' AND period_year = ? AND period_month = ?",
                anio, mes);
        String sql = "INSERT INTO orders (id, order_code, client_code, dest_x, dest_y, requested_quantity, "
                + "sla_hours, registered_at, period_year, period_month, source, import_id) "
                + "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'OFFICIAL', ?)";
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
            ps.setObject(11, importId);
        });
        return true;
    }

    private boolean sincronizarBloqueos(Path archivo, Matcher m) throws IOException {
        String nombre = archivo.getFileName().toString();
        int anio = 2000 + Integer.parseInt(m.group(1));
        int mes = Integer.parseInt(m.group(2));
        String contenido = Files.readString(archivo, StandardCharsets.UTF_8);
        CargaArchivo carga = new CargaArchivo(nombre, TipoArchivo.BLOQUEOS, YearMonth.of(anio, mes));
        carga.procesarArchivo(contenido);
        List<Bloqueo> bloqueos = carga.getBloqueos();
        UUID importId = registrarSiCambio(nombre, TipoArchivo.BLOQUEOS, anio, mes, contenido, bloqueos.size());
        if (importId == null) {
            return false;
        }
        jdbcTemplate.update(
                "DELETE FROM street_blockages WHERE source = 'OFFICIAL' AND period_year = ? AND period_month = ?",
                anio, mes);
        String sql = "INSERT INTO street_blockages (id, start_at, end_at, nodes_json, period_year, period_month, source, import_id) "
                + "VALUES (?, ?, ?, CAST(? AS JSONB), ?, ?, 'OFFICIAL', ?)";
        jdbcTemplate.batchUpdate(sql, bloqueos, BATCH_SIZE, (ps, b) -> {
            ps.setObject(1, UUID.randomUUID());
            ps.setTimestamp(2, Timestamp.from(b.getFechaInicio().toInstant(ZoneOffset.UTC)));
            ps.setTimestamp(3, Timestamp.from(b.getFechaFin().toInstant(ZoneOffset.UTC)));
            ps.setString(4, serializarNodos(b));
            ps.setInt(5, anio);
            ps.setInt(6, mes);
            ps.setObject(7, importId);
        });
        return true;
    }

    private boolean sincronizarMantenimiento(Path archivo) throws IOException {
        String nombre = archivo.getFileName().toString();
        String contenido = Files.readString(archivo, StandardCharsets.UTF_8);
        CargaArchivo carga = new CargaArchivo(nombre, TipoArchivo.MANTENIMIENTO, YearMonth.of(2026, 9));
        carga.procesarArchivo(contenido);
        var pendientes = carga.getMantenimientosPendientes();
        UUID importId = registrarSiCambio(nombre, TipoArchivo.MANTENIMIENTO, null, null, contenido, pendientes.size());
        if (importId == null) {
            return false;
        }
        // La plantilla de mantenimiento no tiene período: se reemplaza lo que venía de este archivo
        // (o, la primera vez tras V5, todo lo oficial sin carga asociada).
        jdbcTemplate.update("DELETE FROM maintenance_schedules WHERE source = 'OFFICIAL' AND (import_id IS NULL "
                + "OR import_id IN (SELECT id FROM data_imports WHERE file_name = ? AND source = 'OFFICIAL'))", nombre);
        String sql = "INSERT INTO maintenance_schedules (id, vehicle_code, scheduled_date, template_month, template_day, source, import_id) "
                + "VALUES (?, ?, ?, ?, ?, 'OFFICIAL', ?)";
        jdbcTemplate.batchUpdate(sql, pendientes, BATCH_SIZE, (ps, mp) -> {
            ps.setObject(1, UUID.randomUUID());
            ps.setString(2, mp.idUnidad());
            ps.setDate(3, Date.valueOf(mp.fecha()));
            ps.setInt(4, mp.fecha().getMonthValue());
            ps.setInt(5, mp.fecha().getDayOfMonth());
            ps.setObject(6, importId);
        });
        return true;
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

    static String sha256(String contenido) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                    .digest(contenido.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException ex) {
            throw new IllegalStateException(ex);
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
