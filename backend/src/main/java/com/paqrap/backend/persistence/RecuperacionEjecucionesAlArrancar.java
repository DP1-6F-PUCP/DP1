package com.paqrap.backend.persistence;

import com.paqrap.exposicion.RepositorioOperacion;
import jakarta.annotation.PostConstruct;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

/**
 * Al arrancar, cierra como {@code INTERRUMPIDA} (motivo {@code REINICIO_SERVIDOR}) las ejecuciones
 * que la base todavía tiene como INICIADA / EN_CURSO / PAUSADA: si el proceso anterior murió sin
 * apagado ordenado, ninguna sigue viva (el estado de una ejecución vive solo en memoria), y antes
 * quedaban "en curso" para siempre.
 *
 * <p>Corre en {@code @PostConstruct}, es decir antes de que el servidor web acepte peticiones (y
 * después de Flyway: {@code JdbcTemplate} depende del migrador), así que no puede marcar por error
 * una ejecución nueva de este mismo proceso.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class RecuperacionEjecucionesAlArrancar {

    private final RepositorioOperacion repositorioOperacion;

    @PostConstruct
    void marcarHuerfanas() {
        try {
            int marcadas = repositorioOperacion.marcarEjecucionesHuerfanas();
            if (marcadas > 0) {
                log.warn("{} ejecución(es) quedaron sin cerrar por un reinicio previo; marcadas INTERRUMPIDA.", marcadas);
            }
        } catch (RuntimeException ex) {
            log.error("No se pudieron marcar las ejecuciones huérfanas: {}", ex.getMessage());
        }
    }
}
