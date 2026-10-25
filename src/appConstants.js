import { LayoutGrid, Scale, Package, History } from "lucide-react";

// `import.meta.env` is replaced by Vite at build time; the fallback keeps these
// modules importable from plain Node (used by the unit tests).
const env = import.meta.env ?? {};

export const API_BASE = env.VITE_API_BASE || "/beantrack-api";
export const ESP32_WS_URL = env.VITE_ESP32_WS_URL || "ws://beantrack.local:81";

// Optional shared secret. Set BEANTRACK_API_TOKEN on the API and VITE_API_TOKEN
// on the frontend to enable it. This is a speed bump for a trusted LAN, not a
// replacement for real authentication.
export const API_TOKEN = env.VITE_API_TOKEN || "";

export const NAV = [
  { id: "dashboard", label: "Dashboard", icon: LayoutGrid },
  { id: "monitor", label: "Sorting & weight", icon: Scale },
  { id: "inventory", label: "Inventory", icon: Package },
  { id: "history", label: "Batch history", icon: History },
];

export const RECOMMENDED_SPEED = 40; // recommended vibration speed (%)
export const PROCESS_TICKS = 60;     // simulated run length (ticks)

// Auto-stop a run when recovered weight is unchanged (stuck mesh / debris).
// The ESP32 runs the same check; keep these values in sync with main.cpp.
export const WEIGHT_IDLE_MS = 10000; // no change for this long → batch complete
export const WEIGHT_CHANGE_G = 5;    // ignore load-cell jitter below this
export const WEIGHT_FLOW_G = 20;     // require this much gain before idle-stop

// Share of the input each deck ends with in the simulator
export const SIM_SHARE = { large: 0.41, medium: 0.39, debris: 0.2 };
export const SIM_CATEGORIES = ["Large", "Medium", "Fine / debris"];

// Sample rows shown only before the database has loaded
export const SEED_BATCHES = [
  { id: "B001", sample: true, date: "2026-09-13 08:02", beanType: "Arabica", mode: "Automatic", vibrationSpeed: 62, inputWeight: 1000,
    weights: { large: 370, medium: 400, debris: 230 }, processingTime: 12 * 60 },
  { id: "B002", sample: true, date: "2026-09-13 09:41", beanType: "Robusta", mode: "Automatic", vibrationSpeed: 55, inputWeight: 1200,
    weights: { large: 470, medium: 480, debris: 250 }, processingTime: 14 * 60 },
  { id: "B003", sample: true, date: "2026-09-14 07:55", beanType: "Arabica", mode: "Manual", vibrationSpeed: 48, inputWeight: 900,
    weights: { large: 300, medium: 340, debris: 260 }, processingTime: 16 * 60 },
  { id: "B004", sample: true, date: "2026-09-14 10:20", beanType: "Robusta", mode: "Automatic", vibrationSpeed: 58, inputWeight: 1100,
    weights: { large: 395, medium: 430, debris: 275 }, processingTime: 13 * 60 },
];
