import { useState } from "react";
import { Package, History, PlusCircle, Scale } from "lucide-react";
import { C, mono, display } from "../appTokens";
import { Panel, IconChip, SectionLabel } from "../components/ui";

const BEANS = ["Arabica", "Robusta"];
const TYPE_LABEL = { receipt: "Received", sort_in: "Sorted (Dashboard)" };

const fmtKg = (g) => `${(Number(g || 0) / 1000).toFixed(2)} kg`;

const inputStyle = {
  background: C.glassStrong,
  border: `1px solid ${C.glassLine}`,
  borderRadius: 10,
  padding: "8px 10px",
  fontSize: 13,
  color: C.text,
  width: "100%",
};

const labelStyle = {
  fontSize: 11,
  color: C.textFaint,
  fontWeight: 600,
  letterSpacing: "0.05em",
  textTransform: "uppercase",
  marginBottom: 4,
  display: "block",
};

// Real type="submit" so the form's onSubmit runs
function SubmitButton({ children, icon: Icon, disabled }) {
  const [hover, setHover] = useState(false);
  return (
    <button
      type="submit"
      disabled={disabled}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      className="flex items-center justify-center gap-2 px-5 py-2.5"
      style={{
        background: disabled ? "rgba(255,251,240,0.35)" : hover ? C.goldGradient : C.glassStrong,
        color: disabled ? C.textFaint : C.text,
        border: `1px solid ${disabled ? C.glassLine : hover ? C.amber : C.glassBorder}`,
        borderRadius: 999,
        cursor: disabled ? "not-allowed" : "pointer",
        boxShadow: "0 4px 14px -6px rgba(90,58,24,0.35)",
        transform: hover && !disabled ? "translateY(-1px)" : "none",
        transition: "transform .15s ease, background .15s ease",
        ...mono,
        fontSize: 12.5,
        fontWeight: 700,
        letterSpacing: "0.02em",
      }}
    >
      {Icon && <Icon size={14} />}
      {children}
    </button>
  );
}

function Stat({ label, value, color }) {
  return (
    <div>
      <div style={{ ...labelStyle, marginBottom: 6 }}>{label}</div>
      <div style={{ ...mono, fontSize: 24, fontWeight: 800, lineHeight: 1.1, color: color || C.text }}>{value}</div>
    </div>
  );
}

// Green bean stock on hand for one bean type
function StockCard({ bean, grams, totals, maxGrams }) {
  const pct = maxGrams > 0 ? Math.max(0, Math.min(100, (grams / maxGrams) * 100)) : 0;
  const color = bean === "Arabica" ? C.arabica : C.robusta;
  return (
    <Panel
      title={
        <span className="flex items-center gap-2">
          <IconChip icon={Package} />
          {bean} green beans
        </span>
      }
    >
      <div className="mb-4">
        <div style={{ ...labelStyle, marginBottom: 6 }}>On hand</div>
        <div style={{ ...mono, fontSize: 40, fontWeight: 800, lineHeight: 1.1 }}>{fmtKg(grams)}</div>
      </div>

      <div className="h-2 rounded-full overflow-hidden mb-5" style={{ background: C.glassLine }}>
        <div
          style={{
            width: `${pct}%`,
            height: "100%",
            background: color,
            borderRadius: 999,
            transition: "width 0.3s ease",
          }}
        />
      </div>

      <div
        className="grid grid-cols-2 gap-4 pt-4"
        style={{ borderTop: `1px solid ${C.glassLine}` }}
      >
        <Stat label="Total received" value={fmtKg(totals.received)} color={C.green} />
        <Stat label="Sent to sorting" value={fmtKg(totals.sorted)} color={C.red} />
      </div>
    </Panel>
  );
}

