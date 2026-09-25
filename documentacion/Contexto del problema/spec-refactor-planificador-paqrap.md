# Especificación de refactor — Acople de ALNS e IPSO al dominio canónico de PaqRap

Este documento resume las decisiones de diseño tomadas en una sesión de trabajo previa (diagramado en Lucid), como brief de implementación. No repitas el proceso de decisión salvo que encuentres una inconsistencia real contra el código fuente — en ese caso, señálala antes de proceder.

## 0. Contexto del proyecto

PaqRap es un sistema de planificación logística (curso universitario, Diseño y Desarrollo de Software). Se requieren **dos algoritmos metaheurísticos** para el componente planificador (RNF-a del curso), evaluados por experimentación numérica comparativa:

- **ALNS** (Adaptive Large Neighborhood Search) — implementado en `com.paqrap.*`, con Maven, Java 21. Motor de simulación funcional de punta a punta, pero con modelo de datos propio que colisiona con el dominio canónico.
- **IPSO** (Improved Particle Swarm Optimization, PSO discreto por secuencias de intercambio) — implementado en `paqrap.*`, sin build tool (javac directo). Modelo de datos más cercano al dominio en nombres/formas, pero con desacople de interfaz más profundo (estado mutable interno en vez de contexto inyectado).

**Objetivo de este refactor**: que ambos algoritmos implementen la misma interfaz `Planificador` sobre el mismo modelo de dominio (`com.paqrap.dominio`), de forma que sean intercambiables y comparables sin que ninguno conozca al otro.

## 1. Módulo de dominio canónico — `com.paqrap.dominio`

Este módulo **no existe todavía como código** — es la primera pieza a construir, prerrequisito de todo lo demás. Proviene del diagrama de clases de dominio del proyecto (página 1 del Lucid), ya validado contra los documentos oficiales del curso (Situación Auténtica, Lista de Exigencias, CSV de preguntas y respuestas).

### 1.1 Clases de datos

**`Nodo`**
```
+ x: int
+ y: int
```

**`Ciudad`**
```
+ ancho: int
+ alto: int
+ origen: Nodo
+ distanciaEntreNodos: int
+ callesDobleSentido: boolean

+ esNodoValido(nodo: Nodo): boolean
```

**`Pedido`**
```
+ idPedido: String
+ idCliente: String
+ destino: Nodo
+ cantidadSolicitada: int
+ horasLimite: int
+ fechaIngreso: DateTime
+ fechaLimite: DateTime
+ estado: EstadoPedido
+ entregasParciales: List<ParadaPlanificada>

+ actualizarEstado(instanteActual: DateTime): void
+ cantidadEntregadaTotal(): int
```

**`EstadoPedido`** (enum): `PENDIENTE`, `ENTREGADA`, `INCUMPLIDA`

**`ParadaPlanificada`**
```
+ pedido: Pedido
+ cantidadAEntregar: int
+ estado: EstadoParada
+ fechaEntregada: DateTime
```

**`EstadoParada`** (enum): `PLANIFICADA`, `CUMPLIDA`, `REASIGNADA`

**`Ruta`**
```
+ idRuta: String
+ costoEstimado: float
+ duracionEstimada: float
+ estado: EstadoRuta
+ horaInicioPlanificada: DateTime
+ secuenciaParadas: List<ParadaPlanificada>
+ unidadTransporte: UnidadTransporte

+ cargaTotal(): int
+ marcarParadaCumplida(pedido, cantidadEntregada, instante): void
```

**`EstadoRuta`** (enum): `PLANIFICADA`, `EN_EJECUCION`, `FINALIZADA`, `REEMPLAZADA`

**`UnidadTransporte`**
```
+ idUnidad: String
+ estado: EstadoUnidad
+ posicion: Nodo
+ tipoVehiculo: TipoVehiculo
+ averiaActual: Averia
+ rutas: List<Ruta>
+ tiempoInicioTurnoActual: DateTime
+ horaRefrigerioProgramada: DateTime
+ refrigerioTomado: boolean

+ cargaActual(): int
+ estaDisponibleParaRuta(instante: DateTime): boolean
+ rutaEnEjecucion(): Ruta
```

