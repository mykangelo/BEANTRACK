export const C = {
  bg: "#F1E8D2", panel: "#FBF6E9", panelRaised: "#ECDCAF", line: "#C7AC79", lineLit: "#8B6B3D",
  text: "#241A10", textDim: "#6B5233", textFaint: "#9C8558", amber: "#C99A2E", green: "#5C3B1E",
  red: "#1C130B", blue: "#3D2914", arabica: "#A9752D", robusta: "#2B1B0E", sidebarBg: "#221609",
  sidebarText: "#F1E8D2", sidebarTextDim: "#A5885A", sidebarBorder: "#3D2914", glass: "rgba(255,252,244,0.60)",
  glassStrong: "rgba(255,251,240,0.72)", glassBorder: "rgba(255,255,255,0.85)", glassLine: "rgba(120,84,40,0.16)",
  glassDark: "rgba(34,22,9,0.78)", glassShadow: "0 1px 2px rgba(90,58,24,0.06), 0 18px 44px -14px rgba(90,58,24,0.24)",
  glassGradient: "linear-gradient(180deg, rgba(255,255,255,0.62) 0%, rgba(255,251,240,0.40) 100%)",
  goldGradient: "linear-gradient(135deg, #EDC66B 0%, #C99A2E 100%)",
  brownGradient: "linear-gradient(135deg, #7A4B28 0%, #4A2E17 100%)",
};

export const blur = { backdropFilter: "blur(16px) saturate(150%)", WebkitBackdropFilter: "blur(16px) saturate(150%)" };
export const sans = { fontFamily: "'Plus Jakarta Sans', 'Inter', 'Segoe UI', sans-serif" };
export const mono = { fontFamily: "'Plus Jakarta Sans', 'Inter', 'Segoe UI', sans-serif", fontVariantNumeric: "tabular-nums" };

export const display = { fontFamily: "'Fraunces', 'Playfair Display', Georgia, 'Times New Roman', serif" };

export const STATUS_COLOR = {
  Idle: C.textFaint,
  Processing: C.amber,
  Completed: C.green,
  Error: C.red,
};