import type { ApiErrorDTO, ApiResponseDTO } from '../types/backend';

// El backend real expone todo bajo /api (ConsultaController, SimulacionController, etc.), nunca
// /api/v1 -- ver AlertasController/ConsultaController/IngestaController/SimulacionController.
const BASE_URL = (import.meta as { env?: Record<string, string> }).env?.VITE_API_URL || '/api';

export interface RequestOptions extends RequestInit {
  params?: Record<string, string | number | boolean | undefined>;
}

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
    public details?: { field: string; issue: string }[] | null
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

function isApiErrorDTO(value: unknown): value is ApiErrorDTO {
  return (
    typeof value === 'object' &&
    value !== null &&
    'error' in value &&
    typeof (value as ApiErrorDTO).error?.message === 'string'
  );
}

export const httpClient = {
  async request<T>(endpoint: string, options: RequestOptions = {}): Promise<T> {
    const { params, headers, ...customConfig } = options;

    let url = `${BASE_URL}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;

    if (params) {
      const searchParams = new URLSearchParams();
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined) {
          searchParams.append(key, String(value));
        }
      });
      const queryString = searchParams.toString();
      if (queryString) {
        url += (url.includes('?') ? '&' : '?') + queryString;
      }
    }

    const defaultHeaders: HeadersInit = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...headers,
    };

    let response: Response;
    try {
      response = await fetch(url, {
        headers: defaultHeaders,
        ...customConfig,
      });
    } catch (err: unknown) {
      throw new HttpError(0, (err as Error)?.message || 'Error de conexión de red');
    }

    if (!response.ok) {
      let body: unknown;
      try {
        body = await response.json();
      } catch {
        body = null;
      }
      if (isApiErrorDTO(body)) {
        throw new HttpError(response.status, body.error.message, body.error.code, body.error.details);
      }
      throw new HttpError(response.status, `Error HTTP ${response.status}`);
    }

    if (response.status === 204) {
      return undefined as T;
    }

    // Todo endpoint real envuelve su payload en ApiResponseDTO<T>{data, meta} -- se desenvuelve
    // aqui, una sola vez, para que el resto del front trabaje directamente con T.
    const envelope = (await response.json()) as ApiResponseDTO<T>;
    return envelope.data;
  },

  get<T>(endpoint: string, options?: RequestOptions): Promise<T> {
    return this.request<T>(endpoint, { ...options, method: 'GET' });
  },

  post<T>(endpoint: string, body?: unknown, options?: RequestOptions): Promise<T> {
    return this.request<T>(endpoint, {
      ...options,
      method: 'POST',
      body: body ? JSON.stringify(body) : undefined,
    });
  },

  put<T>(endpoint: string, body?: unknown, options?: RequestOptions): Promise<T> {
    return this.request<T>(endpoint, {
      ...options,
      method: 'PUT',
      body: body ? JSON.stringify(body) : undefined,
    });
  },

  delete<T>(endpoint: string, options?: RequestOptions): Promise<T> {
    return this.request<T>(endpoint, { ...options, method: 'DELETE' });
  },

  /** Para los 3 endpoints de carga de archivo, que esperan multipart/form-data, no JSON. */
  async postFile<T>(endpoint: string, file: File): Promise<T> {
    const formData = new FormData();
    formData.append('file', file);
    const url = `${BASE_URL}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;

    let response: Response;
    try {
      response = await fetch(url, { method: 'POST', body: formData });
    } catch (err: unknown) {
      throw new HttpError(0, (err as Error)?.message || 'Error de conexión de red');
    }

    if (!response.ok) {
      let body: unknown;
      try {
        body = await response.json();
      } catch {
        body = null;
      }
      if (isApiErrorDTO(body)) {
        throw new HttpError(response.status, body.error.message, body.error.code, body.error.details);
      }
      throw new HttpError(response.status, `Error HTTP ${response.status}`);
    }

    const envelope = (await response.json()) as ApiResponseDTO<T>;
    return envelope.data;
  },
};
