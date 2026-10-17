import { useEffect, useState } from "react";
import { C, mono } from "../appTokens";
import { Panel } from "./ui";

const CATS = ["large", "medium", "debris"];
const LABELS = { large: "Large", medium: "Medium", debris: "Fine / debris" };
const emptyBins = () => ({ large: { checked: 0, correct: 0 }, medium: { checked: 0, correct: 0 }, debris: { checked: 0, correct: 0 } });

export default function AccuracyPanel({ batches, accuracy, onSave }) {
  const [selectedId, setSelectedId] = useState(batches[0]?.id || "");
  const [draft, setDraft] = useState(emptyBins());
  const [message, setMessage] = useState("");

  useEffect(() => { if (!batches.some((batch) => batch.id === selectedId) && batches[0]) setSelectedId(batches[0].id); }, [batches, selectedId]);
  useEffect(() => { setDraft(accuracy[selectedId] ? structuredClone(accuracy[selectedId]) : emptyBins()); setMessage(""); }, [accuracy, selectedId]);

  function setField(bin, field, value) {
    const next = Math.max(0, Math.floor(Number(value) || 0));
    setDraft((current) => ({ ...current, [bin]: { ...current[bin], [field]: next } }));
  }

  const invalid = CATS.some((category) => draft[category].correct > draft[category].checked);
  const checked = CATS.reduce((sum, category) => sum + draft[category].checked, 0);
  const correct = CATS.reduce((sum, category) => sum + draft[category].correct, 0);
  const inputStyle = { width: 96, textAlign: "right", padding: "6px 10px", borderRadius: 10, outline: "none", border: `1px solid ${C.glassLine}`, background: C.glassStrong, color: C.text, ...mono, fontSize: 13 };

  return <Panel title="Sorting accuracy — sample check by weight" right={<select value={selectedId} onChange={(event) => setSelectedId(event.target.value)} style={{ ...mono, fontSize: 12, padding: "4px 10px", borderRadius: 10, border: `1px solid ${C.glassLine}`, background: C.glassStrong, color: C.text }}>{batches.map((batch) => <option key={batch.id} value={batch.id}>{batch.id} · {batch.beanType}</option>)}</select>}>
    <table className="w-full" style={{ borderCollapse: "collapse" }}><thead><tr style={{ borderBottom: `1px solid ${C.glassLine}` }}>{["BIN", "WEIGHT CHECKED (g)", "CORRECTLY SORTED (g)", "ACCURACY"].map((header) => <th key={header} className="text-right py-2" style={{ fontSize: 11, color: C.textFaint, fontWeight: 500 }}>{header}</th>)}</tr></thead><tbody>{CATS.map((category) => { const bad = draft[category].correct > draft[category].checked; return <tr key={category} style={{ borderBottom: `1px solid ${C.glassLine}` }}><td className="text-left py-2" style={{ fontSize: 13 }}>{LABELS[category]}</td><td className="text-right"><input type="number" min={0} value={draft[category].checked} onChange={(event) => setField(category, "checked", event.target.value)} style={inputStyle} /></td><td className="text-right"><input type="number" min={0} value={draft[category].correct} onChange={(event) => setField(category, "correct", event.target.value)} style={{ ...inputStyle, borderColor: bad ? C.amber : C.glassLine }} /></td><td className="text-right" style={mono}>{draft[category].checked ? `${(draft[category].correct / draft[category].checked * 100).toFixed(1)}%` : "—"}</td></tr>; })}<tr><td className="text-left py-2" style={{ fontWeight: 600 }}>Overall</td><td className="text-right" style={mono}>{checked} g</td><td className="text-right" style={mono}>{correct} g</td><td className="text-right" style={mono}>{checked ? `${(correct / checked * 100).toFixed(1)}%` : "—"}</td></tr></tbody></table>
    <div className="flex items-center gap-3 mt-4 flex-wrap"><button disabled={invalid || checked === 0} onClick={() => onSave(selectedId, draft).then((ok) => setMessage(ok ? "Saved to the database." : "Could not save to the database."))} className="px-4 py-2 rounded-full">SAVE ACCURACY CHECK</button>{invalid && <span style={{ fontSize: 12, color: C.textDim }}>Correctly sorted cannot exceed weight checked.</span>}{message && <span style={{ fontSize: 12, color: C.textDim }}>{message}</span>}</div>
  </Panel>;
}
