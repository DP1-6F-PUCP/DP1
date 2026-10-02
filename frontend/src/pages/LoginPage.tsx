import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { useToast } from '../components/ToastProvider';
import { Truck, Lock, Mail, ArrowRight } from 'lucide-react';

export const LoginPage: React.FC = () => {
  const [email, setEmail] = useState('despacho@sysmile.pe');
  const [password, setPassword] = useState('sysmile2026');
  const [isLoading, setIsLoading] = useState(false);

  const login = useAuthStore((s) => s.login);
  const navigate = useNavigate();
  const location = useLocation();
  const { addToast } = useToast();

  const from = (location.state as { from?: { pathname?: string } })?.from?.pathname || '/';

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    setTimeout(() => {
      login('jwt-mock-valid-token-2026', {
        id: 'u-1',
        email,
        name: 'Operador de Despacho',
        role: 'dispatcher',
      });
      setIsLoading(false);
      addToast({
        type: 'success',
        title: 'Sesión iniciada',
        description: 'Bienvenido al panel central de despacho SysMile.',
      });
      navigate(from, { replace: true });
    }, 400);
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center p-4 bg-[#0B111E] text-slate-100">
      <div className="w-full max-w-md p-8 rounded-3xl bg-slate-900 border border-slate-800 shadow-2xl space-y-6">
        <div className="text-center space-y-2">
          <div className="inline-flex p-3 rounded-2xl bg-blue-600/20 text-blue-400 border border-blue-500/30 mb-2">
            <Truck className="h-8 w-8" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white font-mono-code">
            Sys<span className="text-blue-400">Mile</span> TMS
          </h1>
          <p className="text-xs text-slate-400">
            Control Logístico y Ruteo Dinámico VRP (1INF54)
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          <div className="space-y-1.5">
            <label className="font-semibold text-slate-300">Correo Electrónico</label>
            <div className="relative">
              <Mail className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="operador@sysmile.pe"
                className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-slate-100 focus:outline-none focus:border-blue-500 text-xs"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="font-semibold text-slate-300">Contraseña</label>
            <div className="relative">
              <Lock className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-slate-100 focus:outline-none focus:border-blue-500 text-xs"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full btn-primary py-2.5 px-4 rounded-xl font-semibold flex items-center justify-center gap-2 shadow-lg transition-all"
          >
            {isLoading ? 'Autenticando...' : 'Iniciar Sesión'}
            <ArrowRight className="h-4 w-4" />
          </button>
        </form>

        <div className="pt-4 border-t border-slate-800 text-center text-[11px] text-slate-500">
          Credenciales de demostración preconfiguradas para ingreso rápido.
        </div>
      </div>
    </div>
  );
};