**`EstadoUnidad`** (enum): `DISPONIBLE`, `EN_RUTA`, `EN_MANTENIMIENTO`, `AVERIADO`

**`TipoVehiculo`**
```
+ id: String
+ nombre: String
+ capacidad: int
+ velocidadKmH: float
+ costoPorKm: float
+ cantidadUnidades: int
+ duracionMantenimientoHoras: float
```

**`Almacen`** (abstract)
```
+ posicion: Nodo

+ tieneStock(cantidad: int): boolean
+ descontarStock(cantidad: int): void
+ recargar(): void
```

**`AlmacenCentral extends Almacen`** — inventario infinito: `tieneStock` siempre `true`, `descontarStock`/`recargar` no-op.

**`AlmacenIntermedio extends Almacen`**
```
+ capacidadMaxima: int
+ nombre: String
+ stockActual: int
```

**`MovimientoInventario`**
```
+ tipo: TipoMovimiento
+ cantidad: int
+ fecha: DateTime
```
**`TipoMovimiento`** (enum): `ENTRADA_RECARGA`, `SALIDA_DESPACHO` *(el diagrama traía un typo `ESNTRADA_RECARGA` — corregir al implementar)*

**`Bloqueo`**
```
+ secuenciaNodos: List<Nodo>  [2..*]   // invariante: polilínea ABIERTA (primero ≠ último)
+ fechaInicio: DateTime
+ fechaFin: DateTime

+ estaVigente(instanteActual: DateTime): boolean
+ interfiereCon(origen: Nodo, destino: Nodo): boolean
```
> Nota de comportamiento (no representable como atributo): si una unidad llega a un nodo bloqueado, la política de navegación es "vuelta en U" — regresa por el mismo tramo por el que llegó. Esto vive en el `Planificador`, no en `Bloqueo`. Fuente: CSV fila 22 col 3.

**`Averia`**
```
+ tipo: TipoAveria
+ fechaInicio: DateTime
+ fechaFinEstimada: DateTime
+ tiempoPermanenciaEnSitioHoras: int
+ fechaTrasladoAlmacen: DateTime
```
**`TipoAveria`** (enum): `TIPO_1`, `TIPO_2`, `TIPO_3`

> **Regla de negocio importante (LE-104)**: el tramo donde ocurre una avería **sigue transitable** — solo `Bloqueo` inhabilita tramos. El planificador nunca debe consultar `Averia` para transitabilidad, solo `Bloqueo.interfiereCon(...)`. Unidades averiadas tipo 2/3 se trasladan instantáneamente al almacén central (`Averia.fechaTrasladoAlmacen`). Fuente: CSV fila 12 col 3.

**`Mantenimiento`**
```
+ vehiculoAfectado: UnidadTransporte
+ fechaInicio: DateTime
+ fechaFinCalculada: DateTime
```

**`ConfiguracionOperacion`**
```
+ duracionTurnoHoras: float
+ horaInicioTurno: float
+ tiempoServicioClienteHoras: float
+ duracionRefrigerioHoras: float
+ margenRefrigerioHoras: float
+ tiempoCargaAlmacenHoras: float
+ tiempoTrasvaseHoras: float

+ inicioTurnoQueContiene(instante: DateTime): DateTime
```

**`ContextoProblema`**
```
+ marcaTiempoActual: DateTime
+ pedidos: List<Pedido>
+ bloqueos: List<Bloqueo>
+ mantenimientos: List<Mantenimiento>
+ almacenes: List<Almacen>
+ vehiculos: List<UnidadTransporte>
+ ciudad: Ciudad
+ configuracionOperacion: ConfiguracionOperacion
```

### 1.2 Servicios de dominio compartidos

**`CalculadorDistancia`** — stateless, sin atributos.
```
+ distanciaKm(ciudad: Ciudad, bloqueos: List<Bloqueo>, instante: DateTime, origen: Nodo, destino: Nodo): double
+ caminoMasCorto(ciudad: Ciudad, bloqueos: List<Bloqueo>, instante: DateTime, origen: Nodo, destino: Nodo): List<Nodo>
```
Implementación recomendada: BFS real sobre la grilla cuando hay bloqueos, Manhattan cuando no los hay (equivalente matemático en grilla ortogonal sin obstáculos) — esta es la lógica que ya tiene `MapaCuadricula` en el código actual de ALNS, es la base técnica a portar aquí. **No** usar penalización fija por bloqueo (eso es lo que hace hoy IPSO con `DistanciaGridConBloqueos`, y no representa el rodeo real).

