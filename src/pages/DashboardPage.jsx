import { useEffect, useRef, useState } from "react";
import { Activity, Timer, Play, Square, RotateCcw, Scale, Layers, Boxes, Loader2, Wifi, Settings2, Gauge } from "lucide-react";
import DashboardSetup from "../components/DashboardSetup";
import WifiResetConfirm from "../components/WifiResetConfirm";
import WifiSetupModal from "../components/WifiSetupModal";
import CalibrationModal from "../components/CalibrationModal";
import CircularKnob from "../components/CircularKnob";
import { C, mono, display } from "../appTokens";
import { fmtTime, sortingLoss } from "../appUtils";
import { Panel, Button, IconChip } from "../components/ui";

const RING_COLOR = { Idle: C.lineLit, Processing: C.amber, Completed: C.green, Error: C.red };
const STATUS_DOT = { Idle: C.textFaint, Processing: C.amber, Completed: C.green, Error: C.red };

const MIN_CHANGE_G = 0.3;
const ACTIVE_HOLD_MS = 1500;
const DONE_SHOW_MS = 2000;

// Section heading with its own space below, so it never touches the panel under it
function SectionHeading({ children }) {
  return (
    <div
      style={{
        ...mono,
        fontSize: 10.5,
        letterSpacing: "0.08em",
        color: C.textFaint,
        marginBottom: 12,
      }}
    >
      {children}
    </div>
  );
}

// Small label/value cell. Values never overlap their neighbours: they shrink to fit and wrap if needed.
function MetricCell({ label, children }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div
        style={{
          color: C.textFaint,
          fontSize: 10.5,
          fontWeight: 600,
          letterSpacing: "0.07em",
          textTransform: "uppercase",
          marginBottom: 8,
        }}
      >
        {label}
      </div>
      <div
        style={{
          ...mono,
          fontSize: 19,
          fontWeight: 700,
          lineHeight: 1.25,
          overflowWrap: "anywhere",
          color: C.text,
        }}
      >
        {children}
      </div>
    </div>
  );
}

function ProgressRing({ percent, color }) {
  return (
    <div
      style={{
        width: 150, height: 150, borderRadius: "50%", flexShrink: 0,
        background: `conic-gradient(${color} ${percent * 3.6}deg, ${C.glassLine} 0deg)`,
        transition: "background 0.3s ease",
      }}
    >
      <div className="flex flex-col items-center justify-center" style={{ width: 118, height: 118, margin: 16, borderRadius: "50%", background: C.panel }}>
        <div style={{ ...mono, fontSize: 30, fontWeight: 800, lineHeight: 1 }}>{Math.round(percent)}%</div>
        <div style={{ fontSize: 11, color: C.textFaint, marginTop: 6 }}>recovered</div>
      </div>
    </div>
  );
}

function StatusValue({ status }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span style={{ width: 8, height: 8, borderRadius: "50%", background: STATUS_DOT[status] || C.textFaint }} />
      <span>{status}</span>
    </span>
  );
}

function ActiveChip({ active }) {
  return (
    <span
      style={{
        ...mono, fontSize: 10.5, fontWeight: 700, letterSpacing: "0.04em", padding: "3px 9px",
        borderRadius: 999, border: `1px solid ${active ? C.amber : C.glassLine}`,
        background: active ? `${C.amber}33` : "transparent", color: active ? C.text : C.textFaint,
        transition: "all 0.2s ease",
      }}
    >
      {active ? "● ACTIVE" : "IDLE"}
    </span>
  );
}

