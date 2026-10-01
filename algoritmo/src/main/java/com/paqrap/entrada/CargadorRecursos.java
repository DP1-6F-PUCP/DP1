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
import java.time.LocalDate;
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

    /**
     * El curso solo entrega bloqueos para estos 3 años calendario. Una simulación cuyo reloj
     * avanza más allá (p. ej. el escenario día a día corriendo en tiempo real) recicla
     * cíclicamente el patrón de un año disponible -- ver {@link #anioBloqueoDisponible(int)}.
     */
    private static final int ANIO_BLOQUEOS_DESDE = 2026;
    private static final int ANIO_BLOQUEOS_HASTA = 2028;

    /**
     * El curso solo entrega un bimestre de mantenimiento (09-10 de 2026). Se trata como plantilla
     * de día-del-mes + unidad, reaplicada a cualquier otro bimestre/año -- ver
     * {@link #cargarMantenimiento(int, int, int, List)}.
     */
    private static final String ARCHIVO_MANTENIMIENTO_PLANTILLA = "mant.preventivo.09.10.txt";
    private static final int MES1_PLANTILLA_MANTENIMIENTO = 9;

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
     * Carga y parsea el archivo de bloqueos del período dado. Si {@code anio} cae fuera del rango
     * cubierto por el curso ({@value #ANIO_BLOQUEOS_DESDE}-{@value #ANIO_BLOQUEOS_HASTA}), recicla
     * cíclicamente el patrón de un año disponible: el contenido (formato relativo día/hora/minuto
     * dentro del mes, sin año) se reinterpreta contra el {@code anio} realmente solicitado, así que
     * las fechas resultantes quedan correctamente ubicadas en el año pedido, no en el reciclado.
     *
     * @param anio año (4 dígitos)
     * @param mes mes (1-12)
     * @return bloqueos parseados
     */
    public CargaArchivo cargarBloqueos(int anio, int mes) throws IOException {
        int anioDisponible = anioBloqueoDisponible(anio);
        String nombre = String.format("bloqueo.%02d%02d.txt", anioDisponible % 100, mes);
        Path archivo = carpetaDatos.resolve("bloqueos").resolve(nombre);
        CargaArchivo carga = new CargaArchivo(nombre, TipoArchivo.BLOQUEOS, YearMonth.of(anio, mes));
        carga.procesarArchivo(leerContenido(archivo));
        return carga;
    }

    /**
     * Mapea cualquier año al año disponible cuyo patrón de bloqueos se reutiliza para él, ciclando
     * sobre el rango {@value #ANIO_BLOQUEOS_DESDE}-{@value #ANIO_BLOQUEOS_HASTA} (p. ej. 2029 reusa
     * el patrón de 2026, 2030 el de 2027).
     */
    private int anioBloqueoDisponible(int anio) {
        if (anio >= ANIO_BLOQUEOS_DESDE && anio <= ANIO_BLOQUEOS_HASTA) {
            return anio;
        }
        int rango = ANIO_BLOQUEOS_HASTA - ANIO_BLOQUEOS_DESDE + 1;
        return ANIO_BLOQUEOS_DESDE + Math.floorMod(anio - ANIO_BLOQUEOS_DESDE, rango);
    }

    /**
     * Carga, parsea y resuelve contra la flota real el mantenimiento preventivo del bimestre
     * pedido. El curso solo entrega el archivo de un único bimestre real
     * ({@value #ARCHIVO_MANTENIMIENTO_PLANTILLA}), así que se trata como plantilla: se conserva el
     * día-del-mes y la unidad de cada registro, y se reaplica al bimestre/año solicitados
     * ({@code mes1}/{@code mes2}), repitiéndose indefinidamente cada 2 meses en cualquier año.
     *
     * @param anio año (4 dígitos) al que se reaplica la plantilla
     * @param mes1 primer mes del par bimensual destino
     * @param mes2 segundo mes del par bimensual destino
     * @param flota unidades de transporte contra las que resolver el id textual {@code TTNN}
     * @return mantenimientos resueltos, omitiendo las entradas cuya unidad no está en {@code flota}
     */
    public List<Mantenimiento> cargarMantenimiento(int anio, int mes1, int mes2, List<UnidadTransporte> flota)
            throws IOException {
        Path archivo = carpetaDatos.resolve(ARCHIVO_MANTENIMIENTO_PLANTILLA);
        CargaArchivo carga = new CargaArchivo(ARCHIVO_MANTENIMIENTO_PLANTILLA, TipoArchivo.MANTENIMIENTO,
                YearMonth.of(anio, mes1));
        carga.procesarArchivo(leerContenido(archivo));

        return carga.getMantenimientosPendientes().stream()
                .map(pendiente -> resolverMantenimiento(pendiente, flota, anio, mes1, mes2))
                .filter(java.util.Objects::nonNull)
                .toList();
    }

    private Mantenimiento resolverMantenimiento(CargaArchivo.MantenimientoPendiente pendiente,
            List<UnidadTransporte> flota, int anioDestino, int mes1Destino, int mes2Destino) {
        UnidadTransporte unidad = flota.stream()
                .filter(u -> u.getIdUnidad().equalsIgnoreCase(pendiente.idUnidad()))
                .findFirst()
                .orElse(null);
        if (unidad == null) {
            return null;
        }
        boolean primerMesDeLaPlantilla = pendiente.fecha().getMonthValue() == MES1_PLANTILLA_MANTENIMIENTO;
        int mesDestino = primerMesDeLaPlantilla ? mes1Destino : mes2Destino;
        int diaDestino = Math.min(pendiente.fecha().getDayOfMonth(),
                YearMonth.of(anioDestino, mesDestino).lengthOfMonth());
        LocalDateTime inicio = LocalDate.of(anioDestino, mesDestino, diaDestino).atStartOfDay();
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