**`«interface» Planificador`** — el contrato que ambos algoritmos deben implementar:
```java
public interface Planificador {
    List<Ruta> planificarRutas(ContextoProblema contexto);
}
```
Un solo método. No hay `replanificar()` separado — replanificar es volver a invocar `planificarRutas` con un `ContextoProblema` actualizado (refleja el estado post-incidencia). Esto es lo que hace `OrquestadorOperacion` en producción.

**`PlanificadorFactory`** — punto único de instanciación por flag, para producción y para experimentación:
```java
public enum TipoAlgoritmo { ALNS, IPSO }

public class PlanificadorFactory {
    public static Planificador crear(TipoAlgoritmo tipo, Map<String,Object> configDatos) {
        return switch (tipo) {
            case ALNS -> new SolucionadorALNS(ConfiguracionALNS.cargarDesde(configDatos));
            case IPSO -> new PlanificadorIPSO(IPSOConfig.cargarDesde(configDatos));
        };
    }
}
```
Ningún algoritmo conoce al otro. La fábrica es lo único que los conoce a ambos.

### 1.3 Ingesta de archivos y configuración

**`LectorJson`** (compartido, estático, sin estado) — parser JSON genérico:
```
+ parseObjeto(archivo): Map<String,Object> {static}
+ getString/getInt/getDouble/getBoolean/getList/getObject(...) {static}
```
Puede portarse casi literal desde `com.paqrap.configuracion.LectorJson` del código actual de ALNS (ya es genérico, sin dependencia de dominio).

**`CargaArchivo`** (ya existe en el diagrama original de dominio, no inventar de nuevo):
```
+ nombreArchivo: String
+ tipoArchivo: TipoArchivo
+ fechaProceso: DateTime
+ totalRegistros: int

+ procesarArchivo(contenido: String): void
```
**Importante**: recibe el **contenido ya leído** como string, no una ruta. No hace I/O de disco — eso es responsabilidad de `CargadorRecursos`. Parsea el formato propio del curso (`##d##h##m:posX,posY,cIdCliente,qq,hl` según LE-001), **no es JSON**, así que no usa `LectorJson`.

`TipoArchivo` (enum): `PEDIDOS`, `BLOQUEOS`, `MANTENIMIENTO`. *(El enum original también traía `AVERIAS` — se eliminó en el diagrama: las averías se registran en caliente por interfaz según LE-069 v2.0, no por archivo. No la reintroduzcas salvo indicación explícita.)*

**`CargadorRecursos`** (nuevo, compartido) — el único punto del sistema que conoce rutas de carpeta:
```java
public class CargadorRecursos {
    private String carpetaDatos;    // ventas/bloqueos/mantenimiento oficiales
    private String carpetaConfig;   // config-alns.json / config-ipso.json

    public CargaArchivo cargarPedidos(int anio, int mes) { ... }
    public CargaArchivo cargarBloqueos(int anio, int mes) { ... }
    public CargaArchivo cargarMantenimiento(int mes1, int mes2) { ... }
    public Map<String,Object> cargarConfigAlns() { ... }   // usa LectorJson
    public Map<String,Object> cargarConfigIpso() { ... }   // usa LectorJson
}
```
`carpetaDatos`/`carpetaConfig` se inyectan una vez al construir (env vars o args de arranque) — es el único lugar del sistema con conocimiento de filesystem. Ni `CargaArchivo`, ni `ConfiguracionALNS`, ni `IPSOConfig` deben conocer rutas — todos reciben datos ya leídos (string o `Map`).

## 2. Migración de ALNS (`com.paqrap.*` → dominio canónico)

### 2.1 Se elimina (reemplazado 1:1 por el dominio canónico)

