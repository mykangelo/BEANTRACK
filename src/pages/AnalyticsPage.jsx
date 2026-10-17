import { Package } from "lucide-react";
import { C, mono, display } from "../appTokens";
import { CATS, CAT_LABEL } from "../appConstants";
import { Panel, SectionLabel } from "../components/ui";
import AccuracyPanel from "../components/AccuracyPanel";

function metrics(batch) {
  const sorted = batch.weights.large + batch.weights.medium;
  return {
    sorted,
    yieldPct: (sorted / batch.inputWeight) * 100,
    finePct: (batch.weights.debris / batch.inputWeight) * 100,
  };
}

function fmtTime(seconds) {
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
}

function sum(bins) {
  return CATS.reduce((acc, c) => acc + (bins[c] || 0), 0);
}

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
                <div style={{ width: `${pct}%`, height: "100%", background: barColor, borderRadius: 999, transition: "width 0.4s ease" }} />
              </div>
              <span style={{ ...mono, fontSize: 13, fontWeight: 700, width: 64, textAlign: "right" }}>{kg.toFixed(1)} kg</span>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}

export default function AnalyticsPage({ batches, inventory, dbDown, accuracy, onSaveAccuracy }) {
  const latest = batches[0];
  const result = metrics(latest);
  const maxKg = Math.max(0, ...CATS.flatMap((c) => [inventory.Arabica[c] || 0, inventory.Robusta[c] || 0]));

  return (
    <div className="flex flex-col gap-5 max-w-5xl">
      <div>
        <div style={{ ...display, fontSize: 32, fontWeight: 700 }}>Analytics</div>
        <div style={{ fontSize: 13.5, color: C.textDim, marginTop: 3 }}>
          Stock on hand, results from saved batches, and sorting accuracy checks.
        </div>
      </div>

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

      <Panel title={`Batch summary — ${latest.id}`}>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-5">
          <div>
            <small>INPUT</small>
            <div style={mono}>{latest.inputWeight} g</div>
          </div>
          <div>
            <small>SORTED</small>
            <div style={mono}>{result.sorted} g</div>
          </div>
          <div>
            <small>YIELD</small>
            <div style={{ ...mono, color: C.green }}>{result.yieldPct.toFixed(1)}%</div>
          </div>
          <div>
            <small>FINE / DEBRIS</small>
            <div style={{ ...mono, color: C.red }}>{result.finePct.toFixed(1)}%</div>
          </div>
          <div>
            <small>TIME</small>
            <div style={mono}>{fmtTime(latest.processingTime)}</div>
          </div>
        </div>
      </Panel>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {batches.slice(0, 6).map((batch) => {
          const value = metrics(batch);
          return (
            <Panel key={batch.id} title={batch.id}>
              <div className="flex flex-col gap-3">
                <div className="flex justify-between">
                  <span>Yield</span>
                  <strong style={{ ...mono, color: C.green }}>{value.yieldPct.toFixed(1)}%</strong>
                </div>
                <div className="h-2" style={{ background: C.glassLine, borderRadius: 999 }}>
                  <div className="h-full" style={{ width: `${Math.min(value.yieldPct, 100)}%`, background: C.goldGradient, borderRadius: 999 }} />
                </div>
                <div className="flex justify-between" style={{ fontSize: 12, color: C.textDim }}>
                  <span>
                    {batch.beanType} · {batch.mode}
                  </span>
                  <span>{batch.inputWeight} g input</span>
                </div>
              </div>
            </Panel>
          );
        })}
      </div>

      <AccuracyPanel batches={batches} accuracy={accuracy} onSave={onSaveAccuracy} />
    </div>
  );
}
