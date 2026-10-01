package com.paqrap.backend.config;

import com.paqrap.dominio.Almacen;
import com.paqrap.dominio.AlmacenCentral;
import com.paqrap.dominio.AlmacenIntermedio;
import com.paqrap.dominio.Ciudad;
import com.paqrap.dominio.ConfiguracionOperacion;
import com.paqrap.dominio.Nodo;
import com.paqrap.dominio.TipoAlgoritmo;
import com.paqrap.dominio.TipoVehiculo;
import com.paqrap.dominio.UnidadTransporte;
import com.paqrap.entrada.CargadorRecursos;
import com.paqrap.exposicion.ServicioPlanificacion;
import com.paqrap.exposicion.ServicioPlanificacionImpl;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * Raíz de composición del dominio: arma la ciudad, almacenes y flota con los valores oficiales
 * del curso (ver [[project-paqrap-domain]] / CSV Preguntas &amp; Respuestas -- capacidades 24/8/4,
 * velocidades 40/25/12 km/h, almacén central (27,14), intermedios (12,38) y (57,27) con 1000 de
 * capacidad cada uno), y expone {@link ServicioPlanificacion} como bean único de Spring, respaldado
 * por la implementación de referencia que ya construimos en {@code algoritmo/} sin dependencia de
 * Spring.
 */
@Configuration
public class PaqRapConfig {

    @Bean
    public Ciudad ciudad() {
        return new Ciudad(70, 50, new Nodo(0, 0), 1, true);
    }

    @Bean
    public ConfiguracionOperacion configuracionOperacion() {
        // (duracionTurnoHoras, horaInicioTurno, tiempoServicioClienteHoras, duracionRefrigerioHoras,
        //  margenRefrigerioHoras, tiempoCargaAlmacenHoras, tiempoTrasvaseHoras, maxParadasPorRuta)
        // maxParadasPorRuta=2 -- calibrado empíricamente (ver [[project-paqrap-experimentacion]] /
        // hallazgo de empaquetado a capacidad completa): 1 y 2 empatan como los mejores valores
        // (34-35 entregados antes del primer incumplido vs. 25-26 sin límite, +45min de operación
        // sostenida), se eligió 2 por rutas levemente más eficientes en costo sin sacrificar
        // rendimiento frente a 1.
        return new ConfiguracionOperacion(8, 7, 1, 1, 1, 0, 0.5, 2);
    }

    @Bean
    public TipoVehiculo tipoAuto() {
        return new TipoVehiculo("AUTO", "Auto", 24, 40.0, 8.0, 10, 48);
    }

    @Bean
    public TipoVehiculo tipoMoto() {
        return new TipoVehiculo("MOTO", "Moto", 8, 25.0, 6.0, 15, 24);
    }

    @Bean
    public TipoVehiculo tipoBici() {
        return new TipoVehiculo("BICI", "Bicicleta", 4, 12.0, 3.0, 12, 8);
    }

    @Bean
    public List<TipoVehiculo> tiposVehiculo(TipoVehiculo tipoAuto, TipoVehiculo tipoMoto, TipoVehiculo tipoBici) {
        return List.of(tipoAuto, tipoMoto, tipoBici);
    }

    @Bean
    public List<Almacen> almacenes() {
        return List.of(
                new AlmacenCentral(new Nodo(27, 14)),
                new AlmacenIntermedio(new Nodo(12, 38), "Nor-Oeste", 1000, 1000),
                new AlmacenIntermedio(new Nodo(57, 27), "Este", 1000, 1000));
    }

    /** Flota inicial: 10 autos + 15 motos + 12 bicicletas, todas desde el almacén central. */
    @Bean
    public List<UnidadTransporte> flota(TipoVehiculo tipoAuto, TipoVehiculo tipoMoto, TipoVehiculo tipoBici) {
        Nodo central = new Nodo(27, 14);
        LocalDateTime inicioTurno = LocalDateTime.now().withHour(7).withMinute(0).withSecond(0).withNano(0);
        List<UnidadTransporte> flota = new ArrayList<>();
        for (int i = 1; i <= 10; i++) {
            flota.add(new UnidadTransporte(String.format("TA%02d", i), tipoAuto, central, inicioTurno));
        }
        for (int i = 1; i <= 15; i++) {
            flota.add(new UnidadTransporte(String.format("TM%02d", i), tipoMoto, central, inicioTurno));
        }
        for (int i = 1; i <= 12; i++) {
            flota.add(new UnidadTransporte(String.format("TB%02d", i), tipoBici, central, inicioTurno));
        }
        return flota;
    }

