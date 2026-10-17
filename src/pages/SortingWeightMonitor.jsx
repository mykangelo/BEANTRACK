import { C, mono } from "../appTokens";
import { Panel } from "../components/ui";

const CATS = ["large", "medium", "debris"];
const CAT_LABEL = { large: "Large", medium: "Medium", debris: "Fine / debris" };
const CAT_COLOR = { large: "#E3BE58", medium: "#B98A3E", debris: "#231710" };
const BIN_INFO = { large: "Bin 1 · >5 mm", medium: "Bin 2 · 4–5 mm", debris: "Bin 3 · <4 mm" };
const STATUS_COLOR = { Idle: "#9C8558", Processing: "#C99A2E", Completed: "#5C3B1E", Error: "#1C130B" };

function PageHeader({ title, purpose }) {
  return (
    <div>
      <div style={{ fontFamily: "'Fraunces', Georgia, serif", fontSize: 32, fontWeight: 700, lineHeight: 1.15 }}>{title}</div>
      <div style={{ fontSize: 13.5, color: C.textDim, marginTop: 3 }}>{purpose}</div>
    </div>
  );
}

function BeanTag({ bean }) {
  const color = bean === "Arabica" ? C.arabica : C.robusta;
  return <span className="inline-flex items-center gap-1.5 px-2 py-0.5" style={{ border: `1px solid ${color}66`, color, borderRadius: 999, ...mono, fontSize: 11 }}>{bean}</span>;
}

export default function SortingWeightMonitor({ machine, live }) {
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
        {{ Processing: "Batch in progress. Values are still changing.", Completed: "Batch complete. These are the final values.", Error: "Run stopped by an error. Values are incomplete.", Idle: "No batch running. Values stay at zero until a batch starts." }[machine.status]}
      </div>
      <div style={{ fontSize: 11, color: C.textFaint, ...mono }}>LOAD CELL → HX711 → ESP32 → WEB APP → DATABASE</div>

      <Panel title="Weight per bin" right={<BeanTag bean={machine.beanType} />}>
        <table className="w-full" style={{ borderCollapse: "collapse" }}>
          <thead><tr style={rowStyle}><th className="text-left py-2" style={{ fontSize: 11, color: C.textFaint, fontWeight: 500 }}>BIN</th><th className="text-right py-2" style={{ fontSize: 11, color: C.textFaint, fontWeight: 500 }}>WEIGHT</th></tr></thead>
          <tbody>
            {CATS.map((c) => <>
              <tr key={c} style={rowStyle}><td className="py-2.5" style={{ fontSize: 13 }}><span style={{ width: 7, height: 7, background: CAT_COLOR[c], display: "inline-block", marginRight: 8 }} />{CAT_LABEL[c]} <span style={{ ...mono, fontSize: 10.5, color: C.textFaint }}>{BIN_INFO[c]}</span></td><td className="text-right" style={valueStyle}>{Math.round(live[c])} g</td></tr>
              {c === "medium" && <tr key="sorted" style={rowStyle}><td className="py-2" style={{ fontSize: 12, color: C.textDim, paddingLeft: 15 }}>Sorted weight (Bin 1 + Bin 2)</td><td className="text-right" style={{ ...valueStyle, color: C.green }}>{Math.round(sorted)} g</td></tr>}
            </>)}
            <tr style={rowStyle}><td className="py-2.5" style={{ fontSize: 13, fontWeight: 600 }}>Total recorded</td><td className="text-right" style={{ ...valueStyle, fontWeight: 700 }}>{Math.round(total)} g</td></tr>
            <tr><td className="py-2.5" style={{ fontSize: 13 }}>Input weight</td><td className="text-right" style={valueStyle}>{inputW} g</td></tr>
          </tbody>
        </table>
      </Panel>
      <div className="grid grid-cols-2 gap-4">
        <Panel title={machine.status === "Processing" ? "Yield (so far)" : "Yield"}><div style={{ ...mono, fontSize: 26, fontWeight: 700, color: C.green }}>{yieldPct.toFixed(1)}%</div><div style={{ fontSize: 11, color: C.textFaint, marginTop: 4 }}>(Bin 1 + Bin 2) ÷ input × 100</div></Panel>
        <Panel title={machine.status === "Processing" ? "Fine / debris % (so far)" : "Fine / debris %"}><div style={{ ...mono, fontSize: 26, fontWeight: 700, color: C.red }}>{finePct.toFixed(1)}%</div><div style={{ fontSize: 11, color: C.textFaint, marginTop: 4 }}>Bin 3 ÷ input × 100</div></Panel>
      </div>
    </div>
  );
}
