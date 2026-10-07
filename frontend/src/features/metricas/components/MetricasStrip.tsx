import React from 'react';
import { DollarSign, CheckCircle2, XCircle, Repeat, Wrench, Construction } from 'lucide-react';
import type { MetricasOperacionDTO } from '../../../types/backend';

interface MetricasStripProps {
  metricas: MetricasOperacionDTO | undefined;
}

/**
 * MetricasOperacionDTO tiene 7 campos; antes de este componente solo se leia
 * contadorIncumplidos (para el banner de ejecucion detenida) -- el resto, incluido
 * costoTotalAcumulado (el resultado real de la optimizacion ALNS/IPSO), se transportaba desde el
 * backend y se descartaba sin mostrarse en ningun lado.
 */
export const MetricasStrip: React.FC<MetricasStripProps> = ({ metricas }) => {
  if (!metricas) return null;

  const chips = [
    {
      key: 'costo',
      icon: DollarSign,
      label: 'Costo acumulado',
      value: metricas.costoTotalAcumulado.toLocaleString('es-PE', { maximumFractionDigits: 1 }),
      color: 'text-cyan-300 bg-cyan-950/40 border-cyan-500/40',
    },
    {
      key: 'a-tiempo',
      icon: CheckCircle2,
      label: '% a tiempo',
      value: `${metricas.porcentajeEntregasATiempo.toFixed(0)}%`,
      color: 'text-emerald-300 bg-emerald-950/40 border-emerald-500/40',
    },
    {
      key: 'entregados',
      icon: CheckCircle2,
      label: 'Entregados',
      value: metricas.contadorEntregados,
      color: 'text-emerald-300 bg-emerald-950/40 border-emerald-500/40',
    },
    {
      key: 'incumplidos',
      icon: XCircle,
      label: 'Incumplidos',
      value: metricas.contadorIncumplidos,
      color: 'text-rose-300 bg-rose-950/40 border-rose-500/40',
    },
    {
      key: 'reasignadas',
      icon: Repeat,
      label: 'Paradas reasignadas',
      value: metricas.contadorParadasReasignadas,
      color: 'text-amber-300 bg-amber-950/40 border-amber-500/40',
    },
    {
      key: 'averias',
      icon: Wrench,
      label: 'Averías',
      value: metricas.contadorAverias,
      color: 'text-amber-300 bg-amber-950/40 border-amber-500/40',
    },
    {
      key: 'bloqueos',
      icon: Construction,
      label: 'Interferencias por bloqueo',
      value: metricas.contadorInterferenciasBloqueo,
      color: 'text-amber-300 bg-amber-950/40 border-amber-500/40',
    },
  ];

  return (
    <div className="flex items-center gap-2 flex-wrap text-xs font-mono-code">
      {chips.map((c) => {
        const Icon = c.icon;
        return (
          <div key={c.key} className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border ${c.color}`} title={c.label}>
            <Icon className="h-3 w-3" />
            <span>{c.label}: {c.value}</span>
          </div>
        );
      })}
    </div>
  );
};
