import React, { useCallback, useEffect, useRef, useState } from 'react';

/** Distancia (px) al borde derecho y al borde superior o inferior (según `anclaje`) del contenedor. */
export interface PosicionFlotante {
  derecha: number;
  vertical: number;
}

const MARGEN = 4;

const leer = <T,>(clave: string, porDefecto: T): T => {
  try {
    const valor = window.localStorage.getItem(clave);
    return valor ? (JSON.parse(valor) as T) : porDefecto;
  } catch {
    return porDefecto;
  }
};

const guardar = (clave: string, valor: unknown) => {
  try {
    window.localStorage.setItem(clave, JSON.stringify(valor));
  } catch {
    // sin almacenamiento disponible (modo privado): solo no se recuerda
  }
};

/**
 * Panel flotante sobre el mapa que se puede arrastrar (desde su encabezado) y colapsar. Queda
 * anclado a la esquina derecha superior o inferior, nunca se sale del contenedor (también al
 * cambiar el tamaño de la ventana), y posición y estado colapsado se recuerdan en el navegador.
 */
export function usePanelFlotante(clave: string, inicial: PosicionFlotante, anclaje: 'arriba' | 'abajo') {
  const [colapsado, setColapsado] = useState(() => leer(`${clave}.colapsado`, false));
  const [posicion, setPosicion] = useState<PosicionFlotante>(() => {
    const guardada = leer<Partial<PosicionFlotante>>(`${clave}.posicion`, inicial);
    return Number.isFinite(guardada.derecha) && Number.isFinite(guardada.vertical)
      ? (guardada as PosicionFlotante) : inicial;
  });
  const ref = useRef<HTMLElement>(null);
  const arrastre = useRef<{ x: number; y: number; inicio: PosicionFlotante } | null>(null);

  const acotar = useCallback((p: PosicionFlotante): PosicionFlotante => {
    const panel = ref.current;
    const padre = panel?.offsetParent as HTMLElement | null;
    if (!panel || !padre) return p;
    const maxDerecha = Math.max(MARGEN, padre.clientWidth - panel.offsetWidth - MARGEN);
    const maxVertical = Math.max(MARGEN, padre.clientHeight - panel.offsetHeight - MARGEN);
    return {
      derecha: Math.min(maxDerecha, Math.max(MARGEN, p.derecha)),
      vertical: Math.min(maxVertical, Math.max(MARGEN, p.vertical)),
    };
  }, []);

  useEffect(() => {
    const reacomodar = () => setPosicion((p) => acotar(p));
    reacomodar();
    window.addEventListener('resize', reacomodar);
    return () => window.removeEventListener('resize', reacomodar);
  }, [acotar, colapsado]);

  const manejadores = {
    onPointerDown: (e: React.PointerEvent<HTMLElement>) => {
      if ((e.target as HTMLElement).closest('button')) return; // los botones no arrastran
      arrastre.current = { x: e.clientX, y: e.clientY, inicio: posicion };
      e.currentTarget.setPointerCapture(e.pointerId);
    },
    onPointerMove: (e: React.PointerEvent<HTMLElement>) => {
      const a = arrastre.current;
      if (!a) return;
      const dy = e.clientY - a.y;
      setPosicion(acotar({
        derecha: a.inicio.derecha - (e.clientX - a.x),
        vertical: anclaje === 'arriba' ? a.inicio.vertical + dy : a.inicio.vertical - dy,
      }));
    },
    onPointerUp: (e: React.PointerEvent<HTMLElement>) => {
      if (!arrastre.current) return;
      arrastre.current = null;
      e.currentTarget.releasePointerCapture(e.pointerId);
      setPosicion((p) => {
        guardar(`${clave}.posicion`, p);
        return p;
      });
    },
  };

  const alternar = () => {
    setColapsado((c) => {
      guardar(`${clave}.colapsado`, !c);
      return !c;
    });
  };

  const style: React.CSSProperties = anclaje === 'arriba'
    ? { right: posicion.derecha, top: posicion.vertical }
    : { right: posicion.derecha, bottom: posicion.vertical };

  return {
    ref,
    style,
    colapsado,
    alternar,
    manejadoresArrastre: { ...manejadores, onPointerCancel: manejadores.onPointerUp },
  };
}
