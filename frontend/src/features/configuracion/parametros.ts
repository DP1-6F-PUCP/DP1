import type { AjusteInicial, ConfiguracionActualDTO } from '../../types/backend';

/**
 * Lógica pura de los parámetros del sistema (sin React): formulario, valores oficiales del caso,
 * validación por campo y cálculo de los ajustes a enviar. La comparten la página /configuracion y
 * el modal de la pantalla de inicio (vía useParametrosSistema), para no duplicar el envío.
 *
 * Los inputs guardan strings para permitir edición libre (campo vacío, "0.", etc.); la conversión
 * y validación numérica ocurre al validar/guardar.
 */
export interface TipoForm {
  velocidad: string;
  capacidad: string;
  cantidad: string;
}

export interface AlmacenForm {
  esCentral: boolean;
  x: string;
  y: string;
  capacidad: string;
  frecuencia: string;
}

export type CampoOperacion =
  | 'duracionTurnoHoras'
  | 'horaInicioTurno'
  | 'tiempoServicioClienteHoras'
  | 'duracionRefrigerioHoras'
  | 'margenRefrigerioHoras'
  | 'tiempoCargaAlmacenHoras'
  | 'tiempoTrasvaseHoras'
  | 'maxParadasPorRuta';

export interface FormValues {
  tipos: Record<string, TipoForm>;
  almacenes: Record<string, AlmacenForm>;
  operacion: Record<CampoOperacion, string>;
}

export interface DefCampoOperacion {
  campo: CampoOperacion;
  label: string;
  unidad: string;
  ayuda: string;
  min: number;
  max?: number;
  entero?: boolean;
  paso: number;
  grupo: 'turno' | 'tiempos' | 'rutas';
}

/** Mismo catálogo que ServicioPlanificacionImpl.aplicarCambioConfiguracionOperacionInicial. */
export const CAMPOS_OPERACION: DefCampoOperacion[] = [
  { campo: 'duracionTurnoHoras', label: 'Duración del turno', unidad: 'h', min: 1, max: 24, paso: 0.5, grupo: 'turno',
    ayuda: 'Horas de trabajo de cada conductor por turno.' },
  { campo: 'horaInicioTurno', label: 'Inicio del primer turno', unidad: 'h (0-23)', min: 0, max: 23, paso: 0.5, grupo: 'turno',
    ayuda: 'Hora del día en que arranca el primer turno; los siguientes se encadenan.' },
  { campo: 'duracionRefrigerioHoras', label: 'Duración del refrigerio', unidad: 'h', min: 0, max: 8, paso: 0.5, grupo: 'turno',
    ayuda: 'Pausa obligatoria dentro del turno.' },
  { campo: 'margenRefrigerioHoras', label: 'Margen refrigerio / cambio de turno', unidad: 'h', min: 0, max: 12, paso: 0.5, grupo: 'turno',
    ayuda: 'Distancia mínima entre el refrigerio y el inicio o fin del turno.' },
  { campo: 'tiempoServicioClienteHoras', label: 'Atención por entrega', unidad: 'h', min: 0, max: 24, paso: 0.25, grupo: 'tiempos',
    ayuda: 'Tiempo que el vehículo permanece en el destino entregando.' },
  { campo: 'tiempoCargaAlmacenHoras', label: 'Carga en almacén', unidad: 'h', min: 0, max: 24, paso: 0.25, grupo: 'tiempos',
    ayuda: 'Tiempo para cargar paquetes al pasar por un almacén.' },
  { campo: 'tiempoTrasvaseHoras', label: 'Trasvase por avería', unidad: 'h', min: 0, max: 24, paso: 0.25, grupo: 'tiempos',
    ayuda: 'Tiempo para pasar la carga de un vehículo averiado a otro.' },
  { campo: 'maxParadasPorRuta', label: 'Máx. paradas por ruta', unidad: 'paradas', min: 1, max: 50, entero: true, paso: 1, grupo: 'rutas',
    ayuda: 'Entregas que se pueden encadenar en una misma salida.' },
];

