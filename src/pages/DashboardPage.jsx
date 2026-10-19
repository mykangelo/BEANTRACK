import { useEffect, useRef, useState } from "react";
import { Activity, Timer, Play, Square, RotateCcw, Scale, Layers, Boxes, Loader2 } from "lucide-react";
import DashboardSetup from "../components/DashboardSetup";
import WifiSetupPanel from "../components/WifiSetupPanel";
import { C, mono, display } from "../appTokens";
import { fmtTime, sortingLoss } from "../appUtils";
import { Panel, Metric, Button, IconChip, SectionLabel } from "../components/ui";

const RING_COLOR = { Idle: C.lineLit, Processing: C.amber, Completed: C.green, Error: C.red };
const STATUS_DOT = { Idle: C.textFaint, Processing: C.amber, Completed: C.green, Error: C.red };

const MIN_CHANGE_G = 0.3;      // a deck counts as "active" only when it gains at least this much
const ACTIVE_HOLD_MS = 1500;   // keep the active state this long after the last gain
const DONE_SHOW_MS = 2000;     // how long the "zeroed" confirmation stays visible

// Circular gauge: the arc fills with the recovered share of the input
function ProgressRing({ percent, color }) {
  return (
    <div
      style={{
        width: 150,
        height: 150,
        borderRadius: "50%",
        flexShrink: 0,
        background: `conic-gradient(${color} ${percent * 3.6}deg, ${C.glassLine} 0deg)`,
        transition: "background 0.3s ease",
      }}
    >
      <div
        className="flex flex-col items-center justify-center"
        style={{ width: 118, height: 118, margin: 16, borderRadius: "50%", background: C.panel }}
      >
        <div style={{ ...mono, fontSize: 30, fontWeight: 800, lineHeight: 1 }}>{Math.round(percent)}%</div>
        <div style={{ fontSize: 11, color: C.textFaint, marginTop: 4 }}>recovered</div>
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

// Shows whether a deck is currently gaining weight
function ActiveChip({ active }) {
  return (
    <span
      style={{
        ...mono,
        fontSize: 10.5,
        fontWeight: 700,
        letterSpacing: "0.04em",
        padding: "3px 9px",
        borderRadius: 999,
        border: `1px solid ${active ? C.amber : C.glassLine}`,
        background: active ? `${C.amber}33` : "transparent",
        color: active ? C.text : C.textFaint,
        transition: "all 0.2s ease",
      }}
    >
      {active ? "● ACTIVE" : "IDLE"}
    </span>
  );
}

// One live deck reading: weight, bar against the input target, active state
function DeckCard({ title, icon, grams, inputTarget, active, source }) {
  const pct = inputTarget ? Math.min((grams / inputTarget) * 100, 100) : 0;
  return (
    <Panel
      title={
        <span className="flex items-center gap-2">
          <IconChip icon={icon} />
          {title}
        </span>
      }
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

      <div className="flex-1 h-2 rounded-full overflow-hidden mt-4" style={{ background: C.glassLine }}>
        <div
          style={{
            width: `${pct}%`,
            height: "100%",
            background: active ? C.amber : C.lineLit,
            borderRadius: 999,
            transition: "width 0.3s ease, background 0.2s ease",
          }}
        />
      </div>

      <div className="flex justify-between mt-3" style={{ fontSize: 11.5, color: C.textFaint }}>
        <span>{pct.toFixed(0)}% of {inputTarget} g input</span>
        <span>{source}</span>
      </div>
    </Panel>
  );
}

export default function DashboardPage({
  machine,
  live,
  setBeanType,
  setMode,
  setSpeed,
  setInputTarget,
  onStart,
  onStop,
  onReset,
  onTare,
  onSaveWifi,
  wifiPending,
  currentNetwork,
  connected,
  fault,
  taring,
  tareDoneAt,
}) {
  // Two physical decks: top = large grade, bottom = medium grade
  const top = live.large;
  const bottom = live.medium;
  const { recovered, lossG, lossPct } = sortingLoss(machine.inputTarget, top, bottom);

  const percent = machine.inputTarget ? Math.min((recovered / machine.inputTarget) * 100, 100) : 0;
  const isRunning = machine.status === "Processing";
  const statusColor = RING_COLOR[machine.status] || C.lineLit;
  const sourceLabel = connected ? "Live · ESP32" : "Simulated";

  // Mark a deck active while its weight is rising
  const [activeDecks, setActiveDecks] = useState({ top: false, bottom: false });
  const prevRef = useRef({ top: 0, bottom: 0 });
  const holdTimers = useRef({});

  // Briefly show "zeroed" after a tare finishes
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

  const startHint = fault
    ? "Clear the fault before starting."
    : isRunning
    ? "A batch is running."
    : connected
    ? "Hardware online. Start runs the sorter."
    : "Hardware offline. Start runs a simulated batch and saves it to the database.";

  const statusLine = taring
    ? "Taring: keep the decks empty until it finishes."
    : showDone
    ? "Decks zeroed to 0.0 g."
    : startHint;

  return (
    <div className="flex flex-col gap-5 w-full max-w-6xl mx-auto">
      {/* header */}
      <div>
        <div style={{ ...display, fontSize: 32, fontWeight: 700, letterSpacing: "-0.015em", lineHeight: 1.15 }}>
          Dashboard
        </div>
        <div style={{ fontSize: 13.5, color: C.textDim, marginTop: 3 }}>
          Live view of the current batch.
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px] gap-5 items-start">
        {/* left column */}
        <div className="flex flex-col gap-5 min-w-0">
          <Panel
            title={
              <span className="flex items-center gap-2">
                <IconChip icon={Activity} />
                Batch status
              </span>
            }
          >
            <div className="flex items-center gap-8 flex-wrap">
              <ProgressRing percent={percent} color={statusColor} />

              <div className="flex-1" style={{ minWidth: 260 }}>
                <div style={{ color: C.textFaint, fontSize: 10.5, fontWeight: 600, letterSpacing: "0.07em", textTransform: "uppercase" }}>
                  Recovered weight
                </div>
                <div style={{ ...mono, fontSize: 40, fontWeight: 800, lineHeight: 1.1 }}>
                  {recovered.toFixed(0)}
                  <span style={{ fontSize: 18, color: C.textDim, marginLeft: 4 }}>g</span>
                </div>
                <div style={{ fontSize: 12, color: C.textFaint }}>of {machine.inputTarget} g input</div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-5 mt-5 pt-5" style={{ borderTop: `1px solid ${C.glassLine}` }}>
                  <Metric label="Status" value={<StatusValue status={machine.status} />} />
                  <Metric label="Batch" value={machine.batchId} />
                  <Metric label="Bean type" value={machine.beanType} />
                  <Metric label="Mode" value={machine.mode} />
                </div>
              </div>
            </div>
          </Panel>

          {/* tare banner, shown only while taring */}
          {taring && (
            <div
              className="flex items-center gap-3 px-4 py-2.5"
              style={{
                background: `${C.amber}33`,
                border: `1px solid ${C.amber}`,
                borderRadius: 16,
                fontSize: 13,
                fontWeight: 600,
              }}
            >
              <Loader2 size={16} className="animate-spin" />
              Taring both decks. Readings will show 0.0 g when finished.
            </div>
          )}

          {/* live deck weights */}
          <div>
            <SectionLabel>LIVE DECK WEIGHTS</SectionLabel>
            <div
              className="grid grid-cols-1 sm:grid-cols-2 gap-5 mt-2"
              style={{ opacity: taring ? 0.5 : 1, transition: "opacity 0.2s" }}
            >
              <DeckCard
                title="Top deck · Large"
                icon={Layers}
                grams={top}
                inputTarget={machine.inputTarget}
                active={activeDecks.top}
                source={sourceLabel}
              />
              <DeckCard
                title="Bottom deck · Medium"
                icon={Boxes}
                grams={bottom}
                inputTarget={machine.inputTarget}
                active={activeDecks.bottom}
                source={sourceLabel}
              />
            </div>
          </div>

          {/* summary tiles */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
            <Panel title={<span className="flex items-center gap-2"><IconChip icon={Timer} />Processing time</span>}>
              <div style={{ ...mono, fontSize: 30, fontWeight: 800, lineHeight: 1.2 }}>{fmtTime(machine.processingTime)}</div>
            </Panel>
            <Panel title={<span className="flex items-center gap-2"><IconChip icon={Activity} />Recovered</span>}>
              <div style={{ ...mono, fontSize: 30, fontWeight: 800, lineHeight: 1.2 }}>{recovered.toFixed(0)} g</div>
              <div style={{ fontSize: 11.5, color: C.textFaint, marginTop: 4 }}>Large + Medium</div>
            </Panel>
            <Panel title={<span className="flex items-center gap-2"><IconChip icon={Scale} />Loss</span>}>
              <div style={{ ...mono, fontSize: 30, fontWeight: 800, lineHeight: 1.2 }}>{lossG.toFixed(0)} g</div>
              <div style={{ fontSize: 11.5, color: C.textFaint, marginTop: 4 }}>{lossPct.toFixed(1)}% of input</div>
            </Panel>
          </div>

          <Panel title="Run batch">
            <div className="flex flex-wrap gap-3">
              <Button variant="action" icon={Play} onClick={onStart} disabled={isRunning || !!fault}>
                Start sorting
              </Button>
              <Button variant="action" icon={Square} onClick={onStop} disabled={!isRunning}>
                Stop sorting
              </Button>
              <Button variant="reset" icon={RotateCcw} onClick={onReset}>
                Reset batch
              </Button>
              <Button
                variant="action"
                icon={taring ? Loader2 : Scale}
                onClick={onTare}
                disabled={!connected || taring || isRunning}
              >
                {taring ? "Taring..." : "Tare load cells"}
              </Button>
            </div>
            <div style={{ fontSize: 12, color: C.textFaint, marginTop: 12 }}>{statusLine}</div>
          </Panel>
        </div>

        {/* right column */}
        <div className="flex flex-col gap-3">
          <SectionLabel>BATCH SETUP</SectionLabel>
          <DashboardSetup
            machine={machine}
            setBeanType={setBeanType}
            setMode={setMode}
            setSpeed={setSpeed}
            setInputTarget={setInputTarget}
            vertical
          />
          <WifiSetupPanel
            connected={connected}
            isRunning={isRunning}
            currentNetwork={currentNetwork}
            pending={wifiPending}
            onSave={onSaveWifi}
          />
        </div>
      </div>
    </div>
  );
}