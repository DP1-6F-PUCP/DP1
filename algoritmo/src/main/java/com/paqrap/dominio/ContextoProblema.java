package com.paqrap.dominio;

import java.time.LocalDateTime;
import java.util.List;

/**
 * Instantánea completa del estado del problema en un instante dado, insumo único de
 * {@link Planificador#planificarRutas(ContextoProblema)}.
 *
 * <p>Replanificar no es un método separado: es volver a invocar {@code planificarRutas} con un
 * nuevo {@code ContextoProblema} que refleje el estado posterior a una incidencia (avería,
 * bloqueo, nuevo pedido).
 *
 * @param marcaTiempoActual instante de referencia de esta instantánea
 * @param pedidos pedidos pendientes de asignación o en ejecución
 * @param bloqueos bloqueos de calles vigentes o futuros conocidos
 * @param mantenimientos mantenimientos preventivos programados
 * @param almacenes almacenes disponibles (central e intermedios)
 * @param vehiculos unidades de transporte de la flota
 * @param ciudad configuración de la red vial
 * @param configuracionOperacion parámetros operativos vigentes (turnos, refrigerio, etc.)
 */
public record ContextoProblema(
        LocalDateTime marcaTiempoActual,
        List<Pedido> pedidos,
        List<Bloqueo> bloqueos,
        List<Mantenimiento> mantenimientos,
        List<Almacen> almacenes,
        List<UnidadTransporte> vehiculos,
        Ciudad ciudad,
        ConfiguracionOperacion configuracionOperacion) {

    public ContextoProblema {
        pedidos = List.copyOf(pedidos);
        bloqueos = List.copyOf(bloqueos);
        mantenimientos = List.copyOf(mantenimientos);
        almacenes = List.copyOf(almacenes);
        vehiculos = List.copyOf(vehiculos);
    }
}
