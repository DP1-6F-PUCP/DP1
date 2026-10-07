package com.paqrap.backend.dto;

import com.paqrap.simulador.TipoEscenario;
import jakarta.validation.constraints.NotNull;

import java.time.Instant;
import java.util.List;

/**
 * Cuerpo de {@code POST /api/escenarios}.
 *
 * @param fechaInicioSimulada instante simulado desde el que arranca el escenario; opcional --
 *         si se omite, se usa el instante real del servidor (comportamiento previo). Necesario
 *         para escenarios que no tiene sentido arrancar "ahora", como {@code CINCO_DIAS} sobre
 *         un período histórico específico de los datos oficiales del curso.
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
