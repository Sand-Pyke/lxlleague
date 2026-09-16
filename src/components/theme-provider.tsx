"use client";

import { App as AntdApp, ConfigProvider, theme } from "antd";
import type { ThemeConfig } from "antd";
import { createContext, useContext, useEffect, useMemo, useState } from "react";

type ThemeMode = "light" | "dark";
type ThemeContextValue = { mode: ThemeMode; toggleTheme: () => void };

const ThemeModeContext = createContext<ThemeContextValue | null>(null);

export function useThemeMode() {
  const context = useContext(ThemeModeContext);
  if (!context) throw new Error("useThemeMode must be used inside ThemeProvider");
  return context;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setMode] = useState<ThemeMode>("dark");

  useEffect(() => {
    const savedMode = window.localStorage.getItem("lxl-theme") as ThemeMode | null;
    const preferredMode = window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
    setMode(savedMode ?? preferredMode);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = mode;
    window.localStorage.setItem("lxl-theme", mode);
  }, [mode]);

  const config = useMemo<ThemeConfig>(
    () => ({
      algorithm: mode === "dark" ? theme.darkAlgorithm : theme.defaultAlgorithm,
      token: {
        colorPrimary: "#6d5dfc",
        colorInfo: "#6d5dfc",
        borderRadius: 12,
        fontFamily: '"PingFang SC", "Microsoft YaHei", system-ui, sans-serif',
      },
      components: {
        Card: { borderRadiusLG: 16 },
        Button: { fontWeight: 600 },
        Menu: { itemBorderRadius: 8 },
      },
    }),
    [mode],
  );

  return (
    <ThemeModeContext.Provider
      value={{ mode, toggleTheme: () => setMode((value) => (value === "dark" ? "light" : "dark")) }}
    >
      <ConfigProvider theme={config} componentSize="middle">
        <AntdApp>{children}</AntdApp>
      </ConfigProvider>
    </ThemeModeContext.Provider>
  );
}
