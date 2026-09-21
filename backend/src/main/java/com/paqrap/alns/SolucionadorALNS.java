package com.paqrap.alns;

import com.paqrap.dominio.ContextoProblema;
import com.paqrap.dominio.EstadoPedido;
import com.paqrap.dominio.Pedido;
import com.paqrap.dominio.Ruta;
import com.paqrap.dominio.UnidadTransporte;
import com.paqrap.alns.busquedalocal.BusquedaLocalRVND;
import com.paqrap.alns.nucleo.GestorPesosAdaptativo;
import com.paqrap.alns.nucleo.SolucionadorParticionConjuntos;
import com.paqrap.alns.operadores.DestruccionAleatoria;
import com.paqrap.alns.operadores.DestruccionCluster;
import com.paqrap.alns.operadores.DestruccionPeorCosto;
import com.paqrap.alns.operadores.DestruccionRutaCompleta;
import com.paqrap.alns.operadores.DestruccionShaw;
import com.paqrap.alns.operadores.OperadorDestruccion;
import com.paqrap.alns.operadores.OperadorReparacion;
import com.paqrap.alns.operadores.ReparacionRegret;
import com.paqrap.alns.operadores.ReparacionRegretRuido;
import com.paqrap.alns.operadores.ReparacionVoraz;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Random;

/**
 * Adaptive Large Neighborhood Search para el planificador de rutas de PaqRap.
 *
 * <p>Referencia trasladada de la implementación original: Ropke &amp; Pisinger (2006, 2006b) y
 * Friedrich &amp; Elbert (2022) para los operadores de ruina y creación.
 */
public class SolucionadorALNS implements PlanificadorRutas {

    private final ConfiguracionALNS configuracion;
    private final GestorPesosAdaptativo<OperadorDestruccion> gestorDestruccion;
    private final GestorPesosAdaptativo<OperadorReparacion> gestorReparacion;
    private final BusquedaLocalRVND busquedaLocal;
    private final SolucionadorParticionConjuntos solucionadorSPP;
    private int ultimaIteracionMejora;

    public SolucionadorALNS(ConfiguracionALNS configuracion) {
        this.configuracion = configuracion;

        List<OperadorDestruccion> operadoresDestruccion = Arrays.asList(
                new DestruccionAleatoria(),
                new DestruccionPeorCosto(),
                new DestruccionShaw(configuracion.getPesoDistanciaShaw(), configuracion.getPesoTiempoShaw()),
                new DestruccionRutaCompleta(),
                new DestruccionCluster());

        List<OperadorReparacion> operadoresReparacion = Arrays.asList(
                new ReparacionVoraz(),
                new ReparacionRegret(2),
                new ReparacionRegret(3),
                new ReparacionRegretRuido(2, 0.15),
                new ReparacionRegretRuido(3, 0.20));

        this.gestorDestruccion = new GestorPesosAdaptativo<>(operadoresDestruccion);
        this.gestorReparacion = new GestorPesosAdaptativo<>(operadoresReparacion);
        this.busquedaLocal = new BusquedaLocalRVND(configuracion.getEpsilonMejoraRVND());
        this.solucionadorSPP = new SolucionadorParticionConjuntos();
    }

    @Override
    public String getNombre() {
        return "ALNS (Adaptive Large Neighborhood Search)";
    }

    /**
     * Iteración en la que se encontró la última mejora de {@code mejorSolucion} durante la corrida
     * más reciente de {@link #planificarRutas}. Diagnóstico de velocidad de convergencia para
     * experimentación — no forma parte del contrato de {@link com.paqrap.dominio.Planificador}.
     */
    public int getUltimaIteracionMejora() {
        return ultimaIteracionMejora;
    }

