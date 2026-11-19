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

    default void guardarPedidosManuales(List<Pedido> pedidos) {
    }

    default void guardarBloqueosManuales(List<Bloqueo> bloqueos) {
    }

    default void guardarMantenimientosManuales(List<CargaArchivo.MantenimientoPendiente> mantenimientos) {
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

    default void registrarInicioEjecucion(EjecucionEscenario ejecucion) {
    }

    default void registrarActualizacionEjecucion(EjecucionEscenario ejecucion, String motivoFinalizacion,
            LocalDateTime finSimulado) {
    }

    default void guardarReporteFinal(String idEjecucion, ReporteSimulacionDTO reporte) {
    }

    default Optional<ReporteSimulacionDTO> consultarReporteFinal(String idEjecucion) {
        return Optional.empty();
    }

    default Optional<EjecucionEscenario> consultarEjecucionHistorica(String idEjecucion) {
        return Optional.empty();
    }

    default void guardarConfiguracionMaestra(Ciudad ciudad, ConfiguracionOperacion operacion,
            List<TipoVehiculo> tiposVehiculo, List<Almacen> almacenes, List<UnidadTransporte> flota) {
    }
}
