import React from 'react';
import { BookOpen, Car, ChevronDown, ChevronUp, Coffee, GripVertical, MapPin } from 'lucide-react';
import { AlmacenSolido, EstrellaCentral } from './AlmacenSolido';
import { FaBicycle, FaMotorcycle } from 'react-icons/fa';
import { usePanelFlotante } from '../../hooks/usePanelFlotante';
import { WAREHOUSE_STOCK_COLORS } from '../../utils/warehouseStock';

/*
 * Colores tomados de LeafletManhattanMap (marcadores, rutas y bloqueos) y de warehouseStock: si
 * cambian allá, hay que actualizarlos aquí.
 */
const CARGA = [
  { hex: '#16A34A', label: 'Carga alta (≥ 66 %)' },
  { hex: '#EAB308', label: 'Carga media' },
  { hex: '#DC2626', label: 'Poca carga (< 33 %)' },
  { hex: '#6B7280', label: 'Regresa o va a cargar' },
];
const AVERIAS = [
  { hex: '#8B5CF6', texto: 'A1', label: 'Avería tipo 1' },
  { hex: '#EC4899', texto: 'A2', label: 'Avería tipo 2' },
  { hex: '#14B8A6', texto: 'A3', label: 'Avería tipo 3' },
];
const PEDIDOS = [
  { hex: '#10B981', label: 'A tiempo' },
  { hex: '#F59E0B', label: 'En riesgo' },
  { hex: '#F43F5E', label: 'Retrasado' },
  { hex: '#991B1B', label: 'Colapsado' },
];
const ALMACENES = (['high', 'medium', 'low', 'empty'] as const).map((nivel) => WAREHOUSE_STOCK_COLORS[nivel]);

/** Bloque de la leyenda: título y sus filas, separado del anterior por una línea. */
const Seccion: React.FC<{ titulo: string; children: React.ReactNode }> = ({ titulo, children }) => (
  <section className="space-y-1.5 border-t border-[var(--color-sidebar-border)] pt-2 first:border-t-0 first:pt-0">
    <h3 className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{titulo}</h3>
    {children}
  </section>
);

/** Fila de elementos del mismo tipo (una escala o un conjunto), en columnas iguales y en orden. */
const Fila: React.FC<{ columnas: 1 | 2 | 3; rotulo?: string; children: React.ReactNode }> = ({ columnas, rotulo, children }) => (
  <div>
    {rotulo && <div className="mb-0.5 text-[10px] text-slate-500">{rotulo}</div>}
    <ul className={`grid gap-x-2 gap-y-1 ${columnas === 3 ? 'grid-cols-3' : columnas === 2 ? 'grid-cols-2' : 'grid-cols-1'}`}>
      {children}
    </ul>
  </div>
);

const Item: React.FC<{ simbolo: React.ReactNode; children: React.ReactNode }> = ({ simbolo, children }) => (
  <li className="flex min-w-0 items-center gap-1.5 text-[11px] text-slate-200">
    <span className="flex h-4 w-4 shrink-0 items-center justify-center" aria-hidden>{simbolo}</span>
    <span className="truncate">{children}</span>
  </li>
);
const Punto: React.FC<{ hex: string }> = ({ hex }) => (
  <span className="block h-3 w-3 rounded-[3px]" style={{ backgroundColor: hex }} />
);

const Linea: React.FC<{ color: string; punteada?: boolean; grosor?: number }> = ({ color, punteada, grosor = 2.5 }) => (
  <svg width="16" height="8" viewBox="0 0 16 8">
    <line x1="1" y1="4" x2="15" y2="4" stroke={color} strokeWidth={grosor} strokeLinecap="round"
      strokeDasharray={punteada ? '3 3' : undefined} />
  </svg>
);

/**
 * Leyenda del mapa: qué significa cada color y símbolo (vehículos, pedidos, almacenes, rutas y
 * bloqueos). Panel flotante como los relojes y los indicadores: se arrastra desde el encabezado,
 * se colapsa, y recuerda posición y estado. Arranca en la esquina inferior izquierda.
 */
