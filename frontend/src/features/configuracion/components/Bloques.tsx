import React from 'react';
import { Car, Check, Clock, Info, Lock, Moon, Route, Sun, Timer, Warehouse, Zap } from 'lucide-react';
import { FaBicycle, FaMotorcycle } from 'react-icons/fa';
import { EditorSemaforos } from './EditorSemaforos';
import {
  CAMPOS_OPERACION,
  claveAlmacen,
  claveOperacion,
  claveTipo,
  distinto,
  type DefCampoOperacion,
} from '../parametros';
import type { ParametrosSistema } from '../useParametrosSistema';
import { Aviso, BORDE, CampoNumero, EncabezadoBloque, Insignia, TEXTO, TEXTO_FUERTE, TEXTO_TENUE, Tarjeta } from './ui';

const MOTIVO_SOLO_INICIO = 'Solo antes de iniciar';

const CODIGO_TIPO: Record<string, string> = { AUTO: 'TA', MOTO: 'TM', BICI: 'TB' };

const IconoTipo: React.FC<{ id: string }> = ({ id }) => {
  const lower = id.toLowerCase();
  if (lower.includes('moto')) return <FaMotorcycle className="h-4 w-4 text-purple-500 dark:text-purple-400" aria-hidden />;
  if (lower.includes('bici')) return <FaBicycle className="h-4 w-4 text-emerald-600 dark:text-emerald-400" aria-hidden />;
  return <Car className="h-4 w-4 text-blue-600 dark:text-blue-400" aria-hidden />;
};

// Antes de iniciar todo se aplica al inicio: las insignias «En caliente» / «Solo al inicio» solo
// distinguen algo con la simulación en curso, así que se ocultan en el modal de la pantalla de inicio.
// Texto para el operador (regla del dueño): sin «en caliente»; solo se avisa qué no se puede cambiar.
const Leyenda: React.FC<{ enCaliente: boolean; conInicio?: boolean }> = ({ enCaliente, conInicio = true }) => !enCaliente || !conInicio ? null : (
  <span className={`inline-flex items-center gap-1 text-xs ${TEXTO_TENUE}`}><Lock className="h-3 w-3" aria-hidden />Los campos con candado solo se cambian antes de iniciar.</span>
);

interface BloqueProps {
  p: ParametrosSistema;
}

export const BloqueFlota: React.FC<BloqueProps> = ({ p }) => {
  const { configuracion, values, referencia, errores, enCaliente, updateTipo, oficiales } = p;
  if (!configuracion || !values || !referencia) return null;
  const tipos = configuracion.tiposVehiculo;
  const totalUnidades = tipos.reduce((s, t) => s + (Number(values.tipos[t.id]?.cantidad) || 0), 0);
  const capacidadTotal = tipos.reduce((s, t) => s + (Number(values.tipos[t.id]?.cantidad) || 0) * (Number(values.tipos[t.id]?.capacidad) || 0), 0);
  return (
    <div>
      <EncabezadoBloque titulo="Flota" descripcion="Tipos de vehículo de la flota: unidades disponibles, velocidad media y capacidad de carga.">
        <Leyenda enCaliente={enCaliente} />
      </EncabezadoBloque>
      <div className="mb-3 flex flex-wrap gap-2">
        <span className={`rounded-lg border ${BORDE} bg-[var(--color-surface)] px-3 py-1.5 text-sm ${TEXTO}`}>
          <span className={`font-mono-code font-semibold ${TEXTO_FUERTE}`}>{totalUnidades}</span> vehículos
        </span>
        <span className={`rounded-lg border ${BORDE} bg-[var(--color-surface)] px-3 py-1.5 text-sm ${TEXTO}`}
          title="Suma de unidades × capacidad de cada tipo">
          <span className={`font-mono-code font-semibold ${TEXTO_FUERTE}`}>{capacidadTotal.toLocaleString('es-PE')}</span> paquetes de capacidad total
        </span>
      </div>
      {errores.flota && <div className="mb-3"><Aviso tono="error">{errores.flota}</Aviso></div>}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        {tipos.map((t) => {
          const f = values.tipos[t.id];
          const r = referencia.tipos[t.id];
          const oficial = oficiales?.tipos[t.id];
          if (!f || !r) return null;
          return (
            <Tarjeta
              key={t.id}
              titulo={<><IconoTipo id={t.id} />{t.nombre}</>}
              descripcion={CODIGO_TIPO[t.id] ? `Código ${CODIGO_TIPO[t.id]}` : undefined}
            >
              <div className="space-y-3">
                <CampoNumero label="Unidades" unidad="unid." min={0} paso={1} value={f.cantidad}
                  onChange={(v) => updateTipo(t.id, 'cantidad', v)} error={errores[claveTipo(t.id, 'cantidad')]}
                  modificado={distinto(f.cantidad, r.cantidad)} oficial={oficial?.cantidad}
                  aplicacion={enCaliente ? 'inicio' : undefined} bloqueado={enCaliente} motivoBloqueo={MOTIVO_SOLO_INICIO} />
                <CampoNumero label="Velocidad media" unidad="km/h" min={1} paso={1} value={f.velocidad}
                  onChange={(v) => updateTipo(t.id, 'velocidad', v)} error={errores[claveTipo(t.id, 'velocidad')]}
                  modificado={distinto(f.velocidad, r.velocidad)} oficial={oficial?.velocidad} aplicacion={enCaliente ? 'caliente' : undefined} />
                <CampoNumero label="Capacidad de carga" unidad="paq." min={1} paso={1} value={f.capacidad}
                  onChange={(v) => updateTipo(t.id, 'capacidad', v)} error={errores[claveTipo(t.id, 'capacidad')]}
                  modificado={distinto(f.capacidad, r.capacidad)} oficial={oficial?.capacidad} aplicacion={enCaliente ? 'caliente' : undefined} />
              </div>
            </Tarjeta>
          );
        })}
      </div>
    </div>
  );
};

