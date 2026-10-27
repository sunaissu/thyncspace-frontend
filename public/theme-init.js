(function () {
  var root = document.documentElement;
  var themeColors = { light: "#f6f6f7", dark: "#0a0a0b" };
  var accentThemes = ["blue", "violet", "emerald", "amber", "rose"];
  var schemes = {
    ocean: { primary: "#2563eb", secondary: "#06b6d4" },
    forest: { primary: "#15803d", secondary: "#ca8a04" },
    plum: { primary: "#9333ea", secondary: "#db2777" }
  };

  function stored(key) {
    try { return localStorage.getItem(key); } catch { return null; }
  }
  function object(value) {
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  }
  function color(value, fallback) {
    return typeof value === "string" && /^#[\da-f]{6}$/i.test(value) ? value.toLowerCase() : fallback;
  }
  function contrastText(hex) {
    var values = [1, 3, 5].map(function (offset) {
      var value = parseInt(hex.slice(offset, offset + 2), 16) / 255;
      return value <= 0.04045 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4);
    });
    var luminance = 0.2126 * values[0] + 0.7152 * values[1] + 0.0722 * values[2];
    return (luminance + 0.05) / 0.05 >= 1.05 / (luminance + 0.05) ? "#000000" : "#ffffff";
  }

  var preference = stored("thyncspace-theme");
  var systemDark = true;
  try { systemDark = window.matchMedia("(prefers-color-scheme: dark)").matches; } catch { /* Default to dark if unavailable. */ }
  var theme = preference === "light" || preference === "dark" ? preference : systemDark ? "dark" : "light";
  var accent = stored("thyncspace-accent");
  root.dataset.theme = theme;
  root.dataset.accent = accentThemes.indexOf(accent) >= 0 ? accent : "blue";
  root.style.colorScheme = theme;
  var themeColor = document.querySelector('meta[name="theme-color"]');
  if (themeColor) themeColor.setAttribute("content", themeColors[theme]);

  var appearance = {};
  try { appearance = object(JSON.parse(stored("thyncspace-appearance") || "null")); } catch { /* Use defaults for malformed data. */ }
  if (appearance.version !== undefined && appearance.version !== 1) appearance = {};
  var scheme = ["default", "ocean", "forest", "plum", "custom"].indexOf(appearance.colorScheme) >= 0 ? appearance.colorScheme : "default";
  root.dataset.colorScheme = scheme;
  var custom = object(appearance.customBrandColors);
  var brand = scheme === "custom"
    ? { primary: color(custom.primary, "#2563eb"), secondary: color(custom.secondary, "#06b6d4") }
    : schemes[scheme];
  if (brand) {
    root.style.setProperty("--color-accent", brand.primary);
    root.style.setProperty("--color-accent-strong", brand.primary);
    root.style.setProperty("--color-on-accent", contrastText(brand.primary));
    root.style.setProperty("--color-on-accent-strong", contrastText(brand.primary));
    root.style.setProperty("--color-accent-green", brand.secondary);
  }

  var scrollbar = object(appearance.scrollbar);
  var mode = scrollbar.mode === "custom" || scrollbar.mode === "hidden" ? scrollbar.mode : "native";
  var thumb = color(scrollbar.thumbColor, "#667085");
  var track = scrollbar.transparentTrack === false ? color(scrollbar.trackColor, "#e4e4e7") : "transparent";
  root.dataset.scrollbar = mode;
  root.style.setProperty("--app-scrollbar-width", mode === "hidden" ? "none" : scrollbar.thin === true ? "thin" : "auto");
  root.style.setProperty("--app-scrollbar-color", mode === "custom" ? thumb + " " + track : "auto");
  root.style.setProperty("--app-scrollbar-thumb", thumb);
  root.style.setProperty("--app-scrollbar-track", track);
  root.style.setProperty("--app-scrollbar-size", scrollbar.thin === true ? "8px" : "12px");
})();
