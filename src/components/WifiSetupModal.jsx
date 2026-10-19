import { useEffect, useState } from "react";
import { X, Loader2, CheckCircle2 } from "lucide-react";
import { C, mono } from "../appTokens";

const SETUP_HOST = "http://192.168.4.1";

export default function WifiSetupModal({ onClose, connected, currentNetwork }) {
  const [step, setStep] = useState(1);            // 1 instructions, 2 choose network, 3 waiting or done
  const [networks, setNetworks] = useState([]);
  const [ssid, setSsid] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  // Only report success after the board has dropped offline and come back,
  // so an ESP32 that is still connected before the reset does not count
  const [sawOffline, setSawOffline] = useState(false);
  useEffect(() => {
    if (!connected) setSawOffline(true);
  }, [connected]);

  const done = step === 3 && connected && sawOffline;

  async function loadNetworks() {
    setBusy(true);
    setError(null);
    try {
      const statusRes = await fetch(`${SETUP_HOST}/api/status`);
      if (!statusRes.ok) throw new Error();
      const scanRes = await fetch(`${SETUP_HOST}/api/scan`);
      const scan = await scanRes.json();
      const list = Array.isArray(scan) ? scan : [];
      setNetworks(list);
      setSsid("");
      setStep(2);
      if (!list.length) setError("No networks found. Press Scan again.");
    } catch {
      setError("Cannot reach BeanTrack-Setup. Check that your laptop is connected to it.");
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    if (!ssid.trim()) return setError("Choose a network.");
    if (password.length < 8) return setError("The password must be at least 8 characters.");

    setBusy(true);
    setError(null);
    try {
      const body = new URLSearchParams({ ssid: ssid.trim(), password });
      const res = await fetch(`${SETUP_HOST}/api/save`, { method: "POST", body });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Not saved.");
      setStep(3);
    } catch (e) {
      setError(e.message || "Could not send the settings.");
    } finally {
      setBusy(false);
    }
  }

  const btn = {
    background: C.goldGradient,
    color: C.text,
    border: "none",
    borderRadius: 999,
    padding: "9px 18px",
    fontWeight: 700,
    cursor: busy ? "wait" : "pointer",
    opacity: busy ? 0.7 : 1,
    ...mono,
    fontSize: 12.5,
  };

  const inputStyle = {
    background: C.glassStrong,
    border: `1px solid ${C.glassLine}`,
    borderRadius: 10,
    padding: "8px 10px",
    fontSize: 13,
    color: C.text,
    width: "100%",
  };

  const labelStyle = {
    fontSize: 11,
    color: C.textFaint,
    fontWeight: 600,
    letterSpacing: "0.05em",
    textTransform: "uppercase",
    display: "block",
    marginBottom: 4,
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
          <div style={{ fontSize: 16, fontWeight: 700 }}>Connect the ESP32 to Wi-Fi</div>
          <button onClick={onClose} title="Close" style={{ background: "transparent", border: "none", cursor: "pointer" }}>
            <X size={18} />
          </button>
        </div>

        {step === 1 && (
          <div className="flex flex-col gap-3" style={{ fontSize: 13, color: C.textDim, lineHeight: 1.5 }}>
            <div>1. Open your Wi-Fi settings and join <b>BeanTrack-Setup</b> (password <span style={mono}>beantrack123</span>).</div>
            <div>2. Come back here and press <b>I'm connected</b>.</div>
            <div style={{ fontSize: 11.5, color: C.textFaint }}>
              While connected to the board, your laptop has no internet. Reconnect to your home Wi-Fi after saving.
            </div>
            <button style={btn} onClick={loadNetworks} disabled={busy}>
              {busy ? <Loader2 size={14} className="animate-spin" /> : "I'm connected"}
            </button>
          </div>
        )}

        {step === 2 && (
          <div className="flex flex-col gap-3">
            <div>
              <span style={labelStyle}>Network</span>
              <select style={inputStyle} value={ssid} onChange={(e) => setSsid(e.target.value)}>
                <option value="">Choose a network</option>
                {networks.map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </div>
            <div>
              <span style={labelStyle}>Password</span>
              <input
                style={inputStyle}
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="8 to 63 characters"
              />
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              <button style={btn} onClick={save} disabled={busy}>
                {busy ? "Sending..." : "Save and connect"}
              </button>
              <button
                onClick={loadNetworks}
                disabled={busy}
                style={{ background: "transparent", border: "none", color: C.textDim, cursor: "pointer", fontSize: 12.5 }}
              >
                Scan again
              </button>
            </div>
          </div>
        )}

        {step === 3 && !done && (
          <div className="flex flex-col gap-3" style={{ fontSize: 13, color: C.textDim, lineHeight: 1.5 }}>
            <div className="flex items-center gap-2" style={{ color: C.green, fontWeight: 700 }}>
              <CheckCircle2 size={18} /> Settings sent
            </div>
            <div className="flex items-center gap-2">
              <Loader2 size={14} className="animate-spin" />
              Waiting for the ESP32 to join <b>{ssid}</b>. Reconnect your laptop to your normal Wi-Fi now.
            </div>
          </div>
        )}

        {done && (
          <div className="flex flex-col gap-3" style={{ fontSize: 13, color: C.textDim, lineHeight: 1.5 }}>
            <div className="flex items-center gap-2" style={{ color: C.green, fontWeight: 700 }}>
              <CheckCircle2 size={18} /> ESP32 is online
            </div>
            <div>It is connected to <b>{currentNetwork || ssid}</b>.</div>
            <button style={btn} onClick={onClose}>Close</button>
          </div>
        )}

        {error && <div style={{ fontSize: 12.5, color: C.red, marginTop: 12 }}>{error}</div>}
      </div>
    </div>
  );
}