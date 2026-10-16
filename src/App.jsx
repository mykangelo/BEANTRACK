import { useState, useEffect, useRef, useMemo, Fragment } from "react";
import {
  Power, Square, RotateCcw, Wifi, WifiOff,
  Gauge, Timer, Activity, Scale, LayoutGrid, BarChart3, Boxes, History, SlidersHorizontal, AlertTriangle, Database,
} from "lucide-react";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend,
} from "recharts";

/* ---------------------------------------------------------------
   TOKENS
--------------------------------------------------------------- */
const C = {
  bg: "#F1E8D2",
  panel: "#FBF6E9",
  panelRaised: "#ECDCAF",
  line: "#C7AC79",
  lineLit: "#8B6B3D",
  text: "#241A10",
  textDim: "#6B5233",
  textFaint: "#9C8558",
  amber: "#C99A2E",
  green: "#5C3B1E",
  red: "#1C130B",
  blue: "#3D2914",
  arabica: "#A9752D",
  robusta: "#2B1B0E",
  sidebarBg: "#221609",
  sidebarText: "#F1E8D2",
  sidebarTextDim: "#A5885A",
  sidebarBorder: "#3D2914",
  sidebarActiveBg: "rgba(201,154,46,0.22)",
  // frosted-glass tokens
  glass: "rgba(255,252,244,0.60)",
  glassStrong: "rgba(255,251,240,0.72)",
  glassBorder: "rgba(255,255,255,0.85)",
  glassLine: "rgba(120,84,40,0.16)",
  glassDark: "rgba(34,22,9,0.78)",
  glassShadow: "0 1px 2px rgba(90,58,24,0.06), 0 18px 44px -14px rgba(90,58,24,0.24)",
  glassGradient: "linear-gradient(180deg, rgba(255,255,255,0.62) 0%, rgba(255,251,240,0.40) 100%)",
  goldGradient: "linear-gradient(135deg, #EDC66B 0%, #C99A2E 100%)",
  brownGradient: "linear-gradient(135deg, #7A4B28 0%, #4A2E17 100%)",
};

const blur = { backdropFilter: "blur(16px) saturate(150%)", WebkitBackdropFilter: "blur(16px) saturate(150%)" };

const sans = { fontFamily: "'Plus Jakarta Sans', 'Inter', 'Segoe UI', sans-serif" };
// "mono" now means: numbers/labels in the same typeface, with tabular figures so columns still line up
// coffee-house serif: used only for page titles and the cafe name (static text), never for live numbers
const display = { fontFamily: "'Fraunces', 'Playfair Display', Georgia, 'Times New Roman', serif" };
const mono = { fontFamily: "'Plus Jakarta Sans', 'Inter', 'Segoe UI', sans-serif", fontVariantNumeric: "tabular-nums" };

const STATUS_COLOR = {
  Idle: C.textFaint,
  Processing: C.amber,
  Completed: C.green,
  Error: C.red,
};

const NAV = [
  { id: "dashboard", label: "Dashboard", icon: LayoutGrid },
  { id: "control", label: "Machine control", icon: SlidersHorizontal },
  { id: "monitor", label: "Sorting & weight", icon: Scale },
  { id: "analytics", label: "Analytics", icon: BarChart3 },
  { id: "history", label: "Batch history", icon: History },
];

// Three bins, each with its own load cell (per the paper): every fraction is weighed directly.
//   Bin 1 = largest grade (>5 mm), Bin 2 = medium grade (4-5 mm), Bin 3 = fine/debris (<4 mm)
const CATS = ["large", "medium", "debris"];
const CAT_LABEL = { large: "Large", medium: "Medium", debris: "Fine / debris" };
const CAT_COLOR = { large: "#E3BE58", medium: "#B98A3E", debris: "#231710" };
const RECOMMENDED_SPEED = 40; // recommended vibration speed (%)
const BIN_INFO = { large: "Bin 1 · >5 mm", medium: "Bin 2 · 4–5 mm", debris: "Bin 3 · <4 mm" };

const SEED_BATCHES = [
  { id: "B001", sample: true, date: "2026-09-13 08:02", beanType: "Arabica", mode: "Automatic", vibrationSpeed: 62, inputWeight: 1000,
    weights: { large: 370, medium: 400, debris: 230 }, processingTime: 12 * 60 },
  { id: "B002", sample: true, date: "2026-09-13 09:41", beanType: "Robusta", mode: "Automatic", vibrationSpeed: 55, inputWeight: 1200,
    weights: { large: 470, medium: 480, debris: 250 }, processingTime: 14 * 60 },
  { id: "B003", sample: true, date: "2026-09-14 07:55", beanType: "Arabica", mode: "Manual", vibrationSpeed: 48, inputWeight: 900,
    weights: { large: 300, medium: 340, debris: 260 }, processingTime: 16 * 60 },
  { id: "B004", sample: true, date: "2026-09-14 10:20", beanType: "Robusta", mode: "Automatic", vibrationSpeed: 58, inputWeight: 1100,
    weights: { large: 395, medium: 430, debris: 275 }, processingTime: 13 * 60 },
];

function computeMetrics(b) {
  const sorted = b.weights.large + b.weights.medium;
  const debris = b.weights.debris;
  const yieldPct = (sorted / b.inputWeight) * 100;
  const finePct = (debris / b.inputWeight) * 100;
  return { sorted, yieldPct, finePct };
}

// Accuracy rate (%) = correctly sorted weight / total weight checked x 100, summed over the three bins (grams)
function overallAccuracy(bins) {
  let correct = 0, checked = 0;
  CATS.forEach((c) => {
    correct += (bins && bins[c] && bins[c].correct) || 0;
    checked += (bins && bins[c] && bins[c].checked) || 0;
  });
  return checked > 0 ? (correct / checked) * 100 : null;
}

