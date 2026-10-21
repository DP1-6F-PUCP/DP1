package com.paqrap.ipso;

import com.paqrap.dominio.CalculadorDistancia;
import com.paqrap.dominio.ContextoProblema;
import com.paqrap.dominio.EstadoPedido;
import com.paqrap.dominio.EstadoRuta;
import com.paqrap.dominio.Nodo;
import com.paqrap.dominio.ParadaPlanificada;
import com.paqrap.dominio.Pedido;
import com.paqrap.dominio.Planificador;
import com.paqrap.dominio.Ruta;
import com.paqrap.dominio.UnidadTransporte;
import com.paqrap.ipso.nucleo.IPSOConfig;
import com.paqrap.ipso.nucleo.IPSOOptimizador;
import com.paqrap.ipso.nucleo.ResultadoIPSO;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

/**
 * Implementación de {@link Planificador} basada en IPSO: agrupa los pedidos pendientes en lotes
 * por vehículo ({@link ClusterizadorPedidos}) y ejecuta IPSO para secuenciar cada lote.
 *
 * <p>A diferencia del diseño original (que mantenía estado acumulado entre llamadas mediante
 * {@code registrarPedido}/{@code registrarBloqueo}/{@code avanzarTiempo}), esta versión no
 * conserva ningún estado del problema entre invocaciones: todo se lee de {@link ContextoProblema}
 * en cada llamada. Replanificar no es un método separado — es volver a invocar
 * {@link #planificarRutas(ContextoProblema)} con un contexto actualizado.
 */
public class PlanificadorIPSO implements Planificador {

    private final IPSOConfig config;
    private double promedioIteracionMejora;

    public PlanificadorIPSO(IPSOConfig config) {
        this.config = config;
    }

    /**
     * Promedio, entre los lotes por vehículo de la corrida más reciente, de la iteración en la
     * que cada {@link IPSOOptimizador} encontró su última mejora de G_best. Diagnóstico de
     * velocidad de convergencia para experimentación — no forma parte del contrato de
     * {@link Planificador}.
     */
    public double getPromedioIteracionMejora() {
        return promedioIteracionMejora;
    }

