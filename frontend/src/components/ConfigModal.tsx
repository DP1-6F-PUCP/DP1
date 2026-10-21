import React, { useEffect, useMemo, useState } from 'react';
import {
  Bike,
  Car,
  Check,
  Clock,
  Gauge,
  RotateCcw,
  Settings,
  Sun,
  Moon,
  Warehouse,
  X,
} from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useEstadoOperacion } from '../hooks/useEstadoOperacion';
import { useThemeStore } from '../store/themeStore';
import { useConfigInicialStore } from '../store/configInicialStore';
import { useScenarioStore } from '../store/scenarioStore';
import { UMBRALES_SEMAFORO_DEFAULT, useSemaforoStore } from '../store/semaforoStore';
import { escenariosApi } from '../services/escenariosApi';
import { toBackendInstant } from '../utils/backendTime';
import { useToast } from './ToastProvider';
import type { AjusteInicial, ConfiguracionActualDTO } from '../types/backend';

const ESTADOS_ACTIVOS = new Set(['INICIADA', 'EN_CURSO', 'PAUSADA']);

interface ConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * Parámetros del sistema. Dos modos según haya o no una ejecución activa:
 *  - Sin ejecución: se guardan como ajustes pendientes (store/configInicialStore) y viajan al
 *    backend como `ajustesIniciales` al pulsar "Iniciar Simulación".
 *  - Con ejecución: se envían en caliente (POST /escenarios/{id}/solicitudes) al instante simulado
 *    actual, y el backend los aplica en el próximo lote. La cantidad de vehículos queda bloqueada:
 *    según el caso, la flota solo se define al inicio.
 * En ambos casos solo se envía lo que difiere de la configuración vigente del servidor.
 *
 * Los inputs guardan strings para permitir edición libre (campo vacío, "0.", etc.); la conversión
 * y validación numérica ocurre recién al guardar.
 */
interface TipoForm {
  velocidad: string;
  capacidad: string;
  cantidad: string;
}

interface AlmacenForm {
  esCentral: boolean;
  x: string;
  y: string;
  capacidad: string;
  frecuencia: string;
}

interface FormValues {
  tipos: Record<string, TipoForm>;
  almacenes: Record<string, AlmacenForm>;
  operacion: Record<CampoOperacion, string>;
}

type CampoOperacion =
  | 'duracionTurnoHoras'
  | 'horaInicioTurno'
  | 'tiempoServicioClienteHoras'
  | 'duracionRefrigerioHoras'
  | 'margenRefrigerioHoras'
  | 'tiempoCargaAlmacenHoras'
  | 'tiempoTrasvaseHoras'
  | 'maxParadasPorRuta';

/** Mismo catálogo que ServicioPlanificacionImpl.aplicarCambioConfiguracionOperacionInicial. */
const CAMPOS_OPERACION: { campo: CampoOperacion; label: string; min: number; max?: number; entero?: boolean }[] = [
  { campo: 'duracionTurnoHoras', label: 'Duración de turno (h)', min: 1, max: 24 },
  { campo: 'horaInicioTurno', label: 'Inicio del primer turno (0-23 h)', min: 0, max: 23 },
  { campo: 'tiempoServicioClienteHoras', label: 'Atención por entrega (h)', min: 0 },
  { campo: 'duracionRefrigerioHoras', label: 'Duración de refrigerio (h)', min: 0 },
  { campo: 'margenRefrigerioHoras', label: 'Margen refrigerio vs. cambio de turno (h)', min: 0 },
  { campo: 'tiempoCargaAlmacenHoras', label: 'Carga en almacén (h)', min: 0 },
  { campo: 'tiempoTrasvaseHoras', label: 'Trasvase por avería (h)', min: 0 },
  { campo: 'maxParadasPorRuta', label: 'Máx. paradas por ruta', min: 1, entero: true },
];

/**
 * Valores oficiales del caso PaqRap (situación auténtica + PaqRapConfig). El backend conserva los
 * ajustes de ejecuciones anteriores (su configuración es estado compartido), así que "por defecto"
 * no puede leerse del servidor: tiene que venir de aquí.
 */
