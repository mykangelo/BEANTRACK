import { useRef, useState } from "react";
import { C, mono } from "../appTokens";

// Knob geometry: 0 degrees is straight up, the dial sweeps 270 degrees
// from -135 (min, lower left) clockwise to +135 (max, lower right).
const START_DEG = -135;
const END_DEG = 135;
const SWEEP_DEG = END_DEG - START_DEG; // 270

const degToRad = (d) => (d * Math.PI) / 180;

// Point on a circle, measured clockwise from the top
function polar(cx, cy, r, deg) {
  const rad = degToRad(deg);
  return { x: cx + r * Math.sin(rad), y: cy - r * Math.cos(rad) };
}

// SVG arc path from one angle to another, clockwise
function arcPath(cx, cy, r, fromDeg, toDeg) {
  const a = polar(cx, cy, r, fromDeg);
  const b = polar(cx, cy, r, toDeg);
  const span = toDeg - fromDeg;
  const largeArc = span > 180 ? 1 : 0;
  return `M ${a.x} ${a.y} A ${r} ${r} 0 ${largeArc} 1 ${b.x} ${b.y}`;
}

const valueToDeg = (v, min, max) => START_DEG + ((v - min) / (max - min)) * SWEEP_DEG;

const snap = (v, min, max, step) => {
  const clamped = Math.max(min, Math.min(max, v));
  const stepped = Math.round((clamped - min) / step) * step + min;
  return Math.max(min, Math.min(max, stepped));
};

/**
 * Circular dial. Drag around the centre, click a point on the track, or use the keyboard.
 * Props match the previous version, so pages do not need to change.
 */