    @Override
    public List<Ruta> planificarRutas(ContextoProblema contexto) {
        List<Pedido> pedidosPendientes = new ArrayList<>();
        for (Pedido pedido : contexto.pedidos()) {
            if (pedido.getEstado() == EstadoPedido.PENDIENTE) {
                pedidosPendientes.add(pedido);
            }
        }

        List<Ruta> nuevasRutas = new ArrayList<>();
        List<ClusterizadorPedidos.LoteVehiculo> lotes = List.of();
        if (!pedidosPendientes.isEmpty()) {
            ClusterizadorPedidos clusterizador = new ClusterizadorPedidos();
            lotes = clusterizador.clusterizar(pedidosPendientes, contexto.vehiculos(), contexto.almacenes(),
                    contexto.marcaTiempoActual(), contexto.configuracionOperacion().maxParadasPorRuta(),
                    contexto.configuracionOperacion(), contexto.ciudad(), contexto.bloqueos(),
                    contexto.mantenimientos());
        }

        int contadorRutas = 0;
        long sumaIteracionMejora = 0;
        for (ClusterizadorPedidos.LoteVehiculo lote : lotes) {
            // Desde la posición REAL del vehículo (antes: desde el almacén del lote), que es desde
            // donde de verdad arranca la ruta (ver asignarParadasConLlegadas / MotorSimulacion).
            IPSOOptimizador ipso = new IPSOOptimizador(lote.pedidos, lote.unidad.getPosicion(), lote.unidad,
                    contexto.ciudad(), contexto.bloqueos(), config, contexto.marcaTiempoActual(),
                    contexto.configuracionOperacion());
            ResultadoIPSO resultado = ipso.ejecutar();
            sumaIteracionMejora += ipso.getUltimaIteracionMejora();

            Ruta ruta = new Ruta(Ruta.generarId(lote.unidad.getIdUnidad(), contexto.marcaTiempoActual(), "R" + (++contadorRutas)),
                    contexto.marcaTiempoActual(), lote.unidad);
            ruta.setCostoEstimado(resultado.costoTotal());
            ruta.setDuracionEstimada(resultado.duracionTotalHoras());
            ruta.setEstado(EstadoRuta.PLANIFICADA);

            // IPSO solo PENALIZA el retraso en su función de costo (300/h), así que puede preferir
            // un orden más corto que llega tarde a alguna parada. El orden del agrupamiento
            // (por urgencia) es puntual por construcción: si el del PSO no lo es, se usa ese.
            List<Pedido> secuencia = resultado.secuenciaOptima();
            if (!esPuntual(lote.unidad, secuencia, contexto)) {
                secuencia = lote.pedidos;
            }
            asignarParadasConLlegadas(ruta, secuencia, lote.unidad.getTipoVehiculo().getVelocidadKmH(), contexto);

            nuevasRutas.add(ruta);
        }

        // Bug real corregido (expuesto al poner IPSO en producción): a diferencia de ALNS
        // (SolucionadorALNS.construirSolucionInicial crea una Ruta vacía placeholder para TODO
        // vehículo disponible, tenga o no pedidos), IPSO solo generaba Ruta para las unidades que
        // ClusterizadorPedidos sí alcanzó a llenar -- una unidad disponible sin pedidos asignables
        // (sea porque no quedaban pedidos, o porque ninguno le quedaba factible por plazo tras el
        // fix de "mejor tarde que nunca") no recibía NINGÚN objeto Ruta este lote. Sin una Ruta
        // (ni vacía), MotorSimulacion.manejarVehiculoSinParadas nunca corre para ella: no vuelve al
        // almacén ni resetea su actividad, queda congelada donde esté para siempre. Mismo
        // mecanismo que ALNS: toda unidad disponible recibe una Ruta, vacía si no le tocó nada.
        var unidadesConRuta = nuevasRutas.stream().map(Ruta::getUnidadTransporte).collect(java.util.stream.Collectors.toSet());
        for (UnidadTransporte unidad : contexto.vehiculos()) {
            if (unidad.estaDisponibleParaRuta(contexto.marcaTiempoActual()) && !unidadesConRuta.contains(unidad)) {
                Ruta vacia = new Ruta(Ruta.generarId(unidad.getIdUnidad(), contexto.marcaTiempoActual(), "vacia"),
                        contexto.marcaTiempoActual(), unidad);
                vacia.setEstado(EstadoRuta.PLANIFICADA);
                nuevasRutas.add(vacia);
            }
        }

        promedioIteracionMejora = lotes.isEmpty() ? 0.0 : (double) sumaIteracionMejora / lotes.size();
        return nuevasRutas;
    }

    /**
     * Añade una {@link ParadaPlanificada} por cada pedido de la secuencia, calculando su hora de
     * llegada estimada mediante {@link CalculadorDistancia} (la misma fuente de verdad de
     * distancias que usa ALNS), de modo que el reporte de cumplimiento de plazos refleje una
     * estimación real y no quede sin registrar.
     *
     * <p>Bug real encontrado (investigación de por qué IPSO pierde tanto contra ALNS en
     * pctATiempo): a diferencia de {@link com.paqrap.alns.EvaluadorCostos#recalcularRuta}, esta
     * estimación no insertaba la pausa obligatoria de refrigerio -- una ruta que IPSO consideraba
     * "a tiempo" en el papel podía resultar tarde de verdad en la simulación real (que sí para al
     * vehículo a refrigerar), porque IPSO simplemente no la vio venir al planificar. Misma lógica
     * que ALNS, portada aquí (no se puede reusar {@code TiempoUtil} directamente, es
     * paquete-privado de {@code com.paqrap.alns}).
     */
    private void asignarParadasConLlegadas(Ruta ruta, List<Pedido> secuencia, double velocidadKmH,
            ContextoProblema contexto) {
        List<LocalDateTime> llegadas = llegadasEstimadas(ruta.getUnidadTransporte(), ruta.getHoraInicioPlanificada(),
                secuencia, velocidadKmH, contexto);
        for (int i = 0; i < secuencia.size(); i++) {
            Pedido pedido = secuencia.get(i);
            ParadaPlanificada parada = new ParadaPlanificada(pedido, pedido.getCantidadSolicitada());
            parada.setFechaEntregada(llegadas.get(i));
            ruta.getSecuenciaParadas().add(parada);
        }
    }

