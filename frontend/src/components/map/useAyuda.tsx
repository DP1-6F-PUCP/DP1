import React, { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

/**
 * Ayuda al pasar el mouse (o enfocar con teclado). Reemplaza al `title` nativo: el panel se vuelve a
 * dibujar varias veces por segundo y, cada vez que el texto cambiaba (p. ej. "vence en 2h 15m"), el
 * navegador cerraba o hacía parpadear su globo. Este queda abierto mientras el puntero esté encima,
 * con el texto al día, en letra legible, y no tapa nada del panel: va en un portal sobre la página,
 * arriba de la tarjeta (o debajo si no cabe), ajustado a los bordes de la ventana. No captura el
 * puntero, así que no puede "robarse" el hover y cerrarse solo.
 */
export function useAyuda(texto: string, contenido?: React.ReactNode) {
  const id = useId();
  const ancla = useRef<HTMLElement | null>(null);
  const globo = useRef<HTMLDivElement | null>(null);
  const espera = useRef<number | undefined>(undefined);
  const [abierta, setAbierta] = useState(false);

  const abrir = () => { window.clearTimeout(espera.current); espera.current = window.setTimeout(() => setAbierta(true), 250); };
  const cerrar = () => { window.clearTimeout(espera.current); setAbierta(false); };
  useEffect(() => () => window.clearTimeout(espera.current), []);

  // Se reubica en cada dibujo (el texto puede cambiar de largo); sin estado, para no provocar otro dibujo.
  useLayoutEffect(() => {
    if (!abierta || !ancla.current || !globo.current) return;
    const a = ancla.current.getBoundingClientRect();
    const g = globo.current.getBoundingClientRect();
    const margen = 8;
    const left = Math.min(Math.max(margen, a.left + a.width / 2 - g.width / 2), window.innerWidth - g.width - margen);
    const arriba = a.top - g.height - 6;
    const top = arriba >= margen ? arriba : Math.min(a.bottom + 6, window.innerHeight - g.height - margen);
    globo.current.style.left = `${left}px`;
    globo.current.style.top = `${top}px`;
    globo.current.style.visibility = 'visible';
  });

  const props = {
    ref: (el: HTMLElement | null) => { ancla.current = el; },
    onPointerEnter: abrir,
    onPointerLeave: cerrar,
    onFocus: abrir,
    onBlur: cerrar,
    'aria-describedby': abierta ? id : undefined,
  };
  const nodo = abierta && texto
    ? createPortal(
      <div
        ref={globo}
        id={id}
        role="tooltip"
        style={{ position: 'fixed', left: 0, top: 0, visibility: 'hidden' }}
        className="tema-panel pointer-events-none z-[3000] max-w-[230px] space-y-0.5 rounded-lg border border-slate-600 bg-slate-900 px-2.5 py-1.5 text-xs leading-snug shadow-xl"
      >
        {contenido ?? texto.split('\n').map((linea, i) => (
          <div key={i} className={i === 0 ? 'font-semibold text-slate-50' : 'text-slate-300'}>{linea}</div>
        ))}
      </div>,
      document.body,
    )
    : null;
  return { props, nodo };
}
