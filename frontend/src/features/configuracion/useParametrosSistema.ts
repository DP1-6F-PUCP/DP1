import { refrescarConfiguracionEnLotes } from '../../services/ingestaLotes';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEstadoOperacion } from '../../hooks/useEstadoOperacion';
import { configuracionApi } from '../../services/configuracionApi';
import { useThemeStore } from '../../store/themeStore';
import { UMBRALES_DEFAULT, useUmbralesStore, validarUmbrales, type Umbrales } from '../../store/umbralesStore';
import { useConfigInicialStore } from '../../store/configInicialStore';
import { useScenarioStore } from '../../store/scenarioStore';
import { escenariosApi } from '../../services/escenariosApi';
import { toBackendInstant } from '../../utils/backendTime';
import { useToast } from '../../components/ToastProvider';
import type { AjusteInicial } from '../../types/backend';
import {
  aplicarAjustes,
  bloqueDeClave,
  calcularAjustes,
  desdeConfiguracion,
  validarCampos,
  valoresOficiales,
  type AlmacenForm,
  type CampoOperacion,
  type FormValues,
  type TipoForm,
} from './parametros';
import { useAjustesProgramados, useProgramadosStore } from './programadosStore';

const ESTADOS_ACTIVOS = new Set(['INICIADA', 'EN_CURSO', 'PAUSADA']);

export type BloqueEditable = 'flota' | 'almacenes' | 'operacion' | 'apariencia';

const bloqueDeAjuste = (a: AjusteInicial): BloqueEditable => {
  switch (a.tipoSolicitud) {
    case 'CAMBIO_VELOCIDAD':
    case 'CAMBIO_CAPACIDAD':
    case 'CAMBIO_CANTIDAD_VEHICULOS':
      return 'flota';
    case 'CAMBIO_CONFIGURACION_OPERACION':
      return 'operacion';
    default:
      return 'almacenes';
  }
};

/**
 * Estado y envío de los parámetros del sistema, compartido por la página /configuracion y el modal
 * de la pantalla de inicio. Dos modos según haya o no una ejecución activa:
 *  - Sin ejecución: "Guardar" los deja como ajustes pendientes (store/configInicialStore), que viajan
 *    como `ajustesIniciales` al pulsar "Iniciar" en la pantalla de inicio.
 *  - Con ejecución: "Aplicar" los envía en caliente (POST /escenarios/{id}/solicitudes) al instante
 *    simulado actual; el backend los aplica en el próximo lote. Cantidad de flota y posición de
 *    almacén quedan bloqueadas (solo al inicio).
 * Solo se envía lo que difiere de la referencia (configuración vigente + lo ya pendiente/programado).
 *
 * El tema es parte del borrador: se previsualiza al instante en toda la interfaz, pero solo se
 * guarda con "Guardar"; "Descartar" o salir sin guardar lo revierten.
 */