function fmtTime(sec) {
  const m = Math.floor(sec / 60).toString().padStart(2, "0");
  const s = Math.floor(sec % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

function clamp(v, min, max) {
  if (isNaN(v)) return min;
  return Math.min(Math.max(v, min), max);
}

function nextBatchId(batches) {
  const nums = batches.map((b) => parseInt(b.id.replace(/\D/g, ""), 10)).filter((n) => !isNaN(n));
  const n = (nums.length ? Math.max(...nums) : 0) + 1;
  return "B" + String(n).padStart(3, "0");
}

/* ---------------------------------------------------------------
   SMALL UI PRIMITIVES
--------------------------------------------------------------- */
function Panel({ title, right, children, style }) {
  return (
    <div
      style={{
        background: C.glassGradient,
        border: `1px solid ${C.glassBorder}`,
        borderRadius: 24,
        boxShadow: C.glassShadow,
        overflow: "hidden",
        ...blur,
        ...style,
      }}
    >
      {title && (
        <div className="flex items-center justify-between px-5 pt-4">
          <span style={{ ...sans, color: C.textDim, fontSize: 12.5, fontWeight: 600, letterSpacing: "0.01em" }}>{title}</span>
          {right}
        </div>
      )}
      <div className={title ? "px-5 pt-3 pb-5" : "p-5"}>{children}</div>
    </div>
  );
}

// Small round icon chip shown in front of a tile title
function IconChip({ icon: Icon }) {
  return (
    <span className="flex items-center justify-center" style={{ width: 26, height: 26, borderRadius: 9, background: `${C.amber}30` }}>
      <Icon size={14} color={C.green} />
    </span>
  );
}

// Page title + one line saying what the page is for
function PageHeader({ title, purpose }) {
  return (
    <div>
      <div style={{ ...display, fontSize: 32, fontWeight: 700, letterSpacing: "-0.015em", lineHeight: 1.15 }}>{title}</div>
      <div style={{ fontSize: 13.5, color: C.textDim, marginTop: 3 }}>{purpose}</div>
    </div>
  );
}

// Small caps label that groups the panels beneath it
function SectionLabel({ children }) {
  return <div style={{ ...mono, fontSize: 10.5, letterSpacing: "0.08em", color: C.textFaint, marginBottom: -8 }}>{children}</div>;
}

// Marks demo rows so they can't be mistaken for real batches
function SampleTag() {
  return (
    <span
      title="Demo data, not a real batch"
      style={{ ...mono, fontSize: 10, color: C.green, border: `1px solid ${C.amber}`, borderRadius: 999, padding: "1px 7px", marginLeft: 8 }}
    >
      SAMPLE
    </span>
  );
}

function Metric({ label, value, unit, color }) {
  return (
    <div>
      <div style={{ ...sans, color: C.textFaint, fontSize: 10.5, fontWeight: 600, letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: 6 }}>{label}</div>
      <div style={{ ...mono, color: color || C.text, fontSize: 24, fontWeight: 700, lineHeight: 1 }}>
        {value}
        {unit && <span style={{ fontSize: 13, color: C.textDim, marginLeft: 4 }}>{unit}</span>}
      </div>
    </div>
  );
}

function BeanTag({ bean }) {
  const color = bean === "Arabica" ? C.arabica : C.robusta;
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2 py-0.5"
      style={{ border: `1px solid ${color}66`, color, borderRadius: 999, ...mono, fontSize: 11 }}
    >
      <span style={{ width: 6, height: 6, background: color, display: "inline-block", borderRadius: 1 }} />
      {bean}
    </span>
  );
}

// variant "action": cream at rest, yellow on hover, brown while pressed (Start/Stop sorting)
// variant "reset": yellow at rest, flashes dark briefly on click then returns to yellow
function Button({ children, onClick, disabled, variant = "action", icon: Icon }) {
  const [hover, setHover] = useState(false);
  const [pressed, setPressed] = useState(false);
  const [flash, setFlash] = useState(false);

  const cream = C.panel;
  let bg, fg, border;
  if (variant === "reset") {
    if (flash) { bg = C.text; fg = cream; border = C.text; }
    else { bg = C.goldGradient; fg = C.text; border = C.amber; }
  } else {
    if (pressed) { bg = C.brownGradient; fg = cream; border = C.green; }
    else if (hover) { bg = C.goldGradient; fg = C.text; border = C.amber; }
    else { bg = C.glassStrong; fg = C.text; border = C.glassBorder; }
  }

  function handleClick(e) {
    if (disabled) return;
    if (variant === "reset") {
      setFlash(true);
      setTimeout(() => setFlash(false), 220);
    }
    if (onClick) onClick(e);
  }

  return (
    <button
      onClick={handleClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => { setHover(false); setPressed(false); }}
      onMouseDown={() => setPressed(true)}
      onMouseUp={() => setPressed(false)}
      disabled={disabled}
      className="flex items-center justify-center gap-2 px-5 py-2.5"
      style={{
        background: disabled ? "rgba(255,251,240,0.35)" : bg,
        color: disabled ? C.textFaint : fg,
        border: `1px solid ${disabled ? C.glassLine : border}`,
        borderRadius: 999,
        cursor: disabled ? "not-allowed" : "pointer",
        boxShadow: disabled || pressed ? "none" : "0 4px 14px -6px rgba(90,58,24,0.35)",
        transform: hover && !disabled && !pressed ? "translateY(-1px)" : "none",
        transition: "transform .15s ease, box-shadow .15s ease, background .15s ease",
        ...mono,
        fontSize: 12.5,
        fontWeight: 700,
        letterSpacing: "0.02em",
      }}
    >
      {Icon && <Icon size={14} />}
      {children}
    </button>
  );
}

// Faults the machine can report (real ones will come from the ESP32; these also power the demo buttons)
const FAULTS = {
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

function AlertBanner({ severity, icon: Icon, code, title, message, action }) {
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
          width: 38, height: 38, borderRadius: 12,
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
          <span style={{ ...mono, fontSize: 10.5, color: accent, border: `1px solid ${accent}55`, borderRadius: 999, padding: "1px 8px" }}>{code}</span>
        </div>
        <div style={{ fontSize: 12.5, marginTop: 2, opacity: 0.85, lineHeight: 1.5 }}>{message}</div>
      </div>
      {action && (
        <button
          onClick={action.onClick}
          className="shrink-0"
          style={{
            ...mono, fontSize: 12, fontWeight: 700, padding: "8px 14px", borderRadius: 12, border: "none", cursor: "pointer",
            background: isError ? C.amber : C.green, color: isError ? C.text : C.panel,
          }}
        >
          {action.label}
        </button>
      )}
    </div>
  );
}

function NumberField({ value, onCommit, suffix, width = 80, disabled }) {
  const [draft, setDraft] = useState(String(value));
  // Keep the editable draft aligned when the parent commits a new value.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setDraft(String(value)), [value]);

  function commit() {
    const n = Number(draft);
    if (draft.trim() === "" || isNaN(n)) {
      setDraft(String(value));
      return;
    }
    onCommit(n);
  }

  return (
    <div
      className="flex items-center"
      style={{
        width,
        border: `1px solid ${C.glassLine}`,
        borderRadius: 10,
        background: disabled ? "rgba(255,251,240,0.35)" : C.glassStrong,
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <input
        type="number"
        value={draft}
        disabled={disabled}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === "Enter") { commit(); e.currentTarget.blur(); } }}
        className="w-full bg-transparent text-right outline-none px-2 py-1.5"
        style={{ ...mono, fontSize: 15, fontWeight: 700, color: C.text }}
      />
      {suffix && (
        <span style={{ ...mono, fontSize: 12, color: C.textDim, paddingRight: 8 }}>{suffix}</span>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------
   MAIN APP
--------------------------------------------------------------- */
const API_BASE = import.meta.env.VITE_API_BASE || "/beantrack-api";
const ESP32_WS_URL = import.meta.env.VITE_ESP32_WS_URL || "ws://beantrack.local:81";

// The database table still has small_weight/fine_weight columns from before —
// we fold both into "debris" here so old and new rows display consistently.
function mapDbBatch(row) {
  return {
    id: row.batch_code,
    date: row.date_time,
    beanType: row.bean_type,
    mode: row.mode,
    vibrationSpeed: Number(row.vibration_speed),
    inputWeight: Number(row.input_weight),
    weights: {
      large: Number(row.large_weight),
      medium: Number(row.medium_weight),
      debris: Number(row.small_weight) + Number(row.fine_weight),
    },
    processingTime: Number(row.processing_time),
  };
}

export default function CoffeeSorterApp() {
  const [view, setView] = useState("dashboard");
  const [connected, setConnected] = useState(false);
  const [dbDown, setDbDown] = useState(false);
  const [fault, setFault] = useState(null);
  const [accuracy, setAccuracy] = useState({}); // { B001: { large: {checked, correct}, ... } }
  const [batches, setBatches] = useState(SEED_BATCHES);
  const [hardwareConnected, setHardwareConnected] = useState(false);
  const wsRef = useRef(null);

  // Load real data from the MySQL database (also used by the "Retry" button)
  function loadFromDb() {
    fetch(`${API_BASE}/get_batches.php`)
      .then((r) => r.json())
      .then((rows) => {
        if (!Array.isArray(rows)) throw new Error("bad response");
        if (rows.length > 0) {
          const mapped = rows.map(mapDbBatch);
          setBatches(mapped);
          setMachine((m) => ({ ...m, batchId: nextBatchId(mapped) }));
        }
        setDbDown(false);
      })
      .catch(() => setDbDown(true));

    fetch(`${API_BASE}/get_inventory.php`)
      .then((r) => r.json())
      .then((rows) => {
        if (!Array.isArray(rows)) throw new Error("bad response");
        if (rows.length > 0) {
          const next = { Arabica: { large: 0, medium: 0, debris: 0 }, Robusta: { large: 0, medium: 0, debris: 0 } };
          rows.forEach((r) => {
            if (!next[r.bean_type]) return;
            if (r.category === "large") next[r.bean_type].large = Number(r.quantity_kg);
            else if (r.category === "medium") next[r.bean_type].medium = Number(r.quantity_kg);
            else next[r.bean_type].debris += Number(r.quantity_kg); // old "small" + "fine" rows fold into debris
          });
          setInventory(next);
        }
      })
      .catch(() => setDbDown(true));

    // accuracy checks: failures are silent (the accuracy_checks table is optional until it's created)
    fetch(`${API_BASE}/get_accuracy.php`)
      .then((r) => {
        if (!r.ok) throw new Error("load failed");
        return r.json();
      })
      .then((rows) => {
        if (!Array.isArray(rows)) return;
        const next = {};
        rows.forEach((r) => {
          if (!next[r.batch_code]) next[r.batch_code] = {};
          next[r.batch_code][r.bin_name] = { checked: Number(r.beans_checked), correct: Number(r.correctly_sorted) };
        });
        setAccuracy(next);
      })
      .catch(() => {});
  }

  function saveAccuracy(batchId, bins) {
    setAccuracy((a) => ({ ...a, [batchId]: bins }));
    return fetch(`${API_BASE}/save_accuracy.php`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ batch_code: batchId, bins }),
    })
      .then((r) => r.json())
      .then((res) => !!res.success)
      .catch(() => false);
  }

  useEffect(() => {
    loadFromDb();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [machine, setMachine] = useState({
    status: "Idle",
    batchId: nextBatchId(SEED_BATCHES),
    beanType: "Arabica",
    mode: "Automatic",
    vibrationSpeed: RECOMMENDED_SPEED,
    processingTime: 0,
    liveWeight: 0,
    inputTarget: 1000,
    sortingCategory: "—",
  });
  const [live, setLive] = useState({ large: 0, medium: 0, debris: 0 });

  const tickRef = useRef(null);
  const runActiveRef = useRef(false);
  const runStartedAtRef = useRef(null);
  const PROCESS_TICKS = 60; // simulated run length

  function sendHardwareCommand(command) {
    if (wsRef.current?.readyState !== WebSocket.OPEN) return false;
    wsRef.current.send(typeof command === "string" ? command : JSON.stringify(command));
    return true;
  }

  function connectHardware() {
    if (wsRef.current && [WebSocket.CONNECTING, WebSocket.OPEN].includes(wsRef.current.readyState)) return;
    const socket = new WebSocket(ESP32_WS_URL);
    wsRef.current = socket;

    socket.onopen = () => {
      setHardwareConnected(true);
      setConnected(true);
    };
    socket.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        if (message.type === "telemetry") {
          const top = Math.max(0, Number(message.top_grams) || 0);
          const bottom = Math.max(0, Number(message.bottom_grams) || 0);
          setLive({ large: top, medium: bottom, debris: 0 });
          setMachine((m) => ({
            ...m,
            status: message.systemOn ? "Processing" : m.status === "Processing" ? "Idle" : m.status,
            mode: message.mode === "Manual" ? "Manual" : "Automatic",
            vibrationSpeed: Math.max(0, Math.min(100, Number(message.vibration_speed) || 0)),
            sortingCategory: message.active_bin && message.active_bin !== "None" ? message.active_bin : "—",
            liveWeight: top + bottom,
            processingTime: message.systemOn && runStartedAtRef.current
              ? Math.floor((Date.now() - runStartedAtRef.current) / 1000)
              : m.processingTime,
          }));
        }
      } catch {
        // Ignore malformed device messages without breaking the connection.
      }
    };
    socket.onerror = () => setHardwareConnected(false);
    socket.onclose = () => {
      if (wsRef.current === socket) wsRef.current = null;
      setHardwareConnected(false);
      setConnected(false);
      setMachine((m) => m.status === "Processing" ? { ...m, status: "Error", sortingCategory: "—" } : m);
    };
  }

  useEffect(() => {
    connectHardware();
    return () => {
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, []);

  // simulated ESP32 stream — three load cells, one under each bin
  useEffect(() => {
    if (machine.status !== "Processing" || hardwareConnected) return;
    tickRef.current = setInterval(() => {
      setMachine((m) => {
        const nextTime = m.processingTime + 1;
        const done = nextTime >= PROCESS_TICKS;
        const cats = ["Large", "Medium", "Fine / debris"];
        return {
          ...m,
          processingTime: nextTime,
          sortingCategory: cats[Math.floor(nextTime / 2) % cats.length],
          status: done ? "Completed" : "Processing",
        };
      });
      setLive((prev) => {
        // the three bins end near 41% / 39% / 20% of the input, so together they add up to what was loaded
        const jitter = () => 0.9 + Math.random() * 0.2;
        return {
          large: prev.large + (machine.inputTarget * 0.41) / PROCESS_TICKS * jitter(),
          medium: prev.medium + (machine.inputTarget * 0.39) / PROCESS_TICKS * jitter(),
          debris: prev.debris + (machine.inputTarget * 0.20) / PROCESS_TICKS * jitter(),
        };
      });
    }, 200);
    return () => clearInterval(tickRef.current);
  }, [hardwareConnected, machine.inputTarget, machine.status]);

  // Save a completed simulator run or a hardware run that has returned to Idle.
  useEffect(() => {
    if (!runActiveRef.current || !["Completed", "Idle"].includes(machine.status)) return;
    runActiveRef.current = false;
    runStartedAtRef.current = null;

      let L = Math.round(live.large), M = Math.round(live.medium), D = Math.round(live.debris);
      const binSum = L + M + D;
      if (binSum > machine.inputTarget) {
        // the bins can never hold more than was loaded
        const k = machine.inputTarget / binSum;
        L = Math.floor(L * k); M = Math.floor(M * k); D = Math.floor(D * k);
      }
      const rounded = { large: L, medium: M, debris: D };
      const record = {
        id: machine.batchId,
        date: new Date().toISOString().slice(0, 16).replace("T", " "),
        beanType: machine.beanType,
        mode: machine.mode,
        vibrationSpeed: machine.vibrationSpeed,
        inputWeight: machine.inputTarget,
        weights: rounded,
        processingTime: machine.processingTime,
      };
      setBatches((prev) => [record, ...prev]);
      setInventory((inv) => {
        const next = structuredClone(inv);
        CATS.forEach((c) => { next[machine.beanType][c] += rounded[c] / 1000; });
        return next;
      });

      // Persist the batch to the MySQL database via PHP
      fetch(`${API_BASE}/save_batch.php`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          batch_code: record.id,
          bean_type: record.beanType,
          mode: record.mode,
          vibration_speed: record.vibrationSpeed,
          input_weight: record.inputWeight,
          large_weight: rounded.large,
          medium_weight: rounded.medium,
          small_weight: 0,
          fine_weight: rounded.debris,
          processing_time: record.processingTime,
        }),
      })
        .then((r) => r.json())
        .then((res) => {
          if (!res.success) setDbDown(true);
          else loadFromDb();
        })
        .catch(() => setDbDown(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [machine.status]);

  const [inventory, setInventory] = useState({
    Arabica: { large: 5.2, medium: 7.4, debris: 2.9 },
    Robusta: { large: 3.5, medium: 4.8, debris: 1.6 },
  });

  function resetRun() {
    runActiveRef.current = false;
    runStartedAtRef.current = null;
    setLive({ large: 0, medium: 0, debris: 0 });
    setMachine((m) => ({ ...m, status: "Idle", processingTime: 0, liveWeight: 0, sortingCategory: "—" }));
  }
  function triggerFault(key) {
    setFault(key);
    setMachine((m) => ({ ...m, status: "Error", sortingCategory: "—" }));
  }
  function clearFault() {
    setFault(null);
    if (connected) resetRun();
  }
  function reconnect() {
    connectHardware();
    if (!fault && connected) resetRun();
  }
  const faultInfo = fault ? FAULTS[fault] : null;

  function handleStart() {
    if (machine.status === "Processing" || !connected || fault) return;
    runActiveRef.current = true;
    runStartedAtRef.current = Date.now();
    sendHardwareCommand({ command: "START" });
    setLive({ large: 0, medium: 0, debris: 0 });
    setMachine((m) => ({ ...m, status: "Processing", processingTime: 0, liveWeight: 0 }));
  }
  function handleStop() {
    sendHardwareCommand({ command: "STOP" });
    setMachine((m) => ({ ...m, status: m.status === "Processing" ? "Idle" : m.status }));
  }
  function handleReset() {
    clearInterval(tickRef.current);
    runActiveRef.current = false;
    runStartedAtRef.current = null;
    setFault(null);
    setLive({ large: 0, medium: 0, debris: 0 });
    setMachine((m) => ({
      ...m,
      status: connected ? "Idle" : "Error",
      processingTime: 0,
      liveWeight: 0,
      batchId: nextBatchId(batches),
      sortingCategory: "—",
    }));
  }
  function setBeanType(t) {
    if (machine.status === "Processing") return;
    setMachine((m) => ({ ...m, beanType: t }));
  }
  function setMode(mode) {
    if (machine.status === "Processing") return;
    sendHardwareCommand({ command: "SET_MODE", mode });
    setMachine((m) => ({ ...m, mode }));
  }
  function setSpeed(v) {
    sendHardwareCommand({ command: "SET_SPEED", value: v });
    setMachine((m) => ({ ...m, vibrationSpeed: v }));
  }
  function setInputTarget(v) {
    if (machine.status === "Processing") return;
    setMachine((m) => ({ ...m, inputTarget: v }));
  }

  const [historySel, setHistorySel] = useState(null);
  const lastBatch = batches[0];

  return (
    <div
      className="w-full h-full min-h-[720px] flex p-4 gap-4"
      style={{
        position: "relative",
        overflow: "hidden",
        background:
          "radial-gradient(1000px 700px at 90% -15%, rgba(244,214,150,0.55), transparent 70%), radial-gradient(900px 700px at 5% 115%, rgba(205,170,120,0.40), transparent 70%), linear-gradient(160deg, #F9F3E4 0%, #F3E8CF 45%, #EADBBA 78%, #E2CFA6 100%)",
        color: C.text,
        ...sans,
      }}
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400..800&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');
        @keyframes bt-pulse { 0%,100% { box-shadow: 0 0 0 0 rgba(232,178,58,0.45); } 50% { box-shadow: 0 0 0 8px rgba(232,178,58,0); } }
        .bt-range { -webkit-appearance: none; appearance: none; height: 10px; border-radius: 999px; outline: none; cursor: pointer; min-width: 0;
          background: linear-gradient(to right, var(--fill) 0%, var(--fill) var(--pct), rgba(120,84,40,0.16) var(--pct), rgba(120,84,40,0.16) 100%); }
        .bt-range:disabled { cursor: not-allowed; opacity: 0.5; }
        .bt-range::-webkit-slider-thumb { -webkit-appearance: none; appearance: none; width: 24px; height: 24px; border-radius: 50%; background: #fff;
          border: 3px solid var(--fill); box-shadow: 0 3px 10px rgba(60,40,15,0.30); transition: transform .15s ease; }
        .bt-range:hover::-webkit-slider-thumb { transform: scale(1.12); }
        .bt-range::-moz-range-track { height: 10px; border-radius: 999px; background: rgba(120,84,40,0.16); }
        .bt-range::-moz-range-progress { height: 10px; border-radius: 999px; background: var(--fill); }
        .bt-range::-moz-range-thumb { width: 18px; height: 18px; border-radius: 50%; background: #fff; border: 3px solid var(--fill); box-shadow: 0 3px 10px rgba(60,40,15,0.30); }
        .bt-nav { transition: background .18s ease, color .18s ease; }
        .bt-nav:not(.active):hover { background: rgba(255,255,255,0.09); }
        .bt-row { transition: background .15s ease; }
        .bt-row:hover { background: rgba(255,255,255,0.55); }
      `}</style>
      {/* soft coffee-toned glow blobs (give the glass something to blur) */}
      <div style={{ position: "absolute", top: -120, right: -80, width: 460, height: 460, borderRadius: "50%", background: "#EBC163", opacity: 0.20, filter: "blur(140px)", pointerEvents: "none" }} />
      <div style={{ position: "absolute", bottom: -160, left: 120, width: 520, height: 520, borderRadius: "50%", background: "#A97C50", opacity: 0.13, filter: "blur(150px)", pointerEvents: "none" }} />
      <div style={{ position: "absolute", top: "35%", left: "45%", width: 320, height: 320, borderRadius: "50%", background: "#FFF8E6", opacity: 0.55, filter: "blur(120px)", pointerEvents: "none" }} />

      {/* Sidebar */}
      <div
        className="flex flex-col shrink-0"
        style={{
          position: "relative",
          width: 216,
          background: C.glassDark,
          border: "1px solid rgba(255,255,255,0.12)",
          borderRadius: 28,
          boxShadow: "0 18px 48px -12px rgba(34,22,9,0.42)",
          overflow: "hidden",
          ...blur,
        }}
      >
        <div className="px-4 py-4 flex items-center gap-2" style={{ borderBottom: `1px solid ${C.sidebarBorder}` }}>
          <img
            src={BEANHI_LOGO}
            alt="Beanhi logo"
            style={{ width: 42, height: 42, borderRadius: "50%", flexShrink: 0, boxShadow: "0 0 0 2px rgba(255,255,255,0.18)" }}
          />
          <div>
            <div style={{ ...display, fontSize: 21, fontWeight: 700, lineHeight: 1.1, color: C.sidebarText }}>Beanhi</div>
            <div style={{ fontSize: 9.5, color: C.sidebarTextDim, ...sans, fontWeight: 600, letterSpacing: "0.13em", textTransform: "uppercase", marginTop: 2 }}>Coffee Beans &amp; Cafe</div>
          </div>
        </div>

        <nav className="flex-1 py-2">
          {NAV.map((n) => {
            const Icon = n.icon;
            const active = view === n.id;
            return (
              <button
                key={n.id}
                onClick={() => setView(n.id)}
                className={`bt-nav flex items-center gap-2.5 px-4 py-2.5 text-left${active ? " active" : ""}`}
                style={{
                  width: "calc(100% - 16px)",
                  margin: "2px 8px",
                  borderRadius: 999,
                  background: active ? C.goldGradient : undefined,
                  border: "1px solid transparent",
                  color: active ? C.sidebarBg : C.sidebarTextDim,
                  fontWeight: active ? 700 : 500,
                  boxShadow: active ? "0 6px 18px -6px rgba(232,178,58,0.55)" : "none",
                }}
              >
                <Icon size={15} />
                <span style={{ fontSize: 12.5 }}>{n.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="px-4 py-3" style={{ borderTop: `1px solid ${C.sidebarBorder}` }}>
          <div style={{ ...mono, fontSize: 10, color: C.sidebarTextDim, marginBottom: 8, letterSpacing: "0.04em" }}>
            BeanTrack · sorting &amp; monitoring
          </div>
          <button
            onClick={() => (connected ? wsRef.current?.close() : reconnect())}
            className="w-full flex items-center gap-2"
            style={{ color: connected ? C.amber : C.sidebarTextDim, ...mono, fontSize: 11 }}
          >
            {connected ? <Wifi size={13} /> : <WifiOff size={13} />}
            {connected ? "ESP32 linked" : "ESP32 offline"}
          </button>
        </div>
      </div>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0 gap-3" style={{ position: "relative" }}>
        {(!connected || faultInfo || dbDown) && (
          <div className="flex flex-col gap-3 shrink-0">
            {!connected && (
              <AlertBanner
                severity="error" icon={WifiOff} code="E-OFFLINE" title="System down — ESP32 offline"
                message="The dashboard lost contact with the ESP32, so any running batch was stopped. Check the controller's power and Wi-Fi/LAN link, then reconnect."
                action={{ label: "Reconnect", onClick: reconnect }}
              />
            )}
            {faultInfo && (
              <AlertBanner
                severity="error" icon={faultInfo.icon} code={faultInfo.code} title={faultInfo.title}
                message={faultInfo.message}
                action={{ label: "Acknowledge & reset", onClick: clearFault }}
              />
            )}
            {dbDown && (
              <AlertBanner
                severity="warning" icon={Database} code="W-DATABASE" title="Database unreachable"
                message="Start Apache and MySQL in XAMPP. Batches that finish while it's down won't be saved."
                action={{ label: "Retry", onClick: loadFromDb }}
              />
            )}
          </div>
        )}

        <div className="flex-1 overflow-auto px-1 py-1">
          {view === "dashboard" && <Dashboard machine={machine} live={live} inventory={inventory} dbDown={dbDown} />}
          {view === "control" && (
            <Control
              machine={machine}
              onStart={handleStart}
              onStop={handleStop}
              onReset={handleReset}
              setBeanType={setBeanType}
              setMode={setMode}
              setSpeed={setSpeed}
              setInputTarget={setInputTarget}
              connected={connected}
              fault={fault}
              onFault={triggerFault}
              sendCommand={sendHardwareCommand}
            />
          )}
          {view === "monitor" && <SortingWeightMonitor machine={machine} live={live} />}
          {view === "analytics" && <Analytics batches={batches} lastBatch={lastBatch} accuracy={accuracy} onSaveAccuracy={saveAccuracy} />}
          {view === "history" && <BatchHistory batches={batches} sel={historySel} setSel={setHistorySel} />}
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------
   1. DASHBOARD
--------------------------------------------------------------- */
function Dashboard({ machine, live, inventory, dbDown }) {
  const total = live.large + live.medium + live.debris;
  // the ring shows how much of the loaded input has been weighed so far (all three bins)
  const pct = machine.inputTarget ? Math.min((total / machine.inputTarget) * 100, 100) : 0;
  const RING_R = 54;
  const RING_LEN = 2 * Math.PI * RING_R;

  return (
    <div className="flex flex-col gap-5 max-w-5xl">
      <PageHeader title="Dashboard" purpose="Live view of the current batch and the stock on hand." />
      <SectionLabel>CURRENT BATCH</SectionLabel>

      <Panel title="Batch status">
        <div className="flex items-center gap-8 flex-wrap">
          <div style={{ position: "relative", width: 140, height: 140, flexShrink: 0 }}>
            <svg width="140" height="140" viewBox="0 0 140 140" style={{ transform: "rotate(-90deg)" }}>
              <circle cx="70" cy="70" r={RING_R} fill="none" stroke="rgba(120,84,40,0.14)" strokeWidth="13" />
              <circle
                cx="70" cy="70" r={RING_R} fill="none" stroke={STATUS_COLOR[machine.status]} strokeWidth="13" strokeLinecap="round"
                strokeDasharray={RING_LEN} strokeDashoffset={RING_LEN * (1 - pct / 100)}
                style={{ transition: "stroke-dashoffset 0.4s ease, stroke 0.3s ease" }}
              />
            </svg>
            <div className="flex flex-col items-center justify-center" style={{ position: "absolute", inset: 0 }}>
              <span style={{ ...mono, fontSize: 28, fontWeight: 800, lineHeight: 1 }}>{Math.round(pct)}%</span>
              <span style={{ fontSize: 10.5, color: C.textFaint, marginTop: 3 }}>of input</span>
            </div>
          </div>

          <div className="flex-1" style={{ minWidth: 300 }}>
            <div style={{ ...sans, color: C.textFaint, fontSize: 10.5, fontWeight: 600, letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: 6 }}>Total recorded</div>
            <div style={{ ...mono, fontSize: 38, fontWeight: 800, lineHeight: 1, letterSpacing: "-0.02em" }}>
              {Math.round(total)}<span style={{ fontSize: 18, fontWeight: 600, color: C.textDim }}> g</span>
            </div>
            <div style={{ fontSize: 12, color: C.textFaint, marginTop: 6 }}>of {machine.inputTarget} g input · all three bins</div>

            <div className="grid grid-cols-2 gap-x-8 gap-y-4 mt-5 pt-5" style={{ borderTop: `1px solid ${C.glassLine}` }}>
              <Metric label="STATUS" value={machine.status} color={STATUS_COLOR[machine.status]} />
              <Metric label={machine.status === "Idle" ? "NEXT BATCH NUMBER" : "BATCH NUMBER"} value={machine.batchId} />
              <Metric label="BEAN TYPE" value={machine.beanType} color={machine.beanType === "Arabica" ? C.arabica : C.robusta} />
              <Metric label="OPERATING MODE" value={machine.mode} color={machine.mode === "Automatic" ? C.blue : C.amber} />
            </div>
          </div>
        </div>
      </Panel>

      <div className="grid grid-cols-3 gap-5">
        <Panel title={<span className="flex items-center gap-2"><IconChip icon={Gauge} />Vibration speed</span>}>
          <div style={{ ...mono, fontSize: 34, fontWeight: 800, lineHeight: 1, letterSpacing: "-0.02em" }}>
            {machine.vibrationSpeed}<span style={{ fontSize: 17, fontWeight: 600, color: C.textDim }}>%</span>
          </div>
          <div className="mt-3 h-2 w-full" style={{ position: "relative", background: C.glassLine, borderRadius: 999, overflow: "hidden" }}>
            <div className="h-full" style={{ width: `${machine.vibrationSpeed}%`, background: C.goldGradient, borderRadius: 999 }} />
            <div style={{ position: "absolute", top: 0, bottom: 0, left: `${RECOMMENDED_SPEED}%`, width: 2, background: C.text, opacity: 0.55 }} />
          </div>
          <div style={{ fontSize: 11, color: C.textFaint, marginTop: 8 }}>Recommended: {RECOMMENDED_SPEED}% (the line on the bar)</div>
        </Panel>
        <Panel title={<span className="flex items-center gap-2"><IconChip icon={Timer} />Processing time</span>}>
          <div style={{ ...mono, fontSize: 34, fontWeight: 800, lineHeight: 1, letterSpacing: "-0.02em" }}>{fmtTime(machine.processingTime)}</div>
          <div style={{ fontSize: 11, color: C.textFaint, marginTop: 14 }}>mm:ss elapsed this batch</div>
        </Panel>
        <Panel title={<span className="flex items-center gap-2"><IconChip icon={Activity} />Active bin</span>}>
          <div style={{ ...mono, fontSize: 24, fontWeight: 800, lineHeight: 1.15 }}>{machine.sortingCategory}</div>
          <div style={{ fontSize: 11, color: C.textFaint, marginTop: 14 }}>bin being weighed right now</div>
        </Panel>
      </div>

      <SectionLabel>STOCK ON HAND (kg)</SectionLabel>
      {dbDown && (
        <div style={{ fontSize: 12, color: C.textDim, marginTop: -4 }}>
          The database is offline, so these are sample numbers, not your real stock.
        </div>
      )}
      <InventoryPanels inventory={inventory} />

      <div style={{ fontSize: 11.5, color: C.textFaint }}>
        Start, stop, and reset the batch from Machine control.
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------
   2. MACHINE CONTROL
--------------------------------------------------------------- */
function Control({ machine, onStart, onStop, onReset, setBeanType, setMode, setSpeed, setInputTarget, connected, fault, onFault, sendCommand }) {
  const locked = machine.status === "Processing";
  const [speedActive, setSpeedActive] = useState(false);
  const [weightActive, setWeightActive] = useState(false);
  const [hoveredMode, setHoveredMode] = useState(null);
  const [hoveredBean, setHoveredBean] = useState(null);
  return (
    <div className="flex flex-col gap-5 max-w-3xl">
      <PageHeader title="Machine control" purpose="Set up a batch, then start, stop or reset it." />
      <SectionLabel>1 · BATCH SETUP</SectionLabel>
      <Panel title="Bean type">
        <div className="grid grid-cols-2 gap-3">
          {["Arabica", "Robusta"].map((t) => {
            const active = machine.beanType === t;
            const hovered = hoveredBean === t;
            let bg, fg, border;
            if (active) { bg = C.brownGradient; fg = C.panel; border = C.green; }
            else if (hovered) { bg = C.goldGradient; fg = C.text; border = C.amber; }
            else { bg = C.glassStrong; fg = C.textDim; border = C.glassBorder; }
            return (
              <button
                key={t}
                onClick={() => setBeanType(t)}
                onMouseEnter={() => setHoveredBean(t)}
                onMouseLeave={() => setHoveredBean(null)}
                disabled={locked}
                className="py-3 flex items-center justify-center gap-2 transition-colors"
                style={{
                  border: `1px solid ${border}`,
                  background: bg,
                  color: fg,
                  borderRadius: 999,
                  fontWeight: 700,
                  ...blur,
                  cursor: locked ? "not-allowed" : "pointer",
                }}
              >
                <span style={{ width: 7, height: 7, background: fg, display: "inline-block" }} />
                <span style={{ ...mono, fontSize: 12.5 }}>{t}</span>
              </button>
            );
          })}
        </div>
      </Panel>

      <Panel title="Input weight (g)">
        <div
          className="flex items-center gap-4 px-3 py-2.5"
          style={{
            border: `1px solid ${weightActive ? C.amber : C.glassLine}`,
            borderRadius: 14,
            background: weightActive ? `${C.amber}0D` : "transparent",
          }}
        >
          <input
            type="range"
            min={200}
            max={2000}
            step={50}
            value={machine.inputTarget}
            onChange={(e) => setInputTarget(Number(e.target.value))}
            onFocus={() => setWeightActive(true)}
            onBlur={() => setWeightActive(false)}
            onPointerDown={() => setWeightActive(true)}
            onPointerUp={() => setWeightActive(false)}
            disabled={locked}
            className="bt-range flex-1"
            style={{ "--pct": `${((machine.inputTarget - 200) / 1800) * 100}%`, "--fill": weightActive ? C.amber : "#B79F76" }}
          />
          <NumberField
            value={machine.inputTarget}
            onCommit={(v) => setInputTarget(clamp(v, 200, 5000))}
            suffix="g"
            width={92}
            disabled={locked}
          />
        </div>
        <div style={{ fontSize: 11.5, color: C.textDim, marginTop: 10 }}>Amount of green beans loaded into the hopper for this batch.</div>
      </Panel>

      <Panel title="Operating mode">
        <div className="grid grid-cols-2 gap-3">
          {["Manual", "Automatic"].map((m) => {
            const active = machine.mode === m;
            const hovered = hoveredMode === m;
            let bg, fg, border;
            if (active) { bg = C.brownGradient; fg = C.panel; border = C.green; }
            else if (hovered) { bg = C.goldGradient; fg = C.text; border = C.amber; }
            else { bg = C.glassStrong; fg = C.textDim; border = C.glassBorder; }
            return (
              <button
                key={m}
                onClick={() => setMode(m)}
                onMouseEnter={() => setHoveredMode(m)}
                onMouseLeave={() => setHoveredMode(null)}
                disabled={locked}
                className="py-3.5 flex flex-col items-center gap-1 transition-colors"
                style={{
                  border: `1px solid ${border}`,
                  background: bg,
                  color: fg,
                  borderRadius: 14,
                  ...blur,
                  cursor: locked ? "not-allowed" : "pointer",
                  opacity: locked && !active ? 0.5 : 1,
                }}
              >
                <span style={{ ...mono, fontWeight: 700, fontSize: 13 }}>{m.toUpperCase()}</span>
              </button>
            );
          })}
        </div>
        {locked && <div style={{ fontSize: 11, color: C.textFaint, marginTop: 8 }}>Stop the batch to change mode.</div>}
      </Panel>

      <Panel title="Vibration speed (%)">
        <div
          className="flex items-center gap-4 px-3 py-2.5"
          style={{
            border: `1px solid ${speedActive ? C.amber : C.glassLine}`,
            borderRadius: 14,
            background: speedActive ? `${C.amber}0D` : "transparent",
          }}
        >
          <input
            type="range"
            min={0}
            max={100}
            value={machine.vibrationSpeed}
            onChange={(e) => setSpeed(Number(e.target.value))}
            onFocus={() => setSpeedActive(true)}
            onBlur={() => setSpeedActive(false)}
            onPointerDown={() => setSpeedActive(true)}
            onPointerUp={() => setSpeedActive(false)}
            className="bt-range flex-1"
            style={{ "--pct": `${machine.vibrationSpeed}%`, "--fill": speedActive ? C.amber : "#B79F76" }}
          />
          <NumberField
            value={machine.vibrationSpeed}
            onCommit={(v) => setSpeed(clamp(v, 0, 100))}
            suffix="%"
            width={78}
          />
        </div>
        <div className="flex items-center justify-between gap-3 flex-wrap" style={{ marginTop: 10 }}>
          <span style={{ fontSize: 11.5, color: C.textDim }}>Motor power for the sieve, from 0 to 100%. Recommended: {RECOMMENDED_SPEED}%.</span>
          <button
            onClick={() => setSpeed(RECOMMENDED_SPEED)}
            style={{
              ...mono, fontSize: 11.5, padding: "4px 12px", borderRadius: 999, cursor: "pointer", color: C.text,
              border: `1px solid ${C.amber}`,
              background: machine.vibrationSpeed === RECOMMENDED_SPEED ? `${C.amber}40` : C.glass,
            }}
          >
            {machine.vibrationSpeed === RECOMMENDED_SPEED ? `✓ At recommended speed (${RECOMMENDED_SPEED}%)` : `Use recommended speed (${RECOMMENDED_SPEED}%)`}
          </button>
        </div>
      </Panel>

      <SectionLabel>2 · RUN</SectionLabel>
      <Panel title="Batch controls">
        <div className="flex gap-3">
          <Button variant="action" icon={Power} onClick={onStart} disabled={locked || !connected || !!fault}>START SORTING</Button>
          <Button variant="action" icon={Square} onClick={onStop} disabled={!locked}>STOP SORTING</Button>
          <Button variant="reset" icon={RotateCcw} onClick={onReset}>RESET BATCH</Button>
        </div>
        <div className="flex flex-wrap gap-3 mt-3">
          <Button variant="action" icon={Scale} onClick={() => sendCommand("TARE")} disabled={!connected || locked}>TARE LOAD CELLS</Button>
          <Button variant="action" onClick={() => sendCommand("CAL_TOP")} disabled={!connected || locked}>CALIBRATE TOP</Button>
          <Button variant="action" onClick={() => sendCommand("CAL_BOT")} disabled={!connected || locked}>CALIBRATE BOTTOM</Button>
        </div>
        {(!connected || fault) && (
          <div style={{ fontSize: 11.5, color: C.textDim, marginTop: 10 }}>
            Start is disabled until the alert above is cleared.
          </div>
        )}
        <div style={{ fontSize: 11.5, color: C.textDim, marginTop: 10 }}>Stop ends the run without saving it. A batch is saved only when it completes. Reset clears the readings and moves to the next batch number.</div>
      </Panel>

      <SectionLabel>DEMO TOOLS (NOT PART OF THE REAL SYSTEM)</SectionLabel>
      <Panel title="Test error alerts" right={<span style={{ ...mono, fontSize: 10.5, color: C.green, border: `1px solid ${C.amber}`, borderRadius: 999, padding: "1px 8px" }}>DEMO ONLY</span>}>
        <div className="flex flex-wrap gap-3">
          <Button variant="action" icon={AlertTriangle} onClick={() => onFault("jam")} disabled={!!fault}>SIMULATE JAM</Button>
          <Button variant="action" icon={Scale} onClick={() => onFault("loadcell")} disabled={!!fault}>LOAD CELL FAULT</Button>
          <Button variant="action" icon={Boxes} onClick={() => onFault("binfull")} disabled={!!fault}>BIN FULL</Button>
        </div>
        <div style={{ fontSize: 11.5, color: C.textDim, marginTop: 10, lineHeight: 1.6 }}>
          For demos: shows how the dashboard reacts to a fault. Click "ESP32 linked" in the sidebar to simulate the
          system going down. Once the ESP32 is wired in, real faults will come from it.
        </div>
      </Panel>

      <div style={{ fontSize: 11, color: C.textFaint, ...mono, lineHeight: 1.7 }}>
        WEB APP → WI-FI/LAN → ESP32 → L298N → VIBRATION MOTOR
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------
   3. SORTING & WEIGHT MONITOR
--------------------------------------------------------------- */
function SortingWeightMonitor({ machine, live }) {
  const sorted = live.large + live.medium;
  const total = sorted + live.debris;
  const inputW = machine.inputTarget;
  const yieldPct = inputW ? (sorted / inputW) * 100 : 0;
  const finePct = inputW ? (live.debris / inputW) * 100 : 0;

  const rowStyle = { borderBottom: `1px solid ${C.glassLine}` };
  const valueStyle = { ...mono, fontSize: 13 };

  return (
    <div className="flex flex-col gap-5 max-w-3xl">
      <PageHeader title="Sorting & weight" purpose="Weight recorded in each bin for the current batch, and the results worked out from it." />
      <div className="flex items-center gap-2" style={{ fontSize: 12.5, color: C.textDim }}>
        <span style={{ width: 8, height: 8, borderRadius: "50%", background: STATUS_COLOR[machine.status], display: "inline-block" }} />
        {{
          Processing: "Batch in progress. Values are still changing.",
          Completed: "Batch complete. These are the final values.",
          Error: "Run stopped by an error. Values are incomplete.",
          Idle: "No batch running. Values stay at zero until a batch starts.",
        }[machine.status]}
      </div>
      <div style={{ fontSize: 11, color: C.textFaint, ...mono }}>
        LOAD CELL → HX711 → ESP32 → WEB APP → DATABASE
      </div>

      <Panel title="Weight per bin" right={<BeanTag bean={machine.beanType} />}>
        <table className="w-full" style={{ borderCollapse: "collapse" }}>
          <thead>
            <tr style={rowStyle}>
              <th className="text-left py-2" style={{ fontSize: 11, color: C.textFaint, fontWeight: 500 }}>BIN</th>
              <th className="text-right py-2" style={{ fontSize: 11, color: C.textFaint, fontWeight: 500 }}>WEIGHT</th>
            </tr>
          </thead>
          <tbody>
            {CATS.map((c) => (
              <Fragment key={c}>
                <tr style={rowStyle}>
                  <td className="py-2.5" style={{ fontSize: 13 }}>
                    <span style={{ width: 7, height: 7, background: CAT_COLOR[c], display: "inline-block", marginRight: 8 }} />
                    {CAT_LABEL[c]} <span style={{ ...mono, fontSize: 10.5, color: C.textFaint }}>{BIN_INFO[c]}</span>
                  </td>
                  <td className="text-right" style={valueStyle}>{Math.round(live[c])} g</td>
                </tr>
                {c === "medium" && (
                  <tr style={rowStyle}>
                    <td className="py-2" style={{ fontSize: 12, color: C.textDim, paddingLeft: 15 }}>Sorted weight (Bin 1 + Bin 2)</td>
                    <td className="text-right" style={{ ...valueStyle, color: C.green }}>{Math.round(sorted)} g</td>
                  </tr>
                )}
              </Fragment>
            ))}
            <tr style={rowStyle}>
              <td className="py-2.5" style={{ fontSize: 13, fontWeight: 600 }}>Total recorded</td>
              <td className="text-right" style={{ ...valueStyle, fontWeight: 700 }}>{Math.round(total)} g</td>
            </tr>
            <tr>
              <td className="py-2.5" style={{ fontSize: 13 }}>Input weight</td>
              <td className="text-right" style={valueStyle}>{inputW} g</td>
            </tr>
          </tbody>
        </table>
      </Panel>

      <div className="grid grid-cols-2 gap-4">
        <Panel title={machine.status === "Processing" ? "Yield (so far)" : "Yield"}><div style={{ ...mono, fontSize: 26, fontWeight: 700, color: C.green }}>{yieldPct.toFixed(1)}%</div>
          <div style={{ fontSize: 11, color: C.textFaint, marginTop: 4 }}>(Bin 1 + Bin 2) ÷ input × 100</div></Panel>
        <Panel title={machine.status === "Processing" ? "Fine / debris % (so far)" : "Fine / debris %"}><div style={{ ...mono, fontSize: 26, fontWeight: 700, color: C.red }}>{finePct.toFixed(1)}%</div>
          <div style={{ fontSize: 11, color: C.textFaint, marginTop: 4 }}>Bin 3 ÷ input × 100</div></Panel>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------
   5. ANALYTICS
--------------------------------------------------------------- */
function Analytics({ batches, lastBatch, accuracy, onSaveAccuracy }) {
  const m = computeMetrics(lastBatch);
  const sizeDist = CATS.map((c) => ({ name: CAT_LABEL[c], value: lastBatch.weights[c], color: CAT_COLOR[c] }));

  const trend = useMemo(
    () =>
      [...batches].reverse().map((b) => {
        const mm = computeMetrics(b);
        return {
          id: b.id,
          yieldPct: +mm.yieldPct.toFixed(1),
          finePct: +mm.finePct.toFixed(1),
          minutes: +(b.processingTime / 60).toFixed(1),
        };
      }),
    [batches]
  );

  const comparison = useMemo(
    () =>
      [...batches].slice(0, 6).reverse().map((b) => ({
        id: b.id,
        large: b.weights.large,
        medium: b.weights.medium,
        debris: b.weights.debris,
      })),
    [batches]
  );

  return (
    <div className="flex flex-col gap-5 max-w-5xl">
      <PageHeader title="Analytics" purpose="Results from saved batches, plus the sorting accuracy check." />
      <Panel
        title={`Batch summary — ${lastBatch.id} (latest batch)`}
        right={<span className="flex items-center">{lastBatch.sample && <SampleTag />}<span style={{ width: 8 }} /><BeanTag bean={lastBatch.beanType} /></span>}
      >
        <div className="grid grid-cols-3 gap-6">
          <Metric label="INPUT WEIGHT" value={lastBatch.inputWeight} unit="g" />
          <Metric label="SORTED WEIGHT (BIN 1 + 2)" value={m.sorted} unit="g" />
          <Metric label="YIELD" value={m.yieldPct.toFixed(1)} unit="%" color={C.green} />
          <Metric label="FINE / DEBRIS" value={m.finePct.toFixed(1)} unit="%" color={C.red} />
          <Metric label="PROCESSING TIME" value={fmtTime(lastBatch.processingTime)} />
        </div>
      </Panel>

      <div className="grid grid-cols-2 gap-5">
        <Panel title={`Size distribution — ${lastBatch.id}`}>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={sizeDist} dataKey="value" nameKey="name" innerRadius={50} outerRadius={80} paddingAngle={2} label={(e) => `${(e.percent * 100).toFixed(0)}%`}>
                {sizeDist.map((d, i) => <Cell key={i} fill={d.color} stroke={C.panel} />)}
              </Pie>
              <Legend wrapperStyle={{ fontSize: 11, color: C.textDim }} />
              <Tooltip contentStyle={{ background: C.glassStrong, border: `1px solid ${C.glassBorder}`, borderRadius: 12, fontSize: 12 }} />
            </PieChart>
          </ResponsiveContainer>
        </Panel>

        <Panel title="Batch comparison — weight per bin">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={comparison}>
              <CartesianGrid stroke={C.glassLine} strokeDasharray="3 6" vertical={false} />
              <XAxis dataKey="id" tick={{ fill: C.textFaint, fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: C.textFaint, fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ background: C.glassStrong, border: `1px solid ${C.glassBorder}`, borderRadius: 12, fontSize: 12 }} />
              <Bar dataKey="large" stackId="a" fill={CAT_COLOR.large} />
              <Bar dataKey="medium" stackId="a" fill={CAT_COLOR.medium} />
              <Bar dataKey="debris" stackId="a" fill={CAT_COLOR.debris} />
            </BarChart>
          </ResponsiveContainer>
        </Panel>

        <Panel title="Yield & fine/debris trend">
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={trend}>
              <CartesianGrid stroke={C.glassLine} strokeDasharray="3 6" vertical={false} />
              <XAxis dataKey="id" tick={{ fill: C.textFaint, fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: C.textFaint, fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ background: C.glassStrong, border: `1px solid ${C.glassBorder}`, borderRadius: 12, fontSize: 12 }} />
              <Line type="monotone" dataKey="yieldPct" stroke={C.amber} strokeWidth={3} dot={false} name="Yield %" />
              <Line type="monotone" dataKey="finePct" stroke={C.red} strokeWidth={3} dot={{ r: 3 }} name="Fine / debris %" />
            </LineChart>
          </ResponsiveContainer>
        </Panel>

        <Panel title="Processing time per batch (min)">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={trend}>
              <CartesianGrid stroke={C.glassLine} strokeDasharray="3 6" vertical={false} />
              <XAxis dataKey="id" tick={{ fill: C.textFaint, fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: C.textFaint, fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ background: C.glassStrong, border: `1px solid ${C.glassBorder}`, borderRadius: 12, fontSize: 12 }} />
              <Bar dataKey="minutes" fill={C.blue} radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Panel>
      </div>

      <AccuracyPanel batches={batches} accuracy={accuracy} onSave={onSaveAccuracy} />
    </div>
  );
}


/* ---------------------------------------------------------------
   Sorting accuracy — beans checked per bin by caliper / reference sieve
--------------------------------------------------------------- */
function AccuracyPanel({ batches, accuracy, onSave }) {
  const emptyBins = () => ({ large: { checked: 0, correct: 0 }, medium: { checked: 0, correct: 0 }, debris: { checked: 0, correct: 0 } });
  const [selId, setSelId] = useState(batches[0] ? batches[0].id : "");
  const [draft, setDraft] = useState(emptyBins());
  const [msg, setMsg] = useState("");

  useEffect(() => {
    if (!batches.some((b) => b.id === selId) && batches[0]) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSelId(batches[0].id);
    }
  }, [batches, selId]);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setMsg(""); }, [selId]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDraft(accuracy[selId] ? structuredClone(accuracy[selId]) : emptyBins());
  }, [selId, accuracy]);

  function setField(bin, key, val) {
    const v = Math.max(0, Math.floor(Number(val) || 0));
    setDraft((d) => ({ ...d, [bin]: { ...d[bin], [key]: v } }));
  }

  const invalid = CATS.some((c) => draft[c].correct > draft[c].checked);
  const totalChecked = CATS.reduce((a, c) => a + draft[c].checked, 0);
  const overall = overallAccuracy(draft);

  const inputStyle = {
    width: 96, textAlign: "right", padding: "6px 10px", borderRadius: 10, outline: "none",
    border: `1px solid ${C.glassLine}`, background: C.glassStrong, color: C.text, ...mono, fontSize: 13,
  };

  return (
    <Panel
      title="Sorting accuracy — sample check by weight"
      right={
        <select
          value={selId}
          onChange={(e) => setSelId(e.target.value)}
          style={{ ...mono, fontSize: 12, padding: "4px 10px", borderRadius: 10, border: `1px solid ${C.glassLine}`, background: C.glassStrong, color: C.text }}
        >
          {batches.map((b) => <option key={b.id} value={b.id}>{b.id} · {b.beanType}{b.sample ? " (sample)" : ""}</option>)}
        </select>
      }
    >
      <table className="w-full" style={{ borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ borderBottom: `1px solid ${C.glassLine}` }}>
            {["BIN", "WEIGHT CHECKED (g)", "CORRECTLY SORTED (g)", "ACCURACY"].map((h, i) => (
              <th key={h} className={i === 0 ? "text-left py-2" : "text-right py-2"} style={{ fontSize: 11, color: C.textFaint, fontWeight: 500 }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {CATS.map((c) => {
            const bad = draft[c].correct > draft[c].checked;
            return (
              <tr key={c} style={{ borderBottom: `1px solid ${C.glassLine}` }}>
                <td className="py-2" style={{ fontSize: 13 }}>
                  <span style={{ width: 7, height: 7, background: CAT_COLOR[c], display: "inline-block", marginRight: 8 }} />
                  {CAT_LABEL[c]} <span style={{ ...mono, fontSize: 10.5, color: C.textFaint }}>{BIN_INFO[c]}</span>
                </td>
                <td className="text-right"><input type="number" min={0} value={draft[c].checked} onChange={(e) => setField(c, "checked", e.target.value)} style={inputStyle} /><span style={{ ...mono, fontSize: 12, color: C.textFaint, marginLeft: 6 }}>g</span></td>
                <td className="text-right"><input type="number" min={0} value={draft[c].correct} onChange={(e) => setField(c, "correct", e.target.value)} style={{ ...inputStyle, borderColor: bad ? C.amber : C.glassLine }} /><span style={{ ...mono, fontSize: 12, color: C.textFaint, marginLeft: 6 }}>g</span></td>
                <td className="text-right" style={{ ...mono, fontSize: 13 }}>
                  {draft[c].checked > 0 ? `${((draft[c].correct / draft[c].checked) * 100).toFixed(1)}%` : "—"}
                </td>
              </tr>
            );
          })}
          <tr>
            <td className="py-2" style={{ fontSize: 13, fontWeight: 600 }}>Overall (this batch)</td>
            <td className="text-right" style={{ ...mono, fontSize: 13 }}>{totalChecked} g</td>
            <td className="text-right" style={{ ...mono, fontSize: 13 }}>{CATS.reduce((a, c) => a + draft[c].correct, 0)} g</td>
            <td className="text-right" style={{ ...mono, fontSize: 13, fontWeight: 700 }}>{overall !== null ? `${overall.toFixed(1)}%` : "—"}</td>
          </tr>
        </tbody>
      </table>

      <div className="flex items-center gap-3 mt-4 flex-wrap">
        <Button
          variant="action"
          disabled={invalid || totalChecked === 0}
          onClick={() => onSave(selId, draft).then((ok) => setMsg(ok ? "Saved to the database." : "Saved on screen only — the accuracy_checks table isn't in the database yet."))}
        >
          SAVE ACCURACY CHECK
        </Button>
        {invalid && <span style={{ fontSize: 12, color: C.textDim }}>"Correctly sorted" can't be more than "Weight checked".</span>}
        {msg && !invalid && <span style={{ fontSize: 12, color: C.textDim }}>{msg}</span>}
      </div>
    </Panel>
  );
}

function Field({ label, value }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: C.textFaint }}>{label}</div>
      <div style={{ ...mono, marginTop: 2 }}>{value}</div>
    </div>
  );
}

/* ---------------------------------------------------------------
   7. INVENTORY (shown on the Dashboard)
--------------------------------------------------------------- */
function InventoryPanels({ inventory }) {
  return (
    <div className="grid grid-cols-2 gap-5">
      {Object.entries(inventory).map(([bean, cats]) => {
        const color = bean === "Arabica" ? C.arabica : C.robusta;
        const total = CATS.reduce((s, c) => s + cats[c], 0);
        return (
          <Panel key={bean} title={`Inventory — ${bean}`} right={<span style={{ ...mono, fontSize: 12, color }}>{total.toFixed(1)} kg total</span>}>
            <div className="flex flex-col gap-2.5">
              {CATS.map((c, i) => (
                <div key={c} className="flex items-center gap-3">
                  <span style={{ ...mono, fontSize: 12, color: C.textFaint, width: 14 }}>{i === CATS.length - 1 ? "└" : "├"}</span>
                  <span style={{ fontSize: 13, width: 100 }}>{CAT_LABEL[c]}</span>
                  <div className="flex-1 h-1.5" style={{ background: C.glassLine, borderRadius: 999, overflow: "hidden" }}>
                    <div className="h-full" style={{ width: `${total > 0 ? (cats[c] / total) * 100 : 0}%`, background: color }} />
                  </div>
                  <span style={{ ...mono, fontSize: 13, width: 64, textAlign: "right" }}>{cats[c].toFixed(1)} kg</span>
                </div>
              ))}
            </div>
          </Panel>
        );
      })}
    </div>
  );
}

/* ---------------------------------------------------------------
   8. BATCH HISTORY
--------------------------------------------------------------- */
function BatchHistory({ batches, sel, setSel }) {
  const selected = batches.find((b) => b.id === sel) || null;

  return (
    <div className="flex flex-col gap-5 max-w-5xl">
      <PageHeader title="Batch history" purpose="Every saved batch. Click a row to see its details." />
      {batches.some((b) => b.sample) && (
        <div style={{ fontSize: 12, color: C.textDim, marginTop: -4 }}>
          Rows marked SAMPLE are demo data, not real batches. They disappear once real batches are saved.
        </div>
      )}
      <Panel title="All batches">
        <table className="w-full" style={{ borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: `1px solid ${C.line}` }}>
              {[
                ["BATCH", ""], ["DATE", ""], ["TYPE", ""], ["INPUT (g)", ""],
                ["YIELD", "(Bin 1 + Bin 2) ÷ input × 100"],
                ["FINE/DEBRIS", "Bin 3 ÷ input × 100"],
                ["TIME (mm:ss)", ""],
              ].map(([h, tip]) => (
                <th key={h} title={tip} className="text-left py-2 pr-4" style={{ fontSize: 11, color: C.textFaint, fontWeight: 500 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {batches.map((b) => {
              const m = computeMetrics(b);
              const active = sel === b.id;
              return (
                <tr
                  key={b.id}
                  className="bt-row"
                  onClick={() => setSel(active ? null : b.id)}
                  style={{ borderBottom: `1px solid ${C.line}`, cursor: "pointer", background: active ? "rgba(255,255,255,0.7)" : undefined }}
                >
                  <td className="py-2.5 pr-4" style={{ ...mono, fontSize: 13 }}>{b.id}{b.sample && <SampleTag />}</td>
                  <td className="py-2.5 pr-4" style={{ fontSize: 12.5, color: C.textDim }}>{b.date}</td>
                  <td className="py-2.5 pr-4"><BeanTag bean={b.beanType} /></td>
                  <td className="py-2.5 pr-4" style={{ ...mono, fontSize: 13 }}>{b.inputWeight} g</td>
                  <td className="py-2.5 pr-4" style={{ ...mono, fontSize: 13, color: C.green }}>{m.yieldPct.toFixed(1)}%</td>
                  <td className="py-2.5 pr-4" style={{ ...mono, fontSize: 13, color: C.red }}>{m.finePct.toFixed(1)}%</td>
                  <td className="py-2.5 pr-4" style={{ ...mono, fontSize: 13 }}>{fmtTime(b.processingTime)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Panel>

      {selected && (
        <Panel
          title={`Batch detail — ${selected.id}`}
          right={<button onClick={() => setSel(null)} style={{ color: C.textFaint, fontSize: 12 }}>close ✕</button>}
        >
          <div className="grid grid-cols-2 gap-y-4 gap-x-6 mb-4" style={{ fontSize: 13 }}>
            <Field label="Operating mode" value={selected.mode} />
            <Field label="Vibration speed" value={`${selected.vibrationSpeed}%`} />
          </div>
          <table className="w-full">
            <tbody>
              {CATS.map((c) => (
                <tr key={c} style={{ borderBottom: `1px solid ${C.glassLine}` }}>
                  <td className="py-2" style={{ fontSize: 13 }}>
                    {CAT_LABEL[c]} <span style={{ ...mono, fontSize: 10.5, color: C.textFaint }}>{BIN_INFO[c]}</span>
                  </td>
                  <td className="py-2 text-right" style={{ ...mono, fontSize: 13, color: CAT_COLOR[c] }}>{selected.weights[c]} g</td>
                </tr>
              ))}
              <tr>
                <td className="py-2" style={{ fontSize: 13, fontWeight: 600 }}>Total recorded</td>
                <td className="py-2 text-right" style={{ ...mono, fontSize: 13, fontWeight: 700 }}>
                  {selected.weights.large + selected.weights.medium + selected.weights.debris} g
                </td>
              </tr>
            </tbody>
          </table>
        </Panel>
      )}
    </div>
  );
}


// Beanhi Coffee Beans & Cafe logo, embedded so no extra image file is needed
const BEANHI_LOGO = "data:image/png;base64,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";