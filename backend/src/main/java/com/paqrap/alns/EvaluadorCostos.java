package com.paqrap.alns;

import com.paqrap.dominio.CalculadorDistancia;
import com.paqrap.dominio.Ciudad;
import com.paqrap.dominio.ConfiguracionOperacion;
import com.paqrap.dominio.Bloqueo;
import com.paqrap.dominio.ParadaPlanificada;
import com.paqrap.dominio.Ruta;
import com.paqrap.dominio.UnidadTransporte;

import java.time.LocalDateTime;
import java.util.List;

/**
 * Recalcula el costo, la duración y los tiempos de llegada de una {@link Ruta}, simulando el
 * recorrido parada a parada.
 *
 * <p>A diferencia del cálculo original (que mantenía una lista plana de nodos y tiempos de
 * llegada por cada tramo del camino), esta versión opera a nivel de parada: el camino físico
 * entre dos paradas consecutivas es un detalle interno de {@link CalculadorDistancia}, no un
 * dato que el dominio persiste. Simplificación de alcance: no se modela un tramo de regreso al
 * almacén, dado que el dominio canónico no fija un almacén base por unidad (cualquier unidad
 * puede recargar en cualquier almacén con stock).
 */
public final class EvaluadorCostos {

    private EvaluadorCostos() {
    }

    public static void recalcularRuta(Ruta ruta, Ciudad ciudad, List<Bloqueo> bloqueos, ConfiguracionOperacion operacion) {
        UnidadTransporte unidad = ruta.getUnidadTransporte();
        List<ParadaPlanificada> paradas = ruta.getSecuenciaParadas();

        LocalDateTime posicionTiempo = ruta.getHoraInicioPlanificada();
        var posicionActual = unidad.getPosicion();
        double distanciaTotalKm = 0.0;

        double tiempoServicioHoras = operacion.tiempoServicioClienteHoras();
        double duracionRefrigerioHoras = operacion.duracionRefrigerioHoras();
        double duracionTurnoHoras = operacion.duracionTurnoHoras();
        LocalDateTime inicioRefrigerioIdeal = TiempoUtil.sumarHoras(ruta.getHoraInicioPlanificada(), duracionTurnoHoras / 2.0);
        boolean refrigerioTomado = unidad.isRefrigerioTomado();

        for (ParadaPlanificada parada : paradas) {
            LocalDateTime liberacion = parada.getPedido().getFechaIngreso();
            if (posicionTiempo.isBefore(liberacion)) {
                posicionTiempo = liberacion;
            }

            if (!refrigerioTomado && !posicionTiempo.isBefore(inicioRefrigerioIdeal)) {
                posicionTiempo = TiempoUtil.sumarHoras(posicionTiempo, duracionRefrigerioHoras);
                refrigerioTomado = true;
            }

            double distanciaKm = CalculadorDistancia.distanciaKm(ciudad, bloqueos, posicionTiempo, posicionActual,
                    parada.getPedido().getDestino());
            double horasViaje = distanciaKm / unidad.getTipoVehiculo().getVelocidadKmH();
            LocalDateTime llegada = TiempoUtil.sumarHoras(posicionTiempo, horasViaje);

            distanciaTotalKm += distanciaKm;
            parada.setFechaEntregada(llegada);

            posicionTiempo = TiempoUtil.sumarHoras(llegada, tiempoServicioHoras);
            posicionActual = parada.getPedido().getDestino();
        }

        double duracionHoras = TiempoUtil.horasEntre(ruta.getHoraInicioPlanificada(), posicionTiempo);
        ruta.setDuracionEstimada(duracionHoras);
        ruta.setCostoEstimado(distanciaTotalKm * unidad.getTipoVehiculo().getCostoPorKm());
    }
}
