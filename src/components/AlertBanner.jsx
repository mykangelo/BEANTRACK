import { AlertTriangle, Scale, Boxes } from "lucide-react";
import { C, blur, mono } from "../appTokens";

// Faults the machine can report (real ones come from the ESP32)
export const FAULTS = {
  jam: {
    code: "E-JAM", icon: AlertTriangle, title: "Sieve jammed",
    message: "The vibration motor is running but the sieve isn't moving. Stop the machine, clear the beans blocking the mesh, then acknowledge.",
  },
  loadcell: {
    code: "E-LOADCELL", icon: Scale, title: "Load cell not responding",
    message: "No reading from the HX711 module. Check the load cell wiring, then acknowledge.",
  },
  binfull: {
    code: "E-BIN-FULL", icon: Boxes, title: "Collection bin full",
    message: "The ultrasonic sensor reports the bin is at its limit. Empty the bin before sorting again.",
  },
};

export function AlertBanner({ severity, icon: Icon, code, title, message, action }) {
  const isError = severity === "error";
  const accent = isError ? C.amber : C.green;
  return (
    <div
      role="alert"
      className="flex items-center gap-4 px-4 py-3"
      style={{
        background: isError ? "rgba(34,22,9,0.92)" : "rgba(232,178,58,0.30)",
        border: `1px solid ${isError ? "rgba(232,178,58,0.55)" : "rgba(201,154,46,0.65)"}`,
        borderRadius: 22,
        boxShadow: C.glassShadow,
        color: isError ? C.sidebarText : C.text,
        ...blur,
      }}
    >
      <div
        className="flex items-center justify-center shrink-0"
        style={{
          width: 38,
          height: 38,
          borderRadius: 12,
          background: isError ? "rgba(232,178,58,0.18)" : "rgba(92,59,30,0.12)",
          border: `1px solid ${accent}66`,
          animation: isError ? "bt-pulse 1.6s ease-in-out infinite" : "none",
        }}
      >
        <Icon size={18} color={accent} />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span style={{ fontSize: 13.5, fontWeight: 700 }}>{title}</span>
          <span style={{ ...mono, fontSize: 10.5, color: accent, border: `1px solid ${accent}55`, borderRadius: 999, padding: "1px 8px" }}>
            {code}
          </span>
        </div>
        <div style={{ fontSize: 12.5, marginTop: 2, opacity: 0.85, lineHeight: 1.5 }}>{message}</div>
      </div>

      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className="shrink-0"
          style={{
            ...mono,
            fontSize: 12,
            fontWeight: 700,
            padding: "8px 14px",
            borderRadius: 12,
            border: "none",
            cursor: "pointer",
            background: isError ? C.amber : C.green,
            color: isError ? C.text : C.panel,
          }}
        >
          {action.label}
        </button>
      )}
    </div>
  );
}