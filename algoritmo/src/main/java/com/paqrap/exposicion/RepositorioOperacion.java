package com.paqrap.exposicion;

import com.paqrap.dominio.Almacen;
import com.paqrap.dominio.Bloqueo;
import com.paqrap.dominio.Ciudad;
import com.paqrap.dominio.ConfiguracionOperacion;
import com.paqrap.dominio.Pedido;
import com.paqrap.dominio.TipoVehiculo;
import com.paqrap.dominio.UnidadTransporte;
import com.paqrap.entrada.CargaArchivo;
import com.paqrap.simulador.EjecucionEscenario;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

/**
 * Puerto de persistencia para {@link ServicioPlanificacionImpl}, libre de dependencias de Spring o
 * JDBC/JPA para mantener el módulo {@code algoritmo} en Java puro.
 */
public interface RepositorioOperacion {

    /** Implementación por defecto en memoria (sin persistencia externa) para pruebas unitarias. */
    RepositorioOperacion EN_MEMORIA = new RepositorioOperacion() {
    };

    /**
     * Una carga de archivo manual: se registra antes de guardar sus filas para poder rastrearlas y
     * para no volver a cargar el mismo contenido dos veces.
     */
    record ImportacionArchivo(String id, String tipoArchivo, String nombreArchivo, Integer anio, Integer mes,
            String sha256, int filas) {
    }

    /**
     * Una carga vigente (no borrada), estándar o manual, para listarla en Configuración → Datos.
     *
     * @param origen {@code OFFICIAL} (precargada) o {@code MANUAL} (subida por el operador)
     * @param tipoArchivo {@code PEDIDOS}, {@code BLOQUEOS} o {@code MANTENIMIENTO}
     */
    record ImportacionVigente(String id, String origen, String tipoArchivo, String nombreArchivo, Integer anio,
            Integer mes, int filas, java.time.Instant fecha) {
    }

    /** Cargas vigentes, estándar y manuales. */
    default List<ImportacionVigente> listarImportaciones() {
        return List.of();
    }

    /**
     * Borrado lógico de UNA carga MANUAL y de todas sus filas (pedidos, bloqueos o mantenimientos).
     * Las estándar no se borran sueltas (ver {@link #limpiarTodosLosDatos()}).
     *
     * @return {@code MANUAL} si se borró, o {@code null} si no existía una carga manual vigente con ese id
     */
    default String borrarImportacion(String idImportacion) {
        return null;
    }

    default void guardarPedidosManuales(List<Pedido> pedidos) {
        guardarPedidosManuales(pedidos, null);
    }

    default void guardarPedidosManuales(List<Pedido> pedidos, String idImportacion) {
    }

    default void guardarBloqueosManuales(List<Bloqueo> bloqueos) {
        guardarBloqueosManuales(bloqueos, null);
    }

    default void guardarBloqueosManuales(List<Bloqueo> bloqueos, String idImportacion) {
    }

    default void guardarMantenimientosManuales(List<CargaArchivo.MantenimientoPendiente> mantenimientos) {
        guardarMantenimientosManuales(mantenimientos, null);
    }

    default void guardarMantenimientosManuales(List<CargaArchivo.MantenimientoPendiente> mantenimientos,
            String idImportacion) {
    }

    /** Registra la carga y sus filas en una sola transacción (todo o nada). */
    default void guardarImportacionManual(ImportacionArchivo importacion, List<Pedido> pedidos, List<Bloqueo> bloqueos,
            List<CargaArchivo.MantenimientoPendiente> mantenimientos) {
        guardarPedidosManuales(pedidos, importacion.id());
        guardarBloqueosManuales(bloqueos, importacion.id());
        guardarMantenimientosManuales(mantenimientos, importacion.id());
    }

    /** {@code true} si ya hay una carga manual vigente (no limpiada) con exactamente este contenido. */
    default boolean existeImportacionManual(String sha256) {
        return false;
    }

    default List<Pedido> obtenerPedidosManuales() {
        return List.of();
    }

    default List<Bloqueo> obtenerBloqueosManuales() {
        return List.of();
    }

    default List<CargaArchivo.MantenimientoPendiente> obtenerMantenimientosManuales() {
        return List.of();
    }

    default void limpiarDatosManuales() {
    }

    /**
     * Borrado lógico de TODOS los datos de entrada (pedidos, bloqueos, mantenimientos), también los
     * estándar precargados: para probar cómo reacciona el sistema sin datos. Se recuperan con la
     * resincronización de los archivos estándar (al arrancar o desde Configuración → Datos).
     */
    default void limpiarTodosLosDatos() {
    }

    default void registrarInicioEjecucion(EjecucionEscenario ejecucion) {
    }

    /** Inicio con la foto de la configuración con que corre la ejecución (reproducibilidad del reporte). */
    default void registrarInicioEjecucion(EjecucionEscenario ejecucion, float ta, String algoritmo,
            ConfiguracionActualDTO configuracion) {
        registrarInicioEjecucion(ejecucion);
    }

    default void registrarActualizacionEjecucion(EjecucionEscenario ejecucion, String motivoFinalizacion,
            LocalDateTime finSimulado) {
    }

    /** Latido de cada lote: hasta qué instante simulado llegó la ejecución (sirve si el backend cae). */
    default void registrarLatido(String idEjecucion, LocalDateTime instanteSimulado) {
    }

    /**
     * Marca como {@code INTERRUMPIDA} las ejecuciones que quedaron sin cerrar (el backend se cayó sin
     * apagado ordenado). Se llama al arrancar, antes de aceptar ejecuciones nuevas.
     *
     * @return cuántas se marcaron
     */
    default int marcarEjecucionesHuerfanas() {
        return 0;
    }

    default void guardarReporteFinal(String idEjecucion, ReporteSimulacionDTO reporte) {
    }

    /**
     * Cierre de la ejecución: estado final y reporte en una sola transacción. A diferencia de
     * {@link #guardarReporteFinal}, propaga el error para que el llamador pueda reintentar.
     */
    default void finalizarEjecucion(EjecucionEscenario ejecucion, String motivoFinalizacion, LocalDateTime finSimulado,
            ReporteSimulacionDTO reporte) {
        registrarActualizacionEjecucion(ejecucion, motivoFinalizacion, finSimulado);
        guardarReporteFinal(ejecucion.getIdEjecucion(), reporte);
    }

    default Optional<ReporteSimulacionDTO> consultarReporteFinal(String idEjecucion) {
        return Optional.empty();
    }

    default Optional<EjecucionEscenario> consultarEjecucionHistorica(String idEjecucion) {
        return Optional.empty();
    }

    /** Ejecuciones pasadas, de la más reciente a la más antigua. */
    default List<ResumenEjecucionDTO> listarEjecuciones(int pagina, int tamano) {
        return List.of();
    }

    default void registrarAveria(String idEjecucion, AveriaRegistroDTO averia) {
    }

    default void registrarSolicitud(String idEjecucion, SolicitudRegistroDTO solicitud) {
    }

    default void actualizarSolicitud(SolicitudRegistroDTO solicitud) {
    }

    default void guardarConfiguracionMaestra(Ciudad ciudad, ConfiguracionOperacion operacion,
            List<TipoVehiculo> tiposVehiculo, List<Almacen> almacenes, List<UnidadTransporte> flota) {
    }
}
