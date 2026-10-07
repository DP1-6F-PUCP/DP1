import React, { useState } from 'react';
import { Settings2, X } from 'lucide-react';
import { useEscenario } from '../hooks/useEscenario';
import { useEstadoOperacion } from '../../../hooks/useEstadoOperacion';
import { escenariosApi } from '../../../services/escenariosApi';
import { toBackendInstant } from '../../../utils/backendTime';
import type { TipoSolicitud } from '../../../types/backend';

/**
 * De los 9 TipoSolicitud del backend, OrquestadorOperacion.aplicarSolicitudesVencidas implementa
 * 8: AVERIA (ver BreakdownModal/VehiclePanelContainer, flujo propio), CAMBIO_VELOCIDAD,
 * CAMBIO_CAPACIDAD, CAMBIO_CANTIDAD_VEHICULOS, CAMBIO_POSICION_ALMACEN, CAMBIO_CAPACIDAD_ALMACEN,
 * CAMBIO_FRECUENCIA_RECARGA, CAMBIO_CONFIGURACION_OPERACION. El único que falta,
 * CAMBIO_CONFIGURACION_CIUDAD, no es un "pendiente de implementar": ServicioPlanificacionImpl lo
 * rechaza a propósito con 400 en cuanto se intenta programar. Cambiar las dimensiones de la ciudad
 * en caliente deja posiciones ya existentes fuera de la grilla nueva y CalculadorDistancia lanza
 * IllegalStateException para TODA ruta que las toque -- una caída sistémica del simulador, no un
 * error localizado. Por eso esa configuración solo puede fijarse antes de iniciar la ejecución, no
 * tiene ni tendrá un canal de cambio en caliente.
 *
 * Este modal reemplaza lo que hubiera sido un ConfigModal separado: son la misma accion
 * (programar una solicitud sobre la ejecucion activa), partirla en dos componentes habria sido
 * la duplicacion que se pidio evitar.
 */
type Pestana =
  | 'CAMBIO_VELOCIDAD'
  | 'CAMBIO_CAPACIDAD'
  | 'CAMBIO_CANTIDAD_VEHICULOS'
  | 'CAMBIO_CAPACIDAD_ALMACEN'
  | 'CAMBIO_POSICION_ALMACEN'
  | 'CAMBIO_FRECUENCIA_RECARGA'
  | 'CAMBIO_CONFIGURACION_OPERACION';

const PESTANAS: { tipo: Pestana; label: string }[] = [
  { tipo: 'CAMBIO_VELOCIDAD', label: 'Velocidad' },
  { tipo: 'CAMBIO_CAPACIDAD', label: 'Capacidad vehículo' },
  { tipo: 'CAMBIO_CANTIDAD_VEHICULOS', label: 'Cantidad flota' },
  { tipo: 'CAMBIO_CAPACIDAD_ALMACEN', label: 'Capacidad almacén' },
  { tipo: 'CAMBIO_POSICION_ALMACEN', label: 'Posición almacén' },
  { tipo: 'CAMBIO_FRECUENCIA_RECARGA', label: 'Frecuencia recarga' },
  { tipo: 'CAMBIO_CONFIGURACION_OPERACION', label: 'Config. operación' },
];

/** Debe reflejar exactamente los campos de ConfiguracionOperacion (dominio) que
 * aplicarCambioConfiguracionOperacion sabe reconstruir -- cualquier otro valor cae a su "default -> null". */
const CAMPOS_CONFIGURACION_OPERACION = [
  { campo: 'duracionTurnoHoras', label: 'Duración de turno (h)' },
  { campo: 'horaInicioTurno', label: 'Hora de inicio de turno (0-23)' },
  { campo: 'tiempoServicioClienteHoras', label: 'Tiempo de servicio al cliente (h)' },
  { campo: 'duracionRefrigerioHoras', label: 'Duración de refrigerio (h)' },
  { campo: 'margenRefrigerioHoras', label: 'Margen de refrigerio (h)' },
  { campo: 'tiempoCargaAlmacenHoras', label: 'Tiempo de carga en almacén (h)' },
  { campo: 'tiempoTrasvaseHoras', label: 'Tiempo de trasvase entre unidades (h)' },
  { campo: 'maxParadasPorRuta', label: 'Máx. paradas por ruta' },
];

