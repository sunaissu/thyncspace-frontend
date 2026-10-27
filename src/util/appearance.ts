export const APPEARANCE_STORAGE_KEY = "thyncspace-appearance";
export const COLOR_SCHEMES = ["default", "ocean", "forest", "plum", "custom"] as const;
export type ColorScheme = (typeof COLOR_SCHEMES)[number];
export interface BrandColors { primary: string; secondary: string }
export interface ScrollbarPreference {
  mode: "native" | "custom" | "hidden";
  thumbColor: string;
  trackColor: string;
  transparentTrack: boolean;
  thin: boolean;
}
export interface PackageScrollbarOptions {
  thumbColor?: string;
  trackColor?: string;
  width?: "auto" | "thin" | "none";
}
export interface AppearancePreferences {
  version: 1;
  colorScheme: ColorScheme;
  customBrandColors: BrandColors;
  scrollbar: ScrollbarPreference;
}
export const SCHEME_COLORS: Record<"ocean" | "forest" | "plum", BrandColors> = {
  ocean: { primary: "#2563eb", secondary: "#06b6d4" },
  forest: { primary: "#15803d", secondary: "#ca8a04" },
  plum: { primary: "#9333ea", secondary: "#db2777" },
};
export const DEFAULT_APPEARANCE: AppearancePreferences = {
  version: 1,
  colorScheme: "default",
  customBrandColors: { primary: "#2563eb", secondary: "#06b6d4" },
  scrollbar: {
    mode: "native", thumbColor: "#667085", trackColor: "#e4e4e7",
    transparentTrack: true, thin: false,
  },
};

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function color(value: unknown, fallback: string): string {
  return typeof value === "string" && /^#[\da-f]{6}$/i.test(value)
    ? value.toLowerCase()
    : fallback;
}

export function normalizeAppearance(value: unknown): AppearancePreferences {
  const input = record(value);
  if (input.version !== undefined && input.version !== 1) return normalizeAppearance(null);
  const brand = record(input.customBrandColors);
  const scrollbar = record(input.scrollbar);
  return {
    version: 1,
    colorScheme: COLOR_SCHEMES.includes(input.colorScheme as ColorScheme)
      ? input.colorScheme as ColorScheme : "default",
    customBrandColors: {
      primary: color(brand.primary, DEFAULT_APPEARANCE.customBrandColors.primary),
      secondary: color(brand.secondary, DEFAULT_APPEARANCE.customBrandColors.secondary),
    },
    scrollbar: {
      mode: scrollbar.mode === "custom" || scrollbar.mode === "hidden" ? scrollbar.mode : "native",
      thumbColor: color(scrollbar.thumbColor, DEFAULT_APPEARANCE.scrollbar.thumbColor),
      trackColor: color(scrollbar.trackColor, DEFAULT_APPEARANCE.scrollbar.trackColor),
      transparentTrack: typeof scrollbar.transparentTrack === "boolean" ? scrollbar.transparentTrack : true,
      thin: scrollbar.thin === true,
    },
  };
}

export function readAppearance(serialized: string | null): AppearancePreferences {
  try { return normalizeAppearance(JSON.parse(serialized ?? "null")); }
  catch { return normalizeAppearance(null); }
}

export function getPackageBrandColors(appearance: AppearancePreferences, accent: BrandColors): BrandColors {
  if (appearance.colorScheme === "default") return accent;
  if (appearance.colorScheme === "custom") return appearance.customBrandColors;
  return SCHEME_COLORS[appearance.colorScheme];
}

export function getPackageScrollbar(preference: ScrollbarPreference): PackageScrollbarOptions | undefined {
  if (preference.mode === "hidden") return { width: "none" };
  if (preference.mode === "native") return preference.thin ? { width: "thin" } : undefined;
  return {
    thumbColor: preference.thumbColor,
    trackColor: preference.transparentTrack ? "transparent" : preference.trackColor,
    width: preference.thin ? "thin" : "auto",
  };
}

/** Choose the more readable label color for custom accent buttons. */
export function contrastText(hex: string): "#000000" | "#ffffff" {
  const [red, green, blue] = [1, 3, 5].map(offset => {
    const channel = parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  const luminance = 0.2126 * red + 0.7152 * green + 0.0722 * blue;
  return (luminance + 0.05) / 0.05 >= 1.05 / (luminance + 0.05) ? "#000000" : "#ffffff";
}
