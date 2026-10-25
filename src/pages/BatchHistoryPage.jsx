import { useState } from "react";
import { X, Info, Activity, Search, Filter } from "lucide-react";
import { C, mono, display } from "../appTokens";
import { Panel, SectionLabel } from "../components/ui";
import AccuracyPanel from "../components/AccuracyPanel";

function fmtTime(seconds) { 
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`; 
}

function RunTag({ label, color }) {
  return (
    <span
      style={{
        ...mono,
        fontSize: 9.5,
        fontWeight: 700,
        letterSpacing: "0.04em",
        padding: "1px 6px",
        borderRadius: 999,
        color,
        border: `1px solid ${color}66`,
        marginLeft: 6,
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </span>
  );
}

function BeanTag({ bean }) { 
  const color = bean === "Arabica" ? C.arabica : C.robusta; 
  return (
    <span style={{ 
      border: `1px solid ${color}66`, color, borderRadius: 999, ...mono, fontSize: 11, padding: "2px 8px" 
    }}>
      {bean}
    </span>
  ); 
}

function DistributionBar({ label, subLabel, value, total, color }) {
  const pct = total > 0 ? (value / total) * 100 : 0;
  return (
    <div className="mb-4">
      <div className="flex justify-between items-end mb-1">
        <div>
          <div style={{ fontSize: 13, fontWeight: 600 }}>{label}</div>
          <div style={{ ...mono, fontSize: 10.5, color: C.textFaint }}>{subLabel}</div>
        </div>
        <div style={{ ...mono, fontSize: 13, color: C.text }}>
          {value} g <span style={{ color: C.textFaint }}>({pct.toFixed(1)}%)</span>
        </div>
      </div>
      <div className="h-1.5 rounded-full overflow-hidden" style={{ background: C.glassLine }}>
        <div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: 999 }} />
      </div>
    </div>
  );
}

// Reusable input style for the filters
const filterInputStyle = {
  background: C.glassStrong,
  border: `1px solid ${C.glassLine}`,
  borderRadius: 8,
  padding: "6px 10px",
  fontSize: 12.5,
  color: C.text,
  outline: "none",
};

export default function BatchHistoryPage({ batches, sel, setSel, accuracy = {}, onSaveAccuracy }) {
  const selected = batches.find((batch) => batch.id === sel) || null;

  // Filter States
  const [searchId, setSearchId] = useState("");
  const [filterDate, setFilterDate] = useState("");
  const [filterType, setFilterType] = useState("all");

  // Filter Logic
  const filteredBatches = batches.filter((batch) => {
    // 1. Search by Batch ID
    const matchesId = batch.id.toLowerCase().includes(searchId.toLowerCase());
    
    // 2. Filter by Date (YYYY-MM-DD format)
    const batchDateStr = String(batch.date).slice(0, 10); // Assumes date is string like "2026-10-19..."
    const matchesDate = filterDate ? batchDateStr === filterDate : true;
    
    // 3. Filter by Type
    const matchesType = filterType === "all" ? true : batch.beanType === filterType;

    return matchesId && matchesDate && matchesType;
  });

  const clearFilters = () => {
    setSearchId("");
    setFilterDate("");
    setFilterType("all");
  };

  const hasActiveFilters = searchId !== "" || filterDate !== "" || filterType !== "all";

  return (
    <div className="flex flex-col gap-5 w-full max-w-6xl mx-auto">
      
      {/* Header */}
      <div>
        <div style={{ ...display, fontSize: 32, fontWeight: 700, letterSpacing: "-0.015em", lineHeight: 1.15 }}>
          Batch history
        </div>
        <div style={{ fontSize: 13.5, color: C.textDim, marginTop: 3 }}>
          Every saved batch. Click a row to see its distribution details.
        </div>
      </div>

      {/* Main Layout Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-start">
        
        {/* Left Column: Table */}
        <div className="lg:col-span-2">
          <Panel title="All batches">
            
            {/* Filter Bar */}
            <div className="flex flex-wrap items-center gap-2 mb-4 pb-4" style={{ borderBottom: `1px solid ${C.glassLine}` }}>
              
              {/* Batch ID Search */}
              <div className="relative flex items-center">
                <Search size={14} style={{ position: 'absolute', left: 10, color: C.textFaint }} />
                <input
                  type="text"
                  placeholder="Search Batch No..."
                  value={searchId}
                  onChange={(e) => setSearchId(e.target.value)}
                  style={{ ...filterInputStyle, paddingLeft: 30, width: 160 }}
                />
              </div>

              {/* Date Filter */}
              <div className="relative flex items-center">
                <input
                  type="date"
                  value={filterDate}
                  onChange={(e) => setFilterDate(e.target.value)}
                  style={{ ...filterInputStyle, color: filterDate ? C.text : C.textFaint }}
                />
              </div>

              {/* Type Filter */}
              <div className="relative flex items-center">
                <Filter size={14} style={{ position: 'absolute', left: 10, color: C.textFaint }} />
                <select
                  value={filterType}
                  onChange={(e) => setFilterType(e.target.value)}
                  style={{ ...filterInputStyle, paddingLeft: 30, appearance: 'none', cursor: 'pointer' }}
                >
                  <option value="all">All Types</option>
                  <option value="Arabica">Arabica</option>
                  <option value="Robusta">Robusta</option>
                </select>
              </div>

              {/* Clear Button */}
              {hasActiveFilters && (
                <button
                  onClick={clearFilters}
                  className="flex items-center gap-1 px-2 py-1.5 rounded-md text-xs font-semibold"
                  style={{ color: C.red, background: 'rgba(200, 0, 0, 0.1)' }}
                >
                  <X size={12} /> Clear
                </button>
              )}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full" style={{ borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ borderBottom: `1px solid ${C.glassLine}` }}>
                    {["BATCH", "DATE", "TYPE", "INPUT", "LARGE", "SMALL", "TIME"].map((header) => (
                      <th 
                        key={header} 
                        className="text-left py-2 pr-3 whitespace-nowrap" 
                        style={{ fontSize: 11, color: C.textFaint, fontWeight: 500 }}
                      >
                        {header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredBatches.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-8 text-center" style={{ color: C.textFaint, fontSize: 13 }}>
                        No batches match your filters.
                      </td>
                    </tr>
                  ) : (
                    filteredBatches.map((batch) => {
                      const active = sel === batch.id;
                      return (
                        <tr 
                          key={batch.id} 
                          onClick={() => setSel(active ? null : batch.id)} 
                          style={{ 
                            borderBottom: `1px solid ${C.glassLine}`, 
                            cursor: "pointer", 
                            background: active ? "rgba(255, 255, 255, 0.4)" : "transparent",
                            transition: "background 0.2s ease"
                          }}
                          onMouseEnter={(e) => { if(!active) e.currentTarget.style.background = "rgba(255, 255, 255, 0.1)" }}
                          onMouseLeave={(e) => { if(!active) e.currentTarget.style.background = "transparent" }}
                        >
                          <td className="py-2.5 pr-3" style={{ ...mono, fontSize: 13 }}>
                            {batch.id}
                            {batch.sample && <RunTag label="SAMPLE" color={C.textFaint} />}
                            {batch.source === "simulated" && <RunTag label="SIM" color={C.amber} />}
                            {batch.status === "Partial" && <RunTag label="PARTIAL" color={C.amber} />}
                          </td>
                          <td className="py-2.5 pr-3" style={{ fontSize: 12.5, color: C.textDim }}>{batch.date}</td>
                          <td className="py-2.5 pr-3"><BeanTag bean={batch.beanType} /></td>
                          <td className="py-2.5 pr-3" style={{ ...mono, fontSize: 12.5 }}>{batch.inputWeight}g</td>
                          <td className="py-2.5 pr-3" style={{ ...mono, color: C.green }}>{batch.weights.large}g</td>
                          <td className="py-2.5 pr-3" style={{ ...mono, color: C.amber }}>{batch.weights.medium}g</td>
                          <td className="py-2.5 pr-3" style={mono}>{fmtTime(batch.processingTime)}</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </Panel>
        </div>

        {/* Right Column: Insights Sidebar */}
        <div className="lg:col-span-1">
          {selected ? (
            <Panel 
              title={
                <span className="flex items-center gap-2">
                  <Activity size={16} /> Batch Insights
                </span>
              }
              right={
                <button 
                  onClick={() => setSel(null)} 
                  style={{ color: C.textFaint, cursor: "pointer", display: 'flex', alignItems: 'center' }}
                >
                  <X size={16} />
                </button>
              }
            >
              <div className="mb-5 pb-4" style={{ borderBottom: `1px solid ${C.glassLine}` }}>
                <div style={{ fontSize: 22, fontWeight: 700, ...mono, color: C.text }}>{selected.id}</div>
                <div style={{ fontSize: 12.5, color: C.textDim, marginTop: 2 }}>
                  Total Input: <span style={{ ...mono, color: C.text }}>{selected.inputWeight} g</span>
                </div>
                <div className="flex items-center gap-2 flex-wrap" style={{ fontSize: 11.5, color: C.textFaint, marginTop: 4 }}>
                  <span>{selected.source === "simulated" ? "Simulated run" : "Hardware run"}</span>
                  <span>·</span>
                  <span>{selected.status}</span>
                </div>
              </div>

              <div>
                <DistributionBar 
                  label="Large Beans" 
                  subLabel=">5 mm" 
                  value={selected.weights.large} 
                  total={selected.inputWeight} 
                  color={C.green} 
                />
                <DistributionBar 
                  label="Small Beans" 
                  subLabel="4–5 mm" 
                  value={selected.weights.medium} 
                  total={selected.inputWeight} 
                  color={C.amber} 
                />
              </div>

              <div className="mt-4 pt-4 flex justify-between items-center" style={{ borderTop: `1px solid ${C.glassLine}` }}>
                <div style={{ fontSize: 12, color: C.textDim }}>Total Usable Yield</div>
                <div style={{ ...mono, fontSize: 16, fontWeight: 700, color: C.green }}>
                  {(((selected.weights.large + selected.weights.medium) / selected.inputWeight) * 100).toFixed(1)}%
                </div>
              </div>
            </Panel>
          ) : (
            <div 
              className="flex flex-col items-center justify-center text-center p-8 rounded-xl border border-dashed h-48"
              style={{ borderColor: C.glassLine, color: C.textFaint }}
            >
              <Info size={24} className="mb-2 opacity-50" />
              <div style={{ fontSize: 13 }}>Select a batch to view insights</div>
              <div style={{ fontSize: 11, marginTop: 4 }}>Visual breakdown will appear here</div>
            </div>
          )}

          {batches.some((batch) => !batch.sample) && (
            <div className="flex flex-col gap-3 mt-5">
              <SectionLabel>ACCURACY CHECKS</SectionLabel>
              <AccuracyPanel
                batches={batches.filter((batch) => !batch.sample)}
                accuracy={accuracy}
                onSave={onSaveAccuracy}
              />
            </div>
          )}
        </div>

      </div>
    </div>
  );
}