export const BloqueAlmacenes: React.FC<BloqueProps> = ({ p }) => {
  const { configuracion, values, referencia, errores, enCaliente, updateAlmacen, oficiales } = p;
  if (!configuracion || !values || !referencia) return null;
  const { ancho, alto } = configuracion.ciudad;
  return (
    <div>
      <EncabezadoBloque titulo="Almacenes"
        descripcion={`Ubicación en la cuadrícula de la ciudad (0–${ancho} × 0–${alto} cuadras), capacidad y frecuencia de recarga de los almacenes intermedios.`}>
        <Leyenda enCaliente={enCaliente} />
      </EncabezadoBloque>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        {configuracion.almacenes.map((a) => {
          const f = values.almacenes[a.nombre];
          const r = referencia.almacenes[a.nombre];
          const oficial = oficiales?.almacenes[a.nombre];
          if (!f || !r) return null;
          return (
            <Tarjeta key={a.nombre}
              titulo={<><Warehouse className="h-4 w-4 text-blue-600 dark:text-blue-400" aria-hidden />{a.nombre}</>}
              descripcion={f.esCentral ? 'Almacén central · capacidad ilimitada' : 'Almacén intermedio'}>
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <CampoNumero label="Posición X" unidad="cuadra" min={0} max={ancho} paso={1} value={f.x}
                    onChange={(v) => updateAlmacen(a.nombre, 'x', v)} error={errores[claveAlmacen(a.nombre, 'x')]}
                    modificado={distinto(f.x, r.x)} oficial={oficial?.x} bloqueado={enCaliente} compacto />
                  <CampoNumero label="Posición Y" unidad="cuadra" min={0} max={alto} paso={1} value={f.y}
                    onChange={(v) => updateAlmacen(a.nombre, 'y', v)} error={errores[claveAlmacen(a.nombre, 'y')]}
                    modificado={distinto(f.y, r.y)} oficial={oficial?.y} bloqueado={enCaliente} compacto />
                </div>
                <p className={`-mt-1 flex flex-wrap items-center gap-1.5 text-xs ${TEXTO_TENUE}`}>
                  {enCaliente && <Insignia tipo="inicio" />}
                  {enCaliente ? null : oficial ? <>Estándar: <span className="font-mono-code">({oficial.x}, {oficial.y})</span></> : null}
                </p>
                {f.esCentral ? (
                  <p className={`rounded-lg border border-dashed ${BORDE} px-3 py-2 text-xs ${TEXTO_TENUE}`}>
                    Capacidad ilimitada (∞): no requiere recarga.
                  </p>
                ) : (
                  <>
                    <CampoNumero label="Capacidad" unidad="paq." min={1} paso={1} value={f.capacidad}
                      onChange={(v) => updateAlmacen(a.nombre, 'capacidad', v)} error={errores[claveAlmacen(a.nombre, 'capacidad')]}
                      modificado={distinto(f.capacidad, r.capacidad)} oficial={oficial?.capacidad} aplicacion={enCaliente ? 'caliente' : undefined} />
                    <CampoNumero label="Recarga cada" unidad="h" min={1} paso={1} value={f.frecuencia}
                      ayuda="Cada cuánto se repone el stock."
                      onChange={(v) => updateAlmacen(a.nombre, 'frecuencia', v)} error={errores[claveAlmacen(a.nombre, 'frecuencia')]}
                      modificado={distinto(f.frecuencia, r.frecuencia)} oficial={oficial?.frecuencia} aplicacion={enCaliente ? 'caliente' : undefined} />
                  </>
                )}
              </div>
            </Tarjeta>
          );
        })}
      </div>
    </div>
  );
};

