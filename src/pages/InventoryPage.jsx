import { C, mono } from "../appTokens";
import { Panel } from "../components/ui";

const CATS = ["large", "medium", "debris"];
const CAT_LABEL = { large: "Large", medium: "Medium", debris: "Fine / debris" };

export default function InventoryPage({ inventory }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
      {Object.entries(inventory).map(([bean, cats]) => {
        const color = bean === "Arabica" ? C.arabica : C.robusta;
        const total = CATS.reduce((sum, category) => sum + cats[category], 0);
        return (
          <Panel key={bean} title={`Inventory — ${bean}`} right={<span style={{ ...mono, fontSize: 12, color }}>{total.toFixed(1)} kg total</span>}>
            <div className="flex flex-col gap-2.5">
              {CATS.map((category, index) => (
                <div key={category} className="flex items-center gap-3">
                  <span style={{ ...mono, fontSize: 12, color: C.textFaint, width: 14 }}>{index === CATS.length - 1 ? "└" : "├"}</span>
                  <span style={{ fontSize: 13, width: 100 }}>{CAT_LABEL[category]}</span>
                  <div className="flex-1 h-1.5" style={{ background: C.glassLine, borderRadius: 999, overflow: "hidden" }}>
                    <div className="h-full" style={{ width: `${total > 0 ? (cats[category] / total) * 100 : 0}%`, background: color }} />
                  </div>
                  <span style={{ ...mono, fontSize: 13, width: 64, textAlign: "right" }}>{cats[category].toFixed(1)} kg</span>
                </div>
              ))}
            </div>
          </Panel>
        );
      })}
    </div>
  );
}
