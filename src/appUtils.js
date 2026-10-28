import { API_BASE, API_TOKEN } from "./appConstants.js";

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

// Keep the higher of two batch ids. A database response can arrive after a
// newer id has already been handed out, and reusing an id would make the
// next save fail with a duplicate batch code.
export function latestBatchId(current, candidate) {
  const number = (id) => parseInt(String(id).replace(/\D/g, ""), 10) || 0;
  return number(candidate) > number(current) ? candidate : current;
}

// A confirmed setup is bound to one batch. If the operator changes the bean,
// target, or mode afterwards, the confirmation no longer describes the run
// and the dashboard must send them back through the wizard.
export function setupMatches(snapshot, machine) {
  if (!snapshot || !machine) return false;
  return (
    snapshot.beanType === machine.beanType &&
    Number(snapshot.inputTarget) === Number(machine.inputTarget) &&
    snapshot.mode === machine.mode
  );
}

// Stock is only known when the inventory call succeeded. "short" blocks the
// setup step; "unknown" lets the operator continue with a warning.
export function setupStockState({ stockKnown = true, onHand = 0, target = 0 } = {}) {
  if (!stockKnown) return "unknown";
  return Number(onHand) >= Number(target) ? "ok" : "short";
}

// Maps a row from get_batches.php into the shape the UI uses.
// small_weight and fine_weight both fold into "debris", the bottom-deck fine stream.
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
    source: row.source === "simulated" ? "simulated" : "hardware",
    status: row.status || "Completed",
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

// Recovered = top (large) + bottom (medium). Loss = input - recovered.
export function sortingLoss(inputWeight, large, medium) {
  const recovered = large + medium;
  const lossG = inputWeight - recovered;
  return {
    recovered,
    lossG,
    lossPct: inputWeight > 0 ? (lossG / inputWeight) * 100 : 0,
  };
}

/* ---------------- network ---------------- */

function authHeaders(extra = {}) {
  return API_TOKEN ? { ...extra, "X-BeanTrack-Token": API_TOKEN } : extra;
}

// GET a JSON endpoint. Throws an Error that carries the server's message when there is one.
export async function getJson(path) {
  let res;
  try {
    res = await fetch(`${API_BASE}/${path}`, { headers: authHeaders() });
  } catch {
    throw new Error("Cannot reach the database server. Check that XAMPP is running.");
  }
  const text = await res.text();
  let data = null;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`${path}: server returned a non-JSON response (HTTP ${res.status}).`);
  }
  if (!res.ok) throw new Error(data?.error || `${path}: HTTP ${res.status}.`);
  return data;
}

// POST JSON. Always resolves to an object with success and, on failure, error.
export async function postJson(path, body) {
  let res;
  try {
    res = await fetch(`${API_BASE}/${path}`, {
      method: "POST",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(body),
    });
  } catch {
    return { success: false, error: "Cannot reach the database server. Check that XAMPP is running." };
  }

  const text = await res.text();
  try {
    const data = JSON.parse(text);
    if (!res.ok) return { success: false, error: data.error || `Server error (HTTP ${res.status}).` };
    return data;
  } catch {
    return { success: false, error: `Server returned an invalid response (HTTP ${res.status}).` };
  }
}
