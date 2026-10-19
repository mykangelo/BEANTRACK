import { X, AlertTriangle } from "lucide-react";
import { C, mono } from "../appTokens";

export default function WifiResetConfirm({ onCancel, onConfirm }) {
  const btnBase = {
    borderRadius: 999,
    padding: "9px 18px",
    fontWeight: 700,
    cursor: "pointer",
    ...mono,
    fontSize: 12.5,
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(34,22,9,0.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 50,
      }}
    >
      <div
        style={{
          background: C.panel,
          borderRadius: 24,
          padding: 24,
          width: 420,
          maxWidth: "90vw",
          boxShadow: C.glassShadow,
        }}
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2" style={{ fontSize: 16, fontWeight: 700 }}>
            <AlertTriangle size={18} color={C.amber} />
            Change the ESP32 Wi-Fi?
          </div>
          <button onClick={onCancel} title="Close" style={{ background: "transparent", border: "none", cursor: "pointer" }}>
            <X size={18} />
          </button>
        </div>

        <div style={{ fontSize: 13, color: C.textDim, lineHeight: 1.6 }}>
          This clears the Wi-Fi network saved on the ESP32 and restarts it. The board will then open
          its <b>BeanTrack-Setup</b> network so you can connect it to a new one.
        </div>
        <div style={{ fontSize: 12, color: C.textFaint, marginTop: 10, lineHeight: 1.5 }}>
          The dashboard will show offline until the new network is set. A sorting run cannot be in
          progress.
        </div>

        <div className="flex items-center justify-end gap-3 mt-6">
          <button
            onClick={onCancel}
            style={{ ...btnBase, background: "transparent", border: `1px solid ${C.glassLine}`, color: C.textDim }}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            style={{ ...btnBase, background: C.goldGradient, border: "none", color: C.text }}
          >
            Reset Wi-Fi
          </button>
        </div>
      </div>
    </div>
  );
}