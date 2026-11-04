import test from "node:test";
import assert from "node:assert/strict";
import {
  detect,
  summarize,
  reviewMetrics,
  validateProfile,
} from "./domain.mjs";
const sample = (t, damage = null, extra = {}) => ({
  t,
  damage,
  damage_confidence: 0.9,
  ammo: null,
  minimap_motion: null,
  health: null,
  shield: null,
  scene_cut: false,
  issues: [],
  ...extra,
});
test("counter delta, gaps and combat debounce", () => {
  const events = detect([
    sample(0, 100),
    sample(1, 120),
    sample(2, 140),
    sample(12, 140),
    sample(13, 155),
  ]);
  assert.deepEqual(
    events
      .filter((e) => e.kind === "damage_delta")
      .map((e) => e.evidence.damage_delta),
    [20, 20, 15],
  );
  assert.equal(events.filter((e) => e.kind === "combat_start").length, 2);
});
test("unknown samples, jumps and resets do not invent damage", () =>
  assert.deepEqual(
    detect([
      sample(0, 100),
      sample(1),
      sample(2, 160),
      sample(3, 800),
      sample(4, 0),
      sample(9, 50),
    ]),
    [],
  ));
test("scene cuts and low-confidence readings break the baseline", () => {
  assert.deepEqual(
    detect([
      sample(0, 100),
      sample(1, 150, { scene_cut: true }),
      sample(2, 150),
    ]),
    [],
  );
  assert.deepEqual(
    detect([
      sample(0, 100),
      sample(1, 150, { damage_confidence: 0.2 }),
      sample(2, 160),
    ]),
    [],
  );
});
test("sustained minimap signal is required", () => {
  assert.deepEqual(
    detect([
      sample(0, null, { minimap_motion: 3 }),
      sample(1, null, { minimap_motion: 3 }),
    ]),
    [],
  );
  assert.equal(
    detect([0, 1, 2].map((t) => sample(t, null, { minimap_motion: 3 })))[0]
      .kind,
    "position_change",
  );
});
test("resources, reload and contextual findings retain time evidence", () => {
  const observations = [0, 1, 2, 3].map((t) =>
    sample(t, t < 2 ? 100 : 140, {
      minimap_motion: 3,
      health: t < 2 ? 1 : 0.25,
      shield: t < 2 ? 1 : 0.5,
      ammo: t < 2 ? 5 : 20,
      ammo_confidence: 0.9,
    }),
  );
  const events = detect(observations);
  for (const kind of [
    "resource_loss",
    "ammo_refill",
    "fight",
    "exposure_review",
    "reload_pressure",
    "low_health_fight",
  ])
    assert(events.some((e) => e.kind === kind));
  assert.equal(summarize(observations, events).observed_outgoing_damage, 40);
  assert(events.every((e) => e.start >= 0 && e.end <= 3));
});
test("manually annotated intervals omit dismissed events", () => {
  const base = { origin: "manual", review: "confirmed" };
  const m = {
    events: [
      { ...base, kind: "enemy_visible", start: 1 },
      { ...base, kind: "first_shot", start: 1.75 },
      { ...base, kind: "enemy_visible", start: 3, review: "dismissed" },
      { ...base, kind: "first_shot", start: 4 },
    ],
  };
  assert.equal(reviewMetrics(m).manual_response_intervals[0].seconds, 0.75);
  assert.equal(reviewMetrics(m).manual_response_intervals.length, 1);
});
test("profile validation rejects invalid and unknown rectangles", () => {
  assert.throws(() => validateProfile({ damage_roi: [0.9, 0, 0.5, 1] }));
  assert.throws(() => validateProfile({ other: [0, 0, 1, 1] }));
  assert.throws(() => validateProfile(null));
  assert.equal(validateProfile({}).health_roi, null);
});
