(function () {
  var themeColors = { light: "#f6f6f7", dark: "#0a0a0b" };
  var accentThemes = ["blue", "violet", "emerald", "amber", "rose"];

  function applyTheme(theme) {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    var themeColor = document.querySelector('meta[name="theme-color"]');
    if (themeColor) themeColor.setAttribute("content", themeColors[theme]);
  }

  try {
    var storedPreference = localStorage.getItem("thyncspace-theme");
    var preference =
      storedPreference === "light" ||
      storedPreference === "dark" ||
      storedPreference === "system"
        ? storedPreference
        : "system";
    var systemDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    var theme = preference === "system" ? (systemDark ? "dark" : "light") : preference;
    var storedAccent = localStorage.getItem("thyncspace-accent");
    var accent = accentThemes.indexOf(storedAccent) >= 0 ? storedAccent : "blue";
    document.documentElement.dataset.accent = accent;
    applyTheme(theme);
  } catch {
    document.documentElement.dataset.accent = "blue";
    applyTheme("dark");
  }
})();
