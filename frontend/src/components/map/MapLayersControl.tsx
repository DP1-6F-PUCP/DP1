import React from 'react';
import { Blocks, Route as RouteIcon, Package } from 'lucide-react';
import { useMapStore } from '../../store/mapStore';

/**
 * Control de capas del mapa -- antes activeLayers vivia en mapStore y RouteMap lo leia, pero
 * ningun componente lo exponia: el usuario no podia apagar/prender ninguna capa, quedaban
 * siempre en el valor por defecto (todas encendidas). No agrega capacidad nueva, solo la hace
 * accesible.
 */
export const MapLayersControl: React.FC = () => {
  const activeLayers = useMapStore((s) => s.activeLayers);
  const toggleLayer = useMapStore((s) => s.toggleLayer);

  const capas: { key: 'blockedStreets' | 'projectedRoutes' | 'orderPins'; label: string; Icon: typeof Blocks }[] = [
    { key: 'blockedStreets', label: 'Bloqueos', Icon: Blocks },
    { key: 'projectedRoutes', label: 'Destino seleccionado', Icon: RouteIcon },
    { key: 'orderPins', label: 'Pedidos', Icon: Package },
  ];

  return (
    <div className="absolute top-3 left-3 z-20 rounded-lg border border-slate-300 bg-white/95 backdrop-blur-sm px-2.5 py-2 space-y-1 shadow-sm">
      {capas.map(({ key, label, Icon }) => {
        const activo = activeLayers[key];
        return (
          <button
            key={key}
            type="button"
            onClick={() => toggleLayer(key)}
            aria-pressed={activo}
            title={`${activo ? 'Ocultar' : 'Mostrar'} ${label.toLowerCase()}`}
            className={`w-full flex items-center gap-2 px-2 py-1 rounded-md text-[10px] font-medium transition-colors ${
              activo
                ? 'text-slate-700 hover:bg-slate-100'
                : 'text-slate-400 hover:bg-slate-100 line-through decoration-slate-400'
            }`}
          >
            <Icon className={`h-3.5 w-3.5 shrink-0 ${activo ? 'text-cyan-600' : 'text-slate-400'}`} />
            <span>{label}</span>
          </button>
        );
      })}
    </div>
  );
};
