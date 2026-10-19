import { Activity, Layers, Boxes, Scale, ArrowRight } from "lucide-react";
import { C, mono, display } from "../appTokens";
import { sortingLoss } from "../appUtils";
import { Panel, IconChip, SectionLabel } from "../components/ui";

const STATUS_DOT = { Idle: C.textFaint, Processing: C.amber, Completed: C.green, Error: C.red };

const STATUS_TEXT = {
  Idle: "No batch running. Values stay at zero until a batch starts.",
  Processing: "Batch in progress. Values are still changing.",
  Completed: "Batch complete. These are the final values.",
  Error: "Run stopped by an error. Values may be incomplete.",
};

const ACTIVE_HOLD_MS = 1500;

// Small status pill used in the page header and the deck cards
function StatusChip({ label, color }) {
  return (
    <span
      style={{
        ...mono,
        fontSize: 10.5,
        fontWeight: 700,
        letterSpacing: "0.04em",
        padding: "3px 9px",
        borderRadius: 999,
        border: `1px solid ${color}`,
        background: `${color}22`,
        color: C.text,
      }}
    >
      {label}
    </span>
  );
}

// One deck reading, same look as the dashboard deck cards
function DeckCard({ title, icon, grams, inputTarget, info }) {
  const pct = inputTarget ? Math.min((grams / inputTarget) * 100, 100) : 0;
  return (
    <Panel
      title={
        <span className="flex items-center gap-2">
          <IconChip icon={icon} />
          {title}
        </span>
      }
      right={<StatusChip label={info} color={C.lineLit} />}
    >
      <div className="flex items-end gap-2">
        <span style={{ ...mono, fontSize: 40, fontWeight: 800, lineHeight: 1 }}>{grams.toFixed(1)}</span>
        <span style={{ fontSize: 18, color: C.textDim, marginBottom: 4 }}>g</span>
      </div>

      <div className="h-2 rounded-full overflow-hidden mt-4" style={{ background: C.glassLine }}>
        <div
          style={{
            width: `${pct}%`,
            height: "100%",
            background: C.lineLit,
            borderRadius: 999,
            transition: "width 0.3s ease",
          }}
        />
      </div>

      <div className="flex justify-between mt-3" style={{ fontSize: 11.5, color: C.textFaint }}>
        <span>{pct.toFixed(0)}% of {inputTarget} g input</span>
        <span>Live · ESP32</span>
      </div>
    </Panel>
  );
}

