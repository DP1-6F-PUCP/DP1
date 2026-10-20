import React, { useEffect, useRef, useState } from 'react';
import { Clock } from 'lucide-react';
import { useEstadoOperacion } from '../../../hooks/useEstadoOperacion';
import { useScenarioStore } from '../../../store/scenarioStore';

/**
 * No existia ningun reloj en el front para seguir el avance de la simulacion -- el unico lugar
 * que mostraba una hora era DelayAlertModal (al abrir una alerta puntual).
 *
 * Bug real corregido (reporte directo): mostraba marcaTiempoActual tal cual, que solo cambia una
 * vez cada "sa" minutos REALES -- la hora en pantalla quedaba congelada entre lotes, el mismo
 * problema de "foto fija" que ya resolvimos para la posicion de los vehiculos (dead reckoning).
 * Mismo fix aqui: se extrapola en tiempo real usando k (segundos simulados por segundo real,
 * EjecucionEscenarioDTO.k) sumado a la ultima marcaTiempoActual conocida, en vez de mostrar el
 * valor crudo sin avanzar hasta el proximo lote.
 */
export const SimClock: React.FC = () => {
  const { estadoRaw } = useEstadoOperacion();
  const k = useScenarioStore((s) => s.ejecucion?.k) ?? 0;
  const estadoEjecucion = useScenarioStore((s) => s.ejecucion?.estado);
  const [, forceTick] = useState(0);

  // Bug real corregido (reporte directo, con captura: el reloj seguia subiendo en tiempo real
  // despues de detener la ejecucion -- "+22h 47m" creciendo solo). Al no haber ejecucion activa,
  // el backend devuelve un contexto vacio con marcaTiempoActual = la hora real del servidor (ver
  // ServicioPlanificacionImpl.consultarEstadoOperacion) -- ese valor CAMBIA en cada poll porque es
  // "ahora", asi que el reloj seguia pareciendo avanzar aunque ya no hubiera ninguna simulacion
  // corriendo. La extrapolacion por k solo tiene sentido mientras el backend SIGUE calculando
  // lotes nuevos; con la ejecucion pausada/detenida se congela en el ultimo valor real conocido.
  const avanzando = estadoEjecucion === 'EN_CURSO' || estadoEjecucion === 'INICIADA';

  const marcaTiempoActual = estadoRaw?.marcaTiempoActual ?? null;
  const valorAnteriorRef = useRef<string | null>(null);
  const instanteCambioRef = useRef<number>(Date.now());
  const haceSegundosRef = useRef(0);

  useEffect(() => {
    if (marcaTiempoActual !== valorAnteriorRef.current) {
      valorAnteriorRef.current = marcaTiempoActual;
      instanteCambioRef.current = Date.now();
      haceSegundosRef.current = 0;
    }
  }, [marcaTiempoActual]);

  useEffect(() => {
    const id = setInterval(() => {
      haceSegundosRef.current = Math.round((Date.now() - instanteCambioRef.current) / 1000);
      forceTick((v) => v + 1); // re-renderiza cada segundo para que la hora extrapolada avance
    }, 1000);
    return () => clearInterval(id);
  }, []);

  if (!marcaTiempoActual) return null;

  const haceSegundos = haceSegundosRef.current;
  const nowMsConocido = Date.parse(marcaTiempoActual);
  // Hora simulada extrapolada al segundo actual -- no la cruda, que solo avanza cada sa minutos.
  const nowMs = avanzando && Number.isFinite(nowMsConocido) && k > 0
    ? nowMsConocido + k * haceSegundos * 1000
    : nowMsConocido;
  const fechaFormateada = Number.isFinite(nowMs)
    ? new Date(nowMs).toLocaleString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : marcaTiempoActual;

  const estancado = haceSegundos > 50; // mas de sa(20s)+margen sin recibir un tick nuevo

  return (
    <div
      className="flex items-center gap-2 px-0 pt-0.5 text-[11px] font-mono-code text-slate-300"
      title="Hora simulada actual de la ejecución"
    >
      <Clock className="h-3.5 w-3.5 text-cyan-400 shrink-0" />
      <span className="text-slate-100 font-medium">{fechaFormateada}</span>
      <span className={`text-[10px] ${estancado ? 'text-amber-400' : 'text-slate-500'}`}>
        actualizado hace {haceSegundos}s
      </span>
    </div>
  );
};