`TipoNodo`, `NodoCuadricula`, `Almacen` (propio, extiende `NodoCuadricula`), `EstadoVehiculo`, `TipoVehiculo` (propio), `Pedido` (propio), `Ruta` (propio), `ContextoProblema` (propio), `MapaCuadricula`, `CalculadorDistancia` (propio — el canónico lo reemplaza), `ConfiguracionEntorno` (→ `Ciudad`), `ConfiguracionOperacion` (propia → canónica), `TipoEvento` (propio), `EventoSimulacion` (propio), `GestorLogSimulacion` (propio), `MotorSimulacion` (propio), `SimuladorCincoDias`, `SimuladorColapsoLogistico` (redundantes — el `OrquestadorOperacion` canónico con parámetros `sa/ta/k` ya cubre los 3 escenarios), `LectorJson` (→ compartido), `ConfiguracionSistema` (→ se reduce, ver 2.3), `ConfiguracionSimulacion` (→ pertenece a quien loguea, que ahora es el `OrquestadorOperacion`/`GestorLogSimulacion` canónico, no ALNS), `GeneradorEscenarios` (generador de instancia fija hardcodeada, sale del paquete de ALNS — no es de ningún algoritmo en particular; si se retoma, va en capa de experimentación separada, hoy en pausa).

### 2.2 Se reclasifica, NO se elimina

**`Solucion`** — pese a estar marcada inicialmente como colisión, es **estado interno legítimo de búsqueda** (la solución de trabajo que ALNS muta durante destrucción/reparación — necesaria para cualquier metaheurístico de este tipo). Se mantiene como clase privada de ALNS, pero:
- sus campos pasan a tipar contra `Ruta`/`Pedido` **canónicos**, no los propios de ALNS
- deja de ser el tipo de retorno público — se añade `aRutas(): List<Ruta>` que extrae el contrato antes de devolver desde `SolucionadorALNS.planificarRutas(...)`

### 2.3 Cambian firma, se mantienen

**`«interface» PlanificadorRutas`** → pasa a implementar exactamente `Planificador` del dominio:
```java
// antes: String getNombre(); Solucion resolver(ContextoProblema contexto);
// ahora:
List<Ruta> planificarRutas(ContextoProblema contexto);
```

**`SolucionadorALNS`** — implementa `Planificador`. Conserva sus campos internos (`ConfiguracionALNS`, `GestorPesosAdaptativo` x2, `BusquedaLocalRVND`, `SolucionadorParticionConjuntos`) sin cambios estructurales — solo cambian los tipos que manipulan (canónicos). Método público:
```java
List<Ruta> planificarRutas(ContextoProblema contexto) {
    Solucion sol = construirSolucionInicial(contexto);
    // ... ciclo ALNS igual que hoy ...
    return sol.aRutas();
}
```

**`ConfiguracionALNS`** — se mantiene igual (15 hiperparámetros propios, no colisiona con nada). Gana:
```java
public static ConfiguracionALNS cargarDesde(Map<String,Object> datos) {
    ConfiguracionALNS c = new ConfiguracionALNS();
    c.maxIteraciones = LectorJson.getInt(datos, "maxIteraciones", 350);
    // ... resto de los 15 campos, con los defaults que ya existen hardcodeados hoy
    return c;
}
```
Archivo esperado: `config-alns.json`.

**`EvaluadorCostos`** y **`VerificadorRestricciones`** — se quedan dentro del core de ALNS (decisión explícita: aunque no chocan con el dominio y podrían compartirse, el equipo decidió no promoverlas a capa compartida por ahora). Solo cambian los tipos de sus parámetros: `MapaCuadricula` → `CalculadorDistancia` + `Ciudad` + `List<Bloqueo>` + `DateTime`; `Ruta`/`Pedido`/`ContextoProblema`/`ConfiguracionOperacion` propios → canónicos.

> ⚠️ **Riesgo técnico a verificar al implementar**: `EvaluadorCostos.recalcularRuta` hoy escribe directamente sobre `ruta.getNodosCamino()` (lista plana de nodos) y `ruta.getTiemposLlegada()` (lista paralela de tiempos) — estructura que `Ruta` canónica (`secuenciaParadas: List<ParadaPlanificada>`) no tiene en esa forma. Antes de portar, decidir: (a) extender `ParadaPlanificada` con el detalle de camino/tiempo que ALNS necesita, o (b) que ALNS mantenga esa estructura de trabajo como detalle interno privado (fuera de `Ruta`) y solo al final escriba `secuenciaParadas`. Esto no es un simple rename — puede requerir rediseño real del cronograma interno.

