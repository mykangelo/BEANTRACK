import { useState, useEffect, useRef } from "react";
import { Database, Package } from "lucide-react"; 
import "./App.css";

import logo from "./assets/logo.jpg";

import DashboardPage from "./pages/DashboardPage";
import SortingWeightMonitor from "./pages/SortingWeightMonitor";
import InventoryPage from "./pages/InventoryPage";
import BatchHistoryPage from "./pages/BatchHistoryPage";
import { AlertBanner, FAULTS } from "./components/AlertBanner";
import { C, sans, display } from "./appTokens";
import {
  ESP32_WS_URL,
  NAV,
  SEED_BATCHES,
  RECOMMENDED_SPEED,
  PROCESS_TICKS,
  SIM_SHARE,
  SIM_CATEGORIES,
  WEIGHT_IDLE_MS,
  WEIGHT_CHANGE_G,
  WEIGHT_FLOW_G,
} from "./appConstants";
import { clamp, nextBatchId, mapDbBatch, normalizeBins, getJson, postJson } from "./appUtils";

const SHELL_BACKGROUND =
  "radial-gradient(1000px 700px at 90% -15%, rgba(244,214,150,0.55), transparent 70%), " +
  "radial-gradient(900px 700px at 5% 115%, rgba(205,170,120,0.40), transparent 70%), " +
  "linear-gradient(160deg, #F9F3E4 0%, #F3E8CF 45%, #EADBBA 78%, #E2CFA6 100%)";

const EMPTY_LIVE = { large: 0, medium: 0, debris: 0 };
// Both jobs are non-blocking on the ESP32, but keep a generous margin so the
// firmware's own result log wins the race.
const TARE_TIMEOUT_MS = 20000;
const CALIBRATE_TIMEOUT_MS = 20000;
const WS_STALE_MS = 2500;
const WS_CONNECT_TIMEOUT_MS = 5000;
const WS_WATCH_MS = 1000;

const EMPTY_INVENTORY = {
  stock: { Arabica: 0, Robusta: 0 },
  totals: {
    Arabica: { received: 0, sorted: 0, adjusted: 0 },
    Robusta: { received: 0, sorted: 0, adjusted: 0 },
  },
  stock_batches: [],
  active_stock_batch_id: null,
  adjustments: [],
  movements: [],
};

