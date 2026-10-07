package com.paqrap.dominio;

/**
 * Qué está haciendo físicamente una unidad de transporte en el instante actual, dentro de su
 * {@link EstadoUnidad} general. No reemplaza a {@code EstadoUnidad} (el planificador sigue
 * decidiendo disponibilidad solo con ese campo, vía {@link UnidadTransporte#estaDisponibleParaRuta}
 * -- para esa decisión, "entregando" y "en refrigerio" son indistintamente "ocupado"); esto es
 * informativo, para que el visualizador pueda explicar POR QUÉ un vehículo con ruta asignada no
 * avanza entre dos lotes consecutivos, en vez de que se vea como si estuviera "atascado".
 */
public enum ActividadVehiculo {
    /** Sin ruta activa, o recién terminó y todavía no le asignan una nueva. */
    INACTIVO,
    /** En tránsito por la grilla, hacia una parada de entrega o de regreso a un almacén. */
    VIAJANDO,
    /** Detenido en el destino de un pedido, dentro de la ventana de tiempoServicioClienteHoras. */
    ENTREGANDO,
    /** Pausa obligatoria de refrigerio en curso (duracionRefrigerioHoras). */
    EN_REFRIGERIO
}
