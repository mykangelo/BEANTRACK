import { useEffect, useRef, useState } from "react";
import { Loader2, Settings2 } from "lucide-react";
import BatchSetupModal from "../components/BatchSetupModal";
import WifiResetConfirm from "../components/WifiResetConfirm";
import WifiSetupModal from "../components/WifiSetupModal";
import CalibrationModal from "../components/CalibrationModal";
import { C, mono, sans, display, LABEL } from "../appTokens";
import { fmtTime, sortingLoss } from "../appUtils";
import { Panel, Button, Divider } from "../components/ui";
import ControlPanel from "../components/ControlPanel";

const RING_COLOR = { Idle: C.lineLit, Processing: C.amber, Completed: C.green, Error: C.red };
const STATUS_DOT = { Idle: C.textFaint, Processing: C.amber, Completed: C.green, Error: C.red };

const MIN_CHANGE_G = 0.3;
const ACTIVE_HOLD_MS = 1500;
const DONE_SHOW_MS = 2000;

// Section heading with its own space below, so it never touches the panel under it
function SectionHeading({ children }) {
  return <div style={{ ...LABEL, marginBottom: 12 }}>{children}</div>;
}

// Small label/value cell. Values never overlap their neighbours: they shrink to fit and wrap if needed.
function MetricCell({ label, children, numeric }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ ...LABEL, marginBottom: 8 }}>{label}</div>
      <div
        style={{
          ...(numeric ? mono : sans),
          fontSize: 24,
          fontWeight: 700,
          lineHeight: 1.2,
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
    <span className="inline-flex items-center gap-2" style={{ whiteSpace: "nowrap" }}>
      <span style={{ width: 8, height: 8, borderRadius: "50%", background: STATUS_DOT[status] || C.textFaint }} />
      <span>{status}</span>
    </span>
  );
}

function ActiveChip({ active }) {
  return (
    <span
      style={{
        ...LABEL, fontSize: 10, letterSpacing: "0.06em", padding: "3px 9px",
        borderRadius: 999, border: `1px solid ${active ? C.amber : C.glassLine}`,
        background: active ? `${C.amber}33` : "transparent", color: active ? C.text : C.textFaint,
        transition: "all 0.2s ease",
      }}
    >
      {active ? "● Active" : "Idle"}
    </span>
  );
}

function DeckBlock({ title, grams, inputTarget, active, source }) {
  const pct = inputTarget ? Math.min((grams / inputTarget) * 100, 100) : 0;
  return (
    <div
      style={{
        padding: "14px 16px",
        borderRadius: 18,
        border: `1px solid ${active ? C.amber : "transparent"}`,
        background: active ? `${C.amber}14` : "transparent",
        transition: "background 0.2s ease, border-color 0.2s ease",
      }}
    >
      <div className="flex items-center justify-between gap-3">
        <span style={{ ...LABEL }}>{title}</span>
        <ActiveChip active={active} />
      </div>
      <div className="flex items-end gap-2 mt-4">
        <span style={{ ...mono, fontSize: 40, fontWeight: 800, lineHeight: 1 }}>{grams.toFixed(1)}</span>
        <span style={{ fontSize: 18, color: C.textDim, marginBottom: 4 }}>g</span>
      </div>
      <div className="flex-1 h-2 rounded-full overflow-hidden mt-4" style={{ background: C.glassLine }}>
        <div style={{ width: `${pct}%`, height: "100%", background: active ? C.amber : C.lineLit, borderRadius: 999, transition: "width 0.3s ease, background 0.2s ease" }} />
      </div>
      <div className="flex justify-between gap-3 mt-3" style={{ fontSize: 11.5, color: C.textFaint }}>
        <span>{pct.toFixed(0)}% of {inputTarget} g target</span>
        <span>{source}</span>
      </div>
    </div>
  );
}

// Thick rule that splits the sections inside the merged sorting panel.