/**
 * Valores oficiales del caso PaqRap. Vienen del servidor (GET /configuracion/oficial, perfil
 * inmutable en la base): única fuente de verdad, antes copiada aquí. La configuración vigente
 * (/configuracion) no sirve como "por defecto" porque conserva los ajustes de ejecuciones anteriores.
 */
export interface ValoresOficiales {
  tipos: Record<string, { velocidad: number; capacidad: number; cantidad: number }>;
  almacenes: Record<string, { x: number; y: number; capacidad?: number; frecuencia?: number }>;
  operacion: Record<CampoOperacion, number>;
}

const CAPACIDAD_ALMACEN_OFICIAL = 1000;
const FRECUENCIA_RECARGA_OFICIAL = 24;

export const desdeConfiguracion = (config: ConfiguracionActualDTO): FormValues => ({
  tipos: Object.fromEntries(
    config.tiposVehiculo.map((t) => [
      t.id,
      {
        velocidad: String(t.velocidadKmH),
        capacidad: String(t.capacidad),
        cantidad: String(t.cantidadUnidades ?? 0),
      },
    ]),
  ),
  almacenes: Object.fromEntries(
    config.almacenes.map((a) => [
      a.nombre,
      {
        esCentral: a.esCentral,
        x: String(a.posX),
        y: String(a.posY),
        capacidad: a.esCentral ? '' : String(a.capacidadMaxima || CAPACIDAD_ALMACEN_OFICIAL),
        frecuencia: a.esCentral ? '' : String(a.frecuenciaRecargaHoras || FRECUENCIA_RECARGA_OFICIAL),
      },
    ]),
  ),
  operacion: Object.fromEntries(
    CAMPOS_OPERACION.map(({ campo }) => [campo, String(config.operacion[campo])]),
  ) as Record<CampoOperacion, string>,
});

/** Proyecta ajustes (pendientes o ya programados) sobre los valores vigentes. */
export const aplicarAjustes = (base: FormValues, ajustes: AjusteInicial[]): FormValues => {
  const form: FormValues = structuredClone(base);
  for (const { tipoSolicitud, entidadObjetivo: id, valorNuevo } of ajustes) {
    const tipo = form.tipos[id];
    const almacen = form.almacenes[id];
    switch (tipoSolicitud) {
      case 'CAMBIO_VELOCIDAD':
        if (tipo) tipo.velocidad = valorNuevo;
        break;
      case 'CAMBIO_CAPACIDAD':
        if (tipo) tipo.capacidad = valorNuevo;
        break;
      case 'CAMBIO_CANTIDAD_VEHICULOS':
        if (tipo) tipo.cantidad = valorNuevo;
        break;
      case 'CAMBIO_CAPACIDAD_ALMACEN':
        if (almacen) almacen.capacidad = valorNuevo;
        break;
      case 'CAMBIO_FRECUENCIA_RECARGA':
        if (almacen) almacen.frecuencia = valorNuevo;
        break;
      case 'CAMBIO_POSICION_ALMACEN':
        if (almacen) [almacen.x, almacen.y] = valorNuevo.split(',').map((v) => v.trim());
        break;
      case 'CAMBIO_CONFIGURACION_OPERACION':
        if (id in form.operacion) form.operacion[id as CampoOperacion] = valorNuevo;
        break;
      default:
        break;
    }
  }
  return form;
};

/**
 * Valores oficiales sobre la estructura actual. `soloEnCaliente`: conserva los campos que solo se
 * definen al inicio (cantidad de flota y posición de almacén), que durante la simulación no se tocan.
 */