const VALORES_OFICIALES = {
  tipos: {
    AUTO: { velocidad: 40, capacidad: 24, cantidad: 10 },
    MOTO: { velocidad: 25, capacidad: 8, cantidad: 15 },
    BICI: { velocidad: 12, capacidad: 4, cantidad: 12 },
  } as Record<string, { velocidad: number; capacidad: number; cantidad: number }>,
  almacenes: {
    Central: { x: 27, y: 14 },
    'Nor-Oeste': { x: 12, y: 38, capacidad: 1000, frecuencia: 24 },
    Este: { x: 57, y: 27, capacidad: 1000, frecuencia: 24 },
  } as Record<string, { x: number; y: number; capacidad?: number; frecuencia?: number }>,
  operacion: {
    duracionTurnoHoras: 8,
    horaInicioTurno: 7,
    tiempoServicioClienteHoras: 1,
    duracionRefrigerioHoras: 1,
    margenRefrigerioHoras: 1,
    tiempoCargaAlmacenHoras: 0,
    tiempoTrasvaseHoras: 0.5,
    maxParadasPorRuta: 2,
  } as Record<CampoOperacion, number>,
};

const desdeConfiguracion = (config: ConfiguracionActualDTO): FormValues => ({
  tipos: Object.fromEntries(
    config.tiposVehiculo.map((t) => [
      t.id,
      { velocidad: String(t.velocidadKmH), capacidad: String(t.capacidad), cantidad: String(t.cantidadUnidades) },
    ]),
  ),
  almacenes: Object.fromEntries(
    config.almacenes.map((a) => [
      a.nombre,
      {
        esCentral: a.esCentral,
        x: String(a.posX),
        y: String(a.posY),
        capacidad: a.esCentral ? '' : String(a.capacidadMaxima),
        frecuencia: a.esCentral ? '' : String(a.frecuenciaRecargaHoras),
      },
    ]),
  ),
  operacion: Object.fromEntries(
    CAMPOS_OPERACION.map(({ campo }) => [campo, String(config.operacion[campo])]),
  ) as Record<CampoOperacion, string>,
});