export default function DashboardPage({
  machine, live, setBeanType, setMode, setSpeed, setInputTarget, onStart, onStop, onReset, onTare, onCalibrate,
  onReconnect, onResetWifi, reconnecting, currentNetwork, connected, stock, stockKnown, fault, taring, tareDoneAt,
  calibNotice, setCalibNotice,
  setupOpen, setupStep, onSetupStep, onOpenSetup, onCloseSetup, onConfirmSetup, setupConfirmed, onOpenInventory,
}) {
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [showWifiModal, setShowWifiModal] = useState(false);
  const [showCalibModal, setShowCalibModal] = useState(false);

  const top = live.large;
  const bottom = live.medium;
  const { recovered, lossG } = sortingLoss(machine.inputTarget, top, bottom);

  const percent = machine.inputTarget ? Math.min((recovered / machine.inputTarget) * 100, 100) : 0;
  const isRunning = machine.status === "Processing";
  const statusColor = RING_COLOR[machine.status] || C.lineLit;
  const sourceLabel = connected ? "Live · ESP32" : "Simulated";

  // The mode decides who owns the speed. In Manual mode the panel
  // potentiometer does, so the dashboard can only mirror what the board says.
  // Offline there is no board to command, but the dial still chooses the speed
  // recorded with a simulated batch.
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

  function openCalibrate() {
    setCalibNotice(null);
    setShowCalibModal(true);
  }

  const startHint = fault
    ? "Clear the fault before starting."
    : isRunning
    ? "A batch is running. Stop saves the run as partial."
    : !setupConfirmed
    ? "No batch set up yet. Press New batch to configure one."
    : connected
    ? "Ready. Start runs the sorter."
    : "Hardware offline. Start runs a simulated batch and saves it to the database.";
  const statusLine = taring
    ? "Taring/Calibrating: keep the decks empty until it finishes."
    : showDone
    ? "Decks zeroed to 0.0 g."
    : startHint;

  const isCalibModalOpen = showCalibModal || !!calibNotice;

  return (
    <div className="flex flex-col gap-7 w-full max-w-6xl mx-auto">
      {/* header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div style={{ ...display, fontSize: 32, fontWeight: 700, letterSpacing: "-0.015em", lineHeight: 1.15 }}>
            Dashboard
          </div>
          <div style={{ fontSize: 13.5, color: C.textDim, marginTop: 6 }}>
            Live view of the current batch.
          </div>
        </div>
        {setupConfirmed && (
          <Button variant="action" icon={Settings2} onClick={() => onOpenSetup(2)} disabled={isRunning}>
            Change setup
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px] gap-7 items-start">
        {/* left column */}
        <div className="flex flex-col gap-7 min-w-0">
          <Panel
            title="Sorting status"
            titleVariant="banner"
            bodyStyle={{ paddingTop: 18 }}
            style={{ border: `1px solid ${C.lineLit}`, boxShadow: "none" }}
          >
            <div className="flex items-start gap-6 flex-wrap">
              <div className="flex flex-col items-center gap-4" style={{ flexShrink: 0 }}>
                <ProgressRing percent={percent} color={statusColor} />
                <div style={{ textAlign: "center" }}>
                  <div style={LABEL}>Processing time</div>
                  <div style={{ ...mono, fontSize: 24, fontWeight: 800, lineHeight: 1.1, marginTop: 6 }}>
                    {fmtTime(machine.processingTime)}
                  </div>
                </div>
              </div>

              {/* Weights stack beside the ring */}
              <div className="flex flex-col gap-7" style={{ flex: "1 1 150px", minWidth: 140 }}>
                <div>
                  <div style={LABEL}>Recovered weight</div>
                  <div style={{ ...mono, fontSize: 40, fontWeight: 800, lineHeight: 1.15, marginTop: 6 }}>
                    {recovered.toFixed(0)}
                    <span style={{ fontSize: 18, color: C.textDim, marginLeft: 6 }}>g</span>
                  </div>
                  <div style={{ ...sans, fontSize: 12, color: C.textFaint, marginTop: 2 }}>of {machine.inputTarget} g target</div>
                </div>

                <div>
                  <div style={LABEL}>Not recovered</div>
                  <div style={{ ...mono, fontSize: 40, fontWeight: 800, lineHeight: 1.15, marginTop: 6 }}>
                    {lossG.toFixed(0)}
                    <span style={{ fontSize: 18, color: C.textDim, marginLeft: 6 }}>g</span>
                  </div>
                </div>
              </div>

              {/* Batch facts stack on the right */}
              <div className="flex flex-col gap-5" style={{ flex: "1 1 150px", minWidth: 140 }}>
                <MetricCell label="Status">
                  <StatusValue status={machine.status} />
                </MetricCell>
                <MetricCell label="Batch" numeric>{machine.batchId}</MetricCell>
                <MetricCell label="Bean type">{machine.beanType}</MetricCell>
              </div>
            </div>

            {taring && (
              <div className="flex items-center gap-3 mt-6 px-5 py-3" style={{ background: `${C.amber}33`, border: `1px solid ${C.amber}`, borderRadius: 16, fontSize: 13, fontWeight: 600 }}>
                <Loader2 size={16} className="animate-spin" />
                Taring or Calibrating. Please wait...
              </div>
            )}

            <Divider style={{ margin: "24px 0" }} />

            <SectionHeading>LIVE DECK WEIGHTS</SectionHeading>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5" style={{ opacity: taring ? 0.5 : 1, transition: "opacity 0.2s" }}>
              <DeckBlock title="Top deck · Large" grams={top} inputTarget={machine.inputTarget} active={activeDecks.top} source={sourceLabel} />
              <DeckBlock title="Bottom deck · Medium" grams={bottom} inputTarget={machine.inputTarget} active={activeDecks.bottom} source={sourceLabel} />
            </div>
          </Panel>
        </div>

        {/* right column */}
        <div className="flex flex-col gap-5">
          <ControlPanel
            isRunning={isRunning}
            connected={connected}
            taring={taring}
            fault={fault}
            setupConfirmed={setupConfirmed}
            onStart={onStart}
            onStop={onStop}
            onTare={onTare}
            onCalibrate={openCalibrate}
            onReset={onReset}
            onNewBatch={() => onOpenSetup(1)}
            hint={statusLine}
            machine={machine}
            setSpeed={setSpeed}
          />
        </div>
      </div>

      {setupOpen && (
        <BatchSetupModal
          machine={machine}
          setBeanType={setBeanType}
          setMode={setMode}
          setInputTarget={setInputTarget}
          step={setupStep}
          onStep={onSetupStep}
          connected={connected}
          reconnecting={reconnecting}
          currentNetwork={currentNetwork}
          onReconnect={onReconnect}
          onWifi={() => (connected ? handleChangeWifi() : setShowWifiModal(true))}
          stock={stock}
          stockKnown={stockKnown}
          taring={taring}
          fault={fault}
          onCancel={onCloseSetup}
          onConfirm={onConfirmSetup}
          onOpenInventory={onOpenInventory}
        />
      )}

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