export const valoresOficiales = (actual: FormValues, soloEnCaliente: boolean, oficiales: ValoresOficiales): FormValues => {
  const form: FormValues = structuredClone(actual);
  for (const [id, tipo] of Object.entries(form.tipos)) {
    const oficial = oficiales.tipos[id];
    if (!oficial) continue;
    tipo.velocidad = String(oficial.velocidad);
    tipo.capacidad = String(oficial.capacidad);
    if (!soloEnCaliente) tipo.cantidad = String(oficial.cantidad);
  }
  for (const [nombre, almacen] of Object.entries(form.almacenes)) {
    const oficial = oficiales.almacenes[nombre];
    if (!oficial) continue;
    if (!soloEnCaliente) {
      almacen.x = String(oficial.x);
      almacen.y = String(oficial.y);
    }
    if (!almacen.esCentral) {
      if (oficial.capacidad !== undefined) almacen.capacidad = String(oficial.capacidad);
      if (oficial.frecuencia !== undefined) almacen.frecuencia = String(oficial.frecuencia);
    }
  }
  for (const { campo } of CAMPOS_OPERACION) {
    if (oficiales.operacion[campo] !== undefined) form.operacion[campo] = String(oficiales.operacion[campo]);
  }
  return form;
};

const esNumero = (v: string) => v.trim() !== '' && Number.isFinite(Number(v));
const esEntero = (v: string) => esNumero(v) && Number.isInteger(Number(v));

/** Clave de error por campo: `tipo.AUTO.velocidad`, `almacen.Este.x`, `op.maxParadasPorRuta`, `flota`. */
export type ErroresForm = Record<string, string>;

export const claveTipo = (id: string, campo: keyof TipoForm) => `tipo.${id}.${campo}`;
export const claveAlmacen = (nombre: string, campo: keyof Omit<AlmacenForm, 'esCentral'>) => `almacen.${nombre}.${campo}`;
export const claveOperacion = (campo: CampoOperacion) => `op.${campo}`;

/** Bloque (pestaña) al que pertenece una clave de error, para marcar la pestaña con errores. */
export const bloqueDeClave = (clave: string): 'flota' | 'almacenes' | 'operacion' =>
  clave.startsWith('almacen.') ? 'almacenes' : clave.startsWith('op.') ? 'operacion' : 'flota';

/** Validación en línea: un mensaje por campo inválido (vacío = todo válido). */
export const validarCampos = (form: FormValues, config: ConfiguracionActualDTO): ErroresForm => {
  const errores: ErroresForm = {};
  for (const t of config.tiposVehiculo) {
    const f = form.tipos[t.id];
    if (!f) continue;
    if (!esNumero(f.velocidad) || Number(f.velocidad) <= 0) errores[claveTipo(t.id, 'velocidad')] = 'Debe ser un número mayor que 0';
    else if (Number(f.velocidad) > 200) errores[claveTipo(t.id, 'velocidad')] = 'Máximo 200 km/h';
    if (!esEntero(f.capacidad) || Number(f.capacidad) <= 0) errores[claveTipo(t.id, 'capacidad')] = 'Entero mayor que 0';
    if (!esEntero(f.cantidad) || Number(f.cantidad) < 0) errores[claveTipo(t.id, 'cantidad')] = 'Entero de 0 o más';
  }
  if (config.tiposVehiculo.length > 0 && config.tiposVehiculo.every((t) => Number(form.tipos[t.id]?.cantidad ?? 0) === 0)) {
    errores.flota = 'La flota debe tener al menos una unidad';
  }
  for (const a of config.almacenes) {
    const f = form.almacenes[a.nombre];
    if (!f) continue;
    for (const [eje, limite] of [['x', config.ciudad.ancho], ['y', config.ciudad.alto]] as const) {
      const v = f[eje];
      if (!esEntero(v)) errores[claveAlmacen(a.nombre, eje)] = 'Entero';
      else if (Number(v) < 0 || Number(v) > limite) errores[claveAlmacen(a.nombre, eje)] = `Entre 0 y ${limite}`;
    }
    if (!f.esCentral) {
      if (!esEntero(f.capacidad) || Number(f.capacidad) <= 0) errores[claveAlmacen(a.nombre, 'capacidad')] = 'Entero mayor que 0';
      if (!esNumero(f.frecuencia) || Number(f.frecuencia) <= 0) errores[claveAlmacen(a.nombre, 'frecuencia')] = 'Número mayor que 0';
    }
  }
  for (const { campo, min, max, entero } of CAMPOS_OPERACION) {
    const v = form.operacion[campo];
    if (!(entero ? esEntero(v) : esNumero(v))) errores[claveOperacion(campo)] = entero ? 'Debe ser un entero' : 'Debe ser un número';
    else if (Number(v) < min || (max !== undefined && Number(v) > max)) {
      errores[claveOperacion(campo)] = max !== undefined ? `Entre ${min} y ${max}` : `Mínimo ${min}`;
    }
  }
  const turno = Number(form.operacion.duracionTurnoHoras);
  const refrigerio = Number(form.operacion.duracionRefrigerioHoras);
  if (!errores[claveOperacion('duracionRefrigerioHoras')] && !errores[claveOperacion('duracionTurnoHoras')] && refrigerio >= turno) {
    errores[claveOperacion('duracionRefrigerioHoras')] = 'Debe ser menor que la duración del turno';
  }
  return errores;
};

