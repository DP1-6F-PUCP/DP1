package com.paqrap.exposicion;

import com.paqrap.simulador.EjecucionEscenario;
import com.paqrap.simulador.SolicitudOperacion;
import com.paqrap.simulador.TipoEscenario;
import com.paqrap.simulador.TipoSolicitud;

import java.time.LocalDateTime;
import java.util.List;

/**
 * Puerto de entrada de la capa de Exposición: el contrato que consumiría un controlador REST (o
 * cualquier otro cliente) para operar el sistema sin conocer el dominio interno directamente.
 */
public interface ServicioPlanificacion {

    /**
     * Procesa un archivo de entrada oficial del curso (ventas, bloqueos o mantenimiento),
     * incorporando su contenido al estado del sistema.
     *
     * @param archivo nombre y contenido del archivo recibido
     */
    void recibirArchivo(ArchivoEntrada archivo);

    /**
     * @return las rutas actualmente vigentes de la ejecución en curso
     */
    List<RutaDTO> consultarRutasVigentes();

    /**
     * @return una instantánea completa del estado operativo (rutas, vehículos, almacenes,
     *         bloqueos, eventos recientes, métricas) para el visualizador
     */
    EstadoOperacionDTO consultarEstadoOperacion();

    /**
     * @return la configuración vigente del sistema (ciudad, operación, flota, almacenes)
     */
    ConfiguracionActualDTO consultarConfiguracionActual();

    /**
     * @param filtro filtro opcional a aplicar sobre los pedidos
     * @return los pedidos que cumplen el filtro dado
     */
    List<PedidoDTO> consultarPedidos(FiltroPedidos filtro);

    /**
     * Inicia una nueva ejecución de {@link com.paqrap.simulador.OrquestadorOperacion} para el
     * escenario dado, usando valores de {@code sa}/{@code ta}/{@code k} por defecto según
     * {@code tipo} (ver {@link #seleccionarEscenario(TipoEscenario, LocalDateTime, float, float, float, float)}
     * para calibrar explícitamente).
     *
     * @param tipo escenario de evaluación a ejecutar
     * @param fechaInicioSimulada instante simulado de inicio
     * @return el registro de la ejecución iniciada
     */
    EjecucionEscenario seleccionarEscenario(TipoEscenario tipo, LocalDateTime fechaInicioSimulada);

    /**
     * Variante de {@link #seleccionarEscenario(TipoEscenario, LocalDateTime)} que además aplica
     * {@code ajustesIniciales} (velocidad/capacidad de vehículo, flota, posición/capacidad/
     * frecuencia de almacén, configuración de ciudad u operación, incluso una avería de arranque)
     * antes del primer lote de planificación -- mismo catálogo de {@link TipoSolicitud} que
     * {@link #programarSolicitud}, pero sin restricción sobre {@code CAMBIO_CONFIGURACION_CIUDAD}
     * (ver su Javadoc: ese tipo solo se rechaza una vez la ejecución ya está en curso).
     *
     * @param tipo escenario de evaluación a ejecutar
     * @param fechaInicioSimulada instante simulado de inicio
     * @param ajustesIniciales cambios a aplicar antes de construir el contexto inicial; cada
     *         {@link SolicitudOperacion#tiempoSimuladoProgramado()} se ignora (se aplican todos
     *         en {@code fechaInicioSimulada})
     * @return el registro de la ejecución iniciada
     */
    EjecucionEscenario seleccionarEscenario(TipoEscenario tipo, LocalDateTime fechaInicioSimulada,
            List<SolicitudOperacion> ajustesIniciales);