**`GestorPesosAdaptativo<T>`, `BusquedaLocalRVND`, `SolucionadorParticionConjuntos`**, y los operadores (`OperadorDestruccion` + 5 impl., `OperadorReparacion` + 3 impl.) — **no cambian su lógica**, solo los tipos de dato que reciben/devuelven (mismo cambio de `Ruta`/`Pedido`/`EstadoVehiculo` propios a canónicos, propagado desde `Solucion`).

**`ExperimentoComparativo`** — sale del paquete de ALNS (no es de ningún algoritmo, orquesta la comparación de ambos vía `PlanificadorFactory`). Hoy solo instancia `SolucionadorALNS`; al completarse el acople de IPSO, debe instanciar ambos con la misma instancia de `ContextoProblema` y reportar métricas homogéneas: costo total, % entregas a tiempo, tiempo de cómputo, iteración de mejor solución.

## 3. Migración de IPSO (`paqrap.*` → dominio canónico)

### 3.1 Se elimina (reemplazado 1:1 por el dominio canónico)

`PuntoMapa` (interfaz redundante — el equipo decidió usar `Nodo` directo, sin interfaz intermedia), `Nodo` (propio), `Pedido` (propio), `Vehiculo` (propio → `UnidadTransporte`), `TipoVehiculo` (propio), `Almacen` (abstract propio) + `AlmacenCentral` + `AlmacenIntermedio` (propios), `Bloqueo` (propio), `Ruta` (propio), `Reasignacion` (cubierta por `ParadaPlanificada.estado = REASIGNADA` + evento de simulación), `EntregaParcial` (fusionada en `ParadaPlanificada`), `ConfiguracionSemaforo` + `SemaforoColor` (retirado por decisión del equipo — LE-039/040 reclasificado a Deseable, pendiente actualizar Lista de Exigencias formalmente), `DistanciaProveedor` (interfaz) + `DistanciaGridConBloqueos` (reemplazados por `CalculadorDistancia` canónico — la penalización fija de 6 km por bloqueo se descarta, se usa el BFS real).

### 3.2 Cambio estructural más profundo que en ALNS

**`«interface» Planificador`** (la de IPSO) → se **unifica** con la interfaz canónica de dominio, no queda una interfaz IPSO-propia:
```java
// antes: List<Ruta> planificarRutas(); List<Ruta> replanificar();  (sin parámetros)
// ahora:
List<Ruta> planificarRutas(ContextoProblema contexto);
```

**`PlanificadorIPSO`** — pierde **todos** sus campos de estado mutable:
```java
// antes: pedidosPendientes, flota, almacenes, bloqueosActivos, rutasActivas,
//        historialReasignaciones, instanteActual — todo campo de instancia mutable,
//        alimentado por registrarPedido()/registrarBloqueo()/avanzarTiempo()
// ahora, solo:
public class PlanificadorIPSO implements Planificador {
    private IPSOConfig config;   // único campo — hiperparámetros, no estado del problema

    public List<Ruta> planificarRutas(ContextoProblema contexto) {
        // lee pedidos/flota/almacenes/bloqueos directamente de `contexto`
        // en cada llamada, sin guardar nada entre llamadas
    }
}
```
Este es el cambio de diseño más grande de todo el refactor — pasar de estado interno inyectado por setters a un parámetro puro por llamada. Los métodos `registrarPedido`, `registrarBloqueo`, `avanzarTiempo` se eliminan.

**`IPSOConfig`** — se mantiene igual (8 hiperparámetros propios, no colisiona con nada). Gana:
```java
public static IPSOConfig cargarDesde(Map<String,Object> datos) {
    IPSOConfig c = new IPSOConfig();
    c.setTamanoPoblacionN(LectorJson.getInt(datos, "tamanoPoblacionN", 40));
    // ... resto de los 8 campos, con los defaults que ya existen hardcodeados hoy
    return c;
}
```
Archivo esperado: `config-ipso.json`.

