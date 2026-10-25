import { useState } from "react";
import {
  Package,
  PlusCircle,
  Scale,
  Download,
  FileText,
  ArrowDownLeft,
  ArrowUpRight,
  Filter,
  X,
  Layers,
  SlidersHorizontal,
  RotateCcw,
  AlertTriangle,
} from "lucide-react";
import { C, mono, display } from "../appTokens";
import { getJson } from "../appUtils";
import { Panel, IconChip, SectionLabel } from "../components/ui";

const BEANS = ["Arabica", "Robusta"];

const fmtKg = (g) => `${(Number(g || 0) / 1000).toFixed(2)} kg`;
const fmtSignedKg = (g) => {
  const n = Number(g || 0);
  return `${n > 0 ? "+" : ""}${(n / 1000).toFixed(2)} kg`;
};
const signedG = (g) => {
  const n = Math.round(Number(g || 0));
  return `${n > 0 ? "+" : ""}${n} g`;
};

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

const hintStyle = {
  fontSize: 11.5,
  color: C.textFaint,
  lineHeight: 1.5,
};

const cleanDateString = (dateStr) => String(dateStr ?? "").replace(/[^\x20-\x7E]/g, "").trim();

const ACTION_LABEL = {
  subtract: "Subtract",
  add: "Add",
  set: "Set overall to",
};

const SUBPAGES = [
  { id: "overview", label: "Overview" },
  { id: "receipts", label: "Receipts" },
  { id: "batches", label: "Stock batches" },
  { id: "adjustments", label: "Adjustments" },
  { id: "activity", label: "Activity & exports" },
];

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

function Stat({ label, value, color, size = 24 }) {
  return (
    <div>
      <div style={{ ...labelStyle, marginBottom: 6 }}>{label}</div>
      <div style={{ ...mono, fontSize: size, fontWeight: 800, lineHeight: 1.1, color: color || C.text }}>
        {value}
      </div>
    </div>
  );
}

function StockCard({ bean, grams, totals, maxGrams }) {
  const pct = maxGrams > 0 ? Math.max(0, Math.min(100, (grams / maxGrams) * 100)) : 0;
  const color = bean === "Arabica" ? C.arabica : C.robusta;
  const adjusted = Number(totals.adjusted || 0);
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

      <div className="grid grid-cols-3 gap-3 pt-4" style={{ borderTop: `1px solid ${C.glassLine}` }}>
        <Stat label="Received" value={fmtKg(totals.received)} color={C.green} size={19} />
        <Stat label="Sorted" value={fmtKg(totals.sorted)} color={C.red} size={19} />
        <Stat
          label="Adjusted"
          value={fmtSignedKg(adjusted)}
          color={adjusted < 0 ? C.red : C.green}
          size={19}
        />
      </div>
    </Panel>
  );
}

function DateFilter({ value, onChange }) {
  return (
    <div className="flex justify-end mb-3">
      <div className="relative flex items-center" style={{ gap: 6 }}>
        <Filter size={14} style={{ color: C.textFaint }} />
        <input
          type="date"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          style={{
            ...inputStyle,
            width: "auto",
            fontSize: 12,
            padding: "4px 8px",
            borderRadius: 8,
            color: value ? C.text : C.textFaint,
          }}
        />
        {value && (
          <button
            onClick={() => onChange("")}
            title="Clear date filter"
            style={{
              background: C.glassStrong,
              border: `1px solid ${C.glassLine}`,
              borderRadius: 8,
              padding: "5px",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              color: C.textDim,
            }}
          >
            <X size={14} />
          </button>
        )}
      </div>
    </div>
  );
}

