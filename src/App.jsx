import { useState, useEffect, useRef } from "react";
import { Wifi, WifiOff, Database } from "lucide-react";
import "./App.css";

import DashboardPage from "./pages/DashboardPage";
import SortingWeightMonitor from "./pages/SortingWeightMonitor";
import AnalyticsPage from "./pages/AnalyticsPage";
import BatchHistoryPage from "./pages/BatchHistoryPage";
import { AlertBanner, FAULTS } from "./components/AlertBanner";
import { C, mono, sans, display } from "./appTokens";
import {
  API_BASE,
  ESP32_WS_URL,
  NAV,
  CATS,
  SEED_BATCHES,
  RECOMMENDED_SPEED,
  PROCESS_TICKS,
  SIM_SHARE,
  SIM_CATEGORIES,
} from "./appConstants";
import {
  clamp,
  nextBatchId,
  mapDbBatch,
  inventoryFromRows,
  accuracyFromRows,
  normalizeBins,
  getJson,
  postJson,
} from "./appUtils";

const SHELL_BACKGROUND =
  "radial-gradient(1000px 700px at 90% -15%, rgba(244,214,150,0.55), transparent 70%), " +
  "radial-gradient(900px 700px at 5% 115%, rgba(205,170,120,0.40), transparent 70%), " +
  "linear-gradient(160deg, #F9F3E4 0%, #F3E8CF 45%, #EADBBA 78%, #E2CFA6 100%)";

const EMPTY_LIVE = { large: 0, medium: 0, debris: 0 };

const DEFAULT_INVENTORY = {
  Arabica: { large: 5.2, medium: 7.4, debris: 2.9 },
  Robusta: { large: 3.5, medium: 4.8, debris: 1.6 },
};

