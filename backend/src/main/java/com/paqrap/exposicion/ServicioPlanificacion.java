package com.paqrap.exposicion;

import com.paqrap.simulador.EjecucionEscenario;
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
     * @return el registro de la ejecución iniciada
     */
    EjecucionEscenario seleccionarEscenario(TipoEscenario tipo, LocalDateTime fechaInicioSimulada, float sa, float ta,
            float k, float tiempoMaximoComputoSegundos);

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
}