    @Override
    public List<Ruta> planificarRutas(ContextoProblema contexto) {
        Solucion solucionActual = construirSolucionInicial(contexto);
        Solucion mejorSolucion = solucionActual.copiar();

        List<Ruta> poolRutas = new ArrayList<>();
        agregarRutasAlPool(poolRutas, solucionActual);
        ultimaIteracionMejora = 0;

        double temperatura = configuracion.getTemperaturaAceptacionSA();
        double tasaEnfriamiento = configuracion.getTasaEnfriamientoSA();
        Random random = new Random();
        int iteracion = 1;
        int contadorSinMejora = 0;

        while (iteracion <= configuracion.getMaxIteraciones() && contadorSinMejora < configuracion.getMaxSinMejora()) {
            Solucion vecina = solucionActual.copiar();

            int idxDestruccion = gestorDestruccion.seleccionarIndiceOperador();
            int idxReparacion = gestorReparacion.seleccionarIndiceOperador();

            OperadorDestruccion opDestruccion = gestorDestruccion.obtenerOperador(idxDestruccion);
            OperadorReparacion opReparacion = gestorReparacion.obtenerOperador(idxReparacion);

            int q = configuracion.getMinCantidadDestruccion()
                    + random.nextInt(configuracion.getMaxCantidadDestruccion() - configuracion.getMinCantidadDestruccion() + 1);

            List<Pedido> pedidosRemovidos = opDestruccion.destruir(vecina, q, contexto);
            vecina.getPedidosNoAsignados().addAll(pedidosRemovidos);

            opReparacion.reparar(vecina, vecina.getPedidosNoAsignados(), contexto);

            for (Ruta ruta : vecina.getRutas()) {
                EvaluadorCostos.recalcularRuta(ruta, contexto.ciudad(), contexto.bloqueos(), contexto.configuracionOperacion());
            }

            if (vecina.calcularCostoTotal() < mejorSolucion.calcularCostoTotal()) {
                vecina = busquedaLocal.aplicar(vecina, contexto);
            }

            agregarRutasAlPool(poolRutas, vecina);

            double costoActual = solucionActual.calcularCostoTotal();
            double costoVecina = vecina.calcularCostoTotal();
            double mejorCosto = mejorSolucion.calcularCostoTotal();

            if (costoVecina < mejorCosto) {
                mejorSolucion = vecina.copiar();
                solucionActual = vecina.copiar();
                ultimaIteracionMejora = iteracion;
                gestorDestruccion.agregarPuntaje(idxDestruccion, configuracion.getPuntajeMejorGlobal());
                gestorReparacion.agregarPuntaje(idxReparacion, configuracion.getPuntajeMejorGlobal());
                contadorSinMejora = 0;
            } else if (costoVecina < costoActual) {
                solucionActual = vecina.copiar();
                gestorDestruccion.agregarPuntaje(idxDestruccion, configuracion.getPuntajeMejorActual());
                gestorReparacion.agregarPuntaje(idxReparacion, configuracion.getPuntajeMejorActual());
                contadorSinMejora++;
            } else {
                double delta = costoActual - costoVecina;
                double probabilidadAceptacion = Math.exp(delta / Math.max(1e-6, temperatura));
                if (random.nextDouble() < probabilidadAceptacion) {
                    solucionActual = vecina.copiar();
                    gestorDestruccion.agregarPuntaje(idxDestruccion, configuracion.getPuntajeAceptado());
                    gestorReparacion.agregarPuntaje(idxReparacion, configuracion.getPuntajeAceptado());
                }
                contadorSinMejora++;
            }

            temperatura = Math.max(1e-6, temperatura * tasaEnfriamiento);

            if (iteracion % configuracion.getIntervaloSPP() == 0) {
                Solucion solucionSPP = solucionadorSPP.resolver(poolRutas, contexto);
                if (solucionSPP.calcularCostoTotal() < mejorSolucion.calcularCostoTotal()) {
                    mejorSolucion = solucionSPP.copiar();
                    solucionActual = solucionSPP.copiar();
                    ultimaIteracionMejora = iteracion;
                }
                // SPP solo necesita las rutas generadas desde la última recombinación, no el
                // historial completo de la corrida: sin este vaciado, el pool crece sin límite
                // (iteraciones × vehículos) y cada sort() sucesivo reprocesa todo lo acumulado
                // desde el inicio, con costo cuadrático en la cantidad de iteraciones.
                poolRutas.clear();
            }

            if (iteracion % configuracion.getIntervaloActualizacion() == 0) {
                gestorDestruccion.actualizarPesos(configuracion);
                gestorReparacion.actualizarPesos(configuracion);
            }

            iteracion++;
        }

        return mejorSolucion.aRutas();
    }

    private Solucion construirSolucionInicial(ContextoProblema contexto) {
        Solucion sol = new Solucion();
        for (UnidadTransporte unidad : contexto.vehiculos()) {
            Ruta ruta = new Ruta(unidad.getIdUnidad() + "-r1", contexto.marcaTiempoActual(), unidad);
            EvaluadorCostos.recalcularRuta(ruta, contexto.ciudad(), contexto.bloqueos(), contexto.configuracionOperacion());
            sol.getRutas().add(ruta);
        }

        List<Pedido> noAsignados = new ArrayList<>();
        for (Pedido pedido : contexto.pedidos()) {
            if (pedido.getEstado() == EstadoPedido.PENDIENTE) {
                noAsignados.add(pedido);
            }
        }

        new ReparacionRegret(2).reparar(sol, noAsignados, contexto);
        sol.getPedidosNoAsignados().addAll(noAsignados);
        return sol;
    }

    private void agregarRutasAlPool(List<Ruta> pool, Solucion solucion) {
        for (Ruta ruta : solucion.getRutas()) {
            if (!ruta.getSecuenciaParadas().isEmpty()) {
                pool.add(Solucion.copiarRuta(ruta));
            }
        }
    }
}