export default function CircularKnob({
  value,
  onChange,
  min = 0,
  max = 100,
  step = 1,
  size = 150,
  disabled = false,
  label = "Speed",
  suffix = "%",
  showValue = true,
}) {
  const svgRef = useRef(null);
  const [dragging, setDragging] = useState(false);
  const [hover, setHover] = useState(false);
  const [focused, setFocused] = useState(false);

  // Geometry, all in SVG pixels
  const stroke = Math.max(8, size * 0.075);
  const handleR = stroke * 0.8;
  const tickLen = size * 0.04;
  const R = size / 2 - stroke - tickLen - 8; // track radius, leaves room for ticks
  const CX = size / 2;
  const CY = size / 2;

  const currentDeg = valueToDeg(value, min, max);
  const fraction = Math.max(0, Math.min(1, (value - min) / (max - min)));
  const handle = polar(CX, CY, R, currentDeg);

  // Pointer position to a value. The bottom gap (between 135 and 225) clamps to the nearest end.
  function valueFromPointer(clientX, clientY) {
    const rect = svgRef.current.getBoundingClientRect();
    const dx = clientX - (rect.left + CX);
    const dy = clientY - (rect.top + CY);
    let deg = (Math.atan2(dx, -dy) * 180) / Math.PI; // 0 at top, clockwise positive
    deg = Math.max(START_DEG, Math.min(END_DEG, deg));
    const raw = min + ((deg - START_DEG) / SWEEP_DEG) * (max - min);
    return snap(raw, min, max, step);
  }

  function commit(next) {
    if (next !== value) onChange(next);
  }

  function handlePointerDown(e) {
    if (disabled) return;
    e.preventDefault();
    svgRef.current.setPointerCapture(e.pointerId);
    setDragging(true);
    commit(valueFromPointer(e.clientX, e.clientY));
  }

  function handlePointerMove(e) {
    if (!dragging || disabled) return;
    commit(valueFromPointer(e.clientX, e.clientY));
  }

  function handlePointerUp(e) {
    if (svgRef.current?.hasPointerCapture(e.pointerId)) {
      svgRef.current.releasePointerCapture(e.pointerId);
    }
    setDragging(false);
  }

  function handleKeyDown(e) {
    if (disabled) return;
    const big = (max - min) / 10;
    let next = null;
    switch (e.key) {
      case "ArrowUp":
      case "ArrowRight": next = value + step; break;
      case "ArrowDown":
      case "ArrowLeft": next = value - step; break;
      case "PageUp": next = value + big; break;
      case "PageDown": next = value - big; break;
      case "Home": next = min; break;
      case "End": next = max; break;
      default: return;
    }
    e.preventDefault();
    commit(snap(next, min, max, step));
  }

  // Tick marks at 0, 10, ... 100 percent
  const ticks = Array.from({ length: 11 }, (_, i) => {
    const deg = START_DEG + (i / 10) * SWEEP_DEG;
    const outer = R + stroke / 2 + tickLen;
    const inner = R + stroke / 2 + 3;
    const a = polar(CX, CY, inner, deg);
    const b = polar(CX, CY, outer, deg);
    return { key: i, x1: a.x, y1: a.y, x2: b.x, y2: b.y, major: i % 5 === 0 };
  });

  const trackPath = arcPath(CX, CY, R, START_DEG, END_DEG);
  const activeColor = disabled ? C.textFaint : dragging || hover ? C.amber : C.green;
  const handleFill = disabled ? C.textFaint : dragging ? C.amber : C.green;

  return (
    <div
      className="flex flex-col items-center"
      style={{ width: size, opacity: disabled ? 0.55 : 1 }}
    >
      <svg
        ref={svgRef}
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        role="slider"
        aria-label={label}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-disabled={disabled}
        tabIndex={disabled ? -1 : 0}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onKeyDown={handleKeyDown}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onMouseEnter={() => !disabled && setHover(true)}
        onMouseLeave={() => setHover(false)}
        style={{
          display: "block",
          cursor: disabled ? "not-allowed" : dragging ? "grabbing" : "pointer",
          touchAction: "none",
          userSelect: "none",
          outline: focused && !disabled ? `2px solid ${C.amber}` : "none",
          outlineOffset: 4,
          borderRadius: "50%",
        }}
      >
        {/* Ticks */}
        {ticks.map((t) => (
          <line
            key={t.key}
            x1={t.x1}
            y1={t.y1}
            x2={t.x2}
            y2={t.y2}
            stroke={C.textFaint}
            strokeWidth={t.major ? 2 : 1.2}
            strokeLinecap="round"
            opacity={0.6}
          />
        ))}

        {/* Background track */}
        <path
          d={trackPath}
          fill="none"
          stroke={C.glassLine}
          strokeWidth={stroke}
          strokeLinecap="round"
          pathLength={100}
        />

        {/* Progress arc: dash length = percentage of the sweep */}
        <path
          d={trackPath}
          fill="none"
          stroke={activeColor}
          strokeWidth={stroke}
          strokeLinecap="round"
          pathLength={100}
          strokeDasharray={`${fraction * 100} 100`}
          style={{ transition: dragging ? "none" : "stroke-dasharray 0.15s ease, stroke 0.15s ease" }}
        />

        {/* Handle */}
        <circle
          cx={handle.x}
          cy={handle.y}
          r={dragging ? handleR * 1.15 : handleR}
          fill="#fff"
          stroke={handleFill}
          strokeWidth={3}
          style={{
            filter: `drop-shadow(0 2px 6px ${handleFill}66)`,
            transition: dragging ? "none" : "r 0.1s ease",
          }}
        />

        {/* Centre value */}
        {showValue && (
          <g pointerEvents="none">
            <text
              x={CX}
              y={CY - size * 0.02}
              textAnchor="middle"
              dominantBaseline="middle"
              style={{ ...mono, fontSize: size * 0.24, fontWeight: 800, fill: disabled ? C.textFaint : C.text }}
            >
              {value}
            </text>
            <text
              x={CX}
              y={CY + size * 0.17}
              textAnchor="middle"
              dominantBaseline="middle"
              style={{ fontSize: size * 0.07, fill: C.textFaint }}
            >
              {suffix}
            </text>
          </g>
        )}
      </svg>

      <div
        style={{
          marginTop: 6,
          fontSize: 10.5,
          fontWeight: 600,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: C.textFaint,
        }}
      >
        {label}
      </div>
    </div>
  );
}