export function useParametrosSistema() {
  const { configuracion, estadoRaw } = useEstadoOperacion();
  const ejecucion = useScenarioStore((s) => s.ejecucion);
  const ajustesPendientes = useConfigInicialStore((s) => s.ajustesPendientes);
  const setAjustesPendientes = useConfigInicialStore((s) => s.setAjustesPendientes);
  const programados = useAjustesProgramados(ejecucion?.idEjecucion);
  const agregarProgramados = useProgramadosStore((s) => s.agregar);
  const savedIsDark = useThemeStore((s) => s.savedIsDark);
  const previewTheme = useThemeStore((s) => s.previewTheme);
  const revertPreview = useThemeStore((s) => s.revertPreview);
  const setTheme = useThemeStore((s) => s.setTheme);
  const queryClient = useQueryClient();
  const { addToast } = useToast();
  // Valores oficiales del caso: vienen del servidor (perfil inmutable). No cambian, se piden una vez.
  const { data: oficiales = null } = useQuery({
    queryKey: ['configuracionOficial'],
    queryFn: ({ signal }) => configuracionApi.getConfiguracionOficial(signal),
    staleTime: Infinity,
  });

  const enCaliente = Boolean(ejecucion && ESTADOS_ACTIVOS.has(ejecucion.estado));
  const base = useMemo(() => (configuracion ? desdeConfiguracion(configuracion) : null), [configuracion]);
  /** Lo que quedará vigente si no se toca nada: servidor + pendientes (en frío) o programados (en caliente). */
  const referencia = useMemo(
    () => (base ? aplicarAjustes(base, enCaliente ? programados : ajustesPendientes) : null),
    [base, enCaliente, programados, ajustesPendientes],
  );

  const [values, setValues] = useState<FormValues | null>(null);
  const [temaOscuro, setTemaOscuro] = useState(savedIsDark);
  // Cortes de los semáforos: borrador local, se guardan con "Guardar" (preferencia del navegador).
  const umbralesGuardados = useUmbralesStore((s) => s.umbrales);
  const guardarUmbrales = useUmbralesStore((s) => s.guardar);
  const [umbrales, setUmbrales] = useState<Umbrales>(umbralesGuardados);
  const erroresUmbrales = useMemo(() => validarUmbrales(umbrales), [umbrales]);
  const umbralesCambiados = (Object.keys(umbrales) as (keyof Umbrales)[]).some((k) => umbrales[k] !== umbralesGuardados[k]);
  const updateUmbral = useCallback((campo: keyof Umbrales, valor: number) =>
    setUmbrales((prev) => ({ ...prev, [campo]: valor })), []);
  const restaurarUmbrales = useCallback((campos: (keyof Umbrales)[]) =>
    setUmbrales((prev) => ({ ...prev, ...Object.fromEntries(campos.map((c) => [c, UMBRALES_DEFAULT[c]])) })), []);
  const [isSaving, setIsSaving] = useState(false);
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null);

  // Sincroniza el formulario con la referencia mientras no haya ediciones (al abrir, o si la
  // configuración del servidor cambia sin que el usuario haya tocado nada). Con ediciones en curso
  // no se pisa lo que se está escribiendo.
  const referenciaPrevia = useRef<FormValues | null>(null);
  const claveReferencia = referencia ? JSON.stringify(referencia) : null;
  useEffect(() => {
    if (!referencia || claveReferencia === null) return;
    const previa = referenciaPrevia.current;
    setValues((actual) =>
      actual === null || !previa || calcularAjustes(actual, previa, false).length === 0 ? structuredClone(referencia) : actual,
    );
    referenciaPrevia.current = referencia;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [claveReferencia]);

  // Salir sin guardar (desmontar la página o cerrar el modal) revierte la vista previa del tema.
  useEffect(() => () => revertPreview(), [revertPreview]);

  const errores = useMemo(
    () => (values && configuracion ? validarCampos(values, configuracion) : {}),
    [values, configuracion],
  );
  const erroresPorBloque = useMemo(() => {
    const cuenta: Record<BloqueEditable, number> = {
      flota: 0, almacenes: 0, operacion: 0, apariencia: Object.keys(erroresUmbrales).length,
    };
    for (const clave of Object.keys(errores)) cuenta[bloqueDeClave(clave)] += 1;
    return cuenta;
  }, [errores, erroresUmbrales]);

  const cambios = useMemo(
    () => (values && referencia ? calcularAjustes(values, referencia, enCaliente) : []),
    [values, referencia, enCaliente],
  );
  const temaCambiado = temaOscuro !== savedIsDark;
  const cambiosPorBloque = useMemo(() => {
    const cuenta: Record<BloqueEditable, number> = {
      flota: 0, almacenes: 0, operacion: 0, apariencia: (temaCambiado ? 1 : 0) + (umbralesCambiados ? 1 : 0),
    };
    for (const a of cambios) cuenta[bloqueDeAjuste(a)] += 1;
    return cuenta;
  }, [cambios, temaCambiado, umbralesCambiados]);
  const totalCambios = cambios.length + (temaCambiado ? 1 : 0) + (umbralesCambiados ? 1 : 0);
  const hayCambios = totalCambios > 0;
  const hayErrores = Object.keys(errores).length > 0 || Object.keys(erroresUmbrales).length > 0;
  /**
   * El borrador ya tiene los valores oficiales (en lo editable ahora): "Restaurar" no haría nada.
   * Mientras no llegan del servidor también cuenta como true (no hay a qué restaurar).
   */
  const esOficial = useMemo(
    () => (values && oficiales
      ? calcularAjustes(values, valoresOficiales(values, enCaliente, oficiales), enCaliente).length === 0
      : true),
    [values, enCaliente, oficiales],
  );

  // En caliente, los campos "solo al inicio" (cantidad de flota, posición de almacén) se ignoran
  // aunque algo los intente cambiar: además de estar deshabilitados en el formulario.
  const updateTipo = useCallback((id: string, campo: keyof TipoForm, value: string) => {
    if (enCaliente && campo === 'cantidad') return;
    setValues((prev) => prev && { ...prev, tipos: { ...prev.tipos, [id]: { ...prev.tipos[id], [campo]: value } } });
  }, [enCaliente]);
  const updateAlmacen = useCallback((nombre: string, campo: keyof Omit<AlmacenForm, 'esCentral'>, value: string) => {
    if (enCaliente && (campo === 'x' || campo === 'y')) return;
    setValues((prev) => prev && { ...prev, almacenes: { ...prev.almacenes, [nombre]: { ...prev.almacenes[nombre], [campo]: value } } });
  }, [enCaliente]);
  const updateOperacion = useCallback((campo: CampoOperacion, value: string) =>
    setValues((prev) => prev && { ...prev, operacion: { ...prev.operacion, [campo]: value } }), []);
  const elegirTema = useCallback((oscuro: boolean) => {
    setTemaOscuro(oscuro);
    previewTheme(oscuro ? 'dark' : 'light');
  }, [previewTheme]);

  const descartar = useCallback(() => {
    if (referencia) setValues(structuredClone(referencia));
    setTemaOscuro(savedIsDark);
    revertPreview();
    setUmbrales(umbralesGuardados);
    setErrorGeneral(null);
  }, [referencia, savedIsDark, revertPreview, umbralesGuardados]);

  /**
   * Carga los valores oficiales del caso en el borrador (no guarda: el usuario los revisa y guarda).
   * No toca el tema, que es una preferencia de la interfaz y no un parámetro del caso.
   */
  const restaurarOficiales = useCallback(() => {
    if (!oficiales) return;
    setValues((prev) => prev && valoresOficiales(prev, enCaliente, oficiales));
    setErrorGeneral(null);
  }, [enCaliente, oficiales]);

  /** Guarda (en frío) o aplica en caliente. Devuelve true si todo quedó guardado. */
  const guardar = useCallback(async (): Promise<boolean> => {
    if (!values || !base || !referencia) return false;
    if (hayErrores) {
      setErrorGeneral('Corrige los campos marcados antes de guardar.');
      return false;
    }
    setErrorGeneral(null);
    if (temaCambiado) setTheme(temaOscuro ? 'dark' : 'light');
    if (umbralesCambiados) guardarUmbrales(umbrales);

    if (!enCaliente) {
      // Lista completa respecto del servidor: reemplaza los pendientes anteriores.
      const ajustes = calcularAjustes(values, base, false);
      setAjustesPendientes(ajustes);
      addToast({
        type: 'success',
        title: 'Configuración guardada',
        description: ajustes.length === 0
          ? 'Sin cambios en la operación.'
          : ajustes.length === 1 ? 'Se aplica al iniciar la simulación.' : `${ajustes.length} ajustes se aplicarán al iniciar la simulación.`,
      });
      return true;
    }

    if (cambios.length === 0) {
      addToast({ type: 'success', title: 'Configuración guardada', description: 'Se guardaron las preferencias de la interfaz.' });
      return true;
    }
    const instante = estadoRaw?.marcaTiempoActual;
    if (!ejecucion || !instante) {
      setErrorGeneral('La simulación aún está arrancando; reintenta en unos segundos.');
      return false;
    }
    setIsSaving(true);
    const resultados = await Promise.allSettled(
      cambios.map((a) =>
        escenariosApi.programarSolicitud(ejecucion.idEjecucion, { tiempoSimulado: toBackendInstant(instante), ...a }),
      ),
    );
    setIsSaving(false);
    const aceptados = cambios.filter((_, i) => resultados[i].status === 'fulfilled');
    const fallidos = cambios.length - aceptados.length;
    if (aceptados.length > 0) agregarProgramados(ejecucion.idEjecucion, aceptados);
    void queryClient.invalidateQueries({ queryKey: ['configuracion'] });
    // El backend aplica en el próximo lote: volver a pedir la configuración cuando lleguen.
    if (aceptados.length > 0) refrescarConfiguracionEnLotes(4);
    addToast({
      type: fallidos > 0 ? 'warning' : 'success',
      title: fallidos > 0 ? 'Algunos cambios no se guardaron' : 'Cambios guardados',
      description: fallidos > 0 ? `${aceptados.length} de ${cambios.length} se aplicarán en segundos.` : 'Se aplican en segundos.',
    });
    if (fallidos > 0) setErrorGeneral(fallidos === 1 ? '1 cambio no se pudo guardar; sigue pendiente.' : `${fallidos} cambios no se pudieron guardar; siguen pendientes.`);
    return fallidos === 0;
  }, [values, base, referencia, hayErrores, temaCambiado, setTheme, temaOscuro, enCaliente, cambios, estadoRaw,
    ejecucion, setAjustesPendientes, addToast, agregarProgramados, queryClient, umbralesCambiados, guardarUmbrales, umbrales]);

  return {
    configuracion,
    values,
    referencia,
    enCaliente,
    errores,
    erroresPorBloque,
    hayErrores,
    esOficial,
    oficiales,
    cambiosPorBloque,
    totalCambios,
    hayCambios,
    temaOscuro,
    temaCambiado,
    elegirTema,
    umbrales,
    umbralesGuardados,
    erroresUmbrales,
    updateUmbral,
    restaurarUmbrales,
    updateTipo,
    updateAlmacen,
    updateOperacion,
    descartar,
    restaurarOficiales,
    guardar,
    isSaving,
    errorGeneral,
    ajustesPendientes: enCaliente ? [] : ajustesPendientes,
    programados: enCaliente ? programados : [],
  };
}

export type ParametrosSistema = ReturnType<typeof useParametrosSistema>;
