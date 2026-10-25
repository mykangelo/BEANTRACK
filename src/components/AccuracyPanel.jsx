import { useEffect, useState } from "react";
import { C, mono } from "../appTokens";
import { Button, Panel } from "./ui";

// Only the two weighed decks have accuracy checks (see accuracy_checks.bin_name).
const BINS = ["large", "medium"];
const LABELS = { large: "Large", medium: "Medium" };
const emptyBin = () => ({ checked: 0, correct: 0 });
const emptyBins = () => ({ large: emptyBin(), medium: emptyBin() });

const inputStyle = {
  width: 92,
  textAlign: "right",
  padding: "6px 10px",
  borderRadius: 10,
  outline: "none",
  border: `1px solid ${C.glassLine}`,
  background: C.glassStrong,
  color: C.text,
  ...mono,
  fontSize: 13,
};

export default function AccuracyPanel({ batches, accuracy, onSave }) {
  const [selectedId, setSelectedId] = useState(batches[0]?.id || "");
  const [draft, setDraft] = useState(emptyBins());
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!batches.some((batch) => batch.id === selectedId) && batches[0]) {
      setSelectedId(batches[0].id);
    }
  }, [batches, selectedId]);

  useEffect(() => {
    const saved = accuracy[selectedId];
    setDraft({
      large: saved?.large ?? emptyBin(),
      medium: saved?.medium ?? emptyBin(),
    });
    setMessage("");
  }, [accuracy, selectedId]);

  if (!batches.length) return null;

  function setField(bin, field, value) {
    const next = Math.max(0, Math.floor(Number(value) || 0));
    setDraft((current) => ({ ...current, [bin]: { ...current[bin], [field]: next } }));
  }

  const invalid = BINS.some((bin) => draft[bin].correct > draft[bin].checked);
  const checked = BINS.reduce((sum, bin) => sum + draft[bin].checked, 0);
  const correct = BINS.reduce((sum, bin) => sum + draft[bin].correct, 0);

  async function save() {
    if (saving || invalid || checked === 0) return;
    setSaving(true);
    const ok = await onSave(selectedId, draft);
    setSaving(false);
    setMessage(ok ? "Saved to the database." : "Could not save to the database.");
  }

  return (
    <Panel
      title="Sorting accuracy — sample check by weight"
      right={
        <select
          value={selectedId}
          onChange={(event) => setSelectedId(event.target.value)}
          style={{ ...mono, fontSize: 12, padding: "4px 10px", borderRadius: 10, border: `1px solid ${C.glassLine}`, background: C.glassStrong, color: C.text }}
        >
          {batches.map((batch) => (
            <option key={batch.id} value={batch.id}>
              {batch.id} · {batch.beanType}
            </option>
          ))}
        </select>
      }
    >
      <div className="overflow-x-auto">
        <table className="w-full" style={{ borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: `1px solid ${C.glassLine}` }}>
              {["BIN", "WEIGHT CHECKED (g)", "CORRECTLY SORTED (g)", "ACCURACY"].map((header) => (
                <th key={header} className="text-right py-2" style={{ fontSize: 11, color: C.textFaint, fontWeight: 500 }}>
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {BINS.map((bin) => {
              const bad = draft[bin].correct > draft[bin].checked;
              return (
                <tr key={bin} style={{ borderBottom: `1px solid ${C.glassLine}` }}>
                  <td className="text-left py-2" style={{ fontSize: 13 }}>{LABELS[bin]}</td>
                  <td className="text-right">
                    <input
                      type="number"
                      min={0}
                      value={draft[bin].checked}
                      onChange={(event) => setField(bin, "checked", event.target.value)}
                      style={inputStyle}
                    />
                  </td>
                  <td className="text-right">
                    <input
                      type="number"
                      min={0}
                      value={draft[bin].correct}
                      onChange={(event) => setField(bin, "correct", event.target.value)}
                      style={{ ...inputStyle, borderColor: bad ? C.amber : C.glassLine }}
                    />
                  </td>
                  <td className="text-right" style={mono}>
                    {draft[bin].checked ? `${((draft[bin].correct / draft[bin].checked) * 100).toFixed(1)}%` : "—"}
                  </td>
                </tr>
              );
            })}
            <tr>
              <td className="text-left py-2" style={{ fontWeight: 600 }}>Overall</td>
              <td className="text-right" style={mono}>{checked} g</td>
              <td className="text-right" style={mono}>{correct} g</td>
              <td className="text-right" style={mono}>{checked ? `${((correct / checked) * 100).toFixed(1)}%` : "—"}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="flex items-center gap-3 mt-4 flex-wrap">
        <Button onClick={save} disabled={saving || invalid || checked === 0}>
          {saving ? "Saving..." : "Save accuracy check"}
        </Button>
        {invalid && <span style={{ fontSize: 12, color: C.textDim }}>Correctly sorted cannot exceed weight checked.</span>}
        {message && <span style={{ fontSize: 12, color: C.textDim }}>{message}</span>}
      </div>
    </Panel>
  );
}
