import test from "node:test";
import assert from "node:assert/strict";

import {
  clamp,
  fmtTime,
  latestBatchId,
  mapDbBatch,
  nextBatchId,
  normalizeBins,
  setupMatches,
  setupStockState,
  sortingLoss,
} from "./appUtils.js";

test("clamp keeps values inside the range and treats junk as the minimum", () => {
  assert.equal(clamp(50, 0, 100), 50);
  assert.equal(clamp(-5, 0, 100), 0);
  assert.equal(clamp(150, 0, 100), 100);
  assert.equal(clamp(NaN, 0, 100), 0);
  assert.equal(clamp(undefined, 10, 100), 10);
});

test("fmtTime renders mm:ss and does not wrap after an hour", () => {
  assert.equal(fmtTime(0), "00:00");
  assert.equal(fmtTime(65), "01:05");
  assert.equal(fmtTime(59.9), "00:59");
  assert.equal(fmtTime(3600), "60:00");
});

test("nextBatchId increments the highest numeric id", () => {
  assert.equal(nextBatchId([]), "B001");
  assert.equal(nextBatchId([{ id: "B001" }, { id: "B009" }]), "B010");
  assert.equal(nextBatchId([{ id: "B007" }, { id: "not-a-batch" }]), "B008");
});

test("nextBatchId pads to three digits and grows past 999", () => {
  assert.equal(nextBatchId([{ id: "B099" }]), "B100");
  assert.equal(nextBatchId([{ id: "B999" }]), "B1000");
});

test("latestBatchId keeps the highest id so a stale response cannot reuse one", () => {
  assert.equal(latestBatchId("B006", "B005"), "B006");
  assert.equal(latestBatchId("B005", "B006"), "B006");
  assert.equal(latestBatchId("B005", "B005"), "B005");
  assert.equal(latestBatchId("B999", "B1000"), "B1000");
  assert.equal(latestBatchId("B005", "not-a-batch"), "B005");
});

test("setupMatches binds a confirmation to the bean, target, and mode", () => {
  const machine = { beanType: "Arabica", inputTarget: 800, mode: "Automatic" };
  assert.equal(setupMatches({ beanType: "Arabica", inputTarget: 800, mode: "Automatic" }, machine), true);
  assert.equal(setupMatches({ beanType: "Robusta", inputTarget: 800, mode: "Automatic" }, machine), false);
  assert.equal(setupMatches({ beanType: "Arabica", inputTarget: 900, mode: "Automatic" }, machine), false);
  assert.equal(setupMatches({ beanType: "Arabica", inputTarget: 800, mode: "Manual" }, machine), false);
  assert.equal(setupMatches(null, machine), false);
});

test("setupStockState separates unknown stock from a real shortfall", () => {
  assert.equal(setupStockState({ stockKnown: true, onHand: 900, target: 800 }), "ok");
  assert.equal(setupStockState({ stockKnown: true, onHand: 700, target: 800 }), "short");
  assert.equal(setupStockState({ stockKnown: false, onHand: 0, target: 800 }), "unknown");
  assert.equal(setupStockState(), "ok");
});

test("mapDbBatch converts database strings and folds both fine streams into debris", () => {
  const batch = mapDbBatch({
    batch_code: "B012",
    date_time: "2026-10-26 08:00:00",
    bean_type: "Arabica",
    mode: "Automatic",
    vibration_speed: "40.00",
    input_weight: "1000.00",
    large_weight: "410.00",
    medium_weight: "390.00",
    small_weight: "120.00",
    fine_weight: "80.00",
    processing_time: "75",
    source: "simulated",
    status: "Partial",
  });

  assert.deepEqual(batch, {
    id: "B012",
    date: "2026-10-26 08:00:00",
    beanType: "Arabica",
    mode: "Automatic",
    vibrationSpeed: 40,
    inputWeight: 1000,
    weights: { large: 410, medium: 390, debris: 200 },
    processingTime: 75,
    source: "simulated",
    status: "Partial",
  });
});

test("mapDbBatch defaults legacy rows to a completed hardware batch", () => {
  const batch = mapDbBatch({
    batch_code: "B001",
    date_time: "2026-10-19 13:00:00",
    bean_type: "Robusta",
    mode: "Manual",
    vibration_speed: 55,
    input_weight: 500,
    large_weight: 200,
    medium_weight: 180,
    small_weight: 60,
    fine_weight: 40,
    processing_time: 30,
  });

  assert.equal(batch.source, "hardware");
  assert.equal(batch.status, "Completed");
});

test("normalizeBins rounds and leaves an under-target batch alone", () => {
  assert.deepEqual(normalizeBins({ large: 410.4, medium: 389.6, debris: 199.9 }, 1000), {
    large: 410,
    medium: 390,
    debris: 200,
  });
});

test("normalizeBins scales down bins that exceed the input weight", () => {
  const bins = normalizeBins({ large: 500.4, medium: 400.4, debris: 300.4 }, 1000);
  assert.equal(bins.large, 416);
  assert.equal(bins.medium, 333);
  assert.equal(bins.debris, 250);
  assert.ok(bins.large + bins.medium + bins.debris <= 1000);
});

test("normalizeBins handles an empty tally", () => {
  assert.deepEqual(normalizeBins({ large: 0, medium: 0, debris: 0 }, 1000), {
    large: 0,
    medium: 0,
    debris: 0,
  });
});

test("sortingLoss reports recovered grams, loss and percentage", () => {
  assert.deepEqual(sortingLoss(1000, 400, 390), {
    recovered: 790,
    lossG: 210,
    lossPct: 21,
  });
});

test("sortingLoss avoids dividing by zero", () => {
  assert.deepEqual(sortingLoss(0, 0, 0), { recovered: 0, lossG: 0, lossPct: 0 });
});