    /**
     * Inicia una nueva ejecución, calibrando explícitamente la dinámica de planificación
     * programada: {@code ta} (minutos reales que toma una planificación), {@code sa} (minutos
     * reales entre lanzamientos, debe ser {@code sa > ta}) y {@code k} (constante de
     * proporcionalidad tiempo simulado / tiempo real — el profesor indicó valores referenciales
     * K=1 para día a día, y valores mayores calibrados empíricamente para escenarios acelerados).
     *
     * @param tipo escenario de evaluación a ejecutar
     * @param fechaInicioSimulada instante simulado de inicio
     * @param sa minutos reales entre lanzamientos de la planificación
     * @param ta minutos reales que toma ejecutar una planificación
     * @param k constante de proporcionalidad tiempo simulado / tiempo real
     * @param tiempoMaximoComputoSegundos presupuesto de cómputo, en segundos, antes de alertar
     * @param ajustesIniciales ver {@link #seleccionarEscenario(TipoEscenario, LocalDateTime, List)}
     * @return el registro de la ejecución iniciada
     */
    EjecucionEscenario seleccionarEscenario(TipoEscenario tipo, LocalDateTime fechaInicioSimulada, float sa, float ta,
            float k, float tiempoMaximoComputoSegundos, List<SolicitudOperacion> ajustesIniciales);

    /**
     * Encola un cambio de configuración "en caliente" sobre una ejecución en curso.
     *
     * @param ejecucion ejecución sobre la que aplica el cambio
     * @param tiempoSimulado momento simulado en que debe aplicarse
     * @param tipoSolicitud naturaleza del cambio
     * @param entidadObjetivo identificador de la entidad afectada
     * @param valorNuevo valor nuevo a aplicar, en formato textual
     */
    void programarSolicitud(EjecucionEscenario ejecucion, LocalDateTime tiempoSimulado, TipoSolicitud tipoSolicitud,
            String entidadObjetivo, String valorNuevo);

    /**
     * Pausa el ciclo periódico de la ejecución dada: los lotes programados siguen disparando
     * cada {@code sa} minutos reales, pero no hacen nada mientras esté pausada (reversible).
     *
     * @param idEjecucion id de la ejecución a pausar
     * @throws IllegalArgumentException si no hay una ejecución con ese id
     * @throws IllegalStateException si la ejecución no está en curso
     */
    void pausarEjecucion(String idEjecucion);

    /**
     * Reanuda una ejecución previamente pausada con {@link #pausarEjecucion(String)}.
     *
     * @param idEjecucion id de la ejecución a reanudar
     * @throws IllegalArgumentException si no hay una ejecución con ese id
     * @throws IllegalStateException si la ejecución no está en curso o no está pausada
     */
    void reanudarEjecucion(String idEjecucion);

    /**
     * Detiene definitivamente una ejecución (no reversible, a diferencia de pausar). La marca
     * {@code FINALIZADA} salvo que ya estuviera {@code DETENIDA_POR_INCUMPLIMIENTO}.
     *
     * @param idEjecucion id de la ejecución a detener
     * @throws IllegalArgumentException si no hay una ejecución con ese id
     */
    void detenerEjecucion(String idEjecucion);

    /**
     * @param idEjecucion id de la ejecución a consultar
     * @return el registro actual de la ejecución, reflejando su {@code EstadoEjecucion} vigente
     *         (incluyendo si se detuvo por incumplimiento) -- a diferencia de
     *         {@link #consultarEstadoOperacion()}, que no expone ese estado en absoluto
     * @throws IllegalArgumentException si no hay una ejecución con ese id
     */
    EjecucionEscenario consultarEjecucion(String idEjecucion);

    /**
     * Bug real corregido: sin este método no había forma de que un cliente nuevo (p. ej. una
     * pestaña recién abierta o recargada) descubriera que ya hay una ejecución activa -- solo
     * podía consultar {@link #consultarEjecucion(String)} si YA conocía el id, y tras un refresh
     * el frontend pierde ese id (no hay nada persistido). Sin esto, el único camino era que el
     * usuario volviera a hacer clic en "Iniciar ejecución" (que sí se une correctamente a la
     * activa, pero requiere acción manual cada vez) -- la promesa de "cualquier dispositivo se une
     * a la ejecución activa" no se cumplía sola al cargar la página.
     *
     * @return la ejecución activa (incluye {@code PAUSADA}) si existe, o {@code null} si no hay
     *         ninguna en curso
     */
    EjecucionEscenario consultarEjecucionActiva();
}