export default function CoffeeSorterApp() {
  const [view, setView] = useState("dashboard");
  const [network, setNetwork] = useState("");
  const [connected, setConnected] = useState(false);
  const [hardwareConnected, setHardwareConnected] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  const [dbDown, setDbDown] = useState(false);
  const [fault, setFault] = useState(null);
  const [notice, setNotice] = useState(null);
  const [saveError, setSaveError] = useState(null);
  
  // State for Calibration Notices
  const [calibNotice, setCalibNotice] = useState(null);

  const [batches, setBatches] = useState(SEED_BATCHES);
  const [accuracy, setAccuracy] = useState({});
  const [inventory, setInventory] = useState(EMPTY_INVENTORY);
  const [historySel, setHistorySel] = useState(null);
  const [live, setLive] = useState(EMPTY_LIVE);
  const [taring, setTaring] = useState(false);
  const [tareDoneAt, setTareDoneAt] = useState(null);
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
  const tareTimerRef = useRef(null);
  const runActiveRef = useRef(false);
  const runStartedAtRef = useRef(null);
  const lastSeenRef = useRef(0);
  const connectStartedAtRef = useRef(0);
  const connectHardwareRef = useRef(() => {});
  const weightBaselineRef = useRef(null);
  const lastWeightRef = useRef(0);
  const lastWeightChangeAtRef = useRef(0);
  const seenWeightFlowRef = useRef(false);
  const liveTotalRef = useRef(0);
  const inputTargetRef = useRef(1000);
  const prevSystemOnRef = useRef(false);
  const stopReasonRef = useRef(null);
  const sourceRef = useRef("hardware");

  function loadFromDb() {
    getJson("get_batches.php")
      .then((rows) => {
        if (!Array.isArray(rows)) throw new Error("bad response");
        const mapped = rows.map(mapDbBatch);
        setBatches(mapped);
        setMachine((m) => ({ ...m, batchId: nextBatchId(mapped) }));
        setDbDown(false);
      })
      .catch(() => setDbDown(true));

    getJson("get_inventory.php")
      .then((data) => {
        if (!data || !data.stock) throw new Error("bad response");
        setInventory({
          stock: data.stock,
          totals: data.totals ?? EMPTY_INVENTORY.totals,
          stock_batches: data.stock_batches ?? [],
          active_stock_batch_id: data.active_stock_batch_id ?? null,
          adjustments: data.adjustments ?? [],
          movements: data.movements ?? [],
        });
      })
      .catch(() => setDbDown(true));

    loadAccuracy();
  }

  // rows from get_accuracy.php -> { B001: { large: {checked, correct}, medium: {...} } }
  function loadAccuracy() {
    getJson("get_accuracy.php")
      .then((rows) => {
        if (!Array.isArray(rows)) throw new Error("bad response");
        const byBatch = {};
        for (const row of rows) {
          if (!byBatch[row.batch_code]) byBatch[row.batch_code] = {};
          byBatch[row.batch_code][row.bin_name] = {
            checked: Number(row.beans_checked) || 0,
            correct: Number(row.correctly_sorted) || 0,
          };
        }
        setAccuracy(byBatch);
      })
      .catch(() => setDbDown(true));
  }

  function saveAccuracy(batchCode, bins) {
    return postJson("save_accuracy.php", { batch_code: batchCode, bins })
      .then((res) => {
        if (!res.success) {
          setSaveError(res.error || "Accuracy check was not saved.");
          return false;
        }
        setSaveError(null);
        setAccuracy((prev) => ({ ...prev, [batchCode]: bins }));
        return true;
      })
      .catch(() => {
        setDbDown(true);
        return false;
      });
  }

  // All inventory mutations reload the ledger after they succeed so the cards,
  // layer table, and movement logs always agree.
  function inventoryAction(path, payload) {
    return postJson(path, payload)
      .then((res) => {
        if (res.success) loadFromDb();
        return res;
      })
      .catch(() => {
        setDbDown(true);
        return { success: false, error: "Database unreachable." };
      });
  }

  function addMovement(payload) {
    return inventoryAction("add_movement.php", payload);
  }

  function createStockBatch(payload) {
    return inventoryAction("create_stock_batch.php", payload);
  }

  function adjustStock(payload) {
    return inventoryAction("adjust_stock.php", payload);
  }

  function resetStock(payload) {
    return inventoryAction("reset_stock.php", payload);
  }

  function sendHardwareCommand(command) {
    if (wsRef.current?.readyState !== WebSocket.OPEN) return false;
    wsRef.current.send(typeof command === "string" ? command : JSON.stringify(command));
    return true;
  }

  function applyTelemetry(message) {
    if (typeof message.wifi === "string") setNetwork(message.wifi);

    const deviceOn = message.systemOn === true;

    // A run can also be started from the ESP32 button. Arm the recorder on the
    // rising edge so those batches are saved too.
    if (deviceOn && !prevSystemOnRef.current && !runActiveRef.current) {
      runActiveRef.current = true;
      runStartedAtRef.current = Date.now();
      stopReasonRef.current = null;
      sourceRef.current = "hardware";
      resetWeightWatch();
    }
    prevSystemOnRef.current = deviceOn;

    const top = Math.max(0, Number(message.top_grams) || 0);
    const bottom = Math.max(0, Number(message.bottom_grams) || 0);
    setLive({ large: top, medium: bottom, debris: 0 });
    setMachine((m) => {
      // Ignore a stale "on" frame that arrives after the user pressed Stop.
      let status = m.status;
      if (deviceOn && runActiveRef.current) status = "Processing";
      else if (!deviceOn && m.status === "Processing") status = "Idle";

      return {
        ...m,
        status,
        mode: message.mode === "Manual" ? "Manual" : "Automatic",
        vibrationSpeed: clamp(Number(message.vibration_speed) || 0, 0, 100),
        sortingCategory: message.active_bin && message.active_bin !== "None" ? message.active_bin : "—",
        liveWeight: top + bottom,
        processingTime:
          deviceOn && runActiveRef.current && runStartedAtRef.current
            ? Math.floor((Date.now() - runStartedAtRef.current) / 1000)
            : m.processingTime,
      };
    });
  }

  // Catch the Success/Error messages from ESP32
  function handleDeviceLog(text = "") {
    console.log("[Device Log]", text); // Helpful for debugging!
    
    if (text.startsWith("[TARE]")) {
      setTaring(true);
    } else if (text.startsWith("[TARE DONE]")) {
      finishTare();
    } else if (text.startsWith("[FAULT]")) {
      const key = text.slice(7).trim().toLowerCase().split(/[^a-z]/)[0];
      stopReasonRef.current = "fault";
      setFault(FAULTS[key] ? key : "loadcell");
    } else if (text.includes("Success! New factor:")) {
      setTaring(false);
      clearTimeout(tareTimerRef.current);
      setCalibNotice({ severity: "success", title: "Calibration Successful", message: text });
    } else if (text.includes("[CAL] Error:")) {
      setTaring(false);
      clearTimeout(tareTimerRef.current);
      setCalibNotice({ severity: "error", title: "Calibration Failed", message: text });
    }
  }

  function finishTare() {
    clearTimeout(tareTimerRef.current);
    setTaring(false);
    setTareDoneAt(Date.now());
  }

  function requestTare() {
    if (!sendHardwareCommand("TARE")) return;
    setTaring(true);
    clearTimeout(tareTimerRef.current);
    tareTimerRef.current = setTimeout(() => setTaring(false), TARE_TIMEOUT_MS);
  }

  // UPDATED: Catch send failure and show error immediately
  function handleCalibrate(deck, weight) {
    const cmd = deck === "TOP" ? "CALIBRATE_TOP" : "CALIBRATE_BOT";
    const sent = sendHardwareCommand({ command: cmd, weight: weight });
    
    if (!sent) {
      setCalibNotice({ 
        severity: "error", 
        title: "Connection Error", 
        message: "Failed to send command. Check if the ESP32 is connected." 
      });
      return;
    }
    
    setCalibNotice(null); 
    setTaring(true); 
    clearTimeout(tareTimerRef.current);
    tareTimerRef.current = setTimeout(() => {
      setTaring(false);
      setCalibNotice({ 
        severity: "error", 
        title: "Timeout", 
        message: "The ESP32 did not respond to the calibration command. Check your connections." 
      });
    }, CALIBRATE_TIMEOUT_MS);
  }

  function resetWifi() {
    return sendHardwareCommand({ command: "RESET_WIFI" });
  }

  function markHardwareOffline(wasLive) {
    setHardwareConnected(false);
    setConnected(false);
    setReconnecting(false);
    // Allow the recorder to re-arm if the board is still running when it
    // reconnects. Batches that finish while offline cannot be saved.
    prevSystemOnRef.current = false;
    if (!wasLive) return;
    setTaring(false);
    clearTimeout(tareTimerRef.current);
    runActiveRef.current = false;
    runStartedAtRef.current = null;
    stopReasonRef.current = null;
    setMachine((m) => (m.status === "Processing" ? { ...m, status: "Error", sortingCategory: "—" } : m));
  }

  function connectHardware(showProgress = false) {
    const current = wsRef.current;
    if (current && [WebSocket.CONNECTING, WebSocket.OPEN].includes(current.readyState)) {
      if (showProgress && current.readyState === WebSocket.CONNECTING) setReconnecting(true);
      return;
    }
    if (showProgress) setReconnecting(true);

    connectStartedAtRef.current = Date.now();
    const socket = new WebSocket(ESP32_WS_URL);
    wsRef.current = socket;
    let opened = false;

    socket.onopen = () => {
      opened = true;
      lastSeenRef.current = Date.now();
      setHardwareConnected(true);
      setConnected(true);
      setReconnecting(false);
    };

    socket.onmessage = (event) => {
      lastSeenRef.current = Date.now();
      let message;
      try {
        message = JSON.parse(event.data);
      } catch {
        return;
      }
      if (message.type === "telemetry") applyTelemetry(message);
      else if (message.type === "log") handleDeviceLog(message.message);
    };

    socket.onerror = () => {
      setReconnecting(false);
    };

    socket.onclose = () => {
      if (wsRef.current === socket) wsRef.current = null;
      markHardwareOffline(opened);
    };
  }

  connectHardwareRef.current = connectHardware;

  useEffect(() => {
    loadFromDb();
    connectHardwareRef.current();

    const watch = setInterval(() => {
      const socket = wsRef.current;
      const now = Date.now();

      if (!socket || socket.readyState === WebSocket.CLOSED) {
        if (socket) wsRef.current = null;
        connectHardwareRef.current();
        return;
      }

      if (socket.readyState === WebSocket.CONNECTING) {
        if (now - connectStartedAtRef.current > WS_CONNECT_TIMEOUT_MS) socket.close();
        return;
      }

      if (socket.readyState === WebSocket.OPEN && now - lastSeenRef.current > WS_STALE_MS) {
        markHardwareOffline(true);
        socket.close();
      }
    }, WS_WATCH_MS);

    return () => {
      clearInterval(watch);
      wsRef.current?.close();
      wsRef.current = null;
      clearTimeout(tareTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  /* ---------- auto-stop: target weight, or idle scale after beans have arrived ---------- */
  liveTotalRef.current = live.large + live.medium;
  inputTargetRef.current = machine.inputTarget;

  function resetWeightWatch() {
    weightBaselineRef.current = null;
    lastWeightRef.current = 0;
    lastWeightChangeAtRef.current = Date.now();
    seenWeightFlowRef.current = false;
  }

  function handleStop(reason) {
    stopReasonRef.current = typeof reason === "string" ? reason : "manual";
    sendHardwareCommand({ command: "STOP" });
    setMachine((m) => ({ ...m, status: m.status === "Processing" ? "Idle" : m.status }));
  }

  useEffect(() => {
    if (machine.status !== "Processing") return;

    const tick = () => {
      const total = liveTotalRef.current;
      const now = Date.now();

      if (weightBaselineRef.current === null) {
        weightBaselineRef.current = total;
        lastWeightRef.current = total;
        lastWeightChangeAtRef.current = now;
        return;
      }

      if (Math.abs(total - lastWeightRef.current) >= WEIGHT_CHANGE_G) {
        lastWeightRef.current = total;
        lastWeightChangeAtRef.current = now;
        if (total >= weightBaselineRef.current + WEIGHT_FLOW_G) seenWeightFlowRef.current = true;
      }

      if (total >= inputTargetRef.current) {
        handleStop("auto");
        return;
      }

      if (seenWeightFlowRef.current && now - lastWeightChangeAtRef.current >= WEIGHT_IDLE_MS) {
        handleStop("auto");
      }
    };

    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [machine.status]);

  /* ---------- save a finished run ---------- */
  useEffect(() => {
    if (!runActiveRef.current || !["Completed", "Idle"].includes(machine.status)) return;
    runActiveRef.current = false;
    runStartedAtRef.current = null;

    const weights = normalizeBins(live, machine.inputTarget);
    const source = sourceRef.current;
    const status =
      stopReasonRef.current === "manual" ? "Partial" :
      stopReasonRef.current === "fault" ? "Error" : "Completed";
    stopReasonRef.current = null;

    postJson("save_batch.php", {
      batch_code: machine.batchId,
      bean_type: machine.beanType,
      mode: machine.mode,
      source,
      status,
      vibration_speed: machine.vibrationSpeed,
      input_weight: machine.inputTarget,
      large_weight: weights.large,
      medium_weight: weights.medium,
      small_weight: 0,
      fine_weight: weights.debris,
      processing_time: machine.processingTime,
    })
      .then((res) => {
        if (res.success) {
          setSaveError(null);
          loadFromDb();
        } else {
          setSaveError(res.error || "Batch was not saved.");
        }
      })
      .catch(() => setDbDown(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [machine.status]);

  function resetRun() {
    runActiveRef.current = false;
    runStartedAtRef.current = null;
    stopReasonRef.current = null;
    resetWeightWatch();
    sendHardwareCommand({ command: "STOP" });
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

    const onHand = inventory.stock?.[machine.beanType] ?? 0;
    if (!dbDown && onHand < machine.inputTarget) {
      setNotice(
        `Not enough ${machine.beanType} green beans: ${Math.round(onHand)} g on hand, ` +
          `${machine.inputTarget} g needed. Record a receipt on the Inventory page first.`
      );
      return;
    }
    setNotice(null);

    runActiveRef.current = true;
    runStartedAtRef.current = Date.now();
    stopReasonRef.current = null;
    sourceRef.current = hardwareConnected ? "hardware" : "simulated";
    resetWeightWatch();
    sendHardwareCommand({ command: "START", input_weight: machine.inputTarget });
    setLive(EMPTY_LIVE);
    setMachine((m) => ({ ...m, status: "Processing", processingTime: 0, liveWeight: 0 }));
  }

  function handleReset() {
    clearInterval(tickRef.current);
    sendHardwareCommand({ command: "STOP" });
    runActiveRef.current = false;
    runStartedAtRef.current = null;
    stopReasonRef.current = null;
    resetWeightWatch();
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

  const faultInfo = fault ? FAULTS[fault] : null;

  const pages = {
    dashboard: (
      <DashboardPage
        machine={machine}
        live={live}
        setBeanType={setBeanType}
        setMode={setMode}
        setSpeed={setSpeed}
        setInputTarget={setInputTarget}
        onStart={handleStart}
        onStop={handleStop}
        onReset={handleReset}
        onTare={requestTare}
        onCalibrate={handleCalibrate}
        currentNetwork={network}
        connected={connected}
        fault={fault}
        taring={taring}
        tareDoneAt={tareDoneAt}
        onReconnect={reconnect}
        reconnecting={reconnecting}
        onResetWifi={resetWifi}
        calibNotice={calibNotice}         
        setCalibNotice={setCalibNotice}   
      />
    ),
    monitor: <SortingWeightMonitor machine={machine} live={live} />,
    inventory: (
      <InventoryPage
        inventory={inventory}
        onAddMovement={addMovement}
        onCreateStockBatch={createStockBatch}
        onAdjustStock={adjustStock}
        onResetStock={resetStock}
      />
    ),
    history: <BatchHistoryPage batches={batches} sel={historySel} setSel={setHistorySel} accuracy={accuracy} onSaveAccuracy={saveAccuracy} />,
  };

  return (
    <div
      className="w-full h-full min-h-[720px] flex flex-col p-4 gap-4"
      style={{ position: "relative", overflow: "hidden", background: SHELL_BACKGROUND, color: C.text, ...sans }}
    >
      <div style={{ position: "absolute", top: -120, right: -80, width: 460, height: 460, borderRadius: "50%", background: "#EBC163", opacity: 0.2, filter: "blur(140px)", pointerEvents: "none" }} />
      <div style={{ position: "absolute", bottom: -160, left: 120, width: 520, height: 520, borderRadius: "50%", background: "#A97C50", opacity: 0.13, filter: "blur(150px)", pointerEvents: "none" }} />
      <div style={{ position: "absolute", top: "35%", left: "45%", width: 320, height: 320, borderRadius: "50%", background: "#FFF8E6", opacity: 0.55, filter: "blur(120px)", pointerEvents: "none" }} />

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
            src={logo}
            alt="Beanhi logo"
            style={{ width: 42, height: 42, borderRadius: "50%", flexShrink: 0, boxShadow: "0 0 0 2px rgba(255,255,255,0.18)", objectFit: "cover" }}
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
      </header>

      <main className="flex-1 flex flex-col min-w-0 gap-3" style={{ position: "relative" }}>
        {(!connected || faultInfo || dbDown || notice || saveError) && (
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
            {notice && (
              <AlertBanner
                severity="warning"
                icon={Package}
                code="W-STOCK"
                title="Start blocked"
                message={notice}
                action={{ label: "Dismiss", onClick: () => setNotice(null) }}
              />
            )}
            {saveError && (
              <AlertBanner
                severity="warning"
                icon={Database}
                code="W-SAVE"
                title="Batch not saved"
                message={saveError}
                action={{ label: "Dismiss", onClick: () => setSaveError(null) }}
              />
            )}
          </div>
        )}

        <div className="flex-1 overflow-auto px-1 py-1">{pages[view] ?? null}</div>
      </main>
    </div>
  );
}