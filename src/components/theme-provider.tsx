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
    // 默认深色：不再回退到系统 prefers-color-scheme，避免浅色系统下被被动切成 light。
    setMode(savedMode ?? "dark");
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
        // 与 globals.css 的 --font-sans 保持一致，避免 antd 组件与页面字体不一致。
        fontFamily:
          '"Segoe UI", "Noto Sans SC", "HarmonyOS Sans SC", "PingFang SC", "Microsoft YaHei UI", "Microsoft YaHei", "DengXian", system-ui, sans-serif',
        // 标题与 <strong> 的默认字重：antd 默认 600 会在只有 400/700 的中文字体上
        // 落到 Bold，大型标题显得生硬；降到 500 更柔和。
        fontWeightStrong: 500,
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
