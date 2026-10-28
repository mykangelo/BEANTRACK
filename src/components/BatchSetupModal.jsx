import { useEffect } from "react";
import { X, Wifi, Loader2, AlertTriangle, ArrowLeft, ArrowRight, Check, Package } from "lucide-react";
import { C, mono, sans, LABEL } from "../appTokens";
import { clamp, setupStockState } from "../appUtils";
import { Button, NumberField } from "./ui";

const STEPS = ["Connect", "Setup", "Confirm"];

const hint = { ...sans, fontSize: 12.5, color: C.textFaint, lineHeight: 1.55 };
const fieldLabel = { ...LABEL, marginBottom: 8 };

function Choice({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex-1 py-2.5"
      style={{
        borderRadius: 12,
        cursor: "pointer",
        border: `1px solid ${active ? C.green : C.glassLine}`,
        background: active ? C.brownGradient : "transparent",
        color: active ? C.panel : C.textDim,
        ...sans,
        fontSize: 13,
        fontWeight: 700,
      }}
    >
      {children}
    </button>
  );
}

function Fact({ label, value }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span style={{ ...sans, fontSize: 12.5, color: C.textFaint }}>{label}</span>
      <span style={{ ...mono, fontSize: 13, fontWeight: 700, color: C.text }}>{value}</span>
    </div>
  );
}

function Warn({ children, action }) {
  return (
    <div className="flex items-center gap-2 flex-wrap" style={{ ...sans, fontSize: 12, fontWeight: 600, color: C.amber }}>
      <AlertTriangle size={13} style={{ flexShrink: 0 }} />
      <span style={{ flex: 1, minWidth: 140 }}>{children}</span>
      {action}
    </div>
  );
}

