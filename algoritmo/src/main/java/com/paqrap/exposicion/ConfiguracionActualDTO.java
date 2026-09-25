package com.paqrap.exposicion;

import java.util.List;

/** Configuración vigente del sistema (ciudad, operación, flota, almacenes), consultable por el panel de administración. */
public record ConfiguracionActualDTO(CiudadDTO ciudad, ConfiguracionOperacionDTO operacion,
        List<TipoVehiculoDTO> tiposVehiculo, List<AlmacenDTO> almacenes) {
}
