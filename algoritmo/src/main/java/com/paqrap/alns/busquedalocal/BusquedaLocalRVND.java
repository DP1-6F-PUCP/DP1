package com.paqrap.alns.busquedalocal;

import com.paqrap.dominio.ContextoProblema;
import com.paqrap.dominio.ParadaPlanificada;
import com.paqrap.dominio.Ruta;
import com.paqrap.alns.EvaluadorCostos;
import com.paqrap.alns.Solucion;
import com.paqrap.alns.VerificadorRestricciones;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;

/**
 * Random Variable Neighborhood Descent: aplica, en orden aleatorio, 5 vecindarios de búsqueda
 * local (reubicación, intercambio, 2-opt intra-ruta, intercambio (2,1) y 2-opt* inter-ruta),
 * reiniciando el orden cada vez que una mejora es aceptada.
 *
 * <p>Cada movimiento candidato solo copia la(s) 1-2 rutas que realmente toca, en vez de la
 * solución completa: la factibilidad de un movimiento depende únicamente de las rutas
 * involucradas, y en la comparación de costo total las rutas no tocadas se cancelan (aparecen
 * igual a ambos lados de la resta), así que comparar solo el costo de las rutas afectadas es
 * matemáticamente equivalente a comparar el costo total de la solución — sin necesidad de copiar
 * ni recalcular lo que no cambió.
 */
public class BusquedaLocalRVND {

    private final double epsilonMejora;

    public BusquedaLocalRVND(double epsilonMejora) {
        this.epsilonMejora = epsilonMejora;
    }

    public Solucion aplicar(Solucion solucionActual, ContextoProblema contexto) {
        Solucion solucion = solucionActual.copiar();
        List<Integer> vecindarios = new ArrayList<>(Arrays.asList(1, 2, 3, 4, 5));
        Collections.shuffle(vecindarios);

        while (!vecindarios.isEmpty()) {
            int vecindario = vecindarios.remove(0);
            boolean mejoro = switch (vecindario) {
                case 1 -> aplicarReubicacion(solucion, contexto);
                case 2 -> aplicarIntercambio(solucion, contexto);
                case 3 -> aplicarDosOpt(solucion, contexto);
                case 4 -> aplicarIntercambioDosUno(solucion, contexto);
                case 5 -> aplicarDosOptInterRuta(solucion, contexto);
                default -> false;
            };

            if (mejoro) {
                vecindarios = new ArrayList<>(Arrays.asList(1, 2, 3, 4, 5));
                Collections.shuffle(vecindarios);
            }
        }

        return solucion;
    }

    private boolean aplicarReubicacion(Solucion solucion, ContextoProblema contexto) {
        List<Ruta> rutas = solucion.getRutas();
        for (int r1Idx = 0; r1Idx < rutas.size(); r1Idx++) {
            Ruta r1 = rutas.get(r1Idx);
            for (int i = 0; i < r1.getSecuenciaParadas().size(); i++) {
                for (int r2Idx = 0; r2Idx < rutas.size(); r2Idx++) {
                    Ruta r2 = rutas.get(r2Idx);
                    boolean mismaRuta = r1Idx == r2Idx;
                    int maxPos = mismaRuta ? r2.getSecuenciaParadas().size() - 1 : r2.getSecuenciaParadas().size();

                    for (int j = 0; j <= maxPos; j++) {
                        if (mismaRuta && (i == j || i == j - 1)) {
                            continue;
                        }

                        Ruta testR1 = Solucion.copiarRuta(r1);
                        Ruta testR2 = mismaRuta ? testR1 : Solucion.copiarRuta(r2);

                        ParadaPlanificada parada = testR1.getSecuenciaParadas().remove(i);
                        if (mismaRuta && j > i) {
                            testR2.getSecuenciaParadas().add(j - 1, parada);
                        } else {
                            testR2.getSecuenciaParadas().add(j, parada);
                        }

                        recalcular(testR1, contexto);
                        if (!mismaRuta) {
                            recalcular(testR2, contexto);
                        }

                        double costoAntes = r1.getCostoEstimado() + (mismaRuta ? 0 : r2.getCostoEstimado());
                        double costoDespues = testR1.getCostoEstimado() + (mismaRuta ? 0 : testR2.getCostoEstimado());

                        if (esFactible(testR1, contexto) && esFactible(testR2, contexto)
                                && costoDespues < costoAntes - epsilonMejora) {
                            rutas.set(r1Idx, testR1);
                            if (!mismaRuta) {
                                rutas.set(r2Idx, testR2);
                            }
                            return true;
                        }
                    }
                }
            }
        }
        return false;
    }