const GRUPOS_OPERACION: { grupo: DefCampoOperacion['grupo']; titulo: string; descripcion: string; Icono: typeof Clock }[] = [
  { grupo: 'turno', titulo: 'Turnos y refrigerio', descripcion: 'Jornada de los conductores.', Icono: Clock },
  { grupo: 'tiempos', titulo: 'Tiempos de servicio', descripcion: 'Tiempo que se suma en cada parada de la ruta.', Icono: Timer },
  { grupo: 'rutas', titulo: 'Rutas', descripcion: 'Límites para armar las rutas.', Icono: Route },
];

export const BloqueOperacion: React.FC<BloqueProps> = ({ p }) => {
  const { values, referencia, errores, enCaliente, updateOperacion, oficiales } = p;
  if (!values || !referencia) return null;
  return (
    <div>
      <EncabezadoBloque titulo="Operación y turnos" descripcion="Turnos, tiempos de servicio y límites de las rutas.">
        <Leyenda enCaliente={enCaliente} conInicio={false} />
      </EncabezadoBloque>
      <div className="space-y-3">
        {GRUPOS_OPERACION.map(({ grupo, titulo, descripcion, Icono }) => (
          <Tarjeta key={grupo} titulo={<><Icono className="h-4 w-4 text-blue-600 dark:text-blue-400" aria-hidden />{titulo}</>} descripcion={descripcion}>
            <div className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2">
              {CAMPOS_OPERACION.filter((c) => c.grupo === grupo).map(({ campo, label, unidad, ayuda, min, max, paso }) => (
                <CampoNumero key={campo} label={label} unidad={unidad} ayuda={ayuda} min={min} max={max} paso={paso}
                  value={values.operacion[campo]} onChange={(v) => updateOperacion(campo, v)}
                  error={errores[claveOperacion(campo)]} modificado={distinto(values.operacion[campo], referencia.operacion[campo])}
                  oficial={oficiales?.operacion[campo]} />
              ))}
            </div>
          </Tarjeta>
        ))}
      </div>
    </div>
  );
};

