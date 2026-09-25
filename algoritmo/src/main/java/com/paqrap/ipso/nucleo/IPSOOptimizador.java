package com.paqrap.ipso.nucleo;

import com.paqrap.dominio.Bloqueo;
import com.paqrap.dominio.CalculadorDistancia;
import com.paqrap.dominio.Ciudad;
import com.paqrap.dominio.Nodo;
import com.paqrap.dominio.Pedido;
import com.paqrap.dominio.UnidadTransporte;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Random;

/**
 * Improved Particle Swarm Optimization (PSO discreto por secuencias de intercambio) para
 * secuenciar las entregas de un único vehículo. El problema se modela como un TSP con un solo
 * depósito: V = {pedidos a entregar}, agregado como nodo adicional en la matriz de distancias D.
 *
 * <p>Nota de escalabilidad: para más de 30-50 paradas se recomienda clusterizar por zonas y
 * ejecutar IPSO por cuadrante; esa clusterización la realiza {@link com.paqrap.ipso.ClusterizadorPedidos}
 * antes de invocar este optimizador, por lo que aquí "pedidos" ya corresponde a la carga de un
 * solo vehículo.
 */
public class IPSOOptimizador {

    private static final double TIEMPO_ENTREGA_HORAS = 1.0;
    private static final double PENALIZACION_POR_UNIDAD_EXCEDENTE = 500.0;
    private static final double PENALIZACION_POR_HORA_TARDIA = 300.0;

    private final List<Pedido> pedidos;
    private final Nodo deposito;
    private final UnidadTransporte unidad;
    private final Ciudad ciudad;
    private final List<Bloqueo> bloqueos;
    private final IPSOConfig config;
    private final LocalDateTime horaSalida;
    private final Random rnd;

    private double[][] distancias;
    private int indiceDeposito;
    private int ultimaIteracionMejora;

    /**
     * Iteración en la que se encontró la última mejora de G_best en la corrida más reciente de
     * {@link #ejecutar()}. Diagnóstico de velocidad de convergencia para experimentación.
     */
    public int getUltimaIteracionMejora() {
        return ultimaIteracionMejora;
    }

    public IPSOOptimizador(List<Pedido> pedidos, Nodo deposito, UnidadTransporte unidad, Ciudad ciudad,
            List<Bloqueo> bloqueos, IPSOConfig config, LocalDateTime horaSalida) {
        this.pedidos = pedidos;
        this.deposito = deposito;
        this.unidad = unidad;
        this.ciudad = ciudad;
        this.bloqueos = bloqueos;
        this.config = config;
        this.horaSalida = horaSalida;
        this.rnd = new Random(config.getSemillaAleatoria());
    }

