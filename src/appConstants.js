import { LayoutGrid, Scale, Package, History } from "lucide-react";

export const API_BASE = import.meta.env.VITE_API_BASE || "/beantrack-api";
export const ESP32_WS_URL = import.meta.env.VITE_ESP32_WS_URL || "ws://beantrack.local:81";

export const NAV = [
  { id: "dashboard", label: "Dashboard", icon: LayoutGrid },
  { id: "monitor", label: "Sorting & weight", icon: Scale },
  { id: "inventory", label: "Inventory", icon: Package },
  { id: "history", label: "Batch history", icon: History },
];

// Two weighed decks: Large (top) and Medium (bottom). Fine/debris has no load cell.
export const CATS = ["large", "medium", "debris"];
export const CAT_LABEL = { large: "Large", medium: "Medium", debris: "Fine / debris" };
export const CAT_COLOR = { large: "#E3BE58", medium: "#B98A3E", debris: "#231710" };
export const BIN_INFO = { large: "Bin 1 · >5 mm", medium: "Bin 2 · 4–5 mm", debris: "Bin 3 · <4 mm" };

export const RECOMMENDED_SPEED = 40; // recommended vibration speed (%)
export const PROCESS_TICKS = 60;     // simulated run length (ticks)

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