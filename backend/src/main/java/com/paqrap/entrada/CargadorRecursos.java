package com.paqrap.entrada;

import com.paqrap.dominio.Bloqueo;
import com.paqrap.dominio.Mantenimiento;
import com.paqrap.dominio.Pedido;
import com.paqrap.dominio.TipoArchivo;
import com.paqrap.dominio.UnidadTransporte;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.LocalDateTime;
import java.time.YearMonth;
import java.util.List;
import java.util.Map;

/**
 * Único punto del sistema con conocimiento de rutas de carpeta: lee los archivos oficiales del
 * curso (ventas, bloqueos, mantenimiento) y los archivos de configuración de los algoritmos
 * ({@code config-alns.json}, {@code config-ipso.json}), delegando el parseo a {@link CargaArchivo}
 * y {@link LectorJson} respectivamente.
 *
 * <p>Convención de nombres de archivo, según los datos oficiales del curso:
 * {@code ventas/ventas.YYYYMM.txt}, {@code bloqueos/bloqueo.YYMM.txt} (año en 2 dígitos),
 * {@code mant.preventivo.MM1.MM2.txt} (bimensual, en la raíz de la carpeta de datos).
 */
public class CargadorRecursos {

    private final Path carpetaDatos;
    private final Path carpetaConfig;

    public CargadorRecursos(String carpetaDatos, String carpetaConfig) {
        this.carpetaDatos = Path.of(carpetaDatos);
        this.carpetaConfig = Path.of(carpetaConfig);
    }

    /**
     * Carga y parsea el archivo de ventas/pedidos del período dado.
     *
     * @param anio año (4 dígitos)
     * @param mes mes (1-12)
     * @return pedidos parseados
     */
    public CargaArchivo cargarPedidos(int anio, int mes) throws IOException {
        String nombre = String.format("ventas.%04d%02d.txt", anio, mes);
        Path archivo = carpetaDatos.resolve("ventas").resolve(nombre);
        CargaArchivo carga = new CargaArchivo(nombre, TipoArchivo.PEDIDOS, YearMonth.of(anio, mes));
        carga.procesarArchivo(leerContenido(archivo));
        return carga;
    }

    /**
     * Carga y parsea el archivo de bloqueos del período dado.
     *
     * @param anio año (4 dígitos)
     * @param mes mes (1-12)
     * @return bloqueos parseados
     */
    public CargaArchivo cargarBloqueos(int anio, int mes) throws IOException {
        String nombre = String.format("bloqueo.%02d%02d.txt", anio % 100, mes);
        Path archivo = carpetaDatos.resolve("bloqueos").resolve(nombre);
        CargaArchivo carga = new CargaArchivo(nombre, TipoArchivo.BLOQUEOS, YearMonth.of(anio, mes));
        carga.procesarArchivo(leerContenido(archivo));
        return carga;
    }

    /**
     * Carga, parsea y resuelve contra la flota real el archivo de mantenimiento preventivo
     * bimensual.
     *
     * @param mes1 primer mes del par bimensual
     * @param mes2 segundo mes del par bimensual
     * @param flota unidades de transporte contra las que resolver el id textual {@code TTNN}
     * @return mantenimientos resueltos, omitiendo las entradas cuya unidad no está en {@code flota}
     */
    public List<Mantenimiento> cargarMantenimiento(int mes1, int mes2, List<UnidadTransporte> flota)
            throws IOException {
        String nombre = String.format("mant.preventivo.%02d.%02d.txt", mes1, mes2);
        Path archivo = carpetaDatos.resolve(nombre);
        CargaArchivo carga = new CargaArchivo(nombre, TipoArchivo.MANTENIMIENTO, YearMonth.now());
        carga.procesarArchivo(leerContenido(archivo));

        return carga.getMantenimientosPendientes().stream()
                .map(pendiente -> resolverMantenimiento(pendiente, flota))
                .filter(java.util.Objects::nonNull)
                .toList();
    }

    private Mantenimiento resolverMantenimiento(CargaArchivo.MantenimientoPendiente pendiente,
            List<UnidadTransporte> flota) {
        UnidadTransporte unidad = flota.stream()
                .filter(u -> u.getIdUnidad().equalsIgnoreCase(pendiente.idUnidad()))
                .findFirst()
                .orElse(null);
        if (unidad == null) {
            return null;
        }
        LocalDateTime inicio = pendiente.fecha().atStartOfDay();
        LocalDateTime fin = inicio.plusHours((long) unidad.getTipoVehiculo().getDuracionMantenimientoHoras());
        return new Mantenimiento(unidad, inicio, fin);
    }

    /**
     * Carga los hiperparámetros de ALNS desde {@code config-alns.json}.
     *
     * @return mapa de configuración, listo para {@code ConfiguracionALNS.cargarDesde}
     */
    public Map<String, Object> cargarConfigAlns() throws IOException {
        return LectorJson.parseObjeto(carpetaConfig.resolve("config-alns.json").toFile());
    }

    /**
     * Carga los hiperparámetros de IPSO desde {@code config-ipso.json}.
     *
     * @return mapa de configuración, listo para {@code IPSOConfig.cargarDesde}
     */
    public Map<String, Object> cargarConfigIpso() throws IOException {
        return LectorJson.parseObjeto(carpetaConfig.resolve("config-ipso.json").toFile());
    }

    private String leerContenido(Path archivo) throws IOException {
        return Files.readString(archivo, StandardCharsets.UTF_8);
    }
}
