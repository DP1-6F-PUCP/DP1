import { create } from 'zustand';

interface ThemeState {
  isDark: boolean;
  toggleTheme: () => void;
  setTheme: (theme: 'dark' | 'light') => void;
}

const THEME_STORAGE_KEY = 'sysmile_theme';

const getInitialTheme = (): boolean => {
  if (typeof window === 'undefined') return true;
  const saved = localStorage.getItem(THEME_STORAGE_KEY);
  if (saved) {
    return saved === 'dark';
  }
  return true; // Default oscuro oficial
};

const applyThemeToDOM = (isDark: boolean) => {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (isDark) {
    root.classList.add('dark');
  } else {
    root.classList.remove('dark');
  }
};

const initialIsDark = getInitialTheme();
applyThemeToDOM(initialIsDark);

export const useThemeStore = create<ThemeState>((set) => ({
  isDark: initialIsDark,
  toggleTheme: () =>
    set((state) => {
      const next = !state.isDark;
      localStorage.setItem(THEME_STORAGE_KEY, next ? 'dark' : 'light');
      applyThemeToDOM(next);
      return { isDark: next };
    }),
  setTheme: (theme) => {
    const isDark = theme === 'dark';
    localStorage.setItem(THEME_STORAGE_KEY, theme);
    applyThemeToDOM(isDark);
    set({ isDark });
  },
}));
