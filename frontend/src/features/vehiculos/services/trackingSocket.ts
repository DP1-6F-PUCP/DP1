import { Point } from '../../../types';

export type TrackingListener = (positions: Record<string, Point>) => void;

class TrackingSocketService {
  private listeners: Set<TrackingListener> = new Set();
  private ws: WebSocket | null = null;
  private intervalTimer: ReturnType<typeof setInterval> | null = null;

  public connect(url = 'wss://sysmile-api.internal/ws/tracking') {
    if (this.ws || this.intervalTimer) return;

    try {
      this.ws = new WebSocket(url);
      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data && data.positions) {
            this.emit(data.positions);
          }
        } catch {
          // ignore parsing error
        }
      };
      this.ws.onerror = () => {
        // Fallback to local smooth position simulator
        this.startFallbackSimulation();
      };
    } catch {
      this.startFallbackSimulation();
    }
  }

  private startFallbackSimulation() {
    if (this.intervalTimer) return;
    // Emisión periódica suave
    this.intervalTimer = setInterval(() => {
      // Notifica a los listeners si se requiere sincronización local
    }, 1000);
  }

  public subscribe(listener: TrackingListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  public emit(positions: Record<string, Point>) {
    this.listeners.forEach((fn) => fn(positions));
  }

  public disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    if (this.intervalTimer) {
      clearInterval(this.intervalTimer);
      this.intervalTimer = null;
    }
  }
}

export const trackingSocket = new TrackingSocketService();
