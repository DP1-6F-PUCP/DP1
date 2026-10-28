package com.paqrap.backend.dto;

import com.paqrap.simulador.TipoEscenario;
import jakarta.validation.constraints.NotNull;

import java.time.Instant;
import java.util.List;

/**
 * Cuerpo de {@code POST /api/escenarios}.
 *
 * @param fechaInicioSimulada instante simulado desde el que arranca el escenario; opcional --
 *         si se omite, se usa el instante real del servidor. Para {@code DIA_A_DIA} se ignora
 *         cualquier valor recibido y siempre se usa el instante real del servidor; solo los
 *         escenarios históricos, como {@code CINCO_DIAS}, pueden comenzar en una fecha indicada.
 * @param ajustesIniciales cambios de configuración a aplicar antes del primer lote (velocidad,
 *         capacidad, flota, posición/capacidad/frecuencia de almacén, configuración de ciudad u
 *         operación, incluso una avería de arranque) -- opcional, vacío si se omite. A diferencia
 *         de {@code POST .../solicitudes}, aquí SÍ se acepta {@code CAMBIO_CONFIGURACION_CIUDAD}:
 *         antes de que exista la ejecución no hay posiciones ya comprometidas que la invaliden.
 */
public record SeleccionarEscenarioRequestDTO(
        @NotNull(message = "El tipo de escenario es obligatorio") TipoEscenario tipo,
        Instant fechaInicioSimulada,
        List<AjusteInicialDTO> ajustesIniciales) {
}