/* Batch setup as a three-step modal: connect, set the batch, confirm. */
export default function BatchSetupModal({
  machine, setBeanType, setMode, setInputTarget,
  step, onStep,
  connected, reconnecting, currentNetwork,
  onReconnect, onWifi,
  stock, stockKnown,
  fault, taring,
  onCancel, onConfirm, onOpenInventory,
}) {
  const onHand = stock?.[machine.beanType] ?? 0;
  const stockState = setupStockState({ stockKnown, onHand, target: machine.inputTarget });
  const stockShort = stockState === "short";
  const manual = machine.mode === "Manual";

  const canConfirm = !fault && !taring && !stockShort;

  // Escape closes, and the page behind the modal does not scroll.
  useEffect(() => {
    function onKey(e) {
      if (e.key === "Escape") onCancel();
    }
    window.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [onCancel]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      style={{ background: "rgba(34,22,9,0.45)", backdropFilter: "blur(4px)", WebkitBackdropFilter: "blur(4px)" }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Batch setup"
        className="w-full"
        style={{
          width: 460,
          maxWidth: "100%",
          maxHeight: "90vh",
          overflowY: "auto",
          background: C.panel,
          border: `1px solid ${C.lineLit}`,
          borderRadius: 24,
          padding: "20px 22px 18px",
          ...sans,
        }}
      >
        {/* header */}
        <div className="flex items-start justify-between gap-3">
          <div>
            <div style={{ fontSize: 17, fontWeight: 800, color: C.text }}>Batch setup</div>
            <div style={{ ...mono, fontSize: 10.5, fontWeight: 700, letterSpacing: "0.06em", color: C.textFaint, marginTop: 3 }}>
              STEP {step} OF {STEPS.length} · {STEPS[step - 1].toUpperCase()}
            </div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            title="Close"
            style={{ background: "transparent", border: "none", cursor: "pointer", color: C.textDim, padding: 2, marginTop: -2 }}
          >
            <X size={18} />
          </button>
        </div>

        {/* progress */}
        <div className="flex gap-1.5" style={{ margin: "14px 0 20px" }} aria-hidden="true">
          {STEPS.map((s, i) => (
            <span
              key={s}
              style={{
                flex: 1,
                height: 3,
                borderRadius: 999,
                background: i < step ? C.lineLit : "rgba(139,107,61,0.22)",
                transition: "background 0.2s ease",
              }}
            />
          ))}
        </div>

        {/* 1 — connect */}
        {step === 1 && (
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-2.5">
              <span
                style={{
                  width: 8, height: 8, borderRadius: 999, flexShrink: 0,
                  background: connected ? C.green : C.amber,
                }}
              />
              <span style={{ fontSize: 13.5, fontWeight: 700, color: connected ? C.green : C.amber }}>
                {reconnecting ? "Checking the board" : connected ? "Board connected" : "Board offline"}
              </span>
              {reconnecting && <Loader2 size={13} className="animate-spin" />}
            </div>

            <div style={hint}>
              {connected
                ? `Ready${currentNetwork ? ` on ${currentNetwork}` : ""}.`
                : "You can continue without the board. The batch will be simulated."}
            </div>

            <div className="flex gap-2 flex-wrap">
              {!connected && (
                <Button variant="action" icon={Wifi} onClick={onReconnect} disabled={reconnecting}>
                  Retry
                </Button>
              )}
              <Button variant="action" icon={Wifi} onClick={onWifi}>
                Wi-Fi
              </Button>
            </div>
          </div>
        )}

        {/* 2 — batch */}
        {step === 2 && (
          <div className="flex flex-col gap-5">
            <div>
              <div style={fieldLabel}>Bean</div>
              <div className="flex gap-2">
                {["Arabica", "Robusta"].map((bean) => (
                  <Choice key={bean} active={machine.beanType === bean} onClick={() => setBeanType(bean)}>
                    {bean}
                  </Choice>
                ))}
              </div>
            </div>

            <div>
              <div style={fieldLabel}>Target</div>
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min={200}
                  max={2000}
                  step={50}
                  value={machine.inputTarget}
                  onChange={(e) => setInputTarget(Number(e.target.value))}
                  className="bt-range flex-1"
                  aria-label="Target weight"
                  style={{ "--pct": `${((machine.inputTarget - 200) / 1800) * 100}%`, "--fill": C.amber }}
                />
                <NumberField
                  value={machine.inputTarget}
                  onCommit={(v) => setInputTarget(clamp(v, 200, 2000))}
                  suffix="g"
                  width={92}
                />
              </div>
            </div>

            <div>
              <div style={fieldLabel}>Mode</div>
              <div className="flex gap-2">
                {["Manual", "Automatic"].map((mode) => (
                  <Choice key={mode} active={machine.mode === mode} onClick={() => setMode(mode)}>
                    {mode}
                  </Choice>
                ))}
              </div>
              <div style={{ ...hint, marginTop: 8 }}>
                {manual ? "Speed from the panel knob." : "Speed from the dashboard."}
              </div>
            </div>

            {stockState !== "ok" && (
              <div style={{ borderTop: `1px solid ${C.glassLine}`, paddingTop: 12 }}>
                <Warn
                  action={stockShort ? (
                    <Button variant="action" icon={Package} onClick={onOpenInventory}>
                      Inventory
                    </Button>
                  ) : null}
                >
                  {stockState === "unknown"
                    ? "Stock unknown — database offline."
                    : `Only ${Math.round(onHand)} g of ${machine.beanType} on hand.`}
                </Warn>
              </div>
            )}
          </div>
        )}

        {/* 3 — confirm */}
        {step === 3 && (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2.5">
              <Fact label="Bean" value={machine.beanType} />
              <Fact label="Target" value={`${machine.inputTarget} g`} />
              <Fact label="Mode" value={machine.mode} />
              <Fact label="Board" value={connected ? "Connected" : "Offline · simulated"} />
            </div>

            {fault && <Warn>Clear the fault before confirming.</Warn>}
            {taring && <Warn>Tare or calibration still running.</Warn>}
            {stockShort && (
              <Warn
                action={
                  <Button variant="action" icon={Package} onClick={onOpenInventory}>
                    Inventory
                  </Button>
                }
              >
                Only {Math.round(onHand)} g of {machine.beanType} on hand.
              </Warn>
            )}
            {stockState === "unknown" && <Warn>Database offline — this batch will not be saved.</Warn>}

            <div style={hint}>Locked once confirmed.</div>
          </div>
        )}

        {/* footer */}
        <div
          className="flex items-center justify-between gap-3"
          style={{ marginTop: 22, paddingTop: 14, borderTop: `1px solid ${C.glassLine}` }}
        >
          <div className="flex items-center gap-4">
            {step > 1 && (
              <button
                type="button"
                onClick={() => onStep(step - 1)}
                className="flex items-center gap-1.5"
                style={{ background: "transparent", border: "none", cursor: "pointer", color: C.textDim, ...sans, fontSize: 12, fontWeight: 700 }}
              >
                <ArrowLeft size={13} />
                Back
              </button>
            )}
            <button
              type="button"
              onClick={onCancel}
              style={{ background: "transparent", border: "none", cursor: "pointer", color: C.textFaint, ...sans, fontSize: 12, fontWeight: 600 }}
            >
              Cancel
            </button>
          </div>

          {step < 3 ? (
            <Button variant="action" icon={ArrowRight} onClick={() => onStep(step + 1)}>
              Continue
            </Button>
          ) : (
            <Button variant="action" icon={Check} onClick={onConfirm} disabled={!canConfirm}>
              Confirm
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
