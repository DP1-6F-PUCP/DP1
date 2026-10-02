import { create } from 'zustand';

export interface User {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'dispatcher' | 'viewer';
}

interface AuthState {
  token: string | null;
  user: User | null;
  isAuthenticated: boolean;
  login: (token: string, user: User) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  token: typeof window !== 'undefined' ? localStorage.getItem('sysmile_token') || 'demo-jwt-token' : 'demo-jwt-token',
  user: typeof window !== 'undefined'
    ? JSON.parse(localStorage.getItem('sysmile_user') || 'null') || {
        id: 'u-1',
        email: 'despacho@sysmile.pe',
        name: 'Operador de Despacho',
        role: 'dispatcher',
      }
    : null,
  isAuthenticated: true, // Default autenticado para experiencia fluida, listo para JWT real

  login: (token, user) => {
    localStorage.setItem('sysmile_token', token);
    localStorage.setItem('sysmile_user', JSON.stringify(user));
    set({ token, user, isAuthenticated: true });
  },

  logout: () => {
    localStorage.removeItem('sysmile_token');
    localStorage.removeItem('sysmile_user');
    set({ token: null, user: null, isAuthenticated: false });
  },
}));
