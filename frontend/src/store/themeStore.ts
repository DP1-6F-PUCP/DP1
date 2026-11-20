import { create } from 'zustand';

interface ThemeState {
  /** Tema que se ve ahora (puede ser una vista previa sin guardar). */
  isDark: boolean;
  /** Tema guardado (localStorage): al que se vuelve si se descarta una vista previa. */
  savedIsDark: boolean;
  toggleTheme: () => void;
  setTheme: (theme: 'dark' | 'light') => void;
  /**
   * Vista previa: aplica el tema a la interfaz SIN guardarlo. Configuración la usa para que el
   * usuario vea el tema antes de "Guardar"; "Descartar" o salir sin guardar llaman a revertPreview.
   */
  previewTheme: (theme: 'dark' | 'light') => void;
  revertPreview: () => void;
}

const THEME_STORAGE_KEY = 'sysmile_theme';

const getInitialTheme = (): boolean => {
  if (typeof window === 'undefined') return true;
  try {
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    if (saved) return saved === 'dark';
  } catch {
    // Sin storage: tema por defecto.
  }
  return true; // Default oscuro oficial
};

const applyThemeToDOM = (isDark: boolean) => {
  if (typeof document === 'undefined') return;
  document.documentElement.classList.toggle('dark', isDark);
};

const persist = (isDark: boolean) => {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, isDark ? 'dark' : 'light');
  } catch {
    // Sin storage el tema solo vive en memoria.
  }
};

const initialIsDark = getInitialTheme();
applyThemeToDOM(initialIsDark);

export const useThemeStore = create<ThemeState>((set, get) => ({
  isDark: initialIsDark,
  savedIsDark: initialIsDark,
  toggleTheme: () => get().setTheme(get().isDark ? 'light' : 'dark'),
  setTheme: (theme) => {
    const isDark = theme === 'dark';
    persist(isDark);
    applyThemeToDOM(isDark);
    set({ isDark, savedIsDark: isDark });
  },
  previewTheme: (theme) => {
    const isDark = theme === 'dark';
    applyThemeToDOM(isDark);
    set({ isDark });
  },
  revertPreview: () => {
    const { savedIsDark, isDark } = get();
    if (savedIsDark === isDark) return;
    applyThemeToDOM(savedIsDark);
    set({ isDark: savedIsDark });
  },
}));