    /**
     * Ejecuta el algoritmo completo y devuelve la mejor ruta encontrada (G_best).
     *
     * @return resultado con la secuencia óptima, costo, duración y cumplimiento de plazos
     */
    public ResultadoIPSO ejecutar() {
        int n = pedidos.size();
        if (n == 0) {
            return new ResultadoIPSO(new ArrayList<>(), 0.0, 0.0, true);
        }
        construirMatrizDistancias();
        if (n == 1) {
            return traducirResultado(new int[]{0});
        }

        Particula[] poblacion = inicializarPoblacion(n);

        for (Particula p : poblacion) {
            double fit = fitness(p.getPosicion());
            p.setFitnessActual(fit);
            p.setMejorPersonal(p.getPosicion().clone());
            p.setFitnessMejorPersonal(fit);
        }

        int[] gBest = poblacion[0].getMejorPersonal().clone();
        double fitnessGBest = poblacion[0].getFitnessMejorPersonal();
        for (Particula p : poblacion) {
            if (p.getFitnessMejorPersonal() > fitnessGBest) {
                fitnessGBest = p.getFitnessMejorPersonal();
                gBest = p.getMejorPersonal().clone();
            }
        }
        ultimaIteracionMejora = 0;

        int t = 0;
        while (t < config.getIteracionesMaximasT()) {
            for (Particula p : poblacion) {
                List<OperadorIntercambio> nuevaVelocidad = combinarVelocidad(p.getVelocidad(), p.getPosicion(),
                        p.getMejorPersonal(), gBest);
                p.setVelocidad(nuevaVelocidad);

                int[] nuevaPosicion = aplicarVelocidad(p.getPosicion(), nuevaVelocidad);

                if (rnd.nextDouble() < config.getTasaCruceP_c()) {
                    nuevaPosicion = cruceDeOrden(nuevaPosicion, gBest);
                }
                p.setPosicion(nuevaPosicion);

                double fit = fitness(nuevaPosicion);
                p.setFitnessActual(fit);

                if (fit > p.getFitnessMejorPersonal()) {
                    p.setMejorPersonal(nuevaPosicion.clone());
                    p.setFitnessMejorPersonal(fit);
                }
                if (fit > fitnessGBest) {
                    fitnessGBest = fit;
                    gBest = nuevaPosicion.clone();
                    ultimaIteracionMejora = t;
                }
            }

            double[] fitnessPoblacion = new double[poblacion.length];
            for (int i = 0; i < poblacion.length; i++) {
                fitnessPoblacion[i] = poblacion[i].getFitnessActual();
            }
            if (varianza(fitnessPoblacion) < config.getUmbralEstancamiento()) {
                aplicarMutacionHeuristicaBasadaEnDistancia(poblacion);
                for (Particula p : poblacion) {
                    if (p.getFitnessMejorPersonal() > fitnessGBest) {
                        fitnessGBest = p.getFitnessMejorPersonal();
                        gBest = p.getMejorPersonal().clone();
                        ultimaIteracionMejora = t;
                    }
                }
            }

            t++;
        }

        return traducirResultado(gBest);
    }

    private void construirMatrizDistancias() {
        int n = pedidos.size();
        indiceDeposito = n;
        distancias = new double[n + 1][n + 1];
        List<Nodo> puntos = new ArrayList<>();
        for (Pedido pedido : pedidos) {
            puntos.add(pedido.getDestino());
        }
        puntos.add(deposito);
        for (int i = 0; i <= n; i++) {
            for (int j = 0; j <= n; j++) {
                distancias[i][j] = (i == j) ? 0.0
                        : CalculadorDistancia.distanciaKm(ciudad, bloqueos, horaSalida, puntos.get(i), puntos.get(j));
            }
        }
    }

    private Particula[] inicializarPoblacion(int n) {
        Particula[] poblacion = new Particula[config.getTamanoPoblacionN()];
        for (int i = 0; i < poblacion.length; i++) {
            int[] permutacion = permutacionAleatoria(n);
            Particula particula = new Particula(permutacion);
            int numSwapsIniciales = rnd.nextInt(n);
            List<OperadorIntercambio> velocidadInicial = new ArrayList<>();
            for (int k = 0; k < numSwapsIniciales; k++) {
                velocidadInicial.add(new OperadorIntercambio(rnd.nextInt(n), rnd.nextInt(n)));
            }
            particula.setVelocidad(velocidadInicial);
            poblacion[i] = particula;
        }
        return poblacion;
    }

    private int[] permutacionAleatoria(int n) {
        int[] permutacion = new int[n];
        for (int i = 0; i < n; i++) {
            permutacion[i] = i;
        }
        for (int i = n - 1; i > 0; i--) {
            int j = rnd.nextInt(i + 1);
            int tmp = permutacion[i];
            permutacion[i] = permutacion[j];
            permutacion[j] = tmp;
        }
        return permutacion;
    }

    private double fitness(int[] permutacion) {
        return 1.0 / costoRuta(permutacion);
    }