// One metric cell in the summary row
function Figure({ label, value, unit, color, sub }) {
  return (
    <div>
      <div
        style={{
          color: C.textFaint,
          fontSize: 10.5,
          fontWeight: 600,
          letterSpacing: "0.07em",
          textTransform: "uppercase",
          marginBottom: 6,
        }}
      >
        {label}
      </div>
      <div style={{ ...mono, fontSize: 30, fontWeight: 800, lineHeight: 1.1, color: color || C.text }}>
        {value}
        {unit && <span style={{ fontSize: 16, color: C.textDim, marginLeft: 4 }}>{unit}</span>}
      </div>
      {sub && <div style={{ fontSize: 11.5, color: C.textFaint, marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

// Horizontal bar showing how the input splits into top, bottom, and loss
function SplitBar({ topPct, bottomPct, lossPct }) {
  const segments = [
    { label: "Top · Large", pct: topPct, color: C.amber },
    { label: "Bottom · Medium", pct: bottomPct, color: C.lineLit },
    { label: "Loss", pct: lossPct, color: C.red },
  ];
  return (
    <div>
      <div className="flex h-3 rounded-full overflow-hidden" style={{ background: C.glassLine }}>
        {segments.map((s) => (
          <div
            key={s.label}
            title={`${s.label}: ${s.pct.toFixed(1)}%`}
            style={{ width: `${s.pct}%`, background: s.color, transition: "width 0.3s ease" }}
          />
        ))}
      </div>
      <div className="flex flex-wrap gap-5 mt-3" style={{ fontSize: 12, color: C.textDim }}>
        {segments.map((s) => (
          <span key={s.label} className="inline-flex items-center gap-2">
            <span style={{ width: 8, height: 8, borderRadius: 2, background: s.color, display: "inline-block" }} />
            {s.label}
            <span style={{ ...mono, color: C.text, fontWeight: 700 }}>{s.pct.toFixed(1)}%</span>
          </span>
        ))}
      </div>
    </div>
  );
}

export default function SortingWeightMonitor({ machine, live }) {
  const inputW = machine.inputTarget;
  const { recovered, lossG, lossPct } = sortingLoss(inputW, live.large, live.medium);

  const topPct = inputW ? Math.min((live.large / inputW) * 100, 100) : 0;
  const bottomPct = inputW ? Math.min((live.medium / inputW) * 100, 100 - topPct) : 0;
  const lossBarPct = Math.max(0, 100 - topPct - bottomPct);

  const isProcessing = machine.status === "Processing";
  const statusColor = STATUS_DOT[machine.status] || C.textFaint;

  return (
    <div className="flex flex-col gap-5 w-full max-w-6xl mx-auto">
      {/* header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div style={{ ...display, fontSize: 32, fontWeight: 700, letterSpacing: "-0.015em", lineHeight: 1.15 }}>
            Sorting & weight
          </div>
          <div style={{ fontSize: 13.5, color: C.textDim, marginTop: 3 }}>
            Weight recovered from each deck for the current batch, compared with the input.
          </div>
        </div>
        <StatusChip label={machine.status.toUpperCase()} color={statusColor} />
      </div>

      {/* status line */}
      <div className="flex items-center gap-2" style={{ fontSize: 12.5, color: C.textDim }}>
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: statusColor,
            display: "inline-block",
          }}
        />
        {STATUS_TEXT[machine.status]}
      </div>

      {/* deck cards */}
      <div>
        <SectionLabel>LIVE DECK WEIGHTS</SectionLabel>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 mt-2">
          <DeckCard
            title="Top deck · Large"
            icon={Layers}
            grams={live.large}
            inputTarget={inputW}
            info="Bin 1 · >5 mm"
          />
          <DeckCard
            title="Bottom deck · Medium"
            icon={Boxes}
            grams={live.medium}
            inputTarget={inputW}
            info="Bin 2 · 4–5 mm"
          />
        </div>
      </div>

      {/* recovery summary */}
      <Panel
        title={
          <span className="flex items-center gap-2">
            <IconChip icon={Activity} />
            {isProcessing ? "Recovery so far" : "Recovery summary"}
          </span>
        }
        right={<StatusChip label={`${inputW} g INPUT`} color={C.lineLit} />}
      >
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-5">
          <Figure label="Input" value={inputW} unit="g" sub={machine.beanType} />
          <Figure label="Recovered" value={recovered.toFixed(0)} unit="g" color={C.green} sub="Top + Bottom" />
          <Figure label="Loss" value={lossG.toFixed(0)} unit="g" color={C.red} sub="Input − Recovered" />
          <Figure label="Loss" value={`${lossPct.toFixed(1)}`} unit="%" color={C.red} sub="of input" />
        </div>

        <div className="mt-6 pt-5" style={{ borderTop: `1px solid ${C.glassLine}` }}>
          <SplitBar topPct={topPct} bottomPct={bottomPct} lossPct={lossBarPct} />
        </div>
      </Panel>

      {/* formula, for the thesis reader */}
      <div className="flex items-center gap-3 flex-wrap" style={{ fontSize: 12, color: C.textFaint }}>
        <span style={{ ...mono }}>LOAD CELL</span>
        <ArrowRight size={12} />
        <span style={{ ...mono }}>HX711</span>
        <ArrowRight size={12} />
        <span style={{ ...mono }}>ESP32</span>
        <ArrowRight size={12} />
        <span style={{ ...mono }}>WEB APP</span>
        <ArrowRight size={12} />
        <span style={{ ...mono }}>DATABASE</span>
        <span style={{ marginLeft: "auto" }}>Loss = (Input − Recovered) ÷ Input × 100</span>
      </div>
    </div>
  );
}