    private boolean aplicarIntercambio(Solucion solucion, ContextoProblema contexto) {
        List<Ruta> rutas = solucion.getRutas();
        for (int r1Idx = 0; r1Idx < rutas.size(); r1Idx++) {
            for (int r2Idx = r1Idx; r2Idx < rutas.size(); r2Idx++) {
                Ruta r1 = rutas.get(r1Idx);
                Ruta r2 = rutas.get(r2Idx);
                boolean mismaRuta = r1Idx == r2Idx;

                for (int i = 0; i < r1.getSecuenciaParadas().size(); i++) {
                    int startJ = mismaRuta ? i + 1 : 0;

                    for (int j = startJ; j < r2.getSecuenciaParadas().size(); j++) {
                        Ruta testR1 = Solucion.copiarRuta(r1);
                        Ruta testR2 = mismaRuta ? testR1 : Solucion.copiarRuta(r2);

                        ParadaPlanificada p1 = testR1.getSecuenciaParadas().get(i);
                        ParadaPlanificada p2 = testR2.getSecuenciaParadas().get(j);

                        testR1.getSecuenciaParadas().set(i, p2);
                        testR2.getSecuenciaParadas().set(j, p1);

                        recalcular(testR1, contexto);
                        if (!mismaRuta) {
                            recalcular(testR2, contexto);
                        }

                        double costoAntes = r1.getCostoEstimado() + (mismaRuta ? 0 : r2.getCostoEstimado());
                        double costoDespues = testR1.getCostoEstimado() + (mismaRuta ? 0 : testR2.getCostoEstimado());

                        if (esFactible(testR1, contexto) && esFactible(testR2, contexto)
                                && costoDespues < costoAntes - epsilonMejora) {
                            rutas.set(r1Idx, testR1);
                            if (!mismaRuta) {
                                rutas.set(r2Idx, testR2);
                            }
                            return true;
                        }
                    }
                }
            }
        }
        return false;
    }

    private boolean aplicarDosOpt(Solucion solucion, ContextoProblema contexto) {
        List<Ruta> rutas = solucion.getRutas();
        for (int rIdx = 0; rIdx < rutas.size(); rIdx++) {
            Ruta r = rutas.get(rIdx);
            int tamano = r.getSecuenciaParadas().size();
            if (tamano < 3) {
                continue;
            }

            for (int i = 0; i < tamano - 1; i++) {
                for (int j = i + 1; j < tamano; j++) {
                    Ruta testR = Solucion.copiarRuta(r);
                    Collections.reverse(testR.getSecuenciaParadas().subList(i, j + 1));
                    recalcular(testR, contexto);

                    if (esFactible(testR, contexto)
                            && testR.getCostoEstimado() < r.getCostoEstimado() - epsilonMejora) {
                        rutas.set(rIdx, testR);
                        return true;
                    }
                }
            }
        }
        return false;
    }