function DeckCard({ title, icon, grams, inputTarget, active, source }) {
  const pct = inputTarget ? Math.min((grams / inputTarget) * 100, 100) : 0;
  return (
    <Panel
      title={<span className="flex items-center gap-2"><IconChip icon={icon} />{title}</span>}
      right={<ActiveChip active={active} />}
      style={{
        border: `1px solid ${active ? C.amber : C.glassBorder}`,
        boxShadow: active ? `0 0 0 3px ${C.amber}33, ${C.glassShadow}` : C.glassShadow,
        transition: "box-shadow 0.2s ease, border-color 0.2s ease",
      }}
    >
      <div className="flex items-end gap-2">
        <span style={{ ...mono, fontSize: 40, fontWeight: 800, lineHeight: 1 }}>{grams.toFixed(1)}</span>
        <span style={{ fontSize: 18, color: C.textDim, marginBottom: 4 }}>g</span>
      </div>
      <div className="flex-1 h-2 rounded-full overflow-hidden mt-5" style={{ background: C.glassLine }}>
        <div style={{ width: `${pct}%`, height: "100%", background: active ? C.amber : C.lineLit, borderRadius: 999, transition: "width 0.3s ease, background 0.2s ease" }} />
      </div>
      <div className="flex justify-between gap-3 mt-4" style={{ fontSize: 11.5, color: C.textFaint }}>
        <span>{pct.toFixed(0)}% of {inputTarget} g input</span>
        <span>{source}</span>
      </div>
    </Panel>
  );
}