    /** true si recorriendo {@code secuencia} en ese orden se llega a cada pedido antes de su plazo. */
    private boolean esPuntual(UnidadTransporte unidad, List<Pedido> secuencia, ContextoProblema contexto) {
        List<LocalDateTime> llegadas = llegadasEstimadas(unidad, contexto.marcaTiempoActual(), secuencia,
                unidad.getTipoVehiculo().getVelocidadKmH(), contexto);
        for (int i = 0; i < secuencia.size(); i++) {
            if (llegadas.get(i).isAfter(secuencia.get(i).getFechaLimite())) {
                return false;
            }
        }
        return true;
    }

    /** Llegada estimada a cada pedido de {@code secuencia}, en orden, desde la posición actual. */
    private List<LocalDateTime> llegadasEstimadas(UnidadTransporte unidad, LocalDateTime inicio, List<Pedido> secuencia,
            double velocidadKmH, ContextoProblema contexto) {
        List<LocalDateTime> llegadas = new ArrayList<>();
        LocalDateTime tiempoActual = inicio;
        Nodo posicionActual = unidad.getPosicion();
        long servicioSeg = Math.round(contexto.configuracionOperacion().tiempoServicioClienteHoras() * 3600.0);

        double duracionRefrigerioHoras = contexto.configuracionOperacion().duracionRefrigerioHoras();
        // Bug real corregido (mismo que en ALNS, ver VerificadorRestricciones/EvaluadorCostos): el
        // punto medio del refrigerio debe anclarse al turno REAL (07:00/15:00/23:00), no a
        // ruta.getHoraInicioPlanificada() -- si la ruta arranca a media jornada, el punto medio
        // calculado desde el inicio de ruta no coincide con el que MotorSimulacion usará de verdad.
        LocalDateTime inicioTurno = contexto.configuracionOperacion().inicioTurnoQueContiene(inicio);
        LocalDateTime inicioRefrigerioIdeal = contexto.configuracionOperacion().inicioRefrigerioMasTardio(inicioTurno);
        boolean refrigerioTomado = inicioTurno.equals(unidad.getTiempoInicioTurnoActual()) && unidad.isRefrigerioTomado();
        LocalDateTime refrigerioEnCurso = unidad.getHoraRefrigerioProgramada();
        if (refrigerioEnCurso != null) {
            LocalDateTime fin = refrigerioEnCurso.plusSeconds(Math.round(duracionRefrigerioHoras * 3600.0));
            if (fin.isAfter(tiempoActual)) {
                tiempoActual = fin;
            }
            refrigerioTomado = true;
        }

        for (Pedido pedido : secuencia) {
            LocalDateTime liberacion = pedido.getFechaIngreso();
            if (tiempoActual.isBefore(liberacion)) {
                tiempoActual = liberacion;
            }

            if (!refrigerioTomado && !tiempoActual.isBefore(inicioRefrigerioIdeal)) {
                tiempoActual = tiempoActual.plusSeconds(Math.round(duracionRefrigerioHoras * 3600.0));
                refrigerioTomado = true;
            }

            double distanciaKm = CalculadorDistancia.distanciaKm(contexto.ciudad(), contexto.bloqueos(), tiempoActual,
                    posicionActual, pedido.getDestino());
            double horasViaje = distanciaKm / velocidadKmH;
            LocalDateTime llegada = tiempoActual.plusSeconds(Math.round(horasViaje * 3600.0));
            // Refrigerio tomado en el camino si el viaje cruza su último inicio permitido (ver
            // MotorSimulacion.recorrerCamino).
            if (!refrigerioTomado && llegada.isAfter(inicioRefrigerioIdeal)) {
                llegada = llegada.plusSeconds(Math.round(duracionRefrigerioHoras * 3600.0));
                refrigerioTomado = true;
            }
            llegadas.add(llegada);

            // Antes estaba fijo en 1h (llegada.plusHours(1)) en vez de leer la configuración.
            tiempoActual = llegada.plusSeconds(servicioSeg);
            posicionActual = pedido.getDestino();
        }
        return llegadas;
    }
}
