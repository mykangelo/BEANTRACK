import { useState } from "react";
import { Scale } from "lucide-react";
import { C, mono } from "../appTokens";
import { clamp } from "../appUtils";
import { IconChip, NumberField, Panel } from "./ui";

export default function DashboardSetup({ machine, setBeanType, setMode, setInputTarget, vertical = false }) {
  const locked = machine.status === "Processing";
  const [weightActive, setWeightActive] = useState(false);

  const choiceStyle = (active) => ({
    border: `1px solid ${active ? C.green : C.glassBorder}`,
    background: active ? C.brownGradient : C.glassStrong,
    color: active ? C.panel : C.textDim,
    borderRadius: 14,
    cursor: locked ? "not-allowed" : "pointer",
    opacity: locked && !active ? 0.5 : 1,
    ...mono,
    fontSize: 12,
    fontWeight: 700,
  });

  return (
    <div className={vertical ? "flex flex-col gap-3" : "grid grid-cols-2 gap-4"}>
      <Panel title={<span className="flex items-center gap-2"><IconChip icon={Scale} />Input weight</span>}>
        <div className="flex items-center gap-3">
          <input
            type="range"
            min={200}
            max={2000}
            step={50}
            value={machine.inputTarget}
            onChange={(e) => setInputTarget(Number(e.target.value))}
            onFocus={() => setWeightActive(true)}
            onBlur={() => setWeightActive(false)}
            disabled={locked}
            className="bt-range flex-1"
            style={{ "--pct": `${((machine.inputTarget - 200) / 1800) * 100}%`, "--fill": weightActive ? C.amber : "#B79F76" }}
          />
          <NumberField
            value={machine.inputTarget}
            onCommit={(v) => setInputTarget(clamp(v, 200, 2000))}
            suffix="g"
            width={78}
            disabled={locked}
          />
        </div>
      </Panel>

      <Panel title="Operating mode">
        <div className="grid grid-cols-2 gap-2">
          {["Manual", "Automatic"].map((mode) => (
            <button
              key={mode}
              onClick={() => setMode(mode)}
              disabled={locked}
              className="py-3"
              style={choiceStyle(machine.mode === mode)}
            >
              {mode}
            </button>
          ))}
        </div>
      </Panel>

      <Panel title="Bean type">
        <div className="grid grid-cols-2 gap-2">
          {["Arabica", "Robusta"].map((bean) => (
            <button
              key={bean}
              onClick={() => setBeanType(bean)}
              disabled={locked}
              className="py-3"
              style={choiceStyle(machine.beanType === bean)}
            >
              {bean}
            </button>
          ))}
        </div>
      </Panel>
    </div>
  );
}