package com.paqrap.backend.config;

import com.paqrap.exposicion.ServicioPlanificacion;
import jakarta.annotation.PreDestroy;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

/**
 * Apagado ordenado: cuando Spring se cierra (SIGTERM de Docker o de Watchtower al desplegar una
 * versión nueva), detiene la ejecución activa como {@code INTERRUMPIDA}, guarda su reporte con lo
 * simulado hasta ahí y cierra el {@code .jsonl}. Antes, cada release perdía la corrida entera.
 *
 * <p>Depende de {@link ServicioPlanificacion} (y este del repositorio y del pool de conexiones), así
 * que Spring lo destruye ANTES que ellos: la base sigue disponible al llamar a esto. Requiere que el
 * contenedor tenga margen para cerrar (ver {@code stop_grace_period} en docker-compose.yml).
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class ApagadoOrdenado {

    private final ServicioPlanificacion servicioPlanificacion;

    @PreDestroy
    void alApagar() {
        try {
            servicioPlanificacion.detenerPorApagado();
        } catch (RuntimeException ex) {
            log.error("Falló el apagado ordenado de la ejecución activa: {}", ex.getMessage(), ex);
        }
    }
}
