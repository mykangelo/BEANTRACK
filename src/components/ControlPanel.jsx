import { useEffect, useState } from "react";
import {
  Play, Square, RotateCcw, Scale, Settings2, Loader2, Sparkles,
} from "lucide-react";
import { C, sans, LABEL } from "../appTokens";
import { Button, Panel, Divider } from "./ui";
import CircularKnob from "./CircularKnob";

const RESET_CONFIRM_MS = 4000;
const FULL = { width: "100%" };

/* One panel for the batch and the motor:
   row 1  New batch / Reset batch
   row 2  vibration speed
   row 3  Start / Stop / Tare / Calibrate
   Motor control is only offered for a confirmed batch. Reset needs a second
   click because it stops the board and clears the run on screen. */
export default function ControlPanel({
  isRunning, connected, taring, fault, setupConfirmed,
  onStart, onStop, onTare, onCalibrate, onReset, onNewBatch, hint,
  machine, setSpeed,
}) {
  const [resetArmed, setResetArmed] = useState(false);

  useEffect(() => {
    if (!resetArmed) return;
    const timer = setTimeout(() => setResetArmed(false), RESET_CONFIRM_MS);
    return () => clearTimeout(timer);
  }, [resetArmed]);

  // A run starting from the panel button clears the armed reset without an
  // effect: the button below is disabled while processing anyway.
  const armed = resetArmed && !isRunning;
  const prepDisabled = !connected || taring || isRunning;

  // In Manual mode the panel potentiometer owns the speed. Offline there is no
  // board to command, but the dial still sets the speed of a simulated batch.
  const manualSpeed = machine.mode === "Manual";
  const commandedSpeed = Math.round(machine.vibrationSpeed);
  const actualSpeed = Math.round(machine.motorSpeed ?? 0);
  const ramping = connected && Math.abs(actualSpeed - commandedSpeed) > 2;

  function handleReset() {
    if (armed) {
      setResetArmed(false);
      onReset();
      return;
    }
    setResetArmed(true);
  }

  return (
    <Panel
      title="Control Panel"
      titleVariant="banner"
      bodyStyle={{ paddingTop: 16 }}
      style={{ border: `1px solid ${C.lineLit}`, boxShadow: "none" }}
    >
      {/* Row 1 — batch actions, swapped for a confirmation band while armed */}
      {armed ? (
        <div
          role="group"
          aria-label="Confirm reset"
          style={{
            padding: "10px 12px",
            borderRadius: 16,
            border: `1px solid ${C.amber}`,
            background: `${C.amber}18`,
          }}
        >
          <div style={{ ...sans, fontSize: 11.5, fontWeight: 700, color: C.textDim, marginBottom: 8 }}>
            Clear this run?
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="action"
              onClick={() => setResetArmed(false)}
              style={{ flex: 1, paddingLeft: 10, paddingRight: 10, whiteSpace: "nowrap" }}
            >
              Cancel
            </Button>
            <Button
              variant="reset"
              icon={RotateCcw}
              onClick={handleReset}
              disabled={isRunning || taring}
              style={{ flex: 1, paddingLeft: 10, paddingRight: 10, whiteSpace: "nowrap" }}
            >
              Reset
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-2" role="group" aria-label="Batch actions">
          <Button
            variant="action"
            icon={Sparkles}
            onClick={onNewBatch}
            disabled={isRunning || taring}
            style={{ flex: 1, paddingLeft: 10, paddingRight: 10 }}
          >
            New batch
          </Button>
          <Button
            variant="action"
            icon={RotateCcw}
            onClick={handleReset}
            disabled={isRunning || taring}
            style={{ flex: 1, paddingLeft: 10, paddingRight: 10 }}
          >
            Reset batch
          </Button>
        </div>
      )}

      <Divider style={{ margin: "14px 0" }} />

      {/* Row 2 — vibration speed */}
      <div className="flex flex-col items-center gap-3">
        <div className="flex items-center justify-between gap-2 w-full">
          <div style={LABEL}>Vibration speed</div>
          <span
            style={{
              ...LABEL,
              fontSize: 10,
              padding: "3px 8px",
              borderRadius: 999,
              border: `1px solid ${manualSpeed ? C.textFaint : C.green}`,
              background: manualSpeed ? "transparent" : `${C.amber}22`,
              color: manualSpeed ? C.textDim : C.green,
              whiteSpace: "nowrap",
            }}
          >
            {manualSpeed ? "Manual · Panel" : "Automatic · Digital"}
          </span>
        </div>
        <CircularKnob
          value={machine.vibrationSpeed}
          onChange={setSpeed}
          min={0}
          max={100}
          step={1}
          size={150}
          disabled={manualSpeed}
          label="Vibration speed"
          suffix="%"
          showLabel={false}
        />
        {connected && (
          <div style={{ ...sans, fontSize: 11.5, color: C.textDim, textAlign: "center" }}>
            Motor at {actualSpeed}%
            {ramping ? ` · ramping to ${commandedSpeed}%` : ""}
          </div>
        )}
      </div>

      <Divider style={{ margin: "14px 0" }} />

      {/* Row 3 — motor controls */}
      <div
        className="flex flex-col gap-2.5"
        role="toolbar"
        aria-label="Motor controls"
        aria-orientation="vertical"
      >
        {setupConfirmed && (
          <Button
            variant="action"
            icon={Play}
            onClick={onStart}
            disabled={isRunning || !!fault || taring}
            style={FULL}
          >
            Start sorting
          </Button>
        )}

        <Button
          variant="stop"
          icon={Square}
          onClick={onStop}
          disabled={!isRunning}
          style={FULL}
        >
          Stop sorting
        </Button>

        <Divider style={{ margin: "8px 0" }} />

        <Button
          variant="action"
          icon={taring ? Loader2 : Scale}
          onClick={onTare}
          disabled={prepDisabled}
          style={FULL}
        >
          {taring ? "Taring..." : "Tare load cells"}
        </Button>

        <Button
          variant="action"
          icon={Settings2}
          onClick={onCalibrate}
          disabled={prepDisabled}
          style={FULL}
        >
          Calibrate
        </Button>
      </div>

      <div style={{ ...sans, fontSize: 11.5, color: C.textFaint, marginTop: 12, lineHeight: 1.55 }}>
        {hint}
      </div>
    </Panel>
  );
}