/** Proyecta los ajustes pendientes sobre los valores vigentes, para reabrir el modal donde se dejó. */
const aplicarAjustes = (base: FormValues, ajustes: AjusteInicial[]): FormValues => {
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

const valoresOficiales = (base: FormValues): FormValues => {
  const form: FormValues = structuredClone(base);
  for (const [id, tipo] of Object.entries(form.tipos)) {
    const oficial = VALORES_OFICIALES.tipos[id];
    if (!oficial) continue;
    tipo.velocidad = String(oficial.velocidad);
    tipo.capacidad = String(oficial.capacidad);
    tipo.cantidad = String(oficial.cantidad);
  }
  for (const [nombre, almacen] of Object.entries(form.almacenes)) {
    const oficial = VALORES_OFICIALES.almacenes[nombre];
    if (!oficial) continue;
    almacen.x = String(oficial.x);
    almacen.y = String(oficial.y);
    if (!almacen.esCentral) {
      almacen.capacidad = String(oficial.capacidad);
      almacen.frecuencia = String(oficial.frecuencia);
    }
  }
  for (const { campo } of CAMPOS_OPERACION) {
    form.operacion[campo] = String(VALORES_OFICIALES.operacion[campo]);
  }
  return form;
};

const esNumero = (v: string) => v.trim() !== '' && Number.isFinite(Number(v));
const esEntero = (v: string) => esNumero(v) && Number.isInteger(Number(v));

/** Devuelve el primer error de validación, o null si todo es válido. */
const validar = (form: FormValues, config: ConfiguracionActualDTO): string | null => {
  for (const t of config.tiposVehiculo) {
    const f = form.tipos[t.id];
    if (!f) continue;
    if (!esNumero(f.velocidad) || Number(f.velocidad) <= 0) return `Velocidad inválida para ${t.nombre}`;
    if (!esEntero(f.capacidad) || Number(f.capacidad) <= 0) return `Capacidad inválida para ${t.nombre}`;
    if (!esEntero(f.cantidad) || Number(f.cantidad) < 0) return `Cantidad de unidades inválida para ${t.nombre}`;
  }
  if (config.tiposVehiculo.every((t) => Number(form.tipos[t.id]?.cantidad ?? 0) === 0)) {
    return 'La flota debe tener al menos una unidad';
  }
  for (const a of config.almacenes) {
    const f = form.almacenes[a.nombre];
    if (!f) continue;
    if (!esEntero(f.x) || !esEntero(f.y)) return `Posición inválida para el almacén ${a.nombre}`;
    const x = Number(f.x);
    const y = Number(f.y);
    if (x < 0 || y < 0 || x > config.ciudad.ancho || y > config.ciudad.alto) {
      return `El almacén ${a.nombre} queda fuera de la ciudad (0-${config.ciudad.ancho}, 0-${config.ciudad.alto})`;
    }
    if (!f.esCentral) {
      if (!esEntero(f.capacidad) || Number(f.capacidad) <= 0) return `Capacidad inválida para el almacén ${a.nombre}`;
      if (!esNumero(f.frecuencia) || Number(f.frecuencia) <= 0) return `Frecuencia de recarga inválida para ${a.nombre}`;
    }
  }
  for (const { campo, label, min, max, entero } of CAMPOS_OPERACION) {
    const v = form.operacion[campo];
    if (!(entero ? esEntero(v) : esNumero(v))) return `${label}: valor inválido`;
    if (Number(v) < min || (max !== undefined && Number(v) > max)) return `${label}: fuera de rango`;
  }
  return null;
};

/**
 * Solo lo que difiere de la configuración vigente: el backend la conserva entre ejecuciones.
 * `enCaliente`: restringe los tipos de ajuste a los 4 que el equipo aceptó como seguros en caliente
 * -- velocidad, capacidad de carga, capacidad/frecuencia de almacén y parámetros de operación. La
 * cantidad de flota ya está bloqueada en el formulario (ver el input `disabled`); posición de
 * almacén y ciudad quedan fuera de este modal en caliente por decisión explícita del equipo, no
 * por una restricción del backend (que sí la permite, ver ServicioPlanificacionImpl).
 */
const calcularAjustes = (form: FormValues, base: FormValues, enCaliente: boolean): AjusteInicial[] => {
  const ajustes: AjusteInicial[] = [];
  const agregar = (tipoSolicitud: AjusteInicial['tipoSolicitud'], entidadObjetivo: string, nuevo: string, actual: string) => {
    if (Number(nuevo) !== Number(actual)) ajustes.push({ tipoSolicitud, entidadObjetivo, valorNuevo: String(Number(nuevo)) });
  };
  for (const [id, f] of Object.entries(form.tipos)) {
    const b = base.tipos[id];
    if (!b) continue;
    agregar('CAMBIO_VELOCIDAD', id, f.velocidad, b.velocidad);
    agregar('CAMBIO_CAPACIDAD', id, f.capacidad, b.capacidad);
    if (!enCaliente) agregar('CAMBIO_CANTIDAD_VEHICULOS', id, f.cantidad, b.cantidad);
  }
  for (const [nombre, f] of Object.entries(form.almacenes)) {
    const b = base.almacenes[nombre];
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
    agregar('CAMBIO_CONFIGURACION_OPERACION', campo, form.operacion[campo], base.operacion[campo]);
  }
  return ajustes;
};

const inputClass =
  'h-8 w-full rounded-lg border border-slate-700 bg-[#0f172a] px-2 text-xs font-mono-code text-slate-100 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20';

const IconoTipo: React.FC<{ id: string }> = ({ id }) => {
  const lower = id.toLowerCase();
  if (lower.includes('moto')) return <Bike className="h-3 w-3 text-purple-400" />;
  if (lower.includes('bici')) return <Bike className="h-3 w-3 text-emerald-400" />;
  return <Car className="h-3 w-3 text-blue-400" />;
};

export const ConfigModal: React.FC<ConfigModalProps> = ({ isOpen, onClose }) => {
  const { isDark, setTheme } = useThemeStore();
  const { configuracion, estadoRaw } = useEstadoOperacion();
  const ajustesPendientes = useConfigInicialStore((s) => s.ajustesPendientes);
  const setAjustesPendientes = useConfigInicialStore((s) => s.setAjustesPendientes);
  const ejecucion = useScenarioStore((s) => s.ejecucion);
  const umbralesGuardados = useSemaforoStore((s) => s.umbrales);
  const setUmbralesSemaforo = useSemaforoStore((s) => s.setUmbrales);
  const queryClient = useQueryClient();
  const { addToast } = useToast();
  const [values, setValues] = useState<FormValues | null>(null);
  const [umbrales, setUmbrales] = useState({ riesgo: '', retraso: '' });
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const enCaliente = Boolean(ejecucion && ESTADOS_ACTIVOS.has(ejecucion.estado));
  const base = useMemo(() => (configuracion ? desdeConfiguracion(configuracion) : null), [configuracion]);

  useEffect(() => {
    if (!isOpen || !base) return;
    setValues(enCaliente ? base : aplicarAjustes(base, ajustesPendientes));
    setUmbrales({
      riesgo: String(umbralesGuardados.riesgoMinutos / 60),
      retraso: String(umbralesGuardados.retrasoMinutos / 60),
    });
    setError(null);
    // Solo al abrir: re-sincronizar en cada refetch de la configuración pisaría lo que se está editando.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, base === null]);

  if (!isOpen) return null;

  const current = values;
  const types = configuracion?.tiposVehiculo ?? [];
  const warehouses = configuracion?.almacenes ?? [];

  const updateTipo = (id: string, campo: keyof TipoForm, value: string) =>
    setValues((prev) => prev && { ...prev, tipos: { ...prev.tipos, [id]: { ...prev.tipos[id], [campo]: value } } });

  const updateAlmacen = (nombre: string, campo: keyof Omit<AlmacenForm, 'esCentral'>, value: string) =>
    setValues((prev) =>
      prev && { ...prev, almacenes: { ...prev.almacenes, [nombre]: { ...prev.almacenes[nombre], [campo]: value } } },
    );

  const updateOperacion = (campo: CampoOperacion, value: string) =>
    setValues((prev) => prev && { ...prev, operacion: { ...prev.operacion, [campo]: value } });

  const save = async () => {
    if (!current || !base || !configuracion) return;
    const mensajeError = validar(current, configuracion);
    if (mensajeError) {
      setError(mensajeError);
      return;
    }
    const horasRiesgo = Number(umbrales.riesgo);
    const horasRetraso = Number(umbrales.retraso);
    if (!esNumero(umbrales.riesgo) || !esNumero(umbrales.retraso) || horasRetraso < 0 || horasRiesgo <= horasRetraso) {
      setError('Semáforo: el umbral ámbar debe ser mayor que el rojo, y ambos no negativos');
      return;
    }
    setUmbralesSemaforo({ riesgoMinutos: horasRiesgo * 60, retrasoMinutos: horasRetraso * 60 });

    const ajustes = calcularAjustes(current, base, enCaliente);

    if (!enCaliente) {
      setAjustesPendientes(ajustes);
      addToast({
        type: 'success',
        title: 'Parámetros guardados',
        description:
          ajustes.length === 0
            ? 'Sin cambios en la operación respecto a la configuración vigente.'
            : `${ajustes.length} ajuste(s) se aplicarán al iniciar la simulación.`,
      });
      onClose();
      return;
    }

    const enviables = ajustes.filter((a) => a.tipoSolicitud !== 'CAMBIO_CANTIDAD_VEHICULOS');
    if (enviables.length > 0 && (!ejecucion || !estadoRaw?.marcaTiempoActual)) {
      setError('Aún no hay un instante simulado vigente; reintenta tras el primer lote.');
      return;
    }
    setIsSaving(true);
    const resultados = await Promise.allSettled(
      enviables.map((a) =>
        escenariosApi.programarSolicitud(ejecucion!.idEjecucion, {
          tiempoSimulado: toBackendInstant(estadoRaw!.marcaTiempoActual!),
          ...a,
        }),
      ),
    );
    setIsSaving(false);
    const fallidos = resultados.filter((r) => r.status === 'rejected').length;
    queryClient.invalidateQueries({ queryKey: ['configuracion'] });
    addToast({
      type: fallidos > 0 ? 'warning' : 'success',
      title: fallidos > 0 ? 'Algunos cambios no se programaron' : 'Cambios programados',
      description:
        enviables.length === 0
          ? 'Sin cambios en la operación; se actualizó el semáforo.'
          : `${enviables.length - fallidos} de ${enviables.length} cambio(s) se aplicarán en el próximo lote de planificación.`,
    });
    if (fallidos === 0) onClose();
  };

  const reset = () => {
    if (!base) return;
    const oficiales = valoresOficiales(base);
    // La flota y la posición de almacén solo se definen al inicio: en caliente se conservan los
    // valores vigentes para esos dos campos, aunque "valores oficiales" los resetee en frío.
    if (enCaliente) {
      for (const [id, tipo] of Object.entries(oficiales.tipos)) tipo.cantidad = base.tipos[id].cantidad;
      for (const [nombre, almacen] of Object.entries(oficiales.almacenes)) {
        almacen.x = base.almacenes[nombre].x;
        almacen.y = base.almacenes[nombre].y;
      }
    }
    setValues(oficiales);
    setUmbrales({
      riesgo: String(UMBRALES_SEMAFORO_DEFAULT.riesgoMinutos / 60),
      retraso: String(UMBRALES_SEMAFORO_DEFAULT.retrasoMinutos / 60),
    });
    setError(null);
  };

  const totalVehicles = types.reduce((sum, type) => sum + (Number(current?.tipos[type.id]?.cantidad) || 0), 0);

  return (
    <div className="fixed inset-0 z-9999 flex items-center justify-center overflow-hidden bg-black/75 p-2 backdrop-blur-sm">
      <div className="max-h-[calc(100vh-1rem)] w-full max-w-2xl overflow-y-auto rounded-xl border border-slate-700 bg-[#0f172a] p-3 text-slate-100 shadow-2xl sm:p-4">
        <header className="flex items-center justify-between border-b border-slate-800 pb-2.5">
          <div className="flex items-center gap-2.5">
            <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 p-1.5 text-blue-500">
              <Settings className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Parámetros del Sistema</h2>
              <p className="text-[11px] text-slate-400">
                {enCaliente
                  ? 'Simulación en curso: los cambios se aplican en el próximo lote'
                  : 'Se aplican al iniciar la próxima simulación'}
              </p>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Cerrar configuración" className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-white">
            <X className="h-6 w-6" />
          </button>
        </header>

        {!current ? (
          <div className="py-12 text-center text-sm text-slate-400">Cargando parámetros del sistema...</div>
        ) : (
          <div className="space-y-3 pt-3">
            <section className="border-b border-slate-800 pb-3">
              <div className="mb-2 flex items-center justify-between">
                <div>
                  <h3 className="flex items-center gap-2 text-[11px] font-bold text-slate-200"><Gauge className="h-3.5 w-3.5 text-blue-500" /> Flota de Transporte</h3>
                  <p className="text-[10px] text-slate-500">Códigos TTNN — TA: Autos, TM: Motos, TB: Bicicletas</p>
                </div>
                <span className="rounded-lg border border-blue-500/30 px-2 py-0.5 font-mono-code text-[10px] text-blue-400">Total: {totalVehicles} vehículos</span>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                {types.map((type) => (
                  <fieldset key={type.id} className="space-y-1.5 rounded-lg border border-slate-800 p-2">
                    <legend className="flex items-center gap-1 px-1 text-[11px] font-medium text-slate-300">
                      <IconoTipo id={type.id} />
                      {type.nombre}
                    </legend>
                    <label className="block space-y-0.5">
                      <span className="text-[10px] text-slate-500">Unidades{enCaliente ? ' (solo al inicio)' : ''}</span>
                      <input type="number" min="0" step="1" disabled={enCaliente} value={current.tipos[type.id]?.cantidad ?? ''} onChange={(e) => updateTipo(type.id, 'cantidad', e.target.value)} className={`${inputClass} disabled:opacity-50`} />
                    </label>
                    <label className="block space-y-0.5">
                      <span className="text-[10px] text-slate-500">Velocidad (km/h)</span>
                      <input type="number" min="1" value={current.tipos[type.id]?.velocidad ?? ''} onChange={(e) => updateTipo(type.id, 'velocidad', e.target.value)} className={inputClass} />
                    </label>
                    <label className="block space-y-0.5">
                      <span className="text-[10px] text-slate-500">Capacidad (paquetes)</span>
                      <input type="number" min="1" step="1" value={current.tipos[type.id]?.capacidad ?? ''} onChange={(e) => updateTipo(type.id, 'capacidad', e.target.value)} className={inputClass} />
                    </label>
                  </fieldset>
                ))}
              </div>
            </section>

            <section className="border-b border-slate-800 pb-3">
              <h3 className="mb-2 flex items-center gap-2 text-[11px] font-bold text-slate-200">
                <Warehouse className="h-3.5 w-3.5 text-blue-500" /> Almacenes
              </h3>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                {warehouses.map((warehouse) => {
                  const f = current.almacenes[warehouse.nombre];
                  if (!f) return null;
                  return (
                    <fieldset key={warehouse.nombre} className="space-y-1.5 rounded-lg border border-slate-800 p-2">
                      <legend className="px-1 text-[11px] font-medium text-slate-300">{warehouse.nombre}</legend>
                      <div className="grid grid-cols-2 gap-1.5">
                        <label className="block space-y-0.5">
                          <span className="text-[10px] text-slate-500">X{enCaliente ? ' (solo al inicio)' : ''}</span>
                          <input type="number" min="0" step="1" disabled={enCaliente} value={f.x} onChange={(e) => updateAlmacen(warehouse.nombre, 'x', e.target.value)} className={`${inputClass} disabled:opacity-50`} />
                        </label>
                        <label className="block space-y-0.5">
                          <span className="text-[10px] text-slate-500">Y{enCaliente ? ' (solo al inicio)' : ''}</span>
                          <input type="number" min="0" step="1" disabled={enCaliente} value={f.y} onChange={(e) => updateAlmacen(warehouse.nombre, 'y', e.target.value)} className={`${inputClass} disabled:opacity-50`} />
                        </label>
                      </div>
                      {f.esCentral ? (
                        <p className="pt-1 text-[10px] text-slate-500">Capacidad infinita (∞)</p>
                      ) : (
                        <>
                          <label className="block space-y-0.5">
                            <span className="text-[10px] text-slate-500">Capacidad (paquetes)</span>
                            <input type="number" min="1" step="1" value={f.capacidad} onChange={(e) => updateAlmacen(warehouse.nombre, 'capacidad', e.target.value)} className={inputClass} />
                          </label>
                          <label className="block space-y-0.5">
                            <span className="text-[10px] text-slate-500">Recarga cada (h)</span>
                            <input type="number" min="1" value={f.frecuencia} onChange={(e) => updateAlmacen(warehouse.nombre, 'frecuencia', e.target.value)} className={inputClass} />
                          </label>
                        </>
                      )}
                    </fieldset>
                  );
                })}
              </div>
            </section>

            <section className="border-b border-slate-800 pb-3">
              <h3 className="mb-2 flex items-center gap-2 text-[11px] font-bold text-slate-200">
                <Clock className="h-3.5 w-3.5 text-blue-500" /> Operación y Turnos
              </h3>
              {/* Etiqueta arriba y campo abajo, en grilla: antes cada fila ponía la etiqueta al lado
                  de un input que (por w-full + w-20) ocupaba todo el ancho y la aplastaba. */}
              <div className="grid grid-cols-2 gap-x-3 gap-y-2 sm:grid-cols-4">
                {CAMPOS_OPERACION.map(({ campo, label, min, max, entero }) => (
                  <label key={campo} className="flex flex-col justify-between gap-1">
                    <span className="text-[10px] leading-tight text-slate-400">{label}</span>
                    <input
                      type="number"
                      min={min}
                      max={max}
                      step={entero ? 1 : 0.5}
                      value={current.operacion[campo]}
                      onChange={(e) => updateOperacion(campo, e.target.value)}
                      className={inputClass}
                    />
                  </label>
                ))}
              </div>
            </section>

            <section className="border-b border-slate-800 pb-3">
              <h3 className="mb-1 text-[11px] font-bold text-slate-200">Semáforo de Flota</h3>
              <p className="mb-2 text-[10px] text-slate-500">Holgura (horas simuladas) hasta el plazo más próximo de los pedidos del vehículo</p>
              <div className="grid grid-cols-2 gap-x-3 gap-y-2 sm:grid-cols-4">
                <label className="flex flex-col justify-between gap-1">
                  <span className="flex items-center gap-1.5 text-[10px] leading-tight text-slate-400"><span className="h-2 w-2 shrink-0 rounded-full bg-warning" /> Ámbar si holgura ≤ (h)</span>
                  <input type="number" min="0" step="0.5" value={umbrales.riesgo} onChange={(e) => setUmbrales((u) => ({ ...u, riesgo: e.target.value }))} className={inputClass} />
                </label>
                <label className="flex flex-col justify-between gap-1">
                  <span className="flex items-center gap-1.5 text-[10px] leading-tight text-slate-400"><span className="h-2 w-2 shrink-0 rounded-full bg-danger" /> Rojo si holgura ≤ (h)</span>
                  <input type="number" min="0" step="0.5" value={umbrales.retraso} onChange={(e) => setUmbrales((u) => ({ ...u, retraso: e.target.value }))} className={inputClass} />
                </label>
              </div>
            </section>

            <section className="border-b border-slate-800 pb-3">
              <h3 className="mb-2 text-[11px] font-bold text-slate-200">Tema Visual de la Interfaz</h3>
              <div className="grid grid-cols-2 gap-3">
                <button type="button" onClick={() => setTheme('dark')} className={`flex h-9 items-center justify-center gap-2 rounded-lg border text-[11px] ${isDark ? 'border-blue-500 bg-blue-600 font-semibold text-white' : 'border-slate-700 text-slate-400'}`}>
                  <Moon className="h-3.5 w-3.5" /> Modo Oscuro
                </button>
                <button type="button" onClick={() => setTheme('light')} className={`flex h-9 items-center justify-center gap-2 rounded-lg border text-[11px] ${!isDark ? 'border-blue-500 bg-blue-600 font-semibold text-white' : 'border-slate-700 text-slate-400'}`}>
                  <Sun className="h-3.5 w-3.5" /> Modo Claro
                </button>
              </div>
            </section>

            {error && (
              <div role="alert" className="rounded-lg border border-rose-900/60 bg-rose-950/40 p-2 text-[11px] text-rose-300">
                {error}
              </div>
            )}

            <footer className="flex flex-wrap items-center justify-between gap-3">
              <button type="button" onClick={reset} className="flex items-center gap-2 text-xs text-slate-400 hover:text-white"><RotateCcw className="h-4 w-4" /> Valores oficiales del caso</button>
              <div className="flex gap-2">
                <button type="button" onClick={onClose} className="rounded-xl border border-slate-700 px-4 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-800">Cancelar</button>
                <button type="button" onClick={save} disabled={isSaving} className="flex items-center gap-2 rounded-xl bg-blue-700 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-600 disabled:opacity-50">
                  <Check className="h-4 w-4" /> {enCaliente ? 'Aplicar en caliente' : 'Guardar Parámetros'}
                </button>
              </div>
            </footer>
          </div>
        )}
      </div>
    </div>
  );
};