    private double costoRuta(int[] permutacion) {
        double distanciaTotalKm = 0.0;
        double tiempoAcumuladoHoras = 0.0;
        double penalizacionPlazos = 0.0;
        int cargaTotal = 0;

        int nodoAnterior = indiceDeposito;
        for (int idx : permutacion) {
            Pedido pedido = pedidos.get(idx);
            cargaTotal += pedido.getCantidadSolicitada();

            double distanciaTramo = distancias[nodoAnterior][idx];
            distanciaTotalKm += distanciaTramo;
            tiempoAcumuladoHoras += distanciaTramo / unidad.getTipoVehiculo().getVelocidadKmH();

            LocalDateTime llegadaEstimada = horaSalida.plusMinutes(Math.round(tiempoAcumuladoHoras * 60));
            if (llegadaEstimada.isAfter(pedido.getFechaLimite())) {
                double horasTarde = java.time.Duration.between(pedido.getFechaLimite(), llegadaEstimada).toMinutes() / 60.0;
                penalizacionPlazos += horasTarde * PENALIZACION_POR_HORA_TARDIA;
            }

            tiempoAcumuladoHoras += TIEMPO_ENTREGA_HORAS;
            nodoAnterior = idx;
        }
        distanciaTotalKm += distancias[nodoAnterior][indiceDeposito];

        double costoDistancia = distanciaTotalKm * unidad.getTipoVehiculo().getCostoPorKm();

        double penalizacionCapacidad = 0.0;
        int exceso = cargaTotal - unidad.getTipoVehiculo().getCapacidad();
        if (exceso > 0) {
            penalizacionCapacidad = exceso * PENALIZACION_POR_UNIDAD_EXCEDENTE;
        }

        double costoTotal = costoDistancia + penalizacionCapacidad + penalizacionPlazos;
        return Math.max(costoTotal, 0.000001);
    }

    private List<OperadorIntercambio> combinarVelocidad(List<OperadorIntercambio> velocidadAnterior,
            int[] posicionActual, int[] pBest, int[] gBest) {
        List<OperadorIntercambio> nuevaVelocidad = new ArrayList<>();

        for (OperadorIntercambio op : velocidadAnterior) {
            if (rnd.nextDouble() < config.getInercia()) {
                nuevaVelocidad.add(op);
            }
        }

        List<OperadorIntercambio> ssPBest = calcularSecuenciaIntercambio(pBest, posicionActual);
        double probPBest = Math.min(1.0, config.getC1() * rnd.nextDouble());
        for (OperadorIntercambio op : ssPBest) {
            if (rnd.nextDouble() < probPBest) {
                nuevaVelocidad.add(op);
            }
        }

        List<OperadorIntercambio> ssGBest = calcularSecuenciaIntercambio(gBest, posicionActual);
        double probGBest = Math.min(1.0, config.getC2() * rnd.nextDouble());
        for (OperadorIntercambio op : ssGBest) {
            if (rnd.nextDouble() < probGBest) {
                nuevaVelocidad.add(op);
            }
        }

        return nuevaVelocidad;
    }

    private List<OperadorIntercambio> calcularSecuenciaIntercambio(int[] objetivo, int[] origen) {
        List<OperadorIntercambio> secuencia = new ArrayList<>();
        int[] temp = origen.clone();
        int n = temp.length;
        for (int i = 0; i < n; i++) {
            if (temp[i] != objetivo[i]) {
                int j = indexOf(temp, objetivo[i], i);
                OperadorIntercambio op = new OperadorIntercambio(i, j);
                op.aplicar(temp);
                secuencia.add(op);
            }
        }
        return secuencia;
    }

    private int indexOf(int[] arreglo, int valor, int desde) {
        for (int i = desde; i < arreglo.length; i++) {
            if (arreglo[i] == valor) {
                return i;
            }
        }
        return desde;
    }

    private int[] aplicarVelocidad(int[] posicion, List<OperadorIntercambio> velocidad) {
        int[] nueva = posicion.clone();
        for (OperadorIntercambio op : velocidad) {
            op.aplicar(nueva);
        }
        return nueva;
    }

    private int[] cruceDeOrden(int[] padreA, int[] padreB) {
        int n = padreA.length;
        int[] hijo = new int[n];
        boolean[] usado = new boolean[n];
        Arrays.fill(hijo, -1);

        int corte1 = rnd.nextInt(n);
        int corte2 = rnd.nextInt(n);
        int inicio = Math.min(corte1, corte2);
        int fin = Math.max(corte1, corte2);

        for (int i = inicio; i <= fin; i++) {
            hijo[i] = padreA[i];
            usado[padreA[i]] = true;
        }

        int posicionHijo = (fin + 1) % n;
        int posicionPadreB = (fin + 1) % n;
        int insertados = 0;
        int totalAInsertar = n - (fin - inicio + 1);

        while (insertados < totalAInsertar) {
            int gen = padreB[posicionPadreB];
            if (!usado[gen]) {
                hijo[posicionHijo] = gen;
                usado[gen] = true;
                posicionHijo = (posicionHijo + 1) % n;
                insertados++;
            }
            posicionPadreB = (posicionPadreB + 1) % n;
        }

        return hijo;
    }