function ReceiptForm({ onSubmit, activeLabel }) {
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
      setMsg({ ok: true, text: `Receipt recorded in ${res.stock_batch_label || activeLabel}.` });
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
      right={
        <span style={{ ...mono, fontSize: 11, color: C.textFaint }}>
          → {activeLabel || "no active layer"}
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

function CreateStockBatchForm({ onCreate }) {
  const [label, setLabel] = useState("");
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setMsg(null);
    const res = await onCreate({ label: label.trim(), note: note.trim() });
    setBusy(false);
    if (res?.success) {
      setLabel("");
      setNote("");
      setMsg({ ok: true, text: `Created ${res.stock_batch?.label}. New receipts now go here.` });
    } else {
      setMsg({ ok: false, text: res?.error || "Could not create the stock batch." });
    }
  }

  return (
    <Panel
      title={
        <span className="flex items-center gap-2">
          <IconChip icon={Layers} />
          Create new stock batch
        </span>
      }
    >
      <form onSubmit={submit} className="flex flex-col gap-3">
        <p style={hintStyle}>
          Starts a new dated FIFO layer at 0 kg. Older layers keep their stock and are still consumed first.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <span style={labelStyle}>Label (optional)</span>
            <input
              style={inputStyle}
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Auto: SB-YYYYMMDD-01"
              maxLength={40}
            />
          </div>
          <div>
            <span style={labelStyle}>Note</span>
            <input
              style={inputStyle}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Delivery, warehouse"
              maxLength={255}
            />
          </div>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <SubmitButton icon={PlusCircle} disabled={busy}>
            {busy ? "Creating..." : "Create new stock batch"}
          </SubmitButton>
          {msg && (
            <span style={{ fontSize: 12.5, color: msg.ok ? C.green : C.red }}>{msg.text}</span>
          )}
        </div>
      </form>
    </Panel>
  );
}

function AdjustStockForm({ layers, onAdjust }) {
  const [bean, setBean] = useState("Arabica");
  const [action, setAction] = useState("subtract");
  const [kg, setKg] = useState("");
  const [target, setTarget] = useState("");
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    if (busy) return;

    if (kg.trim() === "") {
      setMsg({ ok: false, text: "Enter a weight in kg." });
      return;
    }
    const grams = Math.round(Number(kg) * 1000);
    if (!Number.isFinite(grams) || grams < 0 || (action !== "set" && grams <= 0)) {
      setMsg({ ok: false, text: "Enter a valid weight." });
      return;
    }
    if (note.trim().length < 3) {
      setMsg({ ok: false, text: "Enter a reason (at least 3 characters)." });
      return;
    }

    const payload = { bean_type: bean, action, grams, note: note.trim() };
    if (action !== "set" && target !== "") payload.stock_batch_id = Number(target);

    setBusy(true);
    setMsg(null);
    const res = await onAdjust(payload);
    setBusy(false);

    if (!res?.success) {
      setMsg({ ok: false, text: res?.error || "Could not adjust stock." });
      return;
    }
    if (res.changed === false) {
      setMsg({ ok: true, text: res.message || "Stock is already at that level." });
      return;
    }

    const layerText = (res.allocations || [])
      .map((a) => `${a.label}: ${fmtKg(a.grams)}`)
      .join(", ");
    setMsg({
      ok: true,
      text: `${ACTION_LABEL[action]} ${fmtKg(Math.abs(res.change_grams))} ${res.bean_type}. ${
        layerText ? `Layers: ${layerText}. ` : ""
      }Ref ${res.reference}.`,
    });
    setKg("");
    setNote("");
  }

  return (
    <Panel
      title={
        <span className="flex items-center gap-2">
          <IconChip icon={SlidersHorizontal} />
          Adjust stock
        </span>
      }
    >
      <form onSubmit={submit} className="flex flex-col gap-3">
        <p style={hintStyle}>
          Manual correction or deduction. Every change is audited in the adjustments table; history is never deleted.
        </p>
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
            <span style={labelStyle}>Operation</span>
            <select style={inputStyle} value={action} onChange={(e) => setAction(e.target.value)}>
              <option value="subtract">Subtract</option>
              <option value="add">Add</option>
              <option value="set">Set overall to</option>
            </select>
          </div>
          <div>
            <span style={labelStyle}>{action === "set" ? "New total (kg)" : "Weight (kg)"}</span>
            <input
              style={inputStyle}
              type="number"
              step="0.01"
              min="0"
              value={kg}
              onChange={(e) => setKg(e.target.value)}
              placeholder={action === "set" ? "e.g. 48.5" : "e.g. 5"}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <span style={labelStyle}>Apply to</span>
            <select
              style={{ ...inputStyle, opacity: action === "set" ? 0.65 : 1 }}
              value={action === "set" ? "" : target}
              onChange={(e) => setTarget(e.target.value)}
              disabled={action === "set"}
            >
              <option value="">Overall (FIFO, oldest first)</option>
              {layers.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.label} — {fmtKg(l.balance)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <span style={labelStyle}>Reason (required)</span>
            <input
              style={inputStyle}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Stocktake, spillage, correction"
              maxLength={255}
            />
          </div>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <SubmitButton icon={SlidersHorizontal} disabled={busy}>
            {busy ? "Applying..." : "Apply adjustment"}
          </SubmitButton>
          {msg && (
            <span style={{ fontSize: 12.5, color: msg.ok ? C.green : C.red }}>{msg.text}</span>
          )}
        </div>
      </form>
    </Panel>
  );
}

function InventorySubnav({ active, onChange }) {
  return (
    <nav
      className="flex flex-col gap-0.5 md:sticky md:top-4"
      style={{ borderLeft: `1px solid ${C.glassLine}` }}
    >
      {SUBPAGES.map((page) => {
        const isActive = active === page.id;
        return (
          <button
            key={page.id}
            type="button"
            onClick={() => onChange(page.id)}
            style={{
              position: "relative",
              background: "transparent",
              border: "none",
              padding: "8px 0 8px 16px",
              textAlign: "left",
              cursor: "pointer",
              color: isActive ? C.text : C.textFaint,
              ...mono,
              fontSize: 12.5,
              fontWeight: isActive ? 700 : 500,
              letterSpacing: "0.01em",
              transition: "color .15s ease",
            }}
          >
            {isActive && (
              <span
                style={{
                  position: "absolute",
                  left: -1,
                  top: 6,
                  bottom: 6,
                  width: 2,
                  background: C.amber,
                  borderRadius: 2,
                }}
              />
            )}
            {page.label}
          </button>
        );
      })}
    </nav>
  );
}

function EmergencyResetPanel({ onOpen }) {
  return (
    <Panel
      title={
        <span className="flex items-center gap-2">
          <IconChip icon={RotateCcw} />
          Emergency reset
        </span>
      }
    >
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <p style={{ ...hintStyle, maxWidth: 520 }}>
          Sets overall stock to zero with audited adjustments and starts a new active stock batch.
          Receipts, sorting batches, accuracy checks and history are kept.
        </p>
        <button
          type="button"
          onClick={onOpen}
          className="flex items-center gap-1.5 px-4 py-2 rounded-md text-xs font-semibold"
          style={{
            background: "rgba(255,251,240,0.45)",
            border: `1px solid ${C.glassLine}`,
            color: C.textDim,
            cursor: "pointer",
          }}
        >
          <RotateCcw size={13} /> Reset stock to zero
        </button>
      </div>
    </Panel>
  );
}

function StockBatchTable({ layers }) {
  return (
    <Panel
      title={
        <span className="flex items-center gap-2">
          <IconChip icon={Layers} />
          Stock batches (FIFO layers)
        </span>
      }
      right={
        <span style={{ ...mono, fontSize: 11, color: C.textFaint }}>
          {layers.length} layer{layers.length === 1 ? "" : "s"}
        </span>
      }
    >
      <div className="overflow-x-auto">
        <table className="w-full" style={{ borderCollapse: "collapse", fontSize: 12.5 }}>
          <thead>
            <tr style={{ borderBottom: `1px solid ${C.glassLine}`, color: C.textFaint, fontSize: 11 }}>
              <th className="py-2 text-left whitespace-nowrap" style={{ fontWeight: 500 }}>Stock batch</th>
              <th className="py-2 text-left whitespace-nowrap" style={{ fontWeight: 500 }}>Started</th>
              <th className="py-2 text-right whitespace-nowrap" style={{ fontWeight: 500 }}>Received</th>
              <th className="py-2 text-right whitespace-nowrap" style={{ fontWeight: 500 }}>Sorted</th>
              <th className="py-2 text-right whitespace-nowrap" style={{ fontWeight: 500 }}>Adjusted</th>
              <th className="py-2 text-right whitespace-nowrap" style={{ fontWeight: 500 }}>Balance</th>
              <th className="py-2 text-left whitespace-nowrap pl-3" style={{ fontWeight: 500 }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {layers.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-6 text-center" style={{ color: C.textFaint }}>
                  No stock batches yet.
                </td>
              </tr>
            ) : (
              layers.map((l) => (
                <tr key={l.id} style={{ borderBottom: `1px solid ${C.glassLine}` }}>
                  <td className="py-2.5 pr-3">
                    <div style={{ fontWeight: 700 }}>{l.label}</div>
                    {l.note && (
                      <div style={{ ...hintStyle, marginTop: 2, maxWidth: 240 }}>{l.note}</div>
                    )}
                  </td>
                  <td className="py-2.5 whitespace-nowrap" style={mono}>
                    {cleanDateString(l.started_at).slice(0, 10)}
                  </td>
                  <td className="py-2.5 text-right whitespace-nowrap" style={mono}>{fmtKg(l.received)}</td>
                  <td className="py-2.5 text-right whitespace-nowrap" style={mono}>{fmtKg(l.sorted)}</td>
                  <td
                    className="py-2.5 text-right whitespace-nowrap"
                    style={{ ...mono, color: Number(l.adjusted) < 0 ? C.red : C.green }}
                  >
                    {fmtSignedKg(l.adjusted)}
                  </td>
                  <td className="py-2.5 text-right whitespace-nowrap" style={{ ...mono, fontWeight: 800 }}>
                    <div>{fmtKg(l.balance)}</div>
                    <div style={{ fontSize: 10.5, fontWeight: 500, color: C.textFaint }}>
                      {BEANS.filter((b) => l.beans?.[b])
                        .map((b) => `${b.slice(0, 1)} ${fmtKg(l.beans[b].balance)}`)
                        .join(" · ") || "empty"}
                    </div>
                  </td>
                  <td className="py-2.5 pl-3 whitespace-nowrap">
                    {l.is_active ? (
                      <span
                        style={{
                          ...mono,
                          fontSize: 10.5,
                          fontWeight: 700,
                          padding: "3px 8px",
                          borderRadius: 999,
                          background: "rgba(201,154,46,0.18)",
                          border: `1px solid ${C.glassLine}`,
                        }}
                      >
                        ACTIVE
                      </span>
                    ) : (
                      <span style={{ fontSize: 11, color: C.textFaint }}>closed to receipts</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <p style={{ ...hintStyle, marginTop: 12 }}>
        Overall stock is the sum of every layer. New receipts use the active layer; sorting and deductions consume the oldest
        positive layer first.
      </p>
    </Panel>
  );
}

function AdjustmentsTable({ adjustments }) {
  const [selectedDate, setSelectedDate] = useState("");

  const filtered = adjustments.filter((a) => {
    if (!selectedDate) return true;
    return cleanDateString(a.date).slice(0, 10) === selectedDate;
  });

  return (
    <Panel
      title={
        <span className="flex items-center gap-2">
          <IconChip icon={SlidersHorizontal} />
          Stock adjustments
        </span>
      }
      right={
        <span style={{ ...mono, fontSize: 11, color: C.textFaint }}>
          {filtered.length} record{filtered.length === 1 ? "" : "s"}
        </span>
      }
    >
      <DateFilter value={selectedDate} onChange={setSelectedDate} />

      {filtered.length === 0 ? (
        <div style={{ fontSize: 13, color: C.textFaint, padding: "20px 0", textAlign: "center" }}>
          {selectedDate ? "No adjustments on this exact date." : "No manual adjustments yet."}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full" style={{ borderCollapse: "collapse", fontSize: 12.5 }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${C.glassLine}`, color: C.textFaint, fontSize: 11 }}>
                <th className="py-2 text-left whitespace-nowrap" style={{ fontWeight: 500 }}>Date</th>
                <th className="py-2 text-left whitespace-nowrap" style={{ fontWeight: 500 }}>Bean</th>
                <th className="py-2 text-right whitespace-nowrap" style={{ fontWeight: 500 }}>Change</th>
                <th className="py-2 text-left" style={{ fontWeight: 500 }}>Reason</th>
                <th className="py-2 text-left whitespace-nowrap pl-3" style={{ fontWeight: 500 }}>Stock batch</th>
                <th className="py-2 text-left whitespace-nowrap pl-3" style={{ fontWeight: 500 }}>Reference</th>
              </tr>
            </thead>
            <tbody>
              {filtered.slice(0, 20).map((a) => {
                const positive = Number(a.grams) >= 0;
                return (
                  <tr key={a.key} style={{ borderBottom: `1px solid ${C.glassLine}` }}>
                    <td className="py-2 whitespace-nowrap" style={mono}>{cleanDateString(a.date).slice(0, 16)}</td>
                    <td className="py-2">{a.bean}</td>
                    <td
                      className="py-2 text-right whitespace-nowrap"
                      style={{ ...mono, fontWeight: 700, color: positive ? C.green : C.red }}
                    >
                      {fmtSignedKg(a.grams)}
                    </td>
                    <td className="py-2" style={{ color: C.textDim, maxWidth: 220 }}>{a.note}</td>
                    <td className="py-2 pl-3" style={{ maxWidth: 240 }}>
                      <span title={a.layers.join(", ")} style={{ color: C.textDim }}>
                        {a.layers.join(", ") || "—"}
                      </span>
                      {a.count > 1 && (
                        <span style={{ ...hintStyle, display: "block" }}>{a.count} layer allocations</span>
                      )}
                    </td>
                    <td className="py-2 pl-3 whitespace-nowrap" style={{ ...mono, fontSize: 11, color: C.textFaint }}>
                      {a.reference || "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {filtered.length > 20 && (
            <div style={{ fontSize: 11, color: C.textFaint, textAlign: "center", marginTop: 10 }}>
              Showing latest 20 of {filtered.length} adjustments. Exports include all records.
            </div>
          )}
        </div>
      )}
    </Panel>
  );
}

// Reusable table with exact date filter
function MovementTable({ title, icon, data, isIncoming }) {
  const [selectedDate, setSelectedDate] = useState("");

  const headerColor = isIncoming ? C.green : C.red;
  const amountColor = isIncoming ? C.green : C.red;

  const filteredData = data.filter((m) => {
    if (!selectedDate) return true;
    return cleanDateString(m.movement_date).slice(0, 10) === selectedDate;
  });

  return (
    <Panel
      title={
        <span className="flex items-center gap-2" style={{ color: headerColor }}>
          <IconChip icon={icon} />
          {title}
        </span>
      }
    >
      <DateFilter value={selectedDate} onChange={setSelectedDate} />

      {filteredData.length === 0 ? (
        <div style={{ fontSize: 13, color: C.textFaint, padding: "20px 0", textAlign: "center" }}>
          {selectedDate ? "No records found for this exact date." : "No records found."}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full" style={{ borderCollapse: "collapse", fontSize: 12.5 }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${C.glassLine}`, color: C.textFaint, fontSize: 11 }}>
                <th className="py-2 text-left whitespace-nowrap" style={{ fontWeight: 500 }}>Date</th>
                <th className="py-2 text-left whitespace-nowrap" style={{ fontWeight: 500 }}>Bean</th>
                <th className="py-2 text-right whitespace-nowrap" style={{ fontWeight: 500 }}>Amount</th>
                <th className="py-2 text-left whitespace-nowrap pl-3" style={{ fontWeight: 500 }}>Batch</th>
                <th className="py-2 text-left pl-3" style={{ fontWeight: 500 }}>Stock batch</th>
                <th className="py-2 text-left" style={{ fontWeight: 500 }}>Note</th>
              </tr>
            </thead>
            <tbody>
              {/* Top 15 for the screen; exports pull the full history */}
              {filteredData.slice(0, 15).map((m, i) => {
                const layerText = m.layers?.length ? m.layers.join(", ") : m.stock_batch_label || "—";
                return (
                  <tr key={`${m.movement_date}-${m.batch_code || ""}-${i}`} style={{ borderBottom: `1px solid ${C.glassLine}` }}>
                    <td className="py-2 whitespace-nowrap" style={mono}>{cleanDateString(m.movement_date).slice(0, 16)}</td>
                    <td className="py-2">{m.bean_type}</td>
                    <td
                      className="py-2 text-right whitespace-nowrap"
                      style={{ ...mono, fontWeight: 700, color: amountColor }}
                    >
                      {m.grams >= 0 ? "+" : ""}{Math.round(m.grams)} g
                    </td>
                    <td className="py-2 pl-3" style={mono}>{m.batch_code || "—"}</td>
                    <td className="py-2 pl-3" style={{ color: C.textDim, maxWidth: 180 }}>
                      <span title={layerText}>{layerText}</span>
                    </td>
                    <td className="py-2" style={{ color: C.textDim, maxWidth: 150, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {m.note || ""}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {filteredData.length > 15 && (
            <div style={{ fontSize: 11, color: C.textFaint, textAlign: "center", marginTop: 10 }}>
              Showing latest 15 of {filteredData.length} filtered records.
            </div>
          )}
        </div>
      )}
    </Panel>
  );
}

function ResetModal({ open, stock, onClose, onReset }) {
  const [confirmText, setConfirmText] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  if (!open) return null;

  async function submit(e) {
    e.preventDefault();
    if (busy) return;
    if (confirmText !== "RESET") {
      setError("Type RESET exactly to confirm.");
      return;
    }
    if (reason.trim().length < 3) {
      setError("Enter a reason (at least 3 characters).");
      return;
    }
    setBusy(true);
    setError(null);
    const res = await onReset({ confirm: "RESET", reason: reason.trim(), start_new_batch: true });
    setBusy(false);
    if (!res?.success) {
      setError(res?.error || "Could not reset stock.");
      return;
    }
    setConfirmText("");
    setReason("");
    onClose(true);
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
        background: "rgba(36,26,16,0.45)",
        backdropFilter: "blur(4px)",
      }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onClose(false);
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 480,
          background: C.panel,
          border: `1px solid ${C.glassBorder}`,
          borderRadius: 22,
          boxShadow: C.glassShadow,
          padding: 22,
        }}
      >
        <div className="flex items-center justify-between mb-3">
          <span className="flex items-center gap-2" style={{ ...display, fontSize: 22, fontWeight: 700 }}>
            <AlertTriangle size={20} style={{ color: C.red }} />
            Emergency reset
          </span>
          <button
            onClick={() => !busy && onClose(false)}
            style={{ background: "transparent", border: "none", cursor: "pointer", color: C.textDim }}
            title="Close"
          >
            <X size={18} />
          </button>
        </div>

        <p style={{ fontSize: 13, color: C.textDim, lineHeight: 1.55 }}>
          This sets overall stock to zero by writing audited adjustments. Receipts, sorting batches, accuracy checks and
          history are <strong>not</strong> deleted. A new active stock batch is started afterward.
        </p>

        <div
          className="my-4"
          style={{
            background: C.glassStrong,
            border: `1px solid ${C.glassLine}`,
            borderRadius: 12,
            padding: "10px 12px",
          }}
        >
          {BEANS.map((b) => (
            <div key={b} className="flex items-center justify-between" style={{ fontSize: 13 }}>
              <span>{b}</span>
              <span style={{ ...mono, fontWeight: 700, color: C.red }}>−{fmtKg(stock[b] ?? 0)}</span>
            </div>
          ))}
        </div>

        <form onSubmit={submit} className="flex flex-col gap-3">
          <div>
            <span style={labelStyle}>Reason (required)</span>
            <input
              style={inputStyle}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Fresh start, stocktake correction"
              maxLength={200}
            />
          </div>
          <div>
            <span style={labelStyle}>Type RESET to confirm</span>
            <input
              style={inputStyle}
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="RESET"
              autoComplete="off"
            />
          </div>

          {error && <div style={{ fontSize: 12.5, color: C.red }}>{error}</div>}

          <div className="flex items-center justify-end gap-2 mt-1">
            <button
              type="button"
              onClick={() => !busy && onClose(false)}
              disabled={busy}
              style={{
                ...mono,
                fontSize: 12.5,
                fontWeight: 700,
                padding: "9px 16px",
                borderRadius: 999,
                background: "transparent",
                border: `1px solid ${C.glassLine}`,
                color: C.textDim,
                cursor: busy ? "not-allowed" : "pointer",
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy || confirmText !== "RESET" || reason.trim().length < 3}
              style={{
                ...mono,
                fontSize: 12.5,
                fontWeight: 700,
                padding: "9px 16px",
                borderRadius: 999,
                background: busy ? "rgba(255,251,240,0.35)" : C.brownGradient,
                border: `1px solid ${C.glassLine}`,
                color: C.sidebarText,
                cursor: busy ? "not-allowed" : "pointer",
                opacity: busy || confirmText !== "RESET" || reason.trim().length < 3 ? 0.55 : 1,
              }}
            >
              {busy ? "Resetting..." : "Reset stock to zero"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function groupAdjustments(rows) {
  const groups = new Map();
  for (const row of rows || []) {
    const key = `${row.reference_code || `single-${row.id}`}|${row.bean_type}`;
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        date: row.movement_date,
        bean: row.bean_type,
        grams: 0,
        note: row.note || "",
        reference: row.reference_code,
        layers: [],
        count: 0,
      });
    }
    const g = groups.get(key);
    g.grams += Number(row.grams) || 0;
    if (row.stock_batch_label && !g.layers.includes(row.stock_batch_label)) {
      g.layers.push(row.stock_batch_label);
    }
    g.count += 1;
  }
  return [...groups.values()].sort((a, b) => {
    const byDate = String(b.date).localeCompare(String(a.date));
    return byDate !== 0 ? byDate : String(b.reference || "").localeCompare(String(a.reference || ""));
  });
}

function groupSortings(rows) {
  const groups = new Map();
  for (const row of rows || []) {
    const key = row.batch_code || `single-${row.id ?? row.movement_date}-${row.stock_batch_id}`;
    if (!groups.has(key)) {
      groups.set(key, { ...row, grams: 0, layers: [] });
    }
    const g = groups.get(key);
    g.grams += Number(row.grams) || 0;
    if (row.stock_batch_label && !g.layers.includes(row.stock_batch_label)) {
      g.layers.push(row.stock_batch_label);
    }
  }
  return [...groups.values()].sort((a, b) =>
    String(b.movement_date).localeCompare(String(a.movement_date))
  );
}

function styledSheet(XLSX, wsData, { merges = [], sectionRows = new Set(), headerRows = new Set(), cols, signedCol = 2 }) {
  const ws = XLSX.utils.aoa_to_sheet(wsData);
  if (cols) ws["!cols"] = cols;
  if (merges.length) ws["!merges"] = merges;

  const borderStyle = {
    top: { style: "thin", color: { rgb: "000000" } },
    bottom: { style: "thin", color: { rgb: "000000" } },
    left: { style: "thin", color: { rgb: "000000" } },
    right: { style: "thin", color: { rgb: "000000" } },
  };

  const range = XLSX.utils.decode_range(ws["!ref"]);
  for (let R = range.s.r; R <= range.e.r; ++R) {
    for (let C = range.s.c; C <= range.e.c; ++C) {
      const cell = ws[XLSX.utils.encode_cell({ r: R, c: C })];
      if (!cell) continue;
      cell.s = { alignment: { wrapText: true, vertical: "center" }, border: borderStyle };

      if (sectionRows.has(R)) {
        cell.s.font = { bold: true, size: 12, color: { rgb: "FFFFFF" } };
        cell.s.fill = { fgColor: { rgb: "5A3A18" } };
        cell.s.alignment.horizontal = "center";
      } else if (headerRows.has(R)) {
        cell.s.font = { bold: true };
        cell.s.fill = { fgColor: { rgb: "E0D5C1" } };
        cell.s.alignment.horizontal = "center";
      } else if (C === signedCol && typeof cell.v === "string" && /^[+-]/.test(cell.v)) {
        cell.s.font = { color: { rgb: cell.v.startsWith("+") ? "008000" : "FF0000" }, bold: true };
        cell.s.alignment.horizontal = "right";
      }
    }
  }
  return ws;
}

export default function InventoryPage({
  inventory,
  onAddMovement,
  onCreateStockBatch,
  onAdjustStock,
  onResetStock,
}) {
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState(null);
  const [resetOpen, setResetOpen] = useState(false);
  const [resetNotice, setResetNotice] = useState(null);
  const [tab, setTab] = useState("overview");

  const stock = inventory?.stock ?? {};
  const totals = inventory?.totals ?? {};
  const movements = inventory?.movements ?? [];
  const stockBatches = inventory?.stock_batches ?? [];
  const adjustments = inventory?.adjustments ?? [];
  const activeId = inventory?.active_stock_batch_id ?? null;
  const activeLabel = stockBatches.find((b) => b.id === activeId)?.label ?? "";
  const maxGrams = Math.max(1, ...BEANS.map((b) => stock[b] ?? 0));

  // Split the data for the UI
  const receipts = movements.filter((m) => m.movement_type === "receipt");
  const sortings = groupSortings(movements.filter((m) => m.movement_type === "sort_in"));
  const adjustmentGroups = groupAdjustments(adjustments);

  const getTimestamp = () => new Date().toLocaleString();

  // --- EXPORT FUNCTIONS ---
  // The on-screen log is capped by the API. Exports pull the full movement
  // history so the report and the stock summary agree.
  async function fetchAllMovements() {
    const rows = await getJson("get_movements.php");
    if (!Array.isArray(rows)) throw new Error("The server returned an unexpected response.");
    return rows;
  }

  async function handleExportExcel() {
    if (exporting) return;
    setExporting(true);
    setExportError(null);
    try {
      const all = await fetchAllMovements();
      const allReceipts = all.filter((m) => m.movement_type === "receipt");
      const allSortings = all.filter((m) => m.movement_type === "sort_in");
      const adjGroups = groupAdjustments(all.filter((m) => m.movement_type === "adjustment"));
      const XLSXmod = await import("xlsx-js-style");
      const XLSX = XLSXmod.utils ? XLSXmod : XLSXmod.default;
      const wb = XLSX.utils.book_new();

      // Sheet 1: stock summary + movement logs
      {
        const wsData = [];
        const merges = [];
        const sectionRows = new Set();
        const headerRows = new Set();
        const blank = () => wsData.push([]);
        const title = (text) => {
          wsData.push([text]);
          const r = wsData.length - 1;
          sectionRows.add(r);
          merges.push({ s: { r, c: 0 }, e: { r, c: 5 } });
        };
        const section = (text) => title(text);
        const header = (cells) => {
          wsData.push(cells);
          headerRows.add(wsData.length - 1);
        };

        title("Beanhi - Inventory Report");
        title(`Generated on: ${getTimestamp()}`);
        blank();
        section("STOCK SUMMARY");
        header(["Bean Type", "Total In (kg)", "Total Out (kg)", "Adjustments (kg)", "Final Stock (kg)", ""]);
        BEANS.forEach((b) => {
          wsData.push([
            b,
            (Number(totals[b]?.received || 0) / 1000).toFixed(2),
            (Number(totals[b]?.sorted || 0) / 1000).toFixed(2),
            (Number(totals[b]?.adjusted || 0) / 1000).toFixed(2),
            (Number(stock[b] || 0) / 1000).toFixed(2),
            "",
          ]);
        });
        blank();
        section("RECEIVED GREEN BEANS (IN)");
        header(["Date", "Bean", "Amount", "Batch", "Stock Batch", "Note"]);
        allReceipts.forEach((m) => {
          wsData.push([
            cleanDateString(m.movement_date),
            m.bean_type,
            `+${Math.round(m.grams)} g`,
            m.batch_code || "—",
            m.stock_batch_label || "—",
            m.note || "",
          ]);
        });
        blank();
        section("SORTED BEANS (OUT)");
        header(["Date", "Bean", "Amount", "Batch", "Stock Batch", "Note"]);
        allSortings.forEach((m) => {
          wsData.push([
            cleanDateString(m.movement_date),
            m.bean_type,
            `${Math.round(m.grams)} g`,
            m.batch_code || "—",
            m.stock_batch_label || "—",
            m.note || "",
          ]);
        });

        const ws = styledSheet(XLSX, wsData, {
          merges,
          sectionRows,
          headerRows,
          signedCol: 2,
          cols: [{ wch: 22 }, { wch: 13 }, { wch: 15 }, { wch: 14 }, { wch: 26 }, { wch: 38 }],
        });
        XLSX.utils.book_append_sheet(wb, ws, "Inventory Report");
      }

      // Sheet 2: stock batches
      {
        const wsData = [];
        const merges = [];
        const sectionRows = new Set();
        const headerRows = new Set();
        const title = (text) => {
          wsData.push([text]);
          const r = wsData.length - 1;
          sectionRows.add(r);
          merges.push({ s: { r, c: 0 }, e: { r, c: 7 } });
        };
        title("Beanhi - Stock Batches (FIFO Layers)");
        title(`Generated on: ${getTimestamp()}`);
        wsData.push([]);
        wsData.push(["Label", "Started", "Received (kg)", "Sorted (kg)", "Adjusted (kg)", "Balance (kg)", "Active", "Note"]);
        headerRows.add(wsData.length - 1);
        stockBatches.forEach((l) => {
          wsData.push([
            l.label,
            cleanDateString(l.started_at),
            (Number(l.received || 0) / 1000).toFixed(2),
            (Number(l.sorted || 0) / 1000).toFixed(2),
            (Number(l.adjusted || 0) / 1000).toFixed(2),
            (Number(l.balance || 0) / 1000).toFixed(2),
            l.is_active ? "ACTIVE" : "",
            l.note || "",
          ]);
        });

        const ws = styledSheet(XLSX, wsData, {
          merges,
          sectionRows,
          headerRows,
          signedCol: 4,
          cols: [{ wch: 30 }, { wch: 20 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 10 }, { wch: 34 }],
        });
        XLSX.utils.book_append_sheet(wb, ws, "Stock Batches");
      }

      // Sheet 3: adjustments (separate sheet as requested)
      {
        const wsData = [];
        const merges = [];
        const sectionRows = new Set();
        const headerRows = new Set();
        const title = (text) => {
          wsData.push([text]);
          const r = wsData.length - 1;
          sectionRows.add(r);
          merges.push({ s: { r, c: 0 }, e: { r, c: 5 } });
        };
        title("Beanhi - Stock Adjustments");
        title(`Generated on: ${getTimestamp()}`);
        wsData.push([]);
        wsData.push(["Date", "Bean", "Change", "Reason", "Stock Batch(es)", "Reference"]);
        headerRows.add(wsData.length - 1);
        adjGroups.forEach((a) => {
          wsData.push([
            cleanDateString(a.date),
            a.bean,
            signedG(a.grams),
            a.note || "",
            a.layers.join(", ") || "—",
            a.reference || "—",
          ]);
        });

        const ws = styledSheet(XLSX, wsData, {
          merges,
          sectionRows,
          headerRows,
          signedCol: 2,
          cols: [{ wch: 22 }, { wch: 12 }, { wch: 14 }, { wch: 40 }, { wch: 34 }, { wch: 30 }],
        });
        XLSX.utils.book_append_sheet(wb, ws, "Adjustments");
      }

      XLSX.writeFile(wb, "Beanhi_Inventory.xlsx");
    } catch (e) {
      setExportError(e.message || "Could not export the inventory report.");
    } finally {
      setExporting(false);
    }
  }

  async function handleExportPDF() {
    if (exporting) return;
    setExporting(true);
    setExportError(null);
    try {
      const all = await fetchAllMovements();
      const allReceipts = all.filter((m) => m.movement_type === "receipt");
      const allSortings = all.filter((m) => m.movement_type === "sort_in");
      const adjGroups = groupAdjustments(all.filter((m) => m.movement_type === "adjustment"));
      const { default: jsPDF } = await import("jspdf");
      const { default: autoTable } = await import("jspdf-autotable");

      const doc = new jsPDF();

      doc.setFontSize(18);
      doc.text("Beanhi - Inventory Report", 14, 20);
      doc.setFontSize(10);
      doc.setTextColor(100);
      doc.text(`Generated on: ${getTimestamp()}`, 14, 28);
      doc.setTextColor(0);

      let y = 40;
      const addSection = (title) => {
        if (y > 250) {
          doc.addPage();
          y = 20;
        }
        doc.setFontSize(14);
        doc.text(title, 14, y);
        y += 6;
      };
      const addTable = (head, body, headColor) => {
        autoTable(doc, {
          head: [head],
          body,
          startY: y,
          theme: "grid",
          styles: { fontSize: 9, cellPadding: 3, lineColor: [0, 0, 0], lineWidth: 0.1, overflow: "linebreak" },
          headStyles: { fillColor: headColor, textColor: [255, 255, 255] },
        });
        y = doc.lastAutoTable.finalY + 12;
      };

      addSection("Stock Summary");
      addTable(
        ["Bean Type", "Total In (kg)", "Total Out (kg)", "Adjustments (kg)", "Final Stock (kg)"],
        BEANS.map((b) => [
          b,
          (Number(totals[b]?.received || 0) / 1000).toFixed(2),
          (Number(totals[b]?.sorted || 0) / 1000).toFixed(2),
          (Number(totals[b]?.adjusted || 0) / 1000).toFixed(2),
          (Number(stock[b] || 0) / 1000).toFixed(2),
        ]),
        [90, 58, 24]
      );

      addSection("Stock Batches (FIFO Layers)");
      addTable(
        ["Stock Batch", "Started", "Received", "Sorted", "Adjusted", "Balance", "Status"],
        stockBatches.map((l) => [
          l.label,
          cleanDateString(l.started_at).slice(0, 10),
          fmtKg(l.received),
          fmtKg(l.sorted),
          fmtSignedKg(l.adjusted),
          fmtKg(l.balance),
          l.is_active ? "ACTIVE" : "",
        ]),
        [90, 58, 24]
      );

      addSection("Stock Adjustments");
      addTable(
        ["Date", "Bean", "Change", "Reason", "Stock Batch(es)"],
        adjGroups.map((a) => [
          cleanDateString(a.date).slice(0, 16),
          a.bean,
          fmtSignedKg(a.grams),
          a.note || "",
          a.layers.join(", ") || "—",
        ]),
        [90, 58, 24]
      );

      addSection("Received Green Beans (IN)");
      addTable(
        ["Date", "Bean", "Amount", "Batch", "Stock Batch", "Note"],
        allReceipts.map((m) => [
          cleanDateString(m.movement_date),
          m.bean_type,
          `+${Math.round(m.grams)} g`,
          m.batch_code || "—",
          m.stock_batch_label || "—",
          m.note || "",
        ]),
        [40, 100, 40]
      );

      addSection("Sorted Beans (OUT)");
      addTable(
        ["Date", "Bean", "Amount", "Batch", "Stock Batch", "Note"],
        allSortings.map((m) => [
          cleanDateString(m.movement_date),
          m.bean_type,
          `${Math.round(m.grams)} g`,
          m.batch_code || "—",
          m.stock_batch_label || "—",
          m.note || "",
        ]),
        [120, 40, 40]
      );

      doc.save("Beanhi_Inventory.pdf");
    } catch (e) {
      setExportError(e.message || "Could not export the inventory report.");
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="flex flex-col gap-5 w-full max-w-6xl mx-auto">
      {/* header */}
      <div>
        <div style={{ ...display, fontSize: 32, fontWeight: 700, letterSpacing: "-0.015em", lineHeight: 1.15 }}>
          Inventory
        </div>
        <div style={{ fontSize: 13.5, color: C.textDim, marginTop: 3 }}>
          Green bean stock in dated FIFO layers. Add receipts, correct stock, and keep every change audited.
        </div>
      </div>

      <div className="flex flex-col md:flex-row gap-6 md:gap-8 items-start">
        <aside className="w-full md:w-44 md:shrink-0">
          <div style={{ ...labelStyle, marginBottom: 8 }}>SECTIONS</div>
          <InventorySubnav active={tab} onChange={setTab} />
        </aside>

        <div className="flex-1 min-w-0 w-full flex flex-col gap-5">
          {tab === "overview" && (
            <div className="flex flex-col gap-5">
              <div>
                <SectionLabel>STOCK ON HAND</SectionLabel>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mt-2">
                  {BEANS.map((b) => (
                    <StockCard
                      key={b}
                      bean={b}
                      grams={stock[b] ?? 0}
                      totals={totals[b] ?? { received: 0, sorted: 0, adjusted: 0 }}
                      maxGrams={maxGrams}
                    />
                  ))}
                </div>
              </div>

              <Panel
                title={
                  <span className="flex items-center gap-2">
                    <IconChip icon={Layers} />
                    Stock flow
                  </span>
                }
              >
                <div className="flex flex-col gap-3">
                  <div className="flex items-center justify-between gap-4 flex-wrap">
                    <span style={labelStyle}>Active layer</span>
                    <span style={{ ...mono, fontSize: 13, fontWeight: 700 }}>{activeLabel || "—"}</span>
                  </div>
                  <div style={{ borderTop: `1px solid ${C.glassLine}` }} />
                  {[
                    "Receipts post to the active stock batch.",
                    "Sorting consumes the oldest positive layer first, then the next.",
                    "Manual corrections and emergency resets are audited adjustments; history is never deleted.",
                  ].map((text, i) => (
                    <div key={text} className="flex items-start gap-3">
                      <span style={{ ...mono, fontSize: 11, color: C.textFaint, minWidth: 18 }}>0{i + 1}</span>
                      <span style={{ fontSize: 12.5, color: C.textDim, lineHeight: 1.55 }}>{text}</span>
                    </div>
                  ))}
                </div>
              </Panel>
            </div>
          )}

          {tab === "receipts" && (
            <div className="flex flex-col gap-5">
              <ReceiptForm onSubmit={onAddMovement} activeLabel={activeLabel} />
              <MovementTable
                title="Received Green Beans (IN)"
                icon={ArrowDownLeft}
                data={receipts}
                isIncoming={true}
              />
            </div>
          )}

          {tab === "batches" && (
            <div className="flex flex-col gap-5">
              <CreateStockBatchForm onCreate={onCreateStockBatch} />
              <StockBatchTable layers={stockBatches} />
            </div>
          )}

          {tab === "adjustments" && (
            <div className="flex flex-col gap-5">
              <AdjustStockForm layers={stockBatches} onAdjust={onAdjustStock} />
              {resetNotice && (
                <div
                  style={{
                    fontSize: 12.5,
                    color: C.textDim,
                    background: C.glassStrong,
                    border: `1px solid ${C.glassLine}`,
                    borderRadius: 10,
                    padding: "8px 12px",
                  }}
                >
                  {resetNotice}
                </div>
              )}
              <AdjustmentsTable adjustments={adjustmentGroups} />
              <EmergencyResetPanel onOpen={() => setResetOpen(true)} />
            </div>
          )}

          {tab === "activity" && (
            <div className="flex flex-col gap-5">
              <div className="flex justify-between items-center mb-2 flex-wrap gap-3">
                <SectionLabel>ACTIVITY &amp; EXPORTS</SectionLabel>
                <div className="flex gap-2">
                  <button
                    onClick={handleExportExcel}
                    disabled={exporting}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-colors"
                    style={{ background: C.glassStrong, border: `1px solid ${C.glassLine}`, color: C.text, opacity: exporting ? 0.6 : 1, cursor: exporting ? "wait" : "pointer" }}
                  >
                    <Download size={14} /> {exporting ? "Exporting..." : "Excel"}
                  </button>
                  <button
                    onClick={handleExportPDF}
                    disabled={exporting}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-colors"
                    style={{ background: C.glassStrong, border: `1px solid ${C.glassLine}`, color: C.text, opacity: exporting ? 0.6 : 1, cursor: exporting ? "wait" : "pointer" }}
                  >
                    <FileText size={14} /> PDF
                  </button>
                </div>
              </div>

              {exportError && (
                <div style={{ fontSize: 12.5, color: C.red }}>{exportError}</div>
              )}

              <MovementTable
                title="Received Green Beans (IN)"
                icon={ArrowDownLeft}
                data={receipts}
                isIncoming={true}
              />
              <MovementTable
                title="Sorted Beans (OUT)"
                icon={ArrowUpRight}
                data={sortings}
                isIncoming={false}
              />
            </div>
          )}
        </div>
      </div>

      {resetOpen && (
        <ResetModal
          open
          stock={stock}
          onClose={(didReset) => {
            setResetOpen(false);
            if (didReset) setResetNotice("Stock reset to zero. A new active stock batch was created; all history is preserved.");
          }}
          onReset={onResetStock}
        />
      )}
    </div>
  );
}
