package com.paqrap.alns.operadores;

import com.paqrap.dominio.ContextoProblema;
import com.paqrap.dominio.ParadaPlanificada;
import com.paqrap.dominio.Pedido;
import com.paqrap.dominio.Ruta;
import com.paqrap.alns.Solucion;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Random;

/**
 * Operador de Ruina: Eliminación de Ruta Completa (Route Removal). Referencia: Nagata &amp;
 * Bräysy (2009), Friedrich &amp; Elbert (2022). Selecciona una ruta completa activa y extrae sus
 * clientes para forzar la reasignación hacia otros vehículos, incentivando la reducción de
 * flota y consolidación de carga.
 */
public class DestruccionRutaCompleta implements OperadorDestruccion {

    @Override
    public String getNombre() {
        return "Destrucción de Ruta Completa (Route Removal)";
    }

    @Override
    public List<Pedido> destruir(Solucion solucion, int q, ContextoProblema contexto) {
        List<Pedido> removidos = new ArrayList<>();

        List<Ruta> rutasActivas = new ArrayList<>();
        for (Ruta r : solucion.getRutas()) {
            if (!r.getSecuenciaParadas().isEmpty()) {
                rutasActivas.add(r);
            }
        }
        if (rutasActivas.isEmpty()) {
            return removidos;
        }

        Collections.shuffle(rutasActivas, new Random());

        for (Ruta ruta : rutasActivas) {
            if (removidos.size() >= q) {
                break;
            }

            List<ParadaPlanificada> paradas = new ArrayList<>(ruta.getSecuenciaParadas());
            for (ParadaPlanificada parada : paradas) {
                ruta.getSecuenciaParadas().remove(parada);
                removidos.add(parada.getPedido());
                if (removidos.size() >= q) {
                    break;
                }
            }
            OperadorUtil.recalcular(ruta, contexto);
        }

        return removidos;
    }
}
