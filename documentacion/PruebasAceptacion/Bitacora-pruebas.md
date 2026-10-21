# Bitácora de pruebas de aceptación de PaqRap

Fecha de ejecución: 21/10/2026. Zona: America/Lima.

## Resultado de la primera ejecución

31 aprobados, 8 fallidos y 1 bloqueado. No se considera aceptado el sistema. La aprobación indicada corresponde al alcance y canal documentados en cada caso; una comprobación por API no certifica por sí sola la interfaz.

Los 40 casos tienen estado registrado. El representante válido de CPA-040 no pudo prepararse porque no existe un esquema aprobado de importación de flota. No se modificó ningún archivo de código fuente durante la ejecución; se verificaron sus huellas contra el registro inicial.

## Casos y resultados

| Caso | Estado | Canal | Resultado real |
|---|---|---|---|
| CPA-001 | Aprobado | Interfaz, API | Pedido válido cargado con todos los datos esperados. |
| CPA-002 | Aprobado | Interfaz, API | Archivo incompleto rechazado con HTTP 400 INVALID_ARGUMENT, sin insertar pedidos. |
| CPA-003 | Aprobado | Interfaz, API | Cliente vacío rechazado; HTTP 400 INVALID_ARGUMENT y ningún pedido insertado. |
| CPA-004 | Aprobado | Interfaz, API | Cantidad no numérica rechazada; HTTP 400 INVALID_ARGUMENT y ningún pedido insertado. |
| CPA-005 | Aprobado | Interfaz, API | Fecha de venta imposible rechazada; HTTP 400 INVALID_ARGUMENT y ningún pedido insertado. |
| CPA-006 | Aprobado | Interfaz, API | Archivo mixto rechazado completo, sin guardar la línea válida; HTTP 400 INVALID_ARGUMENT y ningún pedido insertado. |
| CPA-007 | Aprobado | Interfaz, API | Comentario y línea vacía ignorados; se incorpora exactamente un pedido válido. |
| CPA-008 | Aprobado | Interfaz, API | Nombre de archivo desconocido rechazado; HTTP 400 INVALID_ARGUMENT y ningún pedido insertado. |
| CPA-009 | Aprobado | API | Bloqueo correctamente importado. Vigencia falsa/verdadera/falsa antes, durante y después; una ruta con entrega evita los nodos bloqueados. |
| CPA-010 | Aprobado | Interfaz, API | Poligonal incompleta rechazada; HTTP 400 INVALID_ARGUMENT y ningún pedido insertado. |
| CPA-011 | Aprobado | API | El bloqueo se interpreta del 30/09 23:00 al 01/10 01:00; no hay duración negativa. |
| CPA-012 | Aprobado | API | TA01 entra EN_MANTENIMIENTO y no recibe rutas con pedidos en el lote observado. |
| CPA-013 | Aprobado | Interfaz, API | Fecha imposible de mantenimiento rechazada; HTTP 400 INVALID_ARGUMENT y ningún pedido insertado. |
| CPA-014 | Aprobado | API | DIA_A_DIA creado con identificador y fecha solicitada. |
| CPA-015 | Aprobado | API | CINCO_DIAS creado con fecha solicitada y k=150. No se certifica duración total ni punto de colapso. |
| CPA-016 | Aprobado | API | COLAPSO_LOGISTICO creado con fecha solicitada y k=10. No se certifica duración total ni punto de colapso. |
| CPA-017 | Aprobado | API | Tipo ausente rechazado con 400 VALIDATION_ERROR; no se crea ejecución. |
| CPA-018 | Aprobado | Interfaz, API | Una segunda solicitud de otro escenario devuelve la ejecución activa original; misma fecha, tipo e id. |
| CPA-019 | Aprobado | API | PAUSADA; reloj y estado conservados durante más de un intervalo de lote (21 s). |
| CPA-020 | Aprobado | API | Reanudación conserva el id, cambia a EN_CURSO y el reloj avanza. |
| CPA-021 | Aprobado | API | Detención FINALIZADA; instantánea operativa idéntica tras 21 s y último estado consultable. |
| CPA-022 | Aprobado | API | Reanudar una ejecución terminada devuelve 409 INVALID_STATE y conserva FINALIZADA. |
| CPA-023 | Aprobado | API | Identificador inexistente devuelve 400 INVALID_ARGUMENT. |
| CPA-024 | Aprobado | API | El filtro pendiente en minúsculas devuelve el único pedido PENDIENTE y coincide con la consulta sin filtro. |
| CPA-025 | Aprobado | API | El filtro NO_EXISTE devuelve HTTP 200 y lista vacía. |
| CPA-026 | Aprobado | API | Entidad vacía rechazada con 400 VALIDATION_ERROR; velocidad original conservada. |
| CPA-027 | Fallido | Interfaz, API | La API sí aplica el cambio, pero Guardar Parámetros en la interfaz confirma velocidad 35 y el servidor conserva 40.0. |
| CPA-028 | Aprobado | API | Capacidad MOTO cambiada a 10 antes de la llegada de un pedido de 9; se verifica la asignación posterior y la carga real. |
| CPA-029 | Fallido | Interfaz, API | La API sí amplía a 17, pero Guardar Parámetros en pantalla confirma 17 MOTO y el servidor mantiene 15. |
| CPA-030 | Aprobado | API | Solicitud de total 3 conserva las cinco MOTO que ya estaban en ruta y retira las diez libres. |
| CPA-031 | Fallido | Interfaz, API | La API sí actualiza capacidad, pero Guardar Parámetros en pantalla confirma 1200 y Nor-Oeste sigue con 1000. Central también aparece editable. |
| CPA-032 | Aprobado | API | Este se mueve a (56,27) dentro de ciudad y la ejecución continúa. |
| CPA-033 | Aprobado | API | La posición (999,999) es descartada; conserva la posición válida previa (56,27), sin detener el reloj. |
| CPA-034 | Fallido | Interfaz, API | La recarga de 12 h funciona por API frente al control de 24 h, pero la interfaz actual no ofrece el control Frecuencia recarga requerido por el caso. |
| CPA-035 | Aprobado | API | Cambio de ciudad en caliente rechazado con 400; ancho permanece 70. |
| CPA-036 | Fallido | Interfaz, API | TA01 sigue AVERIADO a las 13:40 después de una avería programada a las 07:50 con duración prevista de 2 h. Aplicación, posición y contador correctos; recuperación no observada tras el plazo. |
| CPA-037 | Fallido | Interfaz, API | TA01 sigue AVERIADO a las 13:40 después de una avería programada a las 07:50 con duración prevista de 4 h. Aplicación, posición y contador correctos; recuperación no observada tras el plazo. |
| CPA-038 | Fallido | API | Criterio propuesto incumplido: valor -5 recibió HTTP 200; velocidad AUTO observada -5.0. |
| CPA-039 | Fallido | API | Criterio propuesto incumplido: cantidad -1 aceptada con HTTP 200; pedido almacenado con esa cantidad. |
| CPA-040 | Bloqueado | Interfaz, API, Inspección de código | La pantalla muestra flota-invalida.json como activo sin error. No se observa importación al backend. Falta un esquema aprobado para preparar y ejecutar el representante válido; caso completo no certificable. |