**`ClusterizadorPedidos`** — se mantiene sin cambio de lógica (es mecanismo interno puro de IPSO — decisión explícita al portar cluster-first/route-second, patrón no incluido en el pseudocódigo IPSO del informe de selección, agregado por necesidad práctica: el pseudocódigo resuelve una sola permutación, PaqRap necesita repartir pedidos entre múltiples vehículos primero). Solo cambian tipos de parámetros a canónicos (`List<Pedido>`, `List<UnidadTransporte>`, `List<Almacen>`).

**`IPSOOptimizador`** — no cambia su algoritmo (PSO discreto por secuencias de intercambio, cruce de orden, mutación heurística de escape — todo intacto). Solo cambian tipos:
```
- pedidos: List<Pedido>          [canónico]
- deposito: Nodo                 [canónico]
- vehiculo: UnidadTransporte     [canónico]
- calculador: CalculadorDistancia [canónico — reemplaza DistanciaProveedor]
- config: IPSOConfig
- D: double[][]
```

**`Particula`, `OperadorIntercambio`, `ResultadoIPSO`** — mecanismo interno puro, sin cambio de lógica; `ResultadoIPSO.secuenciaOptima` pasa a tipar `List<Pedido>` canónico.

### 3.3 Punto de atención sobre restricciones — no es un bug, pero debe documentarse

ALNS trata capacidad/plazo/turno como **restricción dura** (`VerificadorRestricciones.esRutaFactible` rechaza soluciones inválidas antes de aceptarlas). IPSO las trata como **restricción blanda** (`IPSOOptimizador.costoRuta` las penaliza numéricamente pero nunca descarta una solución por violarlas — `ResultadoIPSO.cumplePlazos` se calcula pero no se usa para rechazar `G_best`). Esto significa que, en instancias difíciles, IPSO puede devolver una ruta que excede capacidad o llega tarde, mientras que ALNS nunca lo haría (dejaría pedidos sin asignar en su lugar). La Situación Auténtica exige cumplimiento de plazos sin excepciones — este es un hallazgo a reportar en la comparación experimental, no algo que deba "arreglarse" silenciosamente sin decisión explícita del equipo.

## 4. Orden de implementación sugerido

1. `com.paqrap.dominio` completo (sección 1.1) — sin esto nada compila.
2. `CalculadorDistancia` + `Planificador` (sección 1.2) — necesarios para ambos algoritmos.
3. Migrar ALNS (sección 2) — motor ya funcional de punta a punta, sirve para validar que el dominio "funciona en la práctica" antes de exigirle a IPSO el cambio de diseño más grande. Resolver primero el riesgo de `ParadaPlanificada` vs. camino nodo-a-nodo (nota de sección 2.3) antes de tocar los 8 operadores.
4. Migrar IPSO (sección 3) — el cambio de `PlanificadorIPSO` es más grande pero mecánicamente más simple una vez que el dominio ya está probado con ALNS.
5. `LectorJson`, `CargaArchivo`, `CargadorRecursos` (sección 1.3) — infraestructura compartida, puede ir en paralelo a 3-4 si hay más de una persona trabajando.
6. `PlanificadorFactory` + `TipoAlgoritmo` — trivial una vez que ambos implementan `Planificador`.
7. `ExperimentoComparativo` real — corre ambos vía la fábrica sobre la misma instancia, reporta métricas homogéneas incluyendo cumplimiento de restricciones (ver 3.3).

## 5. Fuera de alcance de este refactor (pendiente aparte)

- Formato oficial de archivos del curso (`ventas2026mm`, `aaaamm.bloqueadas`, `mant.preventivo.m1.m2`) — `CargaArchivo.procesarArchivo` necesita implementarse para ese formato específico (LE-001/CSV fila 26), hoy solo tiene la firma.
- Banco de instancias variadas para experimentación (hoy `GeneradorEscenarios` solo tenía una instancia fija hardcodeada) — en pausa porque la experimentación real correrá contra archivos oficiales del profesor, no instancias sintéticas.
- Semáforo de riesgo (`ConfiguracionSemaforo`) — RNF (d) de la Situación Auténtica lo exige sin excepciones, pero la Lista de Exigencias (LE-039/040) fue reclasificada a Deseable por decisión del equipo. Actualización formal de la LE pendiente.