export const LeyendaMapa: React.FC = () => {
  // Esquina inferior izquierda: el lado derecho ya tiene relojes e indicadores.
  const panel = usePanelFlotante('paqrap.panel.leyenda.izq', { derecha: 12, vertical: 12 }, 'abajo', 'izquierda');

  return (
    <section
      ref={panel.ref}
      style={panel.style}
      aria-label="Leyenda del mapa"
      className={`absolute z-[1000] ${panel.colapsado ? '' : 'w-[316px]'} rounded-xl border border-[var(--color-sidebar-border)] bg-[var(--color-sidebar-background)]/95 text-slate-100 shadow-xl backdrop-blur-sm select-none`}
    >
      <div
        {...panel.manejadoresArrastre}
        title="Arrastra para mover"
        className="flex cursor-grab touch-none items-center gap-1.5 px-2 py-1.5 active:cursor-grabbing"
      >
        <GripVertical className="h-4 w-4 shrink-0 text-slate-500" aria-hidden />
        <BookOpen className="h-4 w-4 shrink-0 text-cyan-400" aria-hidden />
        <span className="text-xs font-semibold text-slate-200">Leyenda</span>
        <button
          type="button"
          onClick={panel.alternar}
          aria-expanded={!panel.colapsado}
          aria-label={panel.colapsado ? 'Mostrar leyenda' : 'Colapsar leyenda'}
          className="ml-auto rounded p-0.5 text-slate-400 hover:text-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-400"
        >
          {panel.colapsado ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
        </button>
      </div>

      {!panel.colapsado && (
        // Alto máximo: hasta debajo de los controles del mapa (zoom, ver ciudad y capas, ~200 px arriba a
        // la izquierda); si no alcanza, se desplaza por dentro.
        <div className="max-h-[max(160px,calc(100vh-330px))] space-y-2 overflow-y-auto px-3 pb-2.5">
          <Seccion titulo="Vehículos">
            <Fila columnas={3} rotulo="Tipo">
              <Item simbolo={<Car className="h-3.5 w-3.5 text-slate-300" />}>Auto</Item>
              <Item simbolo={<FaMotorcycle className="h-3.5 w-3.5 text-slate-300" />}>Moto</Item>
              <Item simbolo={<FaBicycle className="h-3.5 w-3.5 text-slate-300" />}>Bicicleta</Item>
            </Fila>
            <Fila columnas={3} rotulo="Color según su carga">
              <Item simbolo={<Punto hex={CARGA[0].hex} />}>Alta ≥66%</Item>
              <Item simbolo={<Punto hex={CARGA[1].hex} />}>Media</Item>
              <Item simbolo={<Punto hex={CARGA[2].hex} />}>Baja &lt;33%</Item>
            </Fila>
          </Seccion>

          <Seccion titulo="Estado del vehículo">
            <Fila columnas={2}>
              <Item simbolo={<span className="vehiculo-entregando"><span className="glifo-pulso block h-3 w-3 rounded-[3px] bg-slate-300" /></span>}>
                Entregando
              </Item>
              <Item simbolo={
                <span className="flex h-4 w-4 items-center justify-center rounded-full border border-white bg-[#FBBF24]">
                  <Coffee className="h-2.5 w-2.5 text-slate-800" strokeWidth={2.8} />
                </span>
              }>En refrigerio</Item>
              <Item simbolo={
                <span className="flex h-4 w-4 items-center justify-center rounded-full border-[1.5px] border-white bg-[#1F3864] text-[8px] font-bold text-white">3</span>
              }>Detenidos juntos</Item>
              <Item simbolo={<Punto hex={CARGA[3].hex} />}>Va al almacén</Item>
            </Fila>
            <Fila columnas={3} rotulo="Avería">
              {AVERIAS.map((a, i) => (
                <Item key={a.texto} simbolo={
                  <span className="flex h-4 w-4 items-center justify-center rounded-full border-[1.5px] bg-white text-[7px] font-extrabold"
                    style={{ borderColor: a.hex, color: a.hex }}>{a.texto}</span>
                }>Tipo {i + 1}</Item>
              ))}
            </Fila>
          </Seccion>

          <Seccion titulo="Pedidos (destino)">
            <Fila columnas={2}>
              {PEDIDOS.map((p) => (
                <Item key={p.hex} simbolo={<MapPin className="h-4 w-4" fill={p.hex} color="#ffffff" strokeWidth={1.8} />}>{p.label}</Item>
              ))}
            </Fila>
          </Seccion>

          <Seccion titulo="Almacenes">
            <Fila columnas={2} rotulo="Color según su stock">
              {ALMACENES.map((a) => (
                <Item key={a.label} simbolo={<AlmacenSolido color={a.hex} size={15} />}>{a.label}</Item>
              ))}
            </Fila>
            <Fila columnas={1}>
              <Item simbolo={<EstrellaCentral size={14} />}>Almacén central</Item>
            </Fila>
          </Seccion>

          <Seccion titulo="Calles">
            <Fila columnas={1}>
              <Item simbolo={<Linea color="#64748b" punteada />}>Ruta planificada de un vehículo</Item>
              <Item simbolo={<Linea color="#38bdf8" grosor={3.5} />}>Ruta del vehículo o pedido seleccionado</Item>
              <Item simbolo={<Linea color="#C62828" grosor={3.2} />}>Calle bloqueada</Item>
            </Fila>
          </Seccion>
        </div>
      )}
    </section>
  );
};
