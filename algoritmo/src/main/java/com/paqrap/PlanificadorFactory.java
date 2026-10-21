package com.paqrap;

import com.paqrap.dominio.Planificador;
import com.paqrap.dominio.TipoAlgoritmo;
import com.paqrap.ipso.PlanificadorIPSO;
import com.paqrap.ipso.nucleo.IPSOConfig;
import com.paqrap.alns.ConfiguracionALNS;
import com.paqrap.alns.SolucionadorALNS;

import java.util.Map;

/**
 * Punto único de instanciación de un {@link Planificador} por tipo de algoritmo, para producción
 * y para experimentación comparativa. Ningún algoritmo conoce al otro — esta fábrica es lo único
 * que los conoce a ambos.
 */
public final class PlanificadorFactory {

    private PlanificadorFactory() {
    }

    /**
     * Instancia el planificador correspondiente al algoritmo pedido, configurado a partir de
     * {@code configDatos} (típicamente el resultado de parsear {@code config-alns.json} o
     * {@code config-ipso.json}).
     *
     * @param tipo algoritmo a instanciar
     * @param configDatos hiperparámetros del algoritmo, ya parseados desde JSON
     * @param tiempoMaximoComputoSegundos presupuesto de tiempo REAL por lote (el mismo
     *         {@code ta} que ya usaba el orquestador solo para loguear un WARN post-hoc) -- ALNS
     *         lo usa como corte real dentro de su bucle (ver ConfiguracionALNS.presupuestoSegundos
     *         y el bug real que esto corrige, documentado ahi); IPSO lo ignora (sus sub-problemas
     *         por vehiculo ya son triviales en tiempo, ver investigacion de convergencia).
     * @return planificador listo para invocar {@link Planificador#planificarRutas}
     */
    public static Planificador crear(TipoAlgoritmo tipo, Map<String, Object> configDatos,
            float tiempoMaximoComputoSegundos) {
        return switch (tipo) {
            case ALNS -> {
                ConfiguracionALNS config = ConfiguracionALNS.cargarDesde(configDatos);
                config.setPresupuestoSegundos(tiempoMaximoComputoSegundos);
                yield new SolucionadorALNS(config);
            }
            case IPSO -> new PlanificadorIPSO(IPSOConfig.cargarDesde(configDatos));
        };
    }
}
