import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertOctagon, RotateCcw } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
  onReset?: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class MapErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Permite console.error para registro según eslint
    console.error('Error no controlado en MapErrorBoundary:', error, errorInfo);
  }

  private handleRetry = () => {
    this.setState({ hasError: false, error: null });
    if (this.props.onReset) {
      this.props.onReset();
    }
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div
          role="alert"
          aria-live="assertive"
          className="flex flex-col items-center justify-center w-full h-full min-h-[350px] p-6 rounded-2xl border-2 border-dashed border-rose-500/40 bg-rose-950/20 text-center text-slate-100"
        >
          <div className="p-3 rounded-2xl bg-rose-500/20 text-rose-400 mb-3 border border-rose-500/30">
            <AlertOctagon className="h-8 w-8" />
          </div>
          <h3 className="text-base font-bold text-white mb-1">
            {this.props.fallbackTitle || 'Error al renderizar el mapa de despacho'}
          </h3>
          <p className="text-xs text-slate-300 max-w-md mb-4 leading-relaxed">
            Se produjo un error visual al calcular las coordenadas del mapa.
            {this.state.error?.message && ` (${this.state.error.message})`}
          </p>
          <button
            type="button"
            onClick={this.handleRetry}
            className="btn-primary py-2 px-4 rounded-xl text-xs font-semibold inline-flex items-center gap-2 shadow"
          >
            <RotateCcw className="h-4 w-4" /> Reintentar carga del mapa
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