## Incidencias

Se registran siete incidencias. Su prioridad es de evaluación y debe confirmarse con el equipo.

### UI-001 Media

Aviso de error con icono verde de éxito. Los archivos rechazados figuran como activos; en CPA-003 a CPA-006 y CPA-013 la vista cuenta registros que no fueron guardados en el backend.

### INT-001 Alta

Guardar Parámetros solo conserva valores en el navegador. Tras pedir AUTO 35, MOTO 17 y Nor-Oeste 1200, el servidor mantiene 40, 15 y 1000 después de otro lote. La API sí aplica los mismos tipos de cambio. El Central aparece editable.

### FUN-001 Alta

La interfaz renderizada no incluye el control Frecuencia recarga. La comprobación API con un límite de ciclo al mediodía sí verifica recarga cada 12 h.

### SIM-001 Alta

TA01 sigue AVERIADO después de los plazos previstos de 2 h y 4 h. Inyección a las 07:50 y último estado observado a las 13:40 en CINCO_DIAS con k=150. El tipo 1 conserva posición y el tipo 2 llega al Central, pero ninguno se reincorpora durante el seguimiento.

### VAL-001 Alta

La API acepta y aplica velocidad AUTO 0 y -5. Fallo contra el criterio propuesto de velocidad positiva; requiere ratificación funcional.

