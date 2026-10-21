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
        if (pedidosPendientes.isEmpty()) {
            return nuevasRutas;
        }

        ClusterizadorPedidos clusterizador = new ClusterizadorPedidos();
        List<ClusterizadorPedidos.LoteVehiculo> lotes = clusterizador.clusterizar(pedidosPendientes,
                contexto.vehiculos(), contexto.almacenes(), contexto.marcaTiempoActual(),
                contexto.configuracionOperacion().maxParadasPorRuta(),
                contexto.configuracionOperacion().tiempoServicioClienteHoras(), contexto.ciudad(), contexto.bloqueos());

        int contadorRutas = 0;
        long sumaIteracionMejora = 0;
        for (ClusterizadorPedidos.LoteVehiculo lote : lotes) {
            IPSOOptimizador ipso = new IPSOOptimizador(lote.pedidos, lote.almacen.getPosicion(), lote.unidad,
                    contexto.ciudad(), contexto.bloqueos(), config, contexto.marcaTiempoActual(),
                    contexto.configuracionOperacion());
            ResultadoIPSO resultado = ipso.ejecutar();
            sumaIteracionMejora += ipso.getUltimaIteracionMejora();

            Ruta ruta = new Ruta(Ruta.generarId(lote.unidad.getIdUnidad(), contexto.marcaTiempoActual(), "R" + (++contadorRutas)),
                    contexto.marcaTiempoActual(), lote.unidad);
            ruta.setCostoEstimado(resultado.costoTotal());
            ruta.setDuracionEstimada(resultado.duracionTotalHoras());
            ruta.setEstado(EstadoRuta.PLANIFICADA);

            asignarParadasConLlegadas(ruta, resultado.secuenciaOptima(), lote.unidad.getTipoVehiculo().getVelocidadKmH(),
                    contexto);

            nuevasRutas.add(ruta);
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
        UnidadTransporte unidad = ruta.getUnidadTransporte();
        LocalDateTime tiempoActual = ruta.getHoraInicioPlanificada();
        Nodo posicionActual = unidad.getPosicion();

        double duracionRefrigerioHoras = contexto.configuracionOperacion().duracionRefrigerioHoras();
        double duracionTurnoHoras = contexto.configuracionOperacion().duracionTurnoHoras();
        LocalDateTime inicioRefrigerioIdeal = ruta.getHoraInicioPlanificada()
                .plusSeconds(Math.round(duracionTurnoHoras / 2.0 * 3600.0));
        boolean refrigerioTomado = unidad.isRefrigerioTomado();

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

            ParadaPlanificada parada = new ParadaPlanificada(pedido, pedido.getCantidadSolicitada());
            parada.setFechaEntregada(llegada);
            ruta.getSecuenciaParadas().add(parada);

            tiempoActual = llegada.plusHours(1);
            posicionActual = pedido.getDestino();
        }
    }
}
