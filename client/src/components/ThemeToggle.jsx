import React, { useEffect, useState } from 'react';
import { Sun, Moon } from 'lucide-react';

export default function ThemeToggle() {
  const [theme, setTheme] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('theme');
      if (saved) return saved;
      const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      return systemPrefersDark ? 'dark' : 'light';
    }
    return 'light';
  });

  useEffect(() => {
    const root = window.document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => (prev === 'light' ? 'dark' : 'light'));
  };

  return (
    <button
      onClick={toggleTheme}
      className="p-2.5 rounded-xl border border-card-border/60 bg-card-bg/50 hover:bg-card-bg/90 hover:border-card-border text-text-main transition-all duration-200 cursor-pointer shadow-sm active:scale-95 group focus:outline-none"
      aria-label="Toggle theme"
      id="theme-toggle-btn"
    >
      {theme === 'light' ? (
        <Moon className="w-5 h-5 text-accent transition-transform duration-300 group-hover:rotate-12" />
      ) : (
        <Sun className="w-5 h-5 text-accent transition-transform duration-300 group-hover:scale-110" />
      )}
    </button>
  );
}
