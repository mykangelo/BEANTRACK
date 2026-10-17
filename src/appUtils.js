import { API_BASE } from "./appConstants";

/* ---------------- numbers and time ---------------- */

export function clamp(value, min, max) {
  if (isNaN(value)) return min;
  return Math.min(Math.max(value, min), max);
}

export function fmtTime(sec) {
  const m = Math.floor(sec / 60).toString().padStart(2, "0");
  const s = Math.floor(sec % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

/* ---------------- batches ---------------- */

export function nextBatchId(batches) {
  const nums = batches.map((b) => parseInt(b.id.replace(/\D/g, ""), 10)).filter((n) => !isNaN(n));
  const n = (nums.length ? Math.max(...nums) : 0) + 1;
  return "B" + String(n).padStart(3, "0");
}

// Sorted = large + medium. Yield and fine % are relative to the input weight.
export function computeMetrics(b) {
  const sorted = b.weights.large + b.weights.medium;
  return {
    sorted,
    yieldPct: (sorted / b.inputWeight) * 100,
    finePct: (b.weights.debris / b.inputWeight) * 100,
  };
}

// Accuracy (%) = correctly sorted grams / checked grams, summed over the three bins
export function overallAccuracy(bins) {
  let correct = 0;
  let checked = 0;
  ["large", "medium", "debris"].forEach((c) => {
    correct += (bins && bins[c] && bins[c].correct) || 0;
    checked += (bins && bins[c] && bins[c].checked) || 0;
  });
  return checked > 0 ? (correct / checked) * 100 : null;
}

// The DB still has small_weight/fine_weight columns; both fold into "debris"
export function mapDbBatch(row) {
  return {
    id: row.batch_code,
    date: row.date_time,
    beanType: row.bean_type,
    mode: row.mode,
    vibrationSpeed: Number(row.vibration_speed),
    inputWeight: Number(row.input_weight),
    weights: {
      large: Number(row.large_weight),
      medium: Number(row.medium_weight),
      debris: Number(row.small_weight) + Number(row.fine_weight),
    },
    processingTime: Number(row.processing_time),
  };
}

// Round each bin and scale them down if they add up to more than was loaded
export function normalizeBins(bins, target) {
  const rounded = {
    large: Math.round(bins.large),
    medium: Math.round(bins.medium),
    debris: Math.round(bins.debris),
  };
  const sum = rounded.large + rounded.medium + rounded.debris;
  if (sum <= target || sum === 0) return rounded;
  const k = target / sum;
  return {
    large: Math.floor(rounded.large * k),
    medium: Math.floor(rounded.medium * k),
    debris: Math.floor(rounded.debris * k),
  };
}

/* ---------------- inventory and accuracy ---------------- */

const emptyBins = () => ({ large: 0, medium: 0, debris: 0 });

export function inventoryFromRows(rows) {
  const next = { Arabica: emptyBins(), Robusta: emptyBins() };
  rows.forEach((r) => {
    const bins = next[r.bean_type];
    if (!bins) return;
    const kg = Number(r.quantity_kg);
    if (r.category === "large") bins.large = kg;
    else if (r.category === "medium") bins.medium = kg;
    else bins.debris += kg; // old "small" and "fine" rows fold into debris
  });
  return next;
}

export function accuracyFromRows(rows) {
  const next = {};
  rows.forEach((r) => {
    if (!next[r.batch_code]) next[r.batch_code] = {};
    next[r.batch_code][r.bin_name] = {
      checked: Number(r.beans_checked),
      correct: Number(r.correctly_sorted),
    };
  });
  return next;
}

/* ---------------- network ---------------- */

export async function getJson(path) {
  const res = await fetch(`${API_BASE}/${path}`);
  if (!res.ok) throw new Error(`${path} failed`);
  return res.json();
}

export function postJson(path, body) {
  return fetch(`${API_BASE}/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).then((r) => r.json());
}