export default function DashboardPage({
  machine, live, setBeanType, setMode, setSpeed, setInputTarget, onStart, onStop, onReset, onTare, onCalibrate,
  onReconnect, onResetWifi, reconnecting, currentNetwork, connected, fault, taring, tareDoneAt,
  calibNotice, setCalibNotice,
}) {
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [showWifiModal, setShowWifiModal] = useState(false);
  const [showCalibModal, setShowCalibModal] = useState(false);

  const top = live.large;
  const bottom = live.medium;
  const { recovered, lossG, lossPct } = sortingLoss(machine.inputTarget, top, bottom);

  const percent = machine.inputTarget ? Math.min((recovered / machine.inputTarget) * 100, 100) : 0;
  const isRunning = machine.status === "Processing";
  const statusColor = RING_COLOR[machine.status] || C.lineLit;
  const sourceLabel = connected ? "Live · ESP32" : "Simulated";

  const [activeDecks, setActiveDecks] = useState({ top: false, bottom: false });
  const prevRef = useRef({ top: 0, bottom: 0 });
  const holdTimers = useRef({});
  const [showDone, setShowDone] = useState(false);

  useEffect(() => {
    const prev = prevRef.current;
    prevRef.current = { top, bottom };
    ["top", "bottom"].forEach((deck) => {
      const now = deck === "top" ? top : bottom;
      if (now - prev[deck] > MIN_CHANGE_G) {
        setActiveDecks((a) => ({ ...a, [deck]: true }));
        clearTimeout(holdTimers.current[deck]);
        holdTimers.current[deck] = setTimeout(() => {
          setActiveDecks((a) => ({ ...a, [deck]: false }));
        }, ACTIVE_HOLD_MS);
      }
    });
  }, [top, bottom]);

  useEffect(() => {
    const timers = holdTimers.current;
    return () => Object.values(timers).forEach(clearTimeout);
  }, []);

  useEffect(() => {
    if (!tareDoneAt) return;
    setShowDone(true);
    const t = setTimeout(() => setShowDone(false), DONE_SHOW_MS);
    return () => clearTimeout(t);
  }, [tareDoneAt]);

  function handleChangeWifi() {
    setShowResetConfirm(true);
  }

  function confirmResetWifi() {
    setShowResetConfirm(false);
    onResetWifi();
    setShowWifiModal(true);
  }

  const startHint = fault
    ? "Clear the fault before starting."
    : isRunning
    ? "A batch is running."
    : connected
    ? "Hardware online. Start runs the sorter."
    : "Hardware offline. Start runs a simulated batch and saves it to the database.";
  const statusLine = taring
    ? "Taring/Calibrating: keep the decks empty until it finishes."
    : showDone
    ? "Decks zeroed to 0.0 g."
    : startHint;
  const connectionText = reconnecting
    ? "Connecting to the ESP32..."
    : connected
    ? `Online${currentNetwork ? ` on "${currentNetwork}"` : ""}`
    : "Offline. Check that the ESP32 is powered and on your Wi-Fi.";

  const isCalibModalOpen = showCalibModal || !!calibNotice;

  return (
    <div className="flex flex-col gap-7 w-full max-w-6xl mx-auto">
      {/* header */}
      <div>
        <div style={{ ...display, fontSize: 32, fontWeight: 700, letterSpacing: "-0.015em", lineHeight: 1.15 }}>Dashboard</div>
        <div style={{ fontSize: 13.5, color: C.textDim, marginTop: 6 }}>Live view of the current batch.</div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px] gap-7 items-start">
        {/* left column */}
        <div className="flex flex-col gap-7 min-w-0">
          <Panel title={<span className="flex items-center gap-2"><IconChip icon={Activity} />Batch status</span>}>
            <div className="flex items-center gap-10 flex-wrap">
              <ProgressRing percent={percent} color={statusColor} />
              <div className="flex-1" style={{ minWidth: 260 }}>
                <div style={{ color: C.textFaint, fontSize: 10.5, fontWeight: 600, letterSpacing: "0.07em", textTransform: "uppercase" }}>
                  Recovered weight
                </div>
                <div style={{ ...mono, fontSize: 40, fontWeight: 800, lineHeight: 1.15, marginTop: 6 }}>
                  {recovered.toFixed(0)}
                  <span style={{ fontSize: 18, color: C.textDim, marginLeft: 6 }}>g</span>
                </div>
                <div style={{ fontSize: 12, color: C.textFaint, marginTop: 2 }}>of {machine.inputTarget} g input</div>

                <div
                  className="grid gap-x-8 gap-y-6 mt-7 pt-6"
                  style={{
                    borderTop: `1px solid ${C.glassLine}`,
                    gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
                  }}
                >
                  <MetricCell label="Status">
                    <StatusValue status={machine.status} />
                  </MetricCell>
                  <MetricCell label="Batch">{machine.batchId}</MetricCell>
                  <MetricCell label="Bean type">{machine.beanType}</MetricCell>
                  <MetricCell label="Mode">{machine.mode}</MetricCell>
                </div>
              </div>
            </div>
          </Panel>

          {taring && (
            <div className="flex items-center gap-3 px-5 py-3" style={{ background: `${C.amber}33`, border: `1px solid ${C.amber}`, borderRadius: 16, fontSize: 13, fontWeight: 600 }}>
              <Loader2 size={16} className="animate-spin" />
              Taring or Calibrating. Please wait...
            </div>
          )}

          <div>
            <SectionHeading>LIVE DECK WEIGHTS</SectionHeading>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6" style={{ opacity: taring ? 0.5 : 1, transition: "opacity 0.2s" }}>
              <DeckCard title="Top deck · Large" icon={Layers} grams={top} inputTarget={machine.inputTarget} active={activeDecks.top} source={sourceLabel} />
              <DeckCard title="Bottom deck · Medium" icon={Boxes} grams={bottom} inputTarget={machine.inputTarget} active={activeDecks.bottom} source={sourceLabel} />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            <Panel title={<span className="flex items-center gap-2"><IconChip icon={Timer} />Processing time</span>}>
              <div style={{ ...mono, fontSize: 30, fontWeight: 800, lineHeight: 1.2 }}>{fmtTime(machine.processingTime)}</div>
            </Panel>
            <Panel title={<span className="flex items-center gap-2"><IconChip icon={Activity} />Recovered</span>}>
              <div style={{ ...mono, fontSize: 30, fontWeight: 800, lineHeight: 1.2 }}>{recovered.toFixed(0)} g</div>
              <div style={{ fontSize: 11.5, color: C.textFaint, marginTop: 6 }}>Large + Medium</div>
            </Panel>
            <Panel title={<span className="flex items-center gap-2"><IconChip icon={Scale} />Loss</span>}>
              <div style={{ ...mono, fontSize: 30, fontWeight: 800, lineHeight: 1.2 }}>{lossG.toFixed(0)} g</div>
              <div style={{ fontSize: 11.5, color: C.textFaint, marginTop: 6 }}>{lossPct.toFixed(1)}% of input</div>
            </Panel>
          </div>

          <Panel title="Run batch">
            <div className="flex flex-wrap gap-4">
              <Button variant="action" icon={Play} onClick={onStart} disabled={isRunning || !!fault}>Start sorting</Button>
              <Button variant="action" icon={Square} onClick={onStop} disabled={!isRunning}>Stop sorting</Button>
              <Button variant="reset" icon={RotateCcw} onClick={onReset}>Reset batch</Button>
              <Button variant="action" icon={taring ? Loader2 : Scale} onClick={onTare} disabled={!connected || taring || isRunning}>
                {taring ? "Taring..." : "Tare load cells"}
              </Button>
              <Button
                variant="action"
                icon={Settings2}
                onClick={() => {
                  setCalibNotice(null);
                  setShowCalibModal(true);
                }}
                disabled={!connected || taring || isRunning}
              >
                Calibrate Scale
              </Button>
            </div>
            <div style={{ fontSize: 12, color: C.textFaint, marginTop: 16, lineHeight: 1.6 }}>{statusLine}</div>
          </Panel>
        </div>

        {/* right column */}
        <div className="flex flex-col gap-5">
          <SectionHeading>BATCH SETUP</SectionHeading>
          <DashboardSetup machine={machine} setBeanType={setBeanType} setMode={setMode} setInputTarget={setInputTarget} vertical />

          <Panel title={<span className="flex items-center gap-2"><IconChip icon={Gauge} />Vibration speed</span>}>
            <div className="flex flex-col items-center gap-4">
              <CircularKnob
                value={machine.vibrationSpeed}
                onChange={setSpeed}
                min={0}
                max={100}
                step={1}
                size={150}
                disabled={isRunning}
                label="Vibration"
                suffix="%"
              />
              <div style={{ fontSize: 11.5, color: C.textFaint, textAlign: "center", lineHeight: 1.6 }}>
                Drag the dial or use arrow keys.
              </div>
            </div>
          </Panel>

          <Panel title={<span className="flex items-center gap-2"><IconChip icon={Wifi} />ESP32 connection</span>}>
            <div style={{ fontSize: 12.5, color: C.textDim, marginBottom: 16, lineHeight: 1.6 }}>{connectionText}</div>
            <div className="flex flex-wrap gap-3">
              {!connected && <Button variant="action" icon={Wifi} onClick={onReconnect} disabled={reconnecting}>Reconnect</Button>}
              {connected ? (
                <Button variant="action" icon={Wifi} onClick={handleChangeWifi}>Change Wi-Fi</Button>
              ) : (
                <Button variant="action" icon={Wifi} onClick={() => setShowWifiModal(true)}>Set up Wi-Fi</Button>
              )}
            </div>
          </Panel>
        </div>
      </div>

      {showResetConfirm && <WifiResetConfirm onCancel={() => setShowResetConfirm(false)} onConfirm={confirmResetWifi} />}
      {showWifiModal && <WifiSetupModal onClose={() => setShowWifiModal(false)} connected={connected} currentNetwork={currentNetwork} />}

      {isCalibModalOpen && (
        <CalibrationModal
          onClose={() => {
            setShowCalibModal(false);
            setCalibNotice(null);
          }}
          isBusy={taring}
          notice={calibNotice}
          onCalibrate={(deck, weight) => onCalibrate(deck, weight)}
        />
      )}
    </div>
  );
}