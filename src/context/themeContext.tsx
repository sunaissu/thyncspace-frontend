import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  APPEARANCE_STORAGE_KEY,
  DEFAULT_APPEARANCE,
  contrastText,
  getPackageBrandColors,
  getPackageScrollbar,
  normalizeAppearance,
  readAppearance,
  type AppearancePreferences,
  type BrandColors,
  type ColorScheme,
  type PackageScrollbarOptions,
  type ScrollbarPreference,
} from "../util/appearance";

export type ThemePreference = "system" | "light" | "dark";
export type ResolvedTheme = "light" | "dark";
export const ACCENT_THEMES = [
  "blue",
  "violet",
  "emerald",
  "amber",
  "rose",
] as const;
export type AccentTheme = (typeof ACCENT_THEMES)[number];
// Noteboard names its active/focus color `primary`; ThyncSpace maps that to
// the selected accent and keeps its supporting `secondary` color neutral.
export const ACCENT_BRAND_COLORS: Record<
  AccentTheme,
  Record<ResolvedTheme, { primary: string; secondary: string }>
> = {
  blue: {
    light: { primary: "#0b63e5", secondary: "#27272a" },
    dark: { primary: "#60a5fa", secondary: "#e4e4e7" },
  },
  violet: {
    light: { primary: "#6d28d9", secondary: "#27272a" },
    dark: { primary: "#a78bfa", secondary: "#e4e4e7" },
  },
  emerald: {
    light: { primary: "#047857", secondary: "#27272a" },
    dark: { primary: "#6ee7b7", secondary: "#e4e4e7" },
  },
  amber: {
    light: { primary: "#92400e", secondary: "#27272a" },
    dark: { primary: "#fbbf24", secondary: "#e4e4e7" },
  },
  rose: {
    light: { primary: "#be123c", secondary: "#27272a" },
    dark: { primary: "#fb7185", secondary: "#e4e4e7" },
  },
};

interface ThemeContextValue {
  preference: ThemePreference;
  resolvedTheme: ResolvedTheme;
  accentTheme: AccentTheme;
  setPreference: (preference: ThemePreference) => void;
  setAccentTheme: (accentTheme: AccentTheme) => void;
  colorScheme: ColorScheme;
  setColorScheme: (scheme: ColorScheme) => void;
  customBrandColors: BrandColors;
  setCustomBrandColors: (colors: Partial<BrandColors>) => void;
  scrollbarPreference: ScrollbarPreference;
  setScrollbarPreference: (changes: Partial<ScrollbarPreference>) => void;
  packageBrandColors: BrandColors;
  packageScrollbar: PackageScrollbarOptions | undefined;
  appearanceStorageError: string;
}

export const THEME_STORAGE_KEY = "thyncspace-theme";
export const ACCENT_STORAGE_KEY = "thyncspace-accent";
export const THEME_COLORS: Record<ResolvedTheme, string> = {
  light: "#f6f6f7",
  dark: "#0a0a0b",
};

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

const getSystemTheme = (): ResolvedTheme => {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return "dark";
  }

  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
};

const getStoredPreference = (): ThemePreference => {
  if (typeof window === "undefined") return "system";

  try {
    const storedPreference = window.localStorage.getItem(THEME_STORAGE_KEY);
    return storedPreference === "light" ||
      storedPreference === "dark" ||
      storedPreference === "system"
      ? storedPreference
      : "system";
  } catch {
    return "system";
  }
};

