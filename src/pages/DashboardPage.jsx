import { Activity, Gauge, Timer, Play, Square, RotateCcw, Scale, Package } from "lucide-react";
import DashboardSetup from "../components/DashboardSetup";
import { C, mono, display } from "../appTokens";
import { fmtTime } from "../appUtils";
import { CATS, CAT_LABEL } from "../appConstants";
import { Panel, Metric, Button, IconChip, SectionLabel } from "../components/ui";

const RING_COLOR = { Idle: C.lineLit, Processing: C.amber, Completed: C.green, Error: C.red };
const STATUS_DOT = { Idle: C.textFaint, Processing: C.amber, Completed: C.green, Error: C.red };

function sum(bins) {
  return CATS.reduce((acc, c) => acc + (bins[c] || 0), 0);
}

// Circular gauge: the arc fills with the percentage of the input that has been sorted
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
        <div style={{ fontSize: 11, color: C.textFaint, marginTop: 4 }}>of input</div>
      </div>
    </div>
  );
}

// Status shown as a colored dot plus a readable label
function StatusValue({ status }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span style={{ width: 8, height: 8, borderRadius: "50%", background: STATUS_DOT[status] || C.textFaint }} />
      <span>{status}</span>
    </span>
  );
}

function StatTile({ icon: Icon, title, value, small }) {
  return (
    <Panel
      title={
        <span className="flex items-center gap-2">
          <IconChip icon={Icon} />
          {title}
        </span>
      }
    >
      <div style={{ ...mono, fontSize: small ? 22 : 30, fontWeight: 800, lineHeight: 1.2 }}>{value}</div>
    </Panel>
  );
}

// Stock for one bean type. Bars are scaled against the largest bin across both beans.
function StockPanel({ bean, bins, maxKg, barColor }) {
  const total = sum(bins);
  return (
    <Panel
      title={`Inventory — ${bean}`}
      right={<span style={{ ...mono, fontSize: 12, color: C.amber }}>{total.toFixed(1)} kg total</span>}
    >
      <div className="flex flex-col gap-3">
        {CATS.map((c) => {
          const kg = bins[c] || 0;
          const pct = maxKg > 0 ? (kg / maxKg) * 100 : 0;
          return (
            <div key={c} className="flex items-center gap-3">
              <span style={{ fontSize: 13, color: C.textDim, width: 96 }}>{CAT_LABEL[c]}</span>
              <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: C.glassLine }}>
                <div
                  style={{
                    width: `${pct}%`,
                    height: "100%",
                    background: barColor,
                    borderRadius: 999,
                    transition: "width 0.4s ease",
                  }}
                />
              </div>
              <span style={{ ...mono, fontSize: 13, fontWeight: 700, width: 64, textAlign: "right" }}>{kg.toFixed(1)} kg</span>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}

export default function DashboardPage({
  machine,
  live,
  inventory,
  dbDown,
  setBeanType,
  setMode,
  setSpeed,
  setInputTarget,
  onStart,
  onStop,
  onReset,
  connected,
  fault,
  sendCommand,
}) {
  const total = live.large + live.medium + live.debris;
  const sorted = live.large + live.medium;
  const percent = machine.inputTarget ? Math.min((total / machine.inputTarget) * 100, 100) : 0;
  const yieldPct = total > 0 ? (sorted / total) * 100 : null;
  const isRunning = machine.status === "Processing";

  const maxKg = Math.max(
    0,
    ...CATS.flatMap((c) => [inventory.Arabica[c] || 0, inventory.Robusta[c] || 0])
  );

  const startHint = fault
    ? "Clear the fault before starting."
    : isRunning
    ? "A batch is running."
    : connected
    ? "Hardware online. Start will run the sorter."
    : "Hardware offline. Start runs a simulated batch and saves it to the database.";

  return (
    <div className="flex flex-col gap-5 w-full max-w-6xl mx-auto">
      {/* header */}
      <div>
        <div style={{ ...display, fontSize: 32, fontWeight: 700, letterSpacing: "-0.015em", lineHeight: 1.15 }}>
          Dashboard
        </div>
        <div style={{ fontSize: 13.5, color: C.textDim, marginTop: 3 }}>
          Live view of the current batch and the stock on hand.
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
              <ProgressRing percent={percent} color={RING_COLOR[machine.status] || C.lineLit} />

              <div className="flex-1" style={{ minWidth: 260 }}>
                <div style={{ color: C.textFaint, fontSize: 10.5, fontWeight: 600, letterSpacing: "0.07em", textTransform: "uppercase" }}>
                  Total recorded
                </div>
                <div style={{ ...mono, fontSize: 40, fontWeight: 800, lineHeight: 1.1 }}>
                  {Math.round(total)}
                  <span style={{ fontSize: 18, color: C.textDim, marginLeft: 4 }}>g</span>
                </div>
                <div style={{ fontSize: 12, color: C.textFaint }}>of {machine.inputTarget} g input</div>

                <div
                  className="grid grid-cols-2 sm:grid-cols-4 gap-5 mt-5 pt-5"
                  style={{ borderTop: `1px solid ${C.glassLine}` }}
                >
                  <Metric label="Status" value={<StatusValue status={machine.status} />} />
                  <Metric label="Batch" value={machine.batchId} />
                  <Metric label="Bean type" value={machine.beanType} />
                  <Metric label="Mode" value={machine.mode} />
                </div>
              </div>
            </div>
          </Panel>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
            <StatTile icon={Timer} title="Processing time" value={fmtTime(machine.processingTime)} />
            <StatTile icon={Activity} title="Active bin" value={machine.sortingCategory} small />
            <StatTile
              icon={Gauge}
              title="Sorted so far"
              value={yieldPct === null ? "—" : `${Math.round(yieldPct)}%`}
            />
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
              <Button variant="action" icon={Scale} onClick={() => sendCommand("TARE")} disabled={!connected}>
                Tare load cells
              </Button>
            </div>
            <div style={{ fontSize: 12, color: C.textFaint, marginTop: 12 }}>{startHint}</div>
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
        </div>
      </div>

      {/* stock */}
      <div className="flex items-center gap-2" style={{ marginBottom: -8 }}>
        <Package size={14} color={C.textFaint} />
        <SectionLabel>STOCK ON HAND</SectionLabel>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <StockPanel bean="Arabica" bins={inventory.Arabica} maxKg={maxKg} barColor={C.arabica} />
        <StockPanel bean="Robusta" bins={inventory.Robusta} maxKg={maxKg} barColor={C.robusta} />
      </div>

      {dbDown && (
        <div style={{ color: C.textDim, fontSize: 12.5 }}>
          The database is offline, so the stock and history numbers may be sample data.
        </div>
      )}
    </div>
  );
}