    private boolean aplicarIntercambioDosUno(Solucion solucion, ContextoProblema contexto) {
        List<Ruta> rutas = solucion.getRutas();
        for (int r1Idx = 0; r1Idx < rutas.size(); r1Idx++) {
            Ruta r1 = rutas.get(r1Idx);
            if (r1.getSecuenciaParadas().size() < 2) {
                continue;
            }

            for (int r2Idx = 0; r2Idx < rutas.size(); r2Idx++) {
                if (r1Idx == r2Idx) {
                    continue;
                }
                Ruta r2 = rutas.get(r2Idx);
                if (r2.getSecuenciaParadas().isEmpty()) {
                    continue;
                }

                for (int i = 0; i < r1.getSecuenciaParadas().size() - 1; i++) {
                    for (int j = 0; j < r2.getSecuenciaParadas().size(); j++) {
                        Ruta testR1 = Solucion.copiarRuta(r1);
                        Ruta testR2 = Solucion.copiarRuta(r2);

                        ParadaPlanificada p1a = testR1.getSecuenciaParadas().get(i);
                        ParadaPlanificada p1b = testR1.getSecuenciaParadas().get(i + 1);
                        ParadaPlanificada p2 = testR2.getSecuenciaParadas().get(j);

                        testR1.getSecuenciaParadas().remove(i + 1);
                        testR1.getSecuenciaParadas().set(i, p2);

                        testR2.getSecuenciaParadas().remove(j);
                        testR2.getSecuenciaParadas().add(j, p1b);
                        testR2.getSecuenciaParadas().add(j, p1a);

                        recalcular(testR1, contexto);
                        recalcular(testR2, contexto);

                        double costoAntes = r1.getCostoEstimado() + r2.getCostoEstimado();
                        double costoDespues = testR1.getCostoEstimado() + testR2.getCostoEstimado();

                        if (esFactible(testR1, contexto) && esFactible(testR2, contexto)
                                && costoDespues < costoAntes - epsilonMejora) {
                            rutas.set(r1Idx, testR1);
                            rutas.set(r2Idx, testR2);
                            return true;
                        }
                    }
                }
            }
        }
        return false;
    }

    private boolean aplicarDosOptInterRuta(Solucion solucion, ContextoProblema contexto) {
        List<Ruta> rutas = solucion.getRutas();
        for (int r1Idx = 0; r1Idx < rutas.size(); r1Idx++) {
            Ruta r1 = rutas.get(r1Idx);
            if (r1.getSecuenciaParadas().isEmpty()) {
                continue;
            }

            for (int r2Idx = r1Idx + 1; r2Idx < rutas.size(); r2Idx++) {
                Ruta r2 = rutas.get(r2Idx);
                if (r2.getSecuenciaParadas().isEmpty()) {
                    continue;
                }

                int size1 = r1.getSecuenciaParadas().size();
                int size2 = r2.getSecuenciaParadas().size();

                for (int i = 0; i < size1; i++) {
                    for (int j = 0; j < size2; j++) {
                        Ruta testR1 = Solucion.copiarRuta(r1);
                        Ruta testR2 = Solucion.copiarRuta(r2);

                        List<ParadaPlanificada> cola1 = new ArrayList<>(testR1.getSecuenciaParadas().subList(i + 1, size1));
                        List<ParadaPlanificada> cola2 = new ArrayList<>(testR2.getSecuenciaParadas().subList(j + 1, size2));

                        testR1.getSecuenciaParadas().subList(i + 1, size1).clear();
                        testR2.getSecuenciaParadas().subList(j + 1, size2).clear();

                        testR1.getSecuenciaParadas().addAll(cola2);
                        testR2.getSecuenciaParadas().addAll(cola1);

                        recalcular(testR1, contexto);
                        recalcular(testR2, contexto);

                        double costoAntes = r1.getCostoEstimado() + r2.getCostoEstimado();
                        double costoDespues = testR1.getCostoEstimado() + testR2.getCostoEstimado();

                        if (esFactible(testR1, contexto) && esFactible(testR2, contexto)
                                && costoDespues < costoAntes - epsilonMejora) {
                            rutas.set(r1Idx, testR1);
                            rutas.set(r2Idx, testR2);
                            return true;
                        }
                    }
                }
            }
        }
        return false;
    }

    private void recalcular(Ruta ruta, ContextoProblema contexto) {
        EvaluadorCostos.recalcularRuta(ruta, contexto.ciudad(), contexto.bloqueos(), contexto.configuracionOperacion());
    }

    private boolean esFactible(Ruta ruta, ContextoProblema contexto) {
        return VerificadorRestricciones.esRutaFactible(ruta, contexto.ciudad(), contexto.bloqueos(),
                contexto.configuracionOperacion());
    }
}
