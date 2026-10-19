import { useState } from "react";
import { Wifi, Eye, EyeOff, Loader2 } from "lucide-react";
import { C, mono } from "../appTokens";
import { Panel, IconChip } from "./ui";

// Returns an object of error messages. An empty object means the form is valid.
export function validateWifi({ name, password, confirm, open }) {
  const errors = {};
  const ssid = name.trim();
  const badChars = /["\\]/;

  if (!ssid) errors.name = "Enter the Wi-Fi network name.";
  else if (ssid.length > 32) errors.name = "The network name must be 32 characters or fewer.";

  if (!open) {
    if (password.length < 8) errors.password = "The password must be at least 8 characters.";
    else if (password.length > 63) errors.password = "The password must be 63 characters or fewer.";
    else if (confirm !== password) errors.confirm = "The two passwords do not match.";
  }

  if (badChars.test(ssid) || (!open && badChars.test(password))) {
    errors.chars = 'Quotes (") and backslashes (\\) cannot be used. Remove them and try again.';
  }
  return errors;
}

const labelStyle = {
  fontSize: 11,
  color: C.textFaint,
  fontWeight: 600,
  letterSpacing: "0.05em",
  textTransform: "uppercase",
  marginBottom: 4,
  display: "block",
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

function SubmitButton({ children, disabled }) {
  const [hover, setHover] = useState(false);
  return (
    <button
      type="submit"
      disabled={disabled}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      className="flex items-center justify-center gap-2 px-5 py-2.5"
      style={{
        background: disabled ? "rgba(255,251,240,0.35)" : hover ? C.goldGradient : C.glassStrong,
        color: disabled ? C.textFaint : C.text,
        border: `1px solid ${disabled ? C.glassLine : hover ? C.amber : C.glassBorder}`,
        borderRadius: 999,
        cursor: disabled ? "not-allowed" : "pointer",
        boxShadow: "0 4px 14px -6px rgba(90,58,24,0.35)",
        transform: hover && !disabled ? "translateY(-1px)" : "none",
        transition: "transform .15s ease, background .15s ease",
        ...mono,
        fontSize: 12.5,
        fontWeight: 700,
        letterSpacing: "0.02em",
      }}
    >
      {children}
    </button>
  );
}

export default function WifiSetupPanel({ connected, isRunning, currentNetwork, pending, onSave }) {
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [open, setOpen] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const [touched, setTouched] = useState(false);
  const [msg, setMsg] = useState(null);

  const errors = validateWifi({ name, password, confirm, open });
  const hasErrors = Object.keys(errors).length > 0;

  // Reasons the form cannot be submitted right now
  const blockedReason = !connected
    ? "The ESP32 is offline. Connect it first, then come back here."
    : isRunning
    ? "Stop the sorting run before changing the Wi-Fi network."
    : null;

  function submit(e) {
    e.preventDefault();
    setTouched(true);
    if (hasErrors || blockedReason || pending) return;

    const sent = onSave(name.trim(), open ? "" : password);
    if (sent) {
      setMsg({ ok: true, text: `Saved. The ESP32 is restarting to join "${name.trim()}".` });
      setPassword("");
      setConfirm("");
      setTouched(false);
    } else {
      setMsg({ ok: false, text: "Could not send the settings. Check the connection and try again." });
    }
  }

  const fieldError = (key) => touched && errors[key];

  let statusText;
  if (pending) statusText = "Restarting the ESP32. Waiting for it to reconnect...";
  else if (connected) statusText = currentNetwork ? `Connected to "${currentNetwork}"` : "Connected";
  else statusText = "ESP32 offline";

  return (
    <Panel
      title={
        <span className="flex items-center gap-2">
          <IconChip icon={Wifi} />
          Wi-Fi network
        </span>
      }
    >
      <div className="flex items-center gap-2 mb-4" style={{ fontSize: 12.5, color: C.textDim }}>
        {pending ? (
          <Loader2 size={14} className="animate-spin" />
        ) : (
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: connected ? C.green : C.textFaint,
              display: "inline-block",
            }}
          />
        )}
        {statusText}
      </div>

      <form onSubmit={submit} className="flex flex-col gap-3">
        <div>
          <span style={labelStyle}>Network name</span>
          <input
            style={inputStyle}
            value={name}
            maxLength={40}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. HomeWiFi"
          />
          {fieldError("name") && <div style={{ fontSize: 12, color: C.red, marginTop: 4 }}>{errors.name}</div>}
        </div>

        <label className="flex items-center gap-2" style={{ fontSize: 12.5, color: C.textDim }}>
          <input type="checkbox" checked={open} onChange={(e) => setOpen(e.target.checked)} />
          Open network (no password)
        </label>

        {!open && (
          <>
            <div>
              <span style={labelStyle}>Password</span>
              <div className="flex items-center gap-2">
                <input
                  style={inputStyle}
                  type={showPw ? "text" : "password"}
                  value={password}
                  maxLength={70}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="8 to 63 characters"
                />
                <button
                  type="button"
                  onClick={() => setShowPw((s) => !s)}
                  title={showPw ? "Hide password" : "Show password"}
                  style={{ background: "transparent", border: "none", cursor: "pointer", color: C.textDim }}
                >
                  {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              {fieldError("password") && (
                <div style={{ fontSize: 12, color: C.red, marginTop: 4 }}>{errors.password}</div>
              )}
            </div>

            <div>
              <span style={labelStyle}>Retype password</span>
              <input
                style={inputStyle}
                type={showPw ? "text" : "password"}
                value={confirm}
                maxLength={70}
                onChange={(e) => setConfirm(e.target.value)}
              />
              {fieldError("confirm") && (
                <div style={{ fontSize: 12, color: C.red, marginTop: 4 }}>{errors.confirm}</div>
              )}
            </div>
          </>
        )}

        {fieldError("chars") && <div style={{ fontSize: 12, color: C.red }}>{errors.chars}</div>}

        <div className="flex items-center gap-3 flex-wrap">
          <SubmitButton disabled={!!blockedReason || pending}>
            {pending ? "Restarting..." : "Save and restart ESP32"}
          </SubmitButton>
          {msg && <span style={{ fontSize: 12.5, color: msg.ok ? C.green : C.red }}>{msg.text}</span>}
        </div>

        {blockedReason && <div style={{ fontSize: 12, color: C.textFaint }}>{blockedReason}</div>}
      </form>

      <div style={{ fontSize: 11.5, color: C.textFaint, marginTop: 14, lineHeight: 1.5 }}>
        If the ESP32 cannot join the network within about 20 seconds, it opens a Wi-Fi called{" "}
        <span style={mono}>BeanTrack-Setup</span> (password <span style={mono}>beantrack123</span>). Join it on a
        phone and open <span style={mono}>192.168.4.1</span> to enter the network again. The password travels only
        on your local network.
      </div>
    </Panel>
  );
}