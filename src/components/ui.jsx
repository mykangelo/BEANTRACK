import { useEffect, useRef, useState } from "react";
import { C, blur, mono, sans, display } from "../appTokens";

/* ---------------------------------------------------------------
   PANEL — frosted-glass card with optional title row
--------------------------------------------------------------- */
export function Panel({ title, right, children, style, bodyStyle }) {
  return (
    <div
      style={{
        background: C.glassGradient,
        border: `1px solid ${C.glassBorder}`,
        borderRadius: 24,
        boxShadow: C.glassShadow,
        overflow: "hidden",
        ...blur,
        ...style,
      }}
    >
      {title && (
        <div className="flex items-center justify-between px-5 pt-4">
          <span style={{ ...sans, color: C.textDim, fontSize: 12.5, fontWeight: 600, letterSpacing: "0.01em" }}>
            {title}
          </span>
          {right}
        </div>
      )}
      <div className={title ? "px-5 pt-3 pb-5" : "p-5"} style={bodyStyle}>
        {children}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------
   ICON CHIP — small round icon shown before a tile title
--------------------------------------------------------------- */
export function IconChip({ icon: Icon }) {
  return (
    <span
      className="flex items-center justify-center"
      style={{ width: 26, height: 26, borderRadius: 9, background: `${C.amber}30` }}
    >
      <Icon size={14} color={C.green} />
    </span>
  );
}

/* ---------------------------------------------------------------
   PAGE HEADER — page title plus one line describing the page
--------------------------------------------------------------- */
export function PageHeader({ title, purpose }) {
  return (
    <div>
      <div style={{ ...display, fontSize: 32, fontWeight: 700, letterSpacing: "-0.015em", lineHeight: 1.15 }}>
        {title}
      </div>
      <div style={{ fontSize: 13.5, color: C.textDim, marginTop: 3 }}>{purpose}</div>
    </div>
  );
}

/* ---------------------------------------------------------------
   SECTION LABEL — small caps label that groups panels beneath it
--------------------------------------------------------------- */
export function SectionLabel({ children }) {
  return (
    <div style={{ ...mono, fontSize: 10.5, letterSpacing: "0.08em", color: C.textFaint, marginBottom: -8 }}>
      {children}
    </div>
  );
}

/* ---------------------------------------------------------------
   METRIC — label over a large value
--------------------------------------------------------------- */
export function Metric({ label, value, unit, color }) {
  return (
    <div>
      <div
        style={{
          ...sans,
          color: C.textFaint,
          fontSize: 10.5,
          fontWeight: 600,
          letterSpacing: "0.07em",
          textTransform: "uppercase",
          marginBottom: 6,
        }}
      >
        {label}
      </div>
      <div style={{ ...mono, color: color || C.text, fontSize: 24, fontWeight: 700, lineHeight: 1 }}>
        {value}
        {unit && <span style={{ fontSize: 13, color: C.textDim, marginLeft: 4 }}>{unit}</span>}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------
   BUTTON — pill button
   variant "action": cream at rest, gold on hover, brown while pressed
   variant "reset":  gold at rest, flashes dark briefly on click
--------------------------------------------------------------- */
export function Button({ children, onClick, disabled, variant = "action", icon: Icon }) {
  const [hover, setHover] = useState(false);
  const [pressed, setPressed] = useState(false);
  const [flash, setFlash] = useState(false);
  const flashTimer = useRef(null);

  // clear any pending flash timer when the button unmounts
  useEffect(() => () => clearTimeout(flashTimer.current), []);

  let bg, fg, border;
  if (variant === "reset") {
    if (flash) { bg = C.text; fg = C.panel; border = C.text; }
    else { bg = C.goldGradient; fg = C.text; border = C.amber; }
  } else if (pressed) {
    bg = C.brownGradient; fg = C.panel; border = C.green;
  } else if (hover) {
    bg = C.goldGradient; fg = C.text; border = C.amber;
  } else {
    bg = C.glassStrong; fg = C.text; border = C.glassBorder;
  }

  function handleClick(e) {
    if (disabled) return;
    if (variant === "reset") {
      setFlash(true);
      clearTimeout(flashTimer.current);
      flashTimer.current = setTimeout(() => setFlash(false), 220);
    }
    if (onClick) onClick(e);
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => { setHover(false); setPressed(false); }}
      onMouseDown={() => setPressed(true)}
      onMouseUp={() => setPressed(false)}
      disabled={disabled}
      className="flex items-center justify-center gap-2 px-5 py-2.5"
      style={{
        background: disabled ? "rgba(255,251,240,0.35)" : bg,
        color: disabled ? C.textFaint : fg,
        border: `1px solid ${disabled ? C.glassLine : border}`,
        borderRadius: 999,
        cursor: disabled ? "not-allowed" : "pointer",
        boxShadow: disabled || pressed ? "none" : "0 4px 14px -6px rgba(90,58,24,0.35)",
        transform: hover && !disabled && !pressed ? "translateY(-1px)" : "none",
        transition: "transform .15s ease, box-shadow .15s ease, background .15s ease",
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

/* ---------------------------------------------------------------
   NUMBER FIELD — editable number that commits on blur or Enter
   Resets its draft whenever the parent's value changes.
--------------------------------------------------------------- */
export function NumberField({ value, onCommit, suffix, width = 80, disabled }) {
  // keying the inner editor on the value remounts it, so the draft always matches the parent
  return <NumberFieldInner key={value} value={value} onCommit={onCommit} suffix={suffix} width={width} disabled={disabled} />;
}

function NumberFieldInner({ value, onCommit, suffix, width, disabled }) {
  const [draft, setDraft] = useState(String(value));

  function commit() {
    const n = Number(draft);
    if (draft.trim() === "" || isNaN(n)) {
      setDraft(String(value));
      return;
    }
    if (n !== value) onCommit(n);
  }

  return (
    <div
      className="flex items-center"
      style={{
        width,
        border: `1px solid ${C.glassLine}`,
        borderRadius: 10,
        background: disabled ? "rgba(255,251,240,0.35)" : C.glassStrong,
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <input
        type="number"
        value={draft}
        disabled={disabled}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            commit();
            e.currentTarget.blur();
          }
        }}
        className="w-full bg-transparent text-right outline-none px-2 py-1.5"
        style={{ ...mono, fontSize: 15, fontWeight: 700, color: C.text }}
      />
      {suffix && <span style={{ ...mono, fontSize: 12, color: C.textDim, paddingRight: 8 }}>{suffix}</span>}
    </div>
  );
}