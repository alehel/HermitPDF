"use client";

import { createContext, useContext, useCallback, useState, useSyncExternalStore } from "react";

type Theme = "light" | "dark";

const ThemeContext = createContext<{
  theme: Theme;
  toggleTheme: () => void;
}>({ theme: "light", toggleTheme: () => {} });

export function useTheme() {
  return useContext(ThemeContext);
}

function createThemeStore() {
  let listeners: Array<() => void> = [];

  function getSnapshot(): Theme {
    if (typeof window === "undefined") return "light";
    return document.documentElement.classList.contains("dark") ? "dark" : "light";
  }

  function getServerSnapshot(): Theme {
    return "light";
  }

  function subscribe(callback: () => void) {
    listeners.push(callback);
    return () => {
      listeners = listeners.filter((l) => l !== callback);
    };
  }

  function setTheme(next: Theme) {
    localStorage.setItem("pw-theme", next);
    if (next === "dark") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
    listeners.forEach((l) => l());
  }

  return { subscribe, getSnapshot, getServerSnapshot, setTheme };
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [store] = useState(createThemeStore);
  const theme = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot);

  const toggleTheme = useCallback(() => {
    store.setTheme(theme === "light" ? "dark" : "light");
  }, [store, theme]);

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}