/**
 * Ajustes que difieren de `referencia`. `enCaliente`: restringe a los tipos que el equipo aceptó
 * como seguros en caliente -- velocidad, capacidad de carga, capacidad/frecuencia de almacén y
 * parámetros de operación. Cantidad de flota y posición de almacén quedan fuera en caliente por
 * decisión explícita del equipo (la flota "solo al inicio" según el caso), no por el backend.
 */
export const calcularAjustes = (form: FormValues, referencia: FormValues, enCaliente: boolean): AjusteInicial[] => {
  const ajustes: AjusteInicial[] = [];
  const agregar = (tipoSolicitud: AjusteInicial['tipoSolicitud'], entidadObjetivo: string, nuevo: string, actual: string) => {
    if (Number(nuevo) !== Number(actual)) ajustes.push({ tipoSolicitud, entidadObjetivo, valorNuevo: String(Number(nuevo)) });
  };
  for (const [id, f] of Object.entries(form.tipos)) {
    const b = referencia.tipos[id];
    if (!b) continue;
    agregar('CAMBIO_VELOCIDAD', id, f.velocidad, b.velocidad);
    agregar('CAMBIO_CAPACIDAD', id, f.capacidad, b.capacidad);
    if (!enCaliente) agregar('CAMBIO_CANTIDAD_VEHICULOS', id, f.cantidad, b.cantidad);
  }
  for (const [nombre, f] of Object.entries(form.almacenes)) {
    const b = referencia.almacenes[nombre];
    if (!b) continue;
    if (!enCaliente && (Number(f.x) !== Number(b.x) || Number(f.y) !== Number(b.y))) {
      ajustes.push({ tipoSolicitud: 'CAMBIO_POSICION_ALMACEN', entidadObjetivo: nombre, valorNuevo: `${Number(f.x)},${Number(f.y)}` });
    }
    if (!f.esCentral) {
      agregar('CAMBIO_CAPACIDAD_ALMACEN', nombre, f.capacidad, b.capacidad);
      agregar('CAMBIO_FRECUENCIA_RECARGA', nombre, f.frecuencia, b.frecuencia);
    }
  }
  for (const { campo } of CAMPOS_OPERACION) {
    agregar('CAMBIO_CONFIGURACION_OPERACION', campo, form.operacion[campo], referencia.operacion[campo]);
  }
  return ajustes;
};

/** Une ajustes: el más reciente gana para el mismo tipo + entidad. */
export const unirAjustes = (previos: AjusteInicial[], nuevos: AjusteInicial[]): AjusteInicial[] => {
  const clave = (a: AjusteInicial) => `${a.tipoSolicitud}|${a.entidadObjetivo}`;
  const mapa = new Map(previos.map((a) => [clave(a), a]));
  for (const a of nuevos) mapa.set(clave(a), a);
  return [...mapa.values()];
};

/** Campos cuyo valor numérico difiere (para marcar "modificado" junto a cada campo). */
export const distinto = (a: string | undefined, b: string | undefined) =>
  (a ?? '').trim() !== (b ?? '').trim() && !(esNumero(a ?? '') && esNumero(b ?? '') && Number(a) === Number(b));