// Adds green beans received from a supplier
function ReceiptForm({ onSubmit }) {
  const [bean, setBean] = useState("Arabica");
  const [kg, setKg] = useState("");
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    if (busy) return;

    const grams = Math.round(Number(kg) * 1000);
    if (!(grams > 0)) {
      setMsg({ ok: false, text: "Enter a weight above 0 kg." });
      return;
    }

    setBusy(true);
    setMsg(null);
    const res = await onSubmit({ movement_type: "receipt", bean_type: bean, grams, note });
    setBusy(false);

    if (res?.success) {
      setKg("");
      setNote("");
      setMsg({ ok: true, text: "Receipt recorded." });
    } else {
      setMsg({ ok: false, text: res?.error || "Could not save." });
    }
  }

  return (
    <Panel
      title={
        <span className="flex items-center gap-2">
          <IconChip icon={PlusCircle} />
          Record receipt
        </span>
      }
    >
      <form onSubmit={submit} className="flex flex-col gap-3">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <span style={labelStyle}>Bean</span>
            <select style={inputStyle} value={bean} onChange={(e) => setBean(e.target.value)}>
              {BEANS.map((b) => (
                <option key={b}>{b}</option>
              ))}
            </select>
          </div>
          <div>
            <span style={labelStyle}>Weight (kg)</span>
            <input
              style={inputStyle}
              type="number"
              step="0.01"
              min="0"
              value={kg}
              onChange={(e) => setKg(e.target.value)}
              placeholder="e.g. 10"
            />
          </div>
          <div>
            <span style={labelStyle}>Note</span>
            <input
              style={inputStyle}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Supplier, invoice"
            />
          </div>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <SubmitButton icon={Scale} disabled={busy}>
            {busy ? "Saving..." : "Add to stock"}
          </SubmitButton>
          {msg && (
            <span style={{ fontSize: 12.5, color: msg.ok ? C.green : C.red }}>{msg.text}</span>
          )}
        </div>
      </form>
    </Panel>
  );
}

export default function InventoryPage({ inventory, onAddMovement }) {
  const stock = inventory?.stock ?? {};
  const totals = inventory?.totals ?? {};
  const movements = inventory?.movements ?? [];
  const maxGrams = Math.max(1, ...BEANS.map((b) => stock[b] ?? 0));

  return (
    <div className="flex flex-col gap-5 w-full max-w-6xl mx-auto">
      {/* header */}
      <div>
        <div style={{ ...display, fontSize: 32, fontWeight: 700, letterSpacing: "-0.015em", lineHeight: 1.15 }}>
          Inventory
        </div>
        <div style={{ fontSize: 13.5, color: C.textDim, marginTop: 3 }}>
          Green bean stock. Add receipts here; stock goes down automatically when a batch is sorted on the Dashboard.
        </div>
      </div>

      {/* stock on hand */}
      <div>
        <SectionLabel>STOCK ON HAND</SectionLabel>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mt-2">
          {BEANS.map((b) => (
            <StockCard
              key={b}
              bean={b}
              grams={stock[b] ?? 0}
              totals={totals[b] ?? { received: 0, sorted: 0 }}
              maxGrams={maxGrams}
            />
          ))}
        </div>
      </div>

      {/* receipt entry */}
      <div>
        <SectionLabel>RECORD RECEIPT</SectionLabel>
        <div className="mt-2">
          <ReceiptForm onSubmit={onAddMovement} />
        </div>
      </div>

      {/* movement log */}
      <Panel
        title={
          <span className="flex items-center gap-2">
            <IconChip icon={History} />
            Stock movements
          </span>
        }
      >
        {movements.length === 0 ? (
          <div style={{ fontSize: 13, color: C.textFaint }}>No movements yet. Record a receipt to start.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full" style={{ borderCollapse: "collapse", fontSize: 12.5 }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${C.glassLine}`, color: C.textFaint, fontSize: 11 }}>
                  {["Date", "Type", "Bean", "Change", "Batch", "Note"].map((h, i) => (
                    <th key={h} className={`py-2 ${i === 3 ? "text-right" : "text-left"}`} style={{ fontWeight: 500 }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {movements.slice(0, 50).map((m, i) => (
                  <tr key={`${m.movement_date}-${i}`} style={{ borderBottom: `1px solid ${C.glassLine}` }}>
                    <td className="py-2" style={mono}>{String(m.movement_date).slice(0, 16)}</td>
                    <td className="py-2">{TYPE_LABEL[m.movement_type] || m.movement_type}</td>
                    <td className="py-2">{m.bean_type}</td>
                    <td
                      className="py-2 text-right"
                      style={{ ...mono, fontWeight: 700, color: m.grams >= 0 ? C.green : C.red }}
                    >
                      {m.grams >= 0 ? "+" : ""}{Math.round(m.grams)} g
                    </td>
                    <td className="py-2" style={mono}>{m.batch_code || "—"}</td>
                    <td className="py-2" style={{ color: C.textDim }}>{m.note || ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}