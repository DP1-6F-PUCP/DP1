import { TickUpdateDTO } from '../types/backend';

export type TickListener = (tick: TickUpdateDTO) => void;

/**
 * Cliente del unico WebSocket real del backend (/ws/simulation, ver SimulationWebSocketHandler /
 * SimulationBroadcaster): solo-servidor-a-cliente, empuja el lote completo (TickUpdateDTO) cada
 * vez que OrquestadorOperacion recalcula. No hay mensajes del cliente al servidor en este canal.
 */
class SimulationSocketService {
  private ws: WebSocket | null = null;
  private listeners: Set<TickListener> = new Set();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  // Estado de conexion observable (useSocketConectado) -- con el socket abierto, el polling de
  // useEstadoOperacion pasa a ser solo un respaldo lento en vez de duplicar cada lote.
  private conectado = false;
  private estadoListeners: Set<() => void> = new Set();

  private setConectado(valor: boolean) {
    if (this.conectado === valor) return;
    this.conectado = valor;
    this.estadoListeners.forEach((fn) => fn());
  }

  public isConectado = (): boolean => this.conectado;

  public subscribeEstado = (fn: () => void): (() => void) => {
    this.estadoListeners.add(fn);
    return () => {
      this.estadoListeners.delete(fn);
    };
  };

  public connect() {
    if (this.ws) return;

    const base = (import.meta as { env?: Record<string, string> }).env?.VITE_WS_URL;
    const url = base || `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}/ws/simulation`;

    try {
      this.ws = new WebSocket(url);
      this.ws.onopen = () => this.setConectado(true);
      this.ws.onmessage = (event) => {
        try {
          const tick = JSON.parse(event.data) as TickUpdateDTO;
          this.listeners.forEach((fn) => fn(tick));
        } catch {
          // mensaje no parseable, se ignora
        }
      };
      this.ws.onclose = () => {
        this.ws = null;
        this.setConectado(false);
        this.scheduleReconnect();
      };
      this.ws.onerror = () => {
        this.ws?.close();
      };
    } catch {
      this.ws = null;
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, 5000);
  }

  public subscribe(listener: TickListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  public disconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.ws?.close();
    this.ws = null;
    this.setConectado(false);
  }
}

export const simulationSocket = new SimulationSocketService();
