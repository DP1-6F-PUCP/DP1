package com.paqrap.alns;

import com.paqrap.dominio.Almacen;
import com.paqrap.dominio.Bloqueo;
import com.paqrap.dominio.CalculadorDistancia;
import com.paqrap.dominio.Ciudad;
import com.paqrap.dominio.ConfiguracionOperacion;
import com.paqrap.dominio.ContextoProblema;
import com.paqrap.dominio.Nodo;
import com.paqrap.dominio.ParadaPlanificada;
import com.paqrap.dominio.Ruta;
import com.paqrap.dominio.UnidadTransporte;

import java.time.LocalDateTime;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Verifica que una {@link Ruta} (o una {@link Solucion} completa) respete capacidad del vehículo,
 * ventanas de tiempo de cada pedido, el refrigerio obligatorio del conductor, el fin de su
 * jornada laboral y el tope de stock de los almacenes intermedios.
 *
 * <p>ALNS trata estas restricciones como duras: una ruta que las viola se descarta durante la
 * búsqueda (a diferencia de IPSO, que las penaliza numéricamente sin rechazar la solución — ver
 * hallazgo documentado en {@code ExperimentoComparativo}).
 */
public final class VerificadorRestricciones {

    private VerificadorRestricciones() {
    }

    public static boolean esRutaFactible(Ruta ruta, Ciudad ciudad, List<Bloqueo> bloqueos, ConfiguracionOperacion operacion) {
        UnidadTransporte unidad = ruta.getUnidadTransporte();
        List<ParadaPlanificada> paradas = ruta.getSecuenciaParadas();

        int demandaTotal = paradas.stream().mapToInt(ParadaPlanificada::getCantidadAEntregar).sum();
        if (demandaTotal > unidad.getTipoVehiculo().getCapacidad()) {
            return false;
        }

        LocalDateTime tiempoActual = ruta.getHoraInicioPlanificada();
        var posicionActual = unidad.getPosicion();

        double duracionTurno = operacion.duracionTurnoHoras();
        LocalDateTime finTurno = TiempoUtil.sumarHoras(ruta.getHoraInicioPlanificada(), duracionTurno);
        double tiempoServicio = operacion.tiempoServicioClienteHoras();
        double duracionRefrigerio = operacion.duracionRefrigerioHoras();
        double margenRefrigerio = operacion.margenRefrigerioHoras();

        LocalDateTime ventanaMinRefrigerio = TiempoUtil.sumarHoras(ruta.getHoraInicioPlanificada(), margenRefrigerio);
        LocalDateTime ventanaMaxRefrigerio = TiempoUtil.sumarHoras(finTurno, -margenRefrigerio);
        LocalDateTime inicioRefrigerioIdeal = TiempoUtil.sumarHoras(ruta.getHoraInicioPlanificada(), duracionTurno / 2.0);
        boolean refrigerioTomado = unidad.isRefrigerioTomado();

        for (ParadaPlanificada parada : paradas) {
            LocalDateTime liberacion = parada.getPedido().getFechaIngreso();
            if (tiempoActual.isBefore(liberacion)) {
                tiempoActual = liberacion;
            }

            if (!refrigerioTomado && !tiempoActual.isBefore(inicioRefrigerioIdeal)) {
                boolean fueraDeVentana = tiempoActual.isBefore(ventanaMinRefrigerio)
                        || TiempoUtil.sumarHoras(tiempoActual, duracionRefrigerio).isAfter(ventanaMaxRefrigerio);
                if (fueraDeVentana) {
                    return false;
                }
                tiempoActual = TiempoUtil.sumarHoras(tiempoActual, duracionRefrigerio);
                refrigerioTomado = true;
            }

            double distanciaKm = CalculadorDistancia.distanciaKm(ciudad, bloqueos, tiempoActual, posicionActual,
                    parada.getPedido().getDestino());
            double horasViaje = distanciaKm / unidad.getTipoVehiculo().getVelocidadKmH();
            LocalDateTime llegada = TiempoUtil.sumarHoras(tiempoActual, horasViaje);

            if (llegada.isAfter(parada.getPedido().getFechaLimite())) {
                return false;
            }

            LocalDateTime salida = TiempoUtil.sumarHoras(llegada, tiempoServicio);
            if (salida.isAfter(finTurno)) {
                return false;
            }

            tiempoActual = salida;
            posicionActual = parada.getPedido().getDestino();
        }

        return true;
    }

    /**
     * Verifica que todas las rutas de la solución sean factibles individualmente y que la
     * demanda total despachada desde cada almacén no exceda su stock disponible.
     *
     * <p>Simplificación de alcance: como el dominio canónico no fija un almacén base por unidad
     * (cualquier unidad puede recargar en cualquier almacén con stock), cada ruta se atribuye al
     * almacén más cercano a la posición de partida de su unidad, en vez de a un almacén fijo
     * asignado de antemano.
     *
     * @param solucion solución a validar
     * @param ciudad configuración de la red vial
     * @param bloqueos bloqueos vigentes o futuros conocidos
     * @param operacion parámetros operativos vigentes
     * @param contexto contexto del problema, usado para conocer los almacenes disponibles
     * @return {@code true} si todas las rutas son factibles y ningún almacén excede su stock
     */
    public static boolean esSolucionFactible(Solucion solucion, Ciudad ciudad, List<Bloqueo> bloqueos,
            ConfiguracionOperacion operacion, ContextoProblema contexto) {
        if (solucion == null) {
            return false;
        }

        Map<Almacen, Integer> demandaPorAlmacen = new HashMap<>();
        for (Ruta ruta : solucion.getRutas()) {
            if (!esRutaFactible(ruta, ciudad, bloqueos, operacion)) {
                return false;
            }
            if (ruta.getSecuenciaParadas().isEmpty()) {
                continue;
            }
            Almacen almacen = almacenMasCercano(contexto.almacenes(), ruta.getUnidadTransporte().getPosicion());
            if (almacen != null) {
                demandaPorAlmacen.merge(almacen, ruta.cargaTotal(), Integer::sum);
            }
        }

        for (Map.Entry<Almacen, Integer> entrada : demandaPorAlmacen.entrySet()) {
            if (!entrada.getKey().tieneStock(entrada.getValue())) {
                return false;
            }
        }

        return true;
    }

    private static Almacen almacenMasCercano(List<Almacen> almacenes, Nodo desde) {
        return almacenes.stream()
                .min(Comparator.comparingInt(
                        a -> Math.abs(a.getPosicion().x() - desde.x()) + Math.abs(a.getPosicion().y() - desde.y())))
                .orElse(null);
    }
}
