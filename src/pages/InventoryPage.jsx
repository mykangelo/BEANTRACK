import { useState } from "react";
import { Package, History, PlusCircle, Scale, Download, FileText, ArrowDownLeft, ArrowUpRight, Filter, X } from "lucide-react";
import * as XLSX from "xlsx-js-style"; 
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
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

// Reusable Table Component with Exact Date Filter
function MovementTable({ title, icon, data, isIncoming }) {
  const [selectedDate, setSelectedDate] = useState("");
  const cleanDateString = (dateStr) => String(dateStr).replace(/[^\x20-\x7E]/g, '').trim();
  
  const headerColor = isIncoming ? C.green : C.red;
  const amountColor = isIncoming ? C.green : C.red;

  // Filter Logic: Compare YYYY-MM-DD strings directly
  const filteredData = data.filter((m) => {
    if (!selectedDate) return true; // Show all if no date is selected
    
    // Extract just the YYYY-MM-DD part from the database timestamp
    const itemDateStr = cleanDateString(m.movement_date).slice(0, 10); 
    return itemDateStr === selectedDate;
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
      {/* Exact Date Filter UI */}
      <div className="flex justify-end mb-3">
        <div className="relative flex items-center" style={{ gap: 6 }}>
          <Filter size={14} style={{ color: C.textFaint }} />
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            style={{
              ...inputStyle,
              width: 'auto',
              fontSize: 12,
              padding: "4px 8px",
              borderRadius: 8,
              color: selectedDate ? C.text : C.textFaint,
            }}
          />
          {selectedDate && (
            <button
              onClick={() => setSelectedDate("")}
              title="Clear Date Filter"
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
                <th className="py-2 text-left" style={{ fontWeight: 500 }}>Note</th>
              </tr>
            </thead>
            <tbody>
              {/* Show top 15 for UI, the export will grab all */}
              {filteredData.slice(0, 15).map((m, i) => (
                <tr key={`${m.movement_date}-${i}`} style={{ borderBottom: `1px solid ${C.glassLine}` }}>
                  <td className="py-2" style={mono}>{cleanDateString(m.movement_date).slice(0, 16)}</td>
                  <td className="py-2">{m.bean_type}</td>
                  <td
                    className="py-2 text-right whitespace-nowrap"
                    style={{ ...mono, fontWeight: 700, color: amountColor }}
                  >
                    {m.grams >= 0 ? "+" : ""}{Math.round(m.grams)} g
                  </td>
                  <td className="py-2 pl-3" style={mono}>{m.batch_code || "—"}</td>
                  <td className="py-2" style={{ color: C.textDim, maxWidth: '150px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {m.note || ""}
                  </td>
                </tr>
              ))}
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

export default function InventoryPage({ inventory, onAddMovement }) {
  const stock = inventory?.stock ?? {};
  const totals = inventory?.totals ?? {};
  const movements = inventory?.movements ?? [];
  const maxGrams = Math.max(1, ...BEANS.map((b) => stock[b] ?? 0));

  // Split the data for the UI
  const receipts = movements.filter((m) => m.movement_type === "receipt");
  const sortings = movements.filter((m) => m.movement_type === "sort_in");

  const getTimestamp = () => new Date().toLocaleString();
  const cleanDateString = (dateStr) => String(dateStr).replace(/[^\x20-\x7E]/g, '').trim();

  // --- EXPORT FUNCTIONS ---
  const handleExportExcel = () => {
    const wsData = [
      ["Beanhi - Inventory Report", "", "", "", "", ""],
      [`Generated on: ${getTimestamp()}`, "", "", "", "", ""],
      [],
      ["STOCK SUMMARY", "", "", "", "", ""],
      ["Bean Type", "Total In (Received)", "Total Out (Sorted)", "Final Stock", "", ""],
      ...BEANS.map((b) => [
        b,
        `${((totals[b]?.received || 0) / 1000).toFixed(2)} kg`,
        `${((totals[b]?.sorted || 0) / 1000).toFixed(2)} kg`,
        `${((stock[b] || 0) / 1000).toFixed(2)} kg`,
        "", ""
      ]),
      [],
      ["RECEIVED GREEN BEANS (IN)", "", "", "", "", ""],
      ["Date", "Bean", "Amount", "Batch", "Note", "Type"]
    ];

    receipts.forEach(m => {
      wsData.push([cleanDateString(m.movement_date), m.bean_type, `+${Math.round(m.grams)} g`, m.batch_code || "—", m.note || "", "Received"]);
    });

    wsData.push([], ["SORTED BEANS (OUT)", "", "", "", "", ""], ["Date", "Bean", "Amount", "Batch", "Note", "Type"]);

    sortings.forEach(m => {
      wsData.push([cleanDateString(m.movement_date), m.bean_type, `${Math.round(m.grams)} g`, m.batch_code || "—", m.note || "", "Sorted"]);
    });

    const ws = XLSX.utils.aoa_to_sheet(wsData);
    ws['!cols'] = [{ wch: 22 }, { wch: 12 }, { wch: 15 }, { wch: 15 }, { wch: 40 }, { wch: 15 }];

    const sortingStartIndex = 9 + receipts.length + 2; 
    ws['!merges'] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: 5 } },
      { s: { r: 1, c: 0 }, e: { r: 1, c: 5 } },
      { s: { r: 3, c: 0 }, e: { r: 3, c: 5 } },
      { s: { r: 7, c: 0 }, e: { r: 7, c: 5 } },
      { s: { r: sortingStartIndex, c: 0 }, e: { r: sortingStartIndex, c: 5 } },
    ];

    const borderStyle = { top: { style: "thin", color: { rgb: "000000" } }, bottom: { style: "thin", color: { rgb: "000000" } }, left: { style: "thin", color: { rgb: "000000" } }, right: { style: "thin", color: { rgb: "000000" } } };
    const range = XLSX.utils.decode_range(ws['!ref']);
    for (let R = range.s.r; R <= range.e.r; ++R) {
      for (let C = range.s.c; C <= range.e.c; ++C) {
        const cell = ws[XLSX.utils.encode_cell({ r: R, c: C })];
        if (!cell) continue;
        cell.s = { alignment: { wrapText: true, vertical: "center" }, border: borderStyle };
        if (R === 0 || R === 3 || R === 7 || R === sortingStartIndex) {
          cell.s.font = { bold: true, size: 12, color: { rgb: "FFFFFF" } };
          cell.s.fill = { fgColor: { rgb: "5A3A18" } };
          cell.s.alignment.horizontal = "center";
        } else if (R === 4 || R === 8 || R === sortingStartIndex + 1) {
          cell.s.font = { bold: true };
          cell.s.fill = { fgColor: { rgb: "E0D5C1" } };
          cell.s.alignment.horizontal = "center";
        }
        if (C === 2 && R > 8) {
          cell.s.font = { color: { rgb: cell.v.startsWith("+") ? "008000" : "FF0000" }, bold: true };
          cell.s.alignment.horizontal = "right";
        }
      }
    }

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Inventory Report");
    XLSX.writeFile(wb, "Beanhi_Inventory.xlsx");
  };

  const handleExportPDF = () => {
    const doc = new jsPDF();
    
    doc.setFontSize(18);
    doc.text("Beanhi - Inventory Report", 14, 20);
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(`Generated on: ${getTimestamp()}`, 14, 28);

    doc.setTextColor(0);
    doc.setFontSize(14);
    doc.text("Stock Summary", 14, 40);

    autoTable(doc, {
      head: [["Bean Type", "Total In (kg)", "Total Out (kg)", "Final Stock (kg)"]],
      body: BEANS.map((b) => [b, `${((totals[b]?.received || 0) / 1000).toFixed(2)} kg`, `${((totals[b]?.sorted || 0) / 1000).toFixed(2)} kg`, `${((stock[b] || 0) / 1000).toFixed(2)} kg`]),
      startY: 44,
      theme: 'grid',
      styles: { fontSize: 10, cellPadding: 4, lineColor: [0, 0, 0], lineWidth: 0.1 },
      headStyles: { fillColor: [90, 58, 24], textColor: [255, 255, 255] },
    });

    let currentY = doc.lastAutoTable.finalY + 15;
    doc.setFontSize(14);
    doc.text("Received Green Beans (IN)", 14, currentY);

    autoTable(doc, {
      head: [["Date", "Bean", "Amount", "Batch", "Note"]],
      body: receipts.map(m => [cleanDateString(m.movement_date), m.bean_type, `+${Math.round(m.grams)} g`, m.batch_code || "—", m.note || ""]),
      startY: currentY + 4,
      theme: 'grid',
      styles: { fontSize: 9, cellPadding: 3, lineColor: [0, 0, 0], lineWidth: 0.1, overflow: 'linebreak' },
      headStyles: { fillColor: [40, 100, 40], textColor: [255, 255, 255] },
      columnStyles: { 2: { halign: 'right', textColor: [0, 128, 0] } },
    });

    currentY = doc.lastAutoTable.finalY + 15;
    doc.setFontSize(14);
    doc.text("Sorted Beans (OUT)", 14, currentY);

    autoTable(doc, {
      head: [["Date", "Bean", "Amount", "Batch", "Note"]],
      body: sortings.map(m => [cleanDateString(m.movement_date), m.bean_type, `${Math.round(m.grams)} g`, m.batch_code || "—", m.note || ""]),
      startY: currentY + 4,
      theme: 'grid',
      styles: { fontSize: 9, cellPadding: 3, lineColor: [0, 0, 0], lineWidth: 0.1, overflow: 'linebreak' },
      headStyles: { fillColor: [120, 40, 40], textColor: [255, 255, 255] },
      columnStyles: { 2: { halign: 'right', textColor: [200, 0, 0] } },
    });

    doc.save("Beanhi_Inventory.pdf");
  };

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

      {/* MOVEMENT LOGS - SPLIT INTO TWO COLUMNS */}
      <div>
        <div className="flex justify-between items-center mb-2 mt-4">
          <SectionLabel>MOVEMENT LOGS</SectionLabel>
          <div className="flex gap-2">
            <button
              onClick={handleExportExcel}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-colors"
              style={{ background: C.glassStrong, border: `1px solid ${C.glassLine}`, color: C.text }}
            >
              <Download size={14} /> Excel
            </button>
            <button
              onClick={handleExportPDF}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-colors"
              style={{ background: C.glassStrong, border: `1px solid ${C.glassLine}`, color: C.text }}
            >
              <FileText size={14} /> PDF
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
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
      </div>
    </div>
  );
}