export default function CoffeeSorterApp() {
  /* ---------- state ---------- */
  const [view, setView] = useState("dashboard");
  const [connected, setConnected] = useState(false);
  const [hardwareConnected, setHardwareConnected] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  const [dbDown, setDbDown] = useState(false);
  const [fault, setFault] = useState(null);
  const [accuracy, setAccuracy] = useState({});
  const [batches, setBatches] = useState(SEED_BATCHES);
  const [inventory, setInventory] = useState(DEFAULT_INVENTORY);
  const [historySel, setHistorySel] = useState(null);
  const [live, setLive] = useState(EMPTY_LIVE);
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

  const wsRef = useRef(null);
  const tickRef = useRef(null);
  const runActiveRef = useRef(false);
  const runStartedAtRef = useRef(null);

  /* ---------- database ---------- */
  // Also used by the "Retry" button in the database banner
  function loadFromDb() {
    getJson("get_batches.php")
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

    getJson("get_inventory.php")
      .then((rows) => {
        if (!Array.isArray(rows)) throw new Error("bad response");
        if (rows.length > 0) setInventory(inventoryFromRows(rows));
      })
      .catch(() => setDbDown(true));

    // accuracy table is optional until it's created, so failures are silent
    getJson("get_accuracy.php")
      .then((rows) => {
        if (Array.isArray(rows)) setAccuracy(accuracyFromRows(rows));
      })
      .catch(() => {});
  }

  function saveAccuracy(batchId, bins) {
    setAccuracy((a) => ({ ...a, [batchId]: bins }));
    return postJson("save_accuracy.php", { batch_code: batchId, bins })
      .then((res) => !!res.success)
      .catch(() => false);
  }

  /* ---------- ESP32 connection ---------- */
  function sendHardwareCommand(command) {
    if (wsRef.current?.readyState !== WebSocket.OPEN) return false;
    wsRef.current.send(typeof command === "string" ? command : JSON.stringify(command));
    return true;
  }

  function applyTelemetry(message) {
    const top = Math.max(0, Number(message.top_grams) || 0);
    const bottom = Math.max(0, Number(message.bottom_grams) || 0);
    setLive({ large: top, medium: bottom, debris: 0 });
    setMachine((m) => ({
      ...m,
      status: message.systemOn ? "Processing" : m.status === "Processing" ? "Idle" : m.status,
      mode: message.mode === "Manual" ? "Manual" : "Automatic",
      vibrationSpeed: clamp(Number(message.vibration_speed) || 0, 0, 100),
      sortingCategory: message.active_bin && message.active_bin !== "None" ? message.active_bin : "—",
      liveWeight: top + bottom,
      processingTime:
        message.systemOn && runStartedAtRef.current
          ? Math.floor((Date.now() - runStartedAtRef.current) / 1000)
          : m.processingTime,
    }));
  }

  function connectHardware(showProgress = false) {
    const current = wsRef.current;
    if (current && [WebSocket.CONNECTING, WebSocket.OPEN].includes(current.readyState)) return;
    if (showProgress) setReconnecting(true);

    const socket = new WebSocket(ESP32_WS_URL);
    wsRef.current = socket;

    socket.onopen = () => {
      setHardwareConnected(true);
      setConnected(true);
      setReconnecting(false);
    };
    socket.onmessage = (event) => {
      let message;
      try {
        message = JSON.parse(event.data);
      } catch {
        return; // ignore malformed device messages
      }
      if (message.type === "telemetry") applyTelemetry(message);
    };
    socket.onerror = () => {
      setHardwareConnected(false);
      setReconnecting(false);
    };
    socket.onclose = () => {
      if (wsRef.current === socket) wsRef.current = null;
      setHardwareConnected(false);
      setConnected(false);
      setReconnecting(false);
      setMachine((m) => (m.status === "Processing" ? { ...m, status: "Error", sortingCategory: "—" } : m));
    };
  }

  // open the hardware socket and load data once on mount; close the socket on unmount
  useEffect(() => {
    loadFromDb();
    connectHardware();
    return () => {
      wsRef.current?.close();
      wsRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---------- simulated sensor stream (used when hardware is absent) ---------- */
  useEffect(() => {
    if (machine.status !== "Processing" || hardwareConnected) return;
    const target = machine.inputTarget;

    tickRef.current = setInterval(() => {
      setMachine((m) => {
        const nextTime = m.processingTime + 1;
        return {
          ...m,
          processingTime: nextTime,
          sortingCategory: SIM_CATEGORIES[Math.floor(nextTime / 2) % SIM_CATEGORIES.length],
          status: nextTime >= PROCESS_TICKS ? "Completed" : "Processing",
        };
      });
      setLive((prev) => {
        const jitter = () => 0.9 + Math.random() * 0.2;
        const step = (key) => prev[key] + ((target * SIM_SHARE[key]) / PROCESS_TICKS) * jitter();
        return { large: step("large"), medium: step("medium"), debris: step("debris") };
      });
    }, 200);

    return () => clearInterval(tickRef.current);
  }, [hardwareConnected, machine.inputTarget, machine.status]);

  /* ---------- save a finished run ---------- */
  // Runs when a run ends (Completed in simulation, or Idle after hardware finishes)
  useEffect(() => {
    if (!runActiveRef.current || !["Completed", "Idle"].includes(machine.status)) return;
    runActiveRef.current = false;
    runStartedAtRef.current = null;

    const weights = normalizeBins(live, machine.inputTarget);
    const record = {
      id: machine.batchId,
      date: new Date().toISOString().slice(0, 16).replace("T", " "),
      beanType: machine.beanType,
      mode: machine.mode,
      vibrationSpeed: machine.vibrationSpeed,
      inputWeight: machine.inputTarget,
      weights,
      processingTime: machine.processingTime,
    };

    setBatches((prev) => [record, ...prev]);
    setInventory((inv) => {
      const next = structuredClone(inv);
      CATS.forEach((c) => {
        next[machine.beanType][c] += weights[c] / 1000;
      });
      return next;
    });

    postJson("save_batch.php", {
      batch_code: record.id,
      bean_type: record.beanType,
      mode: record.mode,
      vibration_speed: record.vibrationSpeed,
      input_weight: record.inputWeight,
      large_weight: weights.large,
      medium_weight: weights.medium,
      small_weight: 0,
      fine_weight: weights.debris,
      processing_time: record.processingTime,
    })
      .then((res) => {
        if (!res.success) setDbDown(true);
        else loadFromDb();
      })
      .catch(() => setDbDown(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [machine.status]);

  /* ---------- actions ---------- */
  function resetRun() {
    runActiveRef.current = false;
    runStartedAtRef.current = null;
    setLive(EMPTY_LIVE);
    setMachine((m) => ({ ...m, status: "Idle", processingTime: 0, liveWeight: 0, sortingCategory: "—" }));
  }

  function clearFault() {
    setFault(null);
    if (connected) resetRun();
  }

  function reconnect() {
    connectHardware(true);
    if (!fault && connected) resetRun();
  }

  function handleStart() {
    if (machine.status === "Processing" || fault) return;
    runActiveRef.current = true;
    runStartedAtRef.current = Date.now();
    sendHardwareCommand({ command: "START" }); // returns false offline, so the simulator runs instead
    setLive(EMPTY_LIVE);
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
    setLive(EMPTY_LIVE);
    setMachine((m) => ({
      ...m,
      status: "Idle",
      processingTime: 0,
      liveWeight: 0,
      batchId: nextBatchId(batches),
      sortingCategory: "—",
    }));
  }

  function setBeanType(beanType) {
    if (machine.status === "Processing") return;
    setMachine((m) => ({ ...m, beanType }));
  }

  function setMode(mode) {
    if (machine.status === "Processing") return;
    sendHardwareCommand({ command: "SET_MODE", mode });
    setMachine((m) => ({ ...m, mode }));
  }

  function setSpeed(value) {
    sendHardwareCommand({ command: "SET_SPEED", value });
    setMachine((m) => ({ ...m, vibrationSpeed: value }));
  }

  function setInputTarget(value) {
    if (machine.status === "Processing") return;
    setMachine((m) => ({ ...m, inputTarget: value }));
  }

  /* ---------- render ---------- */
  const faultInfo = fault ? FAULTS[fault] : null;

  const pages = {
    dashboard: (
      <DashboardPage
        machine={machine}
        live={live}
        inventory={inventory}
        dbDown={dbDown}
        setBeanType={setBeanType}
        setMode={setMode}
        setSpeed={setSpeed}
        setInputTarget={setInputTarget}
        onStart={handleStart}
        onStop={handleStop}
        onReset={handleReset}
        connected={connected}
        fault={fault}
        sendCommand={sendHardwareCommand}
      />
    ),
    monitor: <SortingWeightMonitor machine={machine} live={live} />,
    analytics: <AnalyticsPage batches={batches} accuracy={accuracy} onSaveAccuracy={saveAccuracy} />,
    history: <BatchHistoryPage batches={batches} sel={historySel} setSel={setHistorySel} />,
  };

  return (
    <div
      className="w-full h-full min-h-[720px] flex flex-col p-4 gap-4"
      style={{ position: "relative", overflow: "hidden", background: SHELL_BACKGROUND, color: C.text, ...sans }}
    >
      {/* soft glow blobs behind the frosted glass */}
      <div style={{ position: "absolute", top: -120, right: -80, width: 460, height: 460, borderRadius: "50%", background: "#EBC163", opacity: 0.2, filter: "blur(140px)", pointerEvents: "none" }} />
      <div style={{ position: "absolute", bottom: -160, left: 120, width: 520, height: 520, borderRadius: "50%", background: "#A97C50", opacity: 0.13, filter: "blur(150px)", pointerEvents: "none" }} />
      <div style={{ position: "absolute", top: "35%", left: "45%", width: 320, height: 320, borderRadius: "50%", background: "#FFF8E6", opacity: 0.55, filter: "blur(120px)", pointerEvents: "none" }} />

      {/* top navigation */}
      <header
        className="flex items-center gap-4 shrink-0"
        style={{
          position: "relative",
          height: 76,
          background: C.glassDark,
          border: "1px solid rgba(255,255,255,0.12)",
          borderRadius: 28,
          boxShadow: "0 12px 32px -12px rgba(34,22,9,0.42)",
          overflow: "hidden",
          padding: "0 12px",
          backdropFilter: "blur(16px) saturate(150%)",
          WebkitBackdropFilter: "blur(16px) saturate(150%)",
        }}
      >
        <div className="flex items-center gap-2 shrink-0" style={{ padding: "10px 4px" }}>
          <img
            src="/beanhi-logo.png"
            alt="Beanhi logo"
            style={{ width: 42, height: 42, borderRadius: "50%", flexShrink: 0, boxShadow: "0 0 0 2px rgba(255,255,255,0.18)" }}
          />
          <div>
            <div style={{ ...display, fontSize: 21, fontWeight: 700, lineHeight: 1.1, color: C.sidebarText }}>Beanhi</div>
            <div style={{ fontSize: 9.5, color: C.sidebarTextDim, ...sans, fontWeight: 600, letterSpacing: "0.13em", textTransform: "uppercase", marginTop: 2 }}>
              Coffee Beans &amp; Cafe
            </div>
          </div>
        </div>

        <nav className="flex items-center gap-2 flex-1 min-w-0 overflow-x-auto py-2 px-1">
          {NAV.map(({ id, label, icon: Icon }) => {
            const active = view === id;
            return (
              <button
                key={id}
                onClick={() => setView(id)}
                className={`bt-nav flex items-center justify-center gap-2 px-3 py-2.5${active ? " active" : ""}`}
                style={{
                  margin: "2px 0",
                  minWidth: 92,
                  flex: "0 0 auto",
                  borderRadius: 999,
                  background: active ? C.goldGradient : undefined,
                  border: "1px solid transparent",
                  color: active ? C.sidebarBg : C.sidebarTextDim,
                  fontWeight: active ? 700 : 500,
                  fontSize: 12.5,
                  lineHeight: 1.15,
                  letterSpacing: "0.01em",
                  boxShadow: active ? "0 6px 18px -6px rgba(232,178,58,0.55)" : "none",
                }}
              >
                <Icon size={15} />
                <span>{label}</span>
              </button>
            );
          })}
        </nav>

        <div
          className="flex items-center gap-2 shrink-0"
          role="status"
          style={{
            background: connected ? "rgba(92,59,30,0.22)" : "rgba(34,22,9,0.92)",
            border: `1px solid ${connected ? C.green : C.amber}88`,
            borderRadius: 999,
            color: C.sidebarText,
            padding: "7px 9px 7px 11px",
            ...mono,
            fontSize: 11,
            whiteSpace: "nowrap",
          }}
        >
          {connected ? <Wifi size={14} color={C.amber} /> : <WifiOff size={14} color={C.amber} />}
          <span>{reconnecting ? "Connecting..." : `ESP32 ${connected ? "online" : "offline"}`}</span>
          {!connected && !reconnecting && (
            <button
              onClick={reconnect}
              style={{ background: C.amber, color: C.text, border: "none", borderRadius: 999, padding: "4px 9px", cursor: "pointer", ...mono, fontSize: 10.5, fontWeight: 700 }}
            >
              Reconnect
            </button>
          )}
        </div>
      </header>

      {/* main */}
      <main className="flex-1 flex flex-col min-w-0 gap-3" style={{ position: "relative" }}>
        {(!connected || faultInfo || dbDown) && (
          <div className="flex flex-col gap-3 shrink-0">
            {faultInfo && (
              <AlertBanner
                severity="error"
                icon={faultInfo.icon}
                code={faultInfo.code}
                title={faultInfo.title}
                message={faultInfo.message}
                action={{ label: "Acknowledge & reset", onClick: clearFault }}
              />
            )}
            {dbDown && (
              <AlertBanner
                severity="warning"
                icon={Database}
                code="W-DATABASE"
                title="Database unreachable"
                message="Start Apache and MySQL in XAMPP. Batches that finish while it's down won't be saved."
                action={{ label: "Retry", onClick: loadFromDb }}
              />
            )}
          </div>
        )}

        <div className="flex-1 overflow-auto px-1 py-1">{pages[view] ?? null}</div>
      </main>
    </div>
  );
}