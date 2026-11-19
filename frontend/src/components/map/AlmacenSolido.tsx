import React from 'react';

/**
 * Almacén sólido (relleno con el color del semáforo de stock, con la puerta en blanco). El glifo de
 * lucide era solo contorno y sobre el mapa se veía transparente. Lo usan el mapa y la leyenda.
 */
export const AlmacenSolido: React.FC<{ color: string; size?: number }> = ({ color, size = 24 }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
    {/* galpón: techo a dos aguas y cuerpo */}
    <path d="M1.5 9.2 12 2.6l10.5 6.6V21.4H1.5z" fill={color} />
    {/* portón con persiana */}
    <rect x="6" y="11.6" width="12" height="9.8" rx="0.6" fill="#ffffff" />
    <path d="M6 14.9h12M6 18.1h12" stroke={color} strokeWidth="1.5" />
  </svg>
);

/** Distintivo del almacén central (principal): estrella blanca sobre círculo azul. */
export const EstrellaCentral: React.FC<{ size?: number }> = ({ size = 11 }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
    <circle cx="12" cy="12" r="11.5" fill="#2563eb" stroke="#ffffff" strokeWidth="1.5" />
    <path d="m12 5.2 2.05 4.15 4.58.67-3.31 3.23.78 4.56L12 15.66l-4.1 2.15.78-4.56L5.37 10.02l4.58-.67z" fill="#ffffff" />
  </svg>
);
