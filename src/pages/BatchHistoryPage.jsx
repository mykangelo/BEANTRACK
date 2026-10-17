import { C, mono } from "../appTokens";
import { Panel } from "../components/ui";

const CATS = ["large", "medium", "debris"];
const CAT_LABEL = { large: "Large", medium: "Medium", debris: "Fine / debris" };
const BIN_INFO = { large: "Bin 1 · >5 mm", medium: "Bin 2 · 4–5 mm", debris: "Bin 3 · <4 mm" };

function metrics(batch) {
  const sorted = batch.weights.large + batch.weights.medium;
  return { yieldPct: (sorted / batch.inputWeight) * 100, finePct: (batch.weights.debris / batch.inputWeight) * 100 };
}
function fmtTime(seconds) { return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`; }
function BeanTag({ bean }) { const color = bean === "Arabica" ? C.arabica : C.robusta; return <span style={{ border: `1px solid ${color}66`, color, borderRadius: 999, ...mono, fontSize: 11, padding: "2px 8px" }}>{bean}</span>; }
function PageHeader() { return <div><div style={{ fontFamily: "'Fraunces', Georgia, serif", fontSize: 32, fontWeight: 700 }}>Batch history</div><div style={{ fontSize: 13.5, color: C.textDim, marginTop: 3 }}>Every saved batch. Click a row to see its details.</div></div>; }

export default function BatchHistoryPage({ batches, sel, setSel }) {
  const selected = batches.find((batch) => batch.id === sel) || null;
  return <div className="flex flex-col gap-5 max-w-5xl">
    <PageHeader />
    <Panel title="All batches">
      <div className="overflow-x-auto"><table className="w-full" style={{ borderCollapse: "collapse" }}><thead><tr style={{ borderBottom: `1px solid ${C.line}` }}>{["BATCH", "DATE", "TYPE", "INPUT (g)", "YIELD", "FINE/DEBRIS", "TIME"].map((header) => <th key={header} className="text-left py-2 pr-4" style={{ fontSize: 11, color: C.textFaint, fontWeight: 500 }}>{header}</th>)}</tr></thead><tbody>{batches.map((batch) => { const metric = metrics(batch); const active = sel === batch.id; return <tr key={batch.id} className="bt-row" onClick={() => setSel(active ? null : batch.id)} style={{ borderBottom: `1px solid ${C.line}`, cursor: "pointer", background: active ? "rgba(255,255,255,0.7)" : undefined }}><td className="py-2.5 pr-4" style={{ ...mono, fontSize: 13 }}>{batch.id}</td><td className="py-2.5 pr-4" style={{ fontSize: 12.5, color: C.textDim }}>{batch.date}</td><td className="py-2.5 pr-4"><BeanTag bean={batch.beanType} /></td><td className="py-2.5 pr-4" style={{ ...mono, fontSize: 13 }}>{batch.inputWeight} g</td><td className="py-2.5 pr-4" style={{ ...mono, color: C.green }}>{metric.yieldPct.toFixed(1)}%</td><td className="py-2.5 pr-4" style={{ ...mono, color: C.red }}>{metric.finePct.toFixed(1)}%</td><td className="py-2.5 pr-4" style={mono}>{fmtTime(batch.processingTime)}</td></tr>; })}</tbody></table></div>
    </Panel>
    {selected && <Panel title={`Batch detail — ${selected.id}`} right={<button onClick={() => setSel(null)} style={{ color: C.textFaint }}>close</button>}><table className="w-full"><tbody>{CATS.map((category) => <tr key={category} style={{ borderBottom: `1px solid ${C.glassLine}` }}><td className="py-2">{CAT_LABEL[category]} <span style={{ ...mono, fontSize: 10.5, color: C.textFaint }}>{BIN_INFO[category]}</span></td><td className="py-2 text-right" style={{ ...mono, color: C.text }}>{selected.weights[category]} g</td></tr>)}</tbody></table></Panel>}
  </div>;
}
