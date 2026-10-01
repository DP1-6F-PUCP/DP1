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
        // Tope de paradas por despacho (ConfiguracionOperacion.maxParadasPorRuta): sin esto, un
        // operador de reparación puede seguir insertando paradas en la misma ruta mientras quepan
        // por capacidad, inmovilizando el vehículo por horas de servicio obligatorio acumulado
        // (ver hallazgo de empaquetado a capacidad completa). Se chequea aquí, el único punto por
        // el que pasa toda inserción/destrucción de ALNS.
        if (paradas.size() > operacion.maxParadasPorRuta()) {
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
        for (Ruta ruta : solucion.getRutas()) {
            if (!esRutaFactible(ruta, ciudad, bloqueos, operacion)) {
                return false;
            }
        }
        return respetaStockAlmacenes(solucion.getRutas(), contexto.almacenes());
    }

    /**
     * Verifica que, atribuyendo cada ruta no vacía al almacén más cercano a su posición de
     * partida (misma heurística de {@link #esSolucionFactible}), ningún almacén quede con una
     * demanda total agregada mayor a su stock disponible.
     *
     * <p>Antes de este chequeo, ALNS nunca consultaba el stock de los almacenes intermedios en
     * ningún punto de su búsqueda real (el único método que sí lo hacía, este mismo, no estaba
     * conectado a {@link com.paqrap.alns.SolucionadorALNS} ni a los operadores de reparación/
     * búsqueda local -- código muerto, confirmado). IPSO sí lo respeta desde
     * {@link com.paqrap.ipso.ClusterizadorPedidos}, lo cual permitía a ALNS construir rutas que,
     * en la práctica, despachan más mercadería de la que el almacén intermedio tiene disponible.
     */
    public static boolean respetaStockAlmacenes(List<Ruta> rutas, List<Almacen> almacenes) {
        Map<Almacen, Integer> demandaPorAlmacen = new HashMap<>();
        for (Ruta ruta : rutas) {
            if (ruta.getSecuenciaParadas().isEmpty()) {
                continue;
            }
            Almacen almacen = almacenMasCercano(almacenes, ruta.getUnidadTransporte().getPosicion());
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

    /**
     * Variante de {@link #respetaStockAlmacenes(List, List)} para evaluar una ruta de prueba
     * (todavía no insertada en la solución) sin tener que copiar y mutar la lista real de rutas:
     * sustituye {@code rutaOriginal} por {@code rutaPrueba} en una copia superficial antes de
     * agregar demanda. Usada por los operadores de reparación de ALNS al evaluar una inserción
     * candidata.
     */
    public static boolean respetaStockAlmacenes(Ruta rutaOriginal, Ruta rutaPrueba, List<Ruta> rutasSolucion,
            List<Almacen> almacenes) {
        List<Ruta> conCambio = new java.util.ArrayList<>(rutasSolucion.size());
        for (Ruta r : rutasSolucion) {
            conCambio.add(r == rutaOriginal ? rutaPrueba : r);
        }
        return respetaStockAlmacenes(conCambio, almacenes);
    }

    /**
     * Variante de dos rutas sustituidas a la vez, para los movimientos de
     * {@link com.paqrap.alns.busquedalocal.BusquedaLocalRVND} que tocan dos rutas distintas
     * (reubicación/intercambio inter-ruta, intercambio (2,1), 2-opt* inter-ruta).
     */
    public static boolean respetaStockAlmacenes(Ruta original1, Ruta prueba1, Ruta original2, Ruta prueba2,
            List<Ruta> rutasSolucion, List<Almacen> almacenes) {
        List<Ruta> conCambio = new java.util.ArrayList<>(rutasSolucion.size());
        for (Ruta r : rutasSolucion) {
            if (r == original1) {
                conCambio.add(prueba1);
            } else if (r == original2) {
                conCambio.add(prueba2);
            } else {
                conCambio.add(r);
            }
        }
        return respetaStockAlmacenes(conCambio, almacenes);
    }

    /**
     * Descuenta, de cada almacén, la demanda total de las rutas que le fueron atribuidas (mismo
     * criterio de cercanía que {@link #respetaStockAlmacenes}). Debe llamarse una sola vez, al
     * comprometer la solución final que {@link com.paqrap.alns.SolucionadorALNS#planificarRutas}
     * va a devolver -- nunca durante la búsqueda, donde la inmensa mayoría de las rutas de prueba
     * se descartan. Como todo el camino de inserción/recombinación ya fue validado contra stock
     * por {@link #respetaStockAlmacenes}, esta llamada nunca debería encontrar un almacén sin
     * stock suficiente.
     */
    public static void descontarStockComprometido(List<Ruta> rutas, List<Almacen> almacenes, LocalDateTime instante) {
        Map<Almacen, Integer> demandaPorAlmacen = new HashMap<>();
        for (Ruta ruta : rutas) {
            if (ruta.getSecuenciaParadas().isEmpty()) {
                continue;
            }
            Almacen almacen = almacenMasCercano(almacenes, ruta.getUnidadTransporte().getPosicion());
            if (almacen != null) {
                demandaPorAlmacen.merge(almacen, ruta.cargaTotal(), Integer::sum);
            }
        }
        for (Map.Entry<Almacen, Integer> entrada : demandaPorAlmacen.entrySet()) {
            entrada.getKey().descontarStock(entrada.getValue(), instante);
        }
    }

    private static Almacen almacenMasCercano(List<Almacen> almacenes, Nodo desde) {
        return almacenes.stream()
                .min(Comparator.comparingInt(
                        a -> Math.abs(a.getPosicion().x() - desde.x()) + Math.abs(a.getPosicion().y() - desde.y())))
                .orElse(null);
    }
}