    /**
     * Carga bajo demanda los archivos oficiales del curso (pedidos, bloqueos, mantenimiento)
     * empaquetados en la imagen -- ver {@code backend/Dockerfile} (copia {@code algoritmo/data}) y
     * {@link com.paqrap.exposicion.ServicioPlanificacionImpl}. {@code paqrap.datos.carpeta} permite
     * apuntar a otra ruta en desarrollo local sin tocar el código.
     */
    @Bean
    public CargadorRecursos cargadorRecursos(@Value("${paqrap.datos.carpeta:data}") String carpetaDatos) {
        return new CargadorRecursos(carpetaDatos, "config");
    }

    @Bean
    public ServicioPlanificacion servicioPlanificacion(Ciudad ciudad, ConfiguracionOperacion configuracionOperacion,
            List<TipoVehiculo> tiposVehiculo, List<Almacen> almacenes, List<UnidadTransporte> flota,
            CargadorRecursos cargadorRecursos) {
        return new ServicioPlanificacionImpl(ciudad, configuracionOperacion, tiposVehiculo, almacenes, flota,
                TipoAlgoritmo.ALNS, configAlgoritmoAlns(), "logs", cargadorRecursos);
    }

    /**
     * Hiperparámetros de ALNS -- la configuración ganadora determinada por la experimentación
     * numérica (Fase 1, ver [[project-paqrap-experimentacion]]): mayor intensidad de destrucción,
     * adaptación rápida, enfriamiento SA lento, épsilon RVND estricto. Único factor con efecto
     * estadísticamente significativo (ANOVA p=0.006): destrucción; los demás se fijaron con el
     * sentido descriptivo del análisis previo, no como hallazgo probado.
     *
     * <p>{@code maxIteraciones}/{@code maxSinMejora}=100 (antes 300): recalibrado sobre el tamaño
     * REAL de un lote de producción (2-800 pedidos, según la ventana de llegada del escenario de
     * estrés), no sobre el problema completo de un mes que resuelve la experimentación numérica.
     * Barrido 5-300 con 5 repeticiones por punto (ALNS no tiene semilla fija): la mejora de costo
     * es real y sostenida hasta ~70-100 iteraciones; de 150 a 300 el costo promedio se mantiene
     * plano dentro del ruido estocástico de una corrida a otra, sin ganancia neta, solo más tiempo
     * de cómputo (hasta 5.9s/lote en el peor caso observado, contra ~2s en 100).
     *
     * <p>Deliberadamente NO es un {@code @Bean}: Spring interpreta cualquier parámetro/retorno
     * {@code Map<String, X>} como "recolecta todos los beans de tipo X" -- con {@code X=Object}
     * eso intenta inyectar literalmente todos los beans del contexto, incluyendo el propio
     * consumidor, causando una referencia circular.
     */
    private Map<String, Object> configAlgoritmoAlns() {
        return Map.ofEntries(
                Map.entry("maxIteraciones", 100), Map.entry("maxSinMejora", 100),
                Map.entry("minCantidadDestruccion", 3), Map.entry("maxCantidadDestruccion", 8),
                Map.entry("factorReaccion", 0.4), Map.entry("intervaloActualizacion", 10),
                Map.entry("temperaturaAceptacionSA", 150.0), Map.entry("tasaEnfriamientoSA", 0.999),
                Map.entry("epsilonMejoraRVND", 0.001), Map.entry("intervaloSPP", 20),
                Map.entry("puntajeMejorGlobal", 10.0), Map.entry("puntajeMejorActual", 5.0),
                Map.entry("puntajeAceptado", 2.0), Map.entry("pesoDistanciaShaw", 1.0),
                Map.entry("pesoTiempoShaw", 2.0));
    }
}