    private void aplicarMutacionHeuristicaBasadaEnDistancia(Particula[] poblacion) {
        int n = poblacion[0].getPosicion().length;
        if (n < 3) {
            return;
        }

        Particula[] ordenada = poblacion.clone();
        Arrays.sort(ordenada, (a, b) -> Double.compare(a.getFitnessActual(), b.getFitnessActual()));
        int mitad = ordenada.length / 2;

        for (int idx = 0; idx < mitad; idx++) {
            Particula peor = ordenada[idx];
            int[] posicionActual = peor.getPosicion();
            int puntoCorte = 1 + rnd.nextInt(n - 1);

            boolean[] visitado = new boolean[n];
            int[] nuevaPosicion = new int[n];
            for (int i = 0; i < puntoCorte; i++) {
                nuevaPosicion[i] = posicionActual[i];
                visitado[posicionActual[i]] = true;
            }

            int nodoActual = nuevaPosicion[puntoCorte - 1];
            for (int i = puntoCorte; i < n; i++) {
                int mejorCandidato = -1;
                double mejorDistancia = Double.MAX_VALUE;
                for (int cand = 0; cand < n; cand++) {
                    if (!visitado[cand] && distancias[nodoActual][cand] < mejorDistancia) {
                        mejorDistancia = distancias[nodoActual][cand];
                        mejorCandidato = cand;
                    }
                }
                nuevaPosicion[i] = mejorCandidato;
                visitado[mejorCandidato] = true;
                nodoActual = mejorCandidato;
            }

            double nuevoFitness = fitness(nuevaPosicion);
            peor.setPosicion(nuevaPosicion);
            peor.setFitnessActual(nuevoFitness);
            if (nuevoFitness > peor.getFitnessMejorPersonal()) {
                peor.setMejorPersonal(nuevaPosicion.clone());
                peor.setFitnessMejorPersonal(nuevoFitness);
            }
        }
    }

    private double varianza(double[] valores) {
        double media = 0.0;
        for (double v : valores) {
            media += v;
        }
        media /= valores.length;
        double suma = 0.0;
        for (double v : valores) {
            suma += (v - media) * (v - media);
        }
        return suma / valores.length;
    }

    private ResultadoIPSO traducirResultado(int[] gBest) {
        List<Pedido> secuencia = new ArrayList<>();
        for (int idx : gBest) {
            secuencia.add(pedidos.get(idx));
        }
        double costo = costoRuta(gBest);

        double distanciaTotalKm = 0.0;
        double tiempoAcumuladoHoras = 0.0;
        boolean cumplePlazos = true;
        int nodoAnterior = indiceDeposito;
        for (int idx : gBest) {
            double tramo = distancias[nodoAnterior][idx];
            distanciaTotalKm += tramo;
            tiempoAcumuladoHoras += tramo / unidad.getTipoVehiculo().getVelocidadKmH();
            LocalDateTime llegada = horaSalida.plusMinutes(Math.round(tiempoAcumuladoHoras * 60));
            if (llegada.isAfter(pedidos.get(idx).getFechaLimite())) {
                cumplePlazos = false;
            }
            tiempoAcumuladoHoras += TIEMPO_ENTREGA_HORAS;
            nodoAnterior = idx;
        }
        double tramoRegreso = distancias[nodoAnterior][indiceDeposito];
        distanciaTotalKm += tramoRegreso;
        tiempoAcumuladoHoras += tramoRegreso / unidad.getTipoVehiculo().getVelocidadKmH();

        return new ResultadoIPSO(secuencia, costo, tiempoAcumuladoHoras, cumplePlazos);
    }
}