const getStoredAccentTheme = (): AccentTheme => {
  if (typeof window === "undefined") return "blue";

  try {
    const storedAccent = window.localStorage.getItem(ACCENT_STORAGE_KEY);
    return ACCENT_THEMES.includes(storedAccent as AccentTheme)
      ? (storedAccent as AccentTheme)
      : "blue";
  } catch {
    return "blue";
  }
};

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [preference, setPreferenceState] =
    useState<ThemePreference>(getStoredPreference);
  const [accentTheme, setAccentThemeState] =
    useState<AccentTheme>(getStoredAccentTheme);
  const [systemTheme, setSystemTheme] = useState<ResolvedTheme>(() => {
    if (typeof window === "undefined") return "dark";
    return getSystemTheme();
  });
  const [appearance, setAppearance] = useState<AppearancePreferences>(DEFAULT_APPEARANCE);
  const [appearanceReady, setAppearanceReady] = useState(false);
  const [appearanceStorageError, setAppearanceStorageError] = useState("");

  useEffect(() => {
    const load = () => {
      try { setAppearance(readAppearance(window.localStorage.getItem(APPEARANCE_STORAGE_KEY))); }
      catch { setAppearance(normalizeAppearance(null)); }
      setAppearanceReady(true);
    };
    load();
    const onStorage = (event: StorageEvent) => {
      if (event.key === APPEARANCE_STORAGE_KEY || event.key === null) load();
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  useEffect(() => {
    if (!appearanceReady) return;
    try {
      window.localStorage.setItem(APPEARANCE_STORAGE_KEY, JSON.stringify(appearance));
      setAppearanceStorageError("");
    } catch {
      setAppearanceStorageError("Appearance applies now, but this browser could not save it for next time.");
    }
  }, [appearance, appearanceReady]);

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const updateSystemTheme = () => setSystemTheme(getSystemTheme());
    updateSystemTheme();
    mediaQuery.addEventListener("change", updateSystemTheme);
    return () => mediaQuery.removeEventListener("change", updateSystemTheme);
  }, []);

  const resolvedTheme = preference === "system" ? systemTheme : preference;
  const packageBrandColors = useMemo(
    () => getPackageBrandColors(appearance, ACCENT_BRAND_COLORS[accentTheme][resolvedTheme]),
    [appearance, accentTheme, resolvedTheme],
  );
  const packageScrollbar = useMemo(() => getPackageScrollbar(appearance.scrollbar), [appearance.scrollbar]);

  useEffect(() => {
    document.documentElement.dataset.theme = resolvedTheme;
    document.documentElement.style.colorScheme = resolvedTheme;
    document
      .querySelector<HTMLMetaElement>('meta[name="theme-color"]')
      ?.setAttribute("content", THEME_COLORS[resolvedTheme]);
  }, [resolvedTheme]);

  useEffect(() => {
    document.documentElement.dataset.accent = accentTheme;
  }, [accentTheme]);

  useEffect(() => {
    if (!appearanceReady) return;
    const root = document.documentElement;
    root.dataset.colorScheme = appearance.colorScheme;
    const colors: Record<string, string> = appearance.colorScheme === "default" ? {} : {
      "--color-accent": packageBrandColors.primary,
      "--color-accent-strong": packageBrandColors.primary,
      "--color-on-accent": contrastText(packageBrandColors.primary),
      "--color-on-accent-strong": contrastText(packageBrandColors.primary),
      "--color-accent-green": packageBrandColors.secondary,
    };
    const properties = ["--color-accent", "--color-accent-strong", "--color-on-accent", "--color-on-accent-strong", "--color-accent-green"];
    for (const property of properties) {
      if (colors[property]) root.style.setProperty(property, colors[property]);
      else root.style.removeProperty(property);
    }
  }, [appearanceReady, appearance.colorScheme, packageBrandColors]);

  useEffect(() => {
    if (!appearanceReady) return;
    const root = document.documentElement;
    const scrollbar = appearance.scrollbar;
    root.dataset.scrollbar = scrollbar.mode;
    root.style.setProperty("--app-scrollbar-width", scrollbar.mode === "hidden" ? "none" : scrollbar.thin ? "thin" : "auto");
    root.style.setProperty("--app-scrollbar-color", scrollbar.mode === "custom" ? `${scrollbar.thumbColor} ${scrollbar.transparentTrack ? "transparent" : scrollbar.trackColor}` : "auto");
    root.style.setProperty("--app-scrollbar-thumb", scrollbar.thumbColor);
    root.style.setProperty("--app-scrollbar-track", scrollbar.transparentTrack ? "transparent" : scrollbar.trackColor);
    root.style.setProperty("--app-scrollbar-size", scrollbar.thin ? "8px" : "12px");
  }, [appearanceReady, appearance.scrollbar]);

  const setPreference = useCallback((nextPreference: ThemePreference) => {
    setPreferenceState(nextPreference);
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, nextPreference);
    } catch {
      // The active preference still applies for this session when storage is blocked.
    }
  }, []);

  const setAccentTheme = useCallback((nextAccentTheme: AccentTheme) => {
    setAccentThemeState(nextAccentTheme);
    try {
      window.localStorage.setItem(ACCENT_STORAGE_KEY, nextAccentTheme);
    } catch {
      // The selected accent still applies for this session when storage is blocked.
    }
  }, []);

  const setColorScheme = useCallback((colorScheme: ColorScheme) => {
    setAppearance(current => normalizeAppearance({ ...current, colorScheme }));
  }, []);
  const setCustomBrandColors = useCallback((colors: Partial<BrandColors>) => {
    setAppearance(current => normalizeAppearance({ ...current, colorScheme: "custom", customBrandColors: { ...current.customBrandColors, ...colors } }));
  }, []);
  const setScrollbarPreference = useCallback((changes: Partial<ScrollbarPreference>) => {
    setAppearance(current => normalizeAppearance({ ...current, scrollbar: { ...current.scrollbar, ...changes } }));
  }, []);

  const value = useMemo(
    () => ({
      preference,
      resolvedTheme,
      accentTheme,
      setPreference,
      setAccentTheme,
      colorScheme: appearance.colorScheme,
      setColorScheme,
      customBrandColors: appearance.customBrandColors,
      setCustomBrandColors,
      scrollbarPreference: appearance.scrollbar,
      setScrollbarPreference,
      packageBrandColors,
      packageScrollbar,
      appearanceStorageError,
    }),
    [preference, resolvedTheme, accentTheme, setPreference, setAccentTheme, appearance, setColorScheme, setCustomBrandColors, setScrollbarPreference, packageBrandColors, packageScrollbar, appearanceStorageError],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("useTheme must be used inside ThemeProvider");
  return context;
}