export const NuevaSolicitudButton: React.FC = () => {
  const { ejecucion } = useEscenario();
  const { estadoRaw, configuracion } = useEstadoOperacion();
  const [isOpen, setIsOpen] = useState(false);
  const [pestana, setPestana] = useState<Pestana>('CAMBIO_VELOCIDAD');
  const [tipoVehiculo, setTipoVehiculo] = useState('AUTO');
  const [almacenObjetivo, setAlmacenObjetivo] = useState('');
  const [valor, setValor] = useState('');
  const [posX, setPosX] = useState('');
  const [posY, setPosY] = useState('');
  const [campoConfig, setCampoConfig] = useState(CAMPOS_CONFIGURACION_OPERACION[0].campo);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  if (!ejecucion) return null;

  const tiposVehiculo = configuracion?.tiposVehiculo ?? [];
  const almacenesIntermedios = configuracion?.almacenes.filter((a) => !a.esCentral) ?? [];
  const todosLosAlmacenes = configuracion?.almacenes ?? [];

  const limpiarCampos = () => {
    setValor('');
    setPosX('');
    setPosY('');
  };

  const cambiarPestana = (p: Pestana) => {
    setPestana(p);
    setFeedback(null);
    limpiarCampos();
    setAlmacenObjetivo('');
  };

  const enviar = async (tipoSolicitud: TipoSolicitud, entidadObjetivo: string, valorNuevo: string) => {
    if (!estadoRaw?.marcaTiempoActual) return;
    setIsSubmitting(true);
    setFeedback(null);
    try {
      await escenariosApi.programarSolicitud(ejecucion.idEjecucion, {
        tiempoSimulado: toBackendInstant(estadoRaw.marcaTiempoActual),
        tipoSolicitud,
        entidadObjetivo,
        valorNuevo,
      });
      setFeedback('Solicitud programada. Se aplicará en el próximo lote de planificación (no es instantáneo).');
      limpiarCampos();
    } catch (err) {
      setFeedback((err as Error).message || 'No se pudo programar la solicitud.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        title="Nueva solicitud en caliente"
        className="p-1.5 rounded-lg border border-slate-700 bg-slate-800 text-slate-300 hover:border-blue-500/40 transition-colors"
      >
        <Settings2 className="h-3.5 w-3.5" />
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-xl border border-slate-800 bg-slate-900 p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-white">Nueva solicitud en caliente</h2>
              <button type="button" onClick={() => setIsOpen(false)} className="text-slate-400 hover:text-white">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex flex-wrap gap-1 border-b border-slate-800 pb-2">
              {PESTANAS.map((p) => (
                <button
                  key={p.tipo}
                  type="button"
                  onClick={() => cambiarPestana(p.tipo)}
                  className={`px-2 py-1 rounded-md text-[11px] font-medium transition-colors ${
                    pestana === p.tipo ? 'bg-blue-600 text-white' : 'text-slate-400 hover:bg-slate-800'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>

            {pestana === 'CAMBIO_VELOCIDAD' && (
              <div className="space-y-2">
                <h3 className="text-xs font-semibold text-slate-300">Cambio de velocidad de flota</h3>
                <div className="flex gap-2">
                  <select
                    value={tipoVehiculo}
                    onChange={(e) => setTipoVehiculo(e.target.value)}
                    className="rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-slate-100"
                  >
                    {tiposVehiculo.map((t) => (
                      <option key={t.id} value={t.id}>{t.nombre}</option>
                    ))}
                  </select>
                  <input
                    type="number" min={1} value={valor} onChange={(e) => setValor(e.target.value)}
                    placeholder="Nueva velocidad (km/h)"
                    className="flex-1 rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-slate-100 placeholder-slate-500"
                  />
                  <button type="button" disabled={isSubmitting || !valor}
                    onClick={() => enviar('CAMBIO_VELOCIDAD', tipoVehiculo, valor)}
                    className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-medium transition-colors"
                  >Enviar</button>
                </div>
              </div>
            )}

            {pestana === 'CAMBIO_CAPACIDAD' && (
              <div className="space-y-2">
                <h3 className="text-xs font-semibold text-slate-300">Cambio de capacidad de vehículo</h3>
                <div className="flex gap-2">
                  <select
                    value={tipoVehiculo}
                    onChange={(e) => setTipoVehiculo(e.target.value)}
                    className="rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-slate-100"
                  >
                    {tiposVehiculo.map((t) => (
                      <option key={t.id} value={t.id}>{t.nombre}</option>
                    ))}
                  </select>
                  <input
                    type="number" min={1} value={valor} onChange={(e) => setValor(e.target.value)}
                    placeholder="Nueva capacidad (paquetes)"
                    className="flex-1 rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-slate-100 placeholder-slate-500"
                  />
                  <button type="button" disabled={isSubmitting || !valor}
                    onClick={() => enviar('CAMBIO_CAPACIDAD', tipoVehiculo, valor)}
                    className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-medium transition-colors"
                  >Enviar</button>
                </div>
              </div>
            )}

            {pestana === 'CAMBIO_CANTIDAD_VEHICULOS' && (
              <div className="space-y-2">
                <h3 className="text-xs font-semibold text-slate-300">Cambio de cantidad de vehículos</h3>
                <p className="text-[11px] text-slate-500">
                  El valor es la cantidad TOTAL deseada de ese tipo, no un delta. Al reducir, solo se retiran unidades
                  disponibles (ninguna que esté en ruta).
                </p>
                <div className="flex gap-2">
                  <select
                    value={tipoVehiculo}
                    onChange={(e) => setTipoVehiculo(e.target.value)}
                    className="rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-slate-100"
                  >
                    {tiposVehiculo.map((t) => (
                      <option key={t.id} value={t.id}>{t.nombre}</option>
                    ))}
                  </select>
                  <input
                    type="number" min={0} value={valor} onChange={(e) => setValor(e.target.value)}
                    placeholder="Cantidad total deseada"
                    className="flex-1 rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-slate-100 placeholder-slate-500"
                  />
                  <button type="button" disabled={isSubmitting || !valor}
                    onClick={() => enviar('CAMBIO_CANTIDAD_VEHICULOS', tipoVehiculo, valor)}
                    className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-medium transition-colors"
                  >Enviar</button>
                </div>
              </div>
            )}

            {pestana === 'CAMBIO_CAPACIDAD_ALMACEN' && (
              <div className="space-y-2">
                <h3 className="text-xs font-semibold text-slate-300">Cambio de capacidad de almacén</h3>
                <p className="text-[11px] text-slate-500">No aplica al Almacén Central, que tiene stock infinito.</p>
                <div className="flex gap-2">
                  <select
                    value={almacenObjetivo}
                    onChange={(e) => setAlmacenObjetivo(e.target.value)}
                    className="rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-slate-100"
                  >
                    <option value="" disabled>Almacén...</option>
                    {almacenesIntermedios.map((a) => (
                      <option key={a.nombre} value={a.nombre}>{a.nombre}</option>
                    ))}
                  </select>
                  <input
                    type="number" min={1} value={valor} onChange={(e) => setValor(e.target.value)}
                    placeholder="Nueva capacidad máxima"
                    className="flex-1 rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-slate-100 placeholder-slate-500"
                  />
                  <button type="button" disabled={isSubmitting || !valor || !almacenObjetivo}
                    onClick={() => enviar('CAMBIO_CAPACIDAD_ALMACEN', almacenObjetivo, valor)}
                    className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-medium transition-colors"
                  >Enviar</button>
                </div>
              </div>
            )}

            {pestana === 'CAMBIO_POSICION_ALMACEN' && (
              <div className="space-y-2">
                <h3 className="text-xs font-semibold text-slate-300">Cambio de posición de almacén</h3>
                <div className="flex gap-2">
                  <select
                    value={almacenObjetivo}
                    onChange={(e) => setAlmacenObjetivo(e.target.value)}
                    className="rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-slate-100"
                  >
                    <option value="" disabled>Almacén...</option>
                    {todosLosAlmacenes.map((a) => (
                      <option key={a.nombre} value={a.nombre}>{a.nombre}</option>
                    ))}
                  </select>
                  <input
                    type="number" value={posX} onChange={(e) => setPosX(e.target.value)} placeholder="X"
                    className="w-16 rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-slate-100 placeholder-slate-500"
                  />
                  <input
                    type="number" value={posY} onChange={(e) => setPosY(e.target.value)} placeholder="Y"
                    className="w-16 rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-slate-100 placeholder-slate-500"
                  />
                  <button type="button" disabled={isSubmitting || !posX || !posY || !almacenObjetivo}
                    onClick={() => enviar('CAMBIO_POSICION_ALMACEN', almacenObjetivo, `${posX},${posY}`)}
                    className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-medium transition-colors"
                  >Enviar</button>
                </div>
              </div>
            )}

            {pestana === 'CAMBIO_FRECUENCIA_RECARGA' && (
              <div className="space-y-2">
                <h3 className="text-xs font-semibold text-slate-300">Cambio de frecuencia de recarga</h3>
                <p className="text-[11px] text-slate-500">No aplica al Almacén Central. Por defecto recarga cada 24h.</p>
                <div className="flex gap-2">
                  <select
                    value={almacenObjetivo}
                    onChange={(e) => setAlmacenObjetivo(e.target.value)}
                    className="rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-slate-100"
                  >
                    <option value="" disabled>Almacén...</option>
                    {almacenesIntermedios.map((a) => (
                      <option key={a.nombre} value={a.nombre}>{a.nombre}</option>
                    ))}
                  </select>
                  <input
                    type="number" min={1} value={valor} onChange={(e) => setValor(e.target.value)}
                    placeholder="Nueva frecuencia (horas)"
                    className="flex-1 rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-slate-100 placeholder-slate-500"
                  />
                  <button type="button" disabled={isSubmitting || !valor || !almacenObjetivo}
                    onClick={() => enviar('CAMBIO_FRECUENCIA_RECARGA', almacenObjetivo, valor)}
                    className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-medium transition-colors"
                  >Enviar</button>
                </div>
              </div>
            )}

            {pestana === 'CAMBIO_CONFIGURACION_OPERACION' && (
              <div className="space-y-2">
                <h3 className="text-xs font-semibold text-slate-300">Cambio de configuración de operación</h3>
                <div className="flex gap-2">
                  <select
                    value={campoConfig}
                    onChange={(e) => setCampoConfig(e.target.value)}
                    className="flex-1 rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-slate-100"
                  >
                    {CAMPOS_CONFIGURACION_OPERACION.map((c) => (
                      <option key={c.campo} value={c.campo}>{c.label}</option>
                    ))}
                  </select>
                  <input
                    type="number" value={valor} onChange={(e) => setValor(e.target.value)}
                    placeholder="Nuevo valor"
                    className="w-24 rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-slate-100 placeholder-slate-500"
                  />
                  <button type="button" disabled={isSubmitting || !valor}
                    onClick={() => enviar('CAMBIO_CONFIGURACION_OPERACION', campoConfig, valor)}
                    className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-medium transition-colors"
                  >Enviar</button>
                </div>
              </div>
            )}

            {feedback && <p className="text-[11px] text-amber-300">{feedback}</p>}

            <p className="text-[11px] text-slate-500 pt-3 border-t border-slate-800">
              La configuración de ciudad (ancho/alto/grilla) no es ajustable en caliente: el servidor la rechaza con
              un error explícito si se intenta. Solo puede fijarse antes de iniciar el escenario.
            </p>
          </div>
        </div>
      )}
    </>
  );
};