/** Miniatura fija de la interfaz en un tema (no sigue el tema actual: muestra el que representa). */
const MiniaturaTema: React.FC<{ oscuro: boolean }> = ({ oscuro }) => {
  const c = oscuro
    ? { fondo: '#0B111E', barra: '#131D31', borde: '#334155', linea: '#1e293b', texto: '#94A3B8' }
    : { fondo: '#F5F6F8', barra: '#FFFFFF', borde: '#E2E8F0', linea: '#E2E8F0', texto: '#64748B' };
  return (
    <svg viewBox="0 0 160 90" className="h-auto w-full rounded-md" role="img" aria-label={oscuro ? 'Vista en tema oscuro' : 'Vista en tema claro'}>
      <rect width="160" height="90" fill={c.fondo} />
      <rect width="28" height="90" fill={c.barra} stroke={c.borde} strokeWidth="0.5" />
      {[14, 26, 38, 50].map((y) => <rect key={y} x="7" y={y} width="14" height="4" rx="2" fill={c.texto} opacity="0.6" />)}
      {[44, 60, 76, 92, 108, 124, 140].map((x) => <line key={x} x1={x} y1="8" x2={x} y2="84" stroke={c.linea} strokeWidth="0.8" />)}
      {[20, 34, 48, 62, 76].map((y) => <line key={y} x1="34" y1={y} x2="154" y2={y} stroke={c.linea} strokeWidth="0.8" />)}
      <polyline points="44,62 76,62 76,34 124,34" fill="none" stroke="#3B82F6" strokeWidth="1.8" />
      <circle cx="124" cy="34" r="3.2" fill="#10B981" />
      <circle cx="92" cy="76" r="3.2" fill="#F59E0B" />
      <circle cx="140" cy="62" r="3.2" fill="#F43F5E" />
      <rect x="40" y="58" width="8" height="8" rx="1.5" fill="#16A34A" />
    </svg>
  );
};

export const BloqueApariencia: React.FC<BloqueProps> = ({ p }) => {
  const { temaOscuro, elegirTema, cambiosPorBloque } = p;
  const opciones = [
    { oscuro: true, label: 'Oscuro', detalle: 'Recomendado para operación prolongada', Icono: Moon },
    { oscuro: false, label: 'Claro', detalle: 'Mejor en ambientes muy iluminados o al proyectar', Icono: Sun },
  ];
  return (
    <div>
      <EncabezadoBloque titulo="Apariencia" descripcion="Solo cambia cómo se ve, en este navegador." />
      <div className="space-y-3">
        <Tarjeta titulo="Tema de la interfaz"
          descripcion="Se ve al instante; se conserva al guardar.">
          <div role="radiogroup" aria-label="Tema de la interfaz" className="grid max-w-2xl grid-cols-1 gap-3 sm:grid-cols-2">
            {opciones.map(({ oscuro, label, detalle, Icono }) => {
              const activo = temaOscuro === oscuro;
              return (
                <button key={label} type="button" role="radio" aria-checked={activo} onClick={() => elegirTema(oscuro)}
                  className={`rounded-xl border-2 p-2 text-left transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 ${
                    activo ? 'border-blue-600 dark:border-blue-500' : `${BORDE} hover:border-slate-400 dark:hover:border-slate-500`}`}>
                  <MiniaturaTema oscuro={oscuro} />
                  <div className="mt-2 flex items-start justify-between gap-2 px-1 pb-1">
                    <div>
                      <span className={`flex items-center gap-1.5 text-sm font-semibold ${TEXTO_FUERTE}`}><Icono className="h-4 w-4" aria-hidden />{label}</span>
                      <span className={`text-xs ${TEXTO_TENUE}`}>{detalle}</span>
                    </div>
                    {activo && <span className="rounded-full bg-blue-600 p-0.5 text-white"><Check className="h-3.5 w-3.5" aria-hidden /></span>}
                  </div>
                </button>
              );
            })}
          </div>
          {cambiosPorBloque.apariencia > 0 && p.temaCambiado && (
            <p className="mt-3 text-xs text-blue-700 dark:text-blue-300">Vista previa sin guardar.</p>
          )}
        </Tarjeta>

        <Tarjeta titulo={<><Info className="h-4 w-4 text-blue-600 dark:text-blue-400" aria-hidden />Semáforos</>}
          descripcion="Desde qué valor cambia de color cada indicador. Solo cambian cómo se ve; se guardan en este navegador.">
          <EditorSemaforos p={p} />
        </Tarjeta>
      </div>
    </div>
  );
};

/** Resumen corto de cuándo se aplica lo guardado, para la barra de acciones. */
export const TextoAplicacion: React.FC<{ enCaliente: boolean }> = ({ enCaliente }) => (
  <span className={`inline-flex items-center gap-1 text-xs ${TEXTO_TENUE}`}>
    {enCaliente ? <><Zap className="h-3 w-3" aria-hidden />Se aplica en segundos</> : <><Lock className="h-3 w-3" aria-hidden />Se aplica al iniciar la simulación</>}
  </span>
);