### VAL-002 Alta

La carga acepta pedidos con cantidad 0 y -1, en dos backend limpios independientes. Fallo contra el criterio propuesto de cantidad positiva; requiere ratificación funcional.

### IMP-001 Media

La carga de flota muestra el nombre del archivo sin validación ni llamada de importación. Se requiere definir un esquema válido y completar el flujo antes de certificar el caso.

## Evidencias y versión

- `evidencias/registro-ejecucion.json` contiene resultados, comprobaciones, variantes, relaciones con archivos y huellas SHA-256.
- `evidencias/CPA-xxx-api-nn.json` conserva petición, URL, respuesta y orden de las consultas. Los nombres con respuesta corresponden al primer lote de cargas.
- Las capturas `CPA-xxx-pantalla.png` y `UI-002-*.png` muestran las acciones de interfaz.
- `evidencias/logs` conserva las bitácoras de los backend aislados.
- `datos-prueba` contiene las cargas manuales. Las cargas programadas y ajustes iniciales figuran también en las respuestas y bitácoras del entorno.
- La copia no contiene .git; no se atribuye un commit. El hash del archivo ejecutable se guarda en el registro.

## Método y límites

Backend compilado con Java 21; frontend con Vite. Ejecución local en puertos 8080 y 5173. Se reinició únicamente el backend de pruebas entre grupos. Se usaron datos aislados, no una carga completa de producción. Las pruebas de control observaron más de un intervalo de lote cuando correspondía.

CPA-009 se ensayó con tres inicios aislados antes, durante y después de la vigencia; los pedidos usados en cada inicio tienen fecha coincidente para evitar el descarte de datos históricos. CPA-028 aisló las MOTO y verificó una asignación nueva de nueve paquetes después de subir capacidad a diez. CPA-030 preparó exactamente cinco motos ocupadas y diez libres. CPA-033 usó como posición previa (56,27), proveniente del cambio válido anterior.

CPA-034 comparó 24 h frente a 12 h cruzando el mediodía simulado, con capacidad 1200 y stock inicial 1000. Su API pasa, pero falta el control en la interfaz. CPA-036 y CPA-037 se ejecutaron en CINCO_DIAS con k=150 y flota preparada; sus duraciones reales en DIA_A_DIA y estados internos de cada parada no quedan certificados. Se conservaron los registros de preparación y de repeticiones; no se eliminaron intentos inconclusos.

Los casos CPA-038 a CPA-040 contienen criterios propuestos, pendientes de ratificación funcional. Iniciar CINCO_DIAS o COLAPSO_LOGISTICO no certifica duración total, estabilidad prolongada ni el punto de colapso.

## Pendientes de cierre

1. Corregir y repetir los ocho casos fallidos, conservando esta primera ejecución como referencia.
2. Definir el esquema y archivo válido de importación de flota para desbloquear CPA-040.
3. Ratificar los criterios propuestos; completar las comprobaciones de interfaz y estados internos indicadas como límites.
4. Revisar evidencias y obtener conformidad del responsable funcional.

El Word y PDF con sufijo ejecutado incorporan estos estados y el informe de ejecución. El catálogo original se mantiene como especificación previa.
