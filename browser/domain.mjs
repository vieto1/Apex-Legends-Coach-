// Pure, evidence-linked event rules for the browser runtime.
export function detect(samples) {
  const events = [];
  let baseline = null,
    lastCombat = -100,
    movement = [],
    last = -1;
  const add = (kind, start, end, title, evidence, advice, confidence) =>
    events.push({ kind, start, end, title, evidence, advice, confidence });
  const flush = () => {
    if (movement.length >= 3)
      add(
        "position_change",
        movement[0].t,
        movement.at(-1).t,
        "Möglicher Positionswechsel",
        {
          motion_px: movement.map((s) => s.minimap_motion),
          source: "browser minimap translation estimate",
          limitation:
            "Map rotation, zoom, overlays and spectator views can mimic movement; no world coordinates",
        },
        "Prüft die Route: Welche Deckung und welcher Rückweg waren verfügbar?",
        0.4,
      );
    movement = [];
  };
  let previous = null;
  for (const o of samples) {
    if (!Number.isFinite(o.t) || o.t <= last)
      throw Error("Ungeordnete Videozeitpunkte");
    const gap = o.t - last;
    last = o.t;
    if (o.scene_cut || gap > 3) {
      baseline = null;
      flush();
    }
    if (o.scene_cut) {
      previous = o;
      continue;
    }
    if (
      o.damage !== null &&
      o.damage !== undefined &&
      o.damage_confidence >= 0.65
    ) {
      if (baseline && o.t - baseline.t <= 3) {
        const delta = o.damage - baseline.damage;
        if (delta > 0 && delta <= 300) {
          const evidence = {
            counter_before: baseline.damage,
            counter_after: o.damage,
            damage_delta: delta,
            sample_start: baseline.t,
            sample_end: o.t,
            source: "local browser OCR",
            limitation: "OCR counter delta; damage received and target unknown",
          };
          if (o.t - lastCombat > 8)
            add(
              "combat_start",
              baseline.t,
              o.t,
              "Möglicher Kampfbeginn",
              evidence,
              "Clip prüfen: War Deckung verfügbar und das Team bereit?",
              Math.min(0.85, o.damage_confidence),
            );
          add(
            "damage_delta",
            baseline.t,
            o.t,
            `+${delta} abgelesener Schaden`,
            evidence,
            "Prüft den Trade gemeinsam. Eingehender Schaden ist hier unbekannt.",
            o.damage_confidence,
          );
          lastCombat = o.t;
        }
      }
      baseline = o;
    } else baseline = null;
    if (o.minimap_motion != null && o.minimap_motion > 1.8) movement.push(o);
    else flush();
    if (previous && !previous.scene_cut && o.t - previous.t <= 3) {
      for (const [resource, label] of [
        ["health", "Gesundheit"],
        ["shield", "Schild"],
      ]) {
        const before = previous[resource],
          after = o[resource];
        if (before == null || after == null) continue;
        const delta = after - before;
        if (Math.abs(delta) >= 0.15)
          add(
            delta < 0 ? "resource_loss" : "resource_recovery",
            previous.t,
            o.t,
            `${label}: mögliche ${delta < 0 ? "Abnahme" : "Wiederherstellung"}`,
            {
              resource,
              before_fraction: before,
              after_fraction: after,
              source: "calibrated browser HUD bar",
              limitation:
                "Visible relative bar occupancy; exact HP, armor swap and occlusion unknown",
            },
            delta < 0
              ? "Prüfen: War Deckung erreichbar und wäre Heilen oder ein Schildwechsel sinnvoll gewesen?"
              : "War das Zeitfenster zum Auffüllen der Ressourcen abgesichert?",
            0.5,
          );
      }
      if (
        o.ammo != null &&
        previous.ammo != null &&
        Math.min(o.ammo_confidence, previous.ammo_confidence) >= 0.65 &&
        o.ammo - previous.ammo >= 5
      )
        add(
          "ammo_refill",
          previous.t,
          o.t,
          "Mögliches Nachladen / Waffenwechsel",
          {
            ammo_before: previous.ammo,
            ammo_after: o.ammo,
            source: "local browser OCR",
            limitation: "Weapon changes can mimic reloads",
          },
          "Prüfen: War das Nachladen gedeckt oder wäre ein Waffenwechsel schneller gewesen?",
          0.5,
        );
    }
    previous = o;
  }
  flush();
  const signals = events
    .filter((e) => ["damage_delta", "resource_loss"].includes(e.kind))
    .sort((a, b) => a.start - b.start);
  const groups = [];
  for (const e of signals) {
    if (!groups.length || e.start - groups.at(-1).at(-1).end > 8)
      groups.push([e]);
    else groups.at(-1).push(e);
  }
  for (const group of groups) {
    const start = group[0].start,
      end = group.at(-1).end;
    add(
      "fight",
      start,
      end,
      "Kampfphase zum Review",
      {
        observed_outgoing_damage: group
          .filter((e) => e.kind === "damage_delta")
          .reduce((n, e) => n + e.evidence.damage_delta, 0),
        resource_loss_signals: group.filter((e) => e.kind === "resource_loss")
          .length,
        source: "grouped HUD signals",
        limitation:
          "Incomplete counter observations; exact trade, enemies and outcome unknown",
      },
      "Gemeinsam prüfen: Einstieg, Fokusziel, Deckung, Rückzug und Ressourcen. Was war die erste vermeidbare Entscheidung?",
      0.55,
    );
    const low = samples.find(
      (o) =>
        o.t >= start &&
        o.t <= end &&
        o.health != null &&
        o.health <= 0.35 &&
        !o.scene_cut,
    );
    if (low)
      add(
        "low_health_fight",
        low.t,
        low.t,
        "Niedriger Lebensbalken in einer Kampfphase",
        {
          health_fraction: low.health,
          fight_window: [start, end],
          source: "calibrated bar",
          limitation: "No exact HP or tactical mistake classification",
        },
        "Hier pausieren: Druck halten, zurückziehen oder Ressourcen auffüllen — welche Option war begründbar?",
        0.45,
      );
  }
  const losses = events.filter((e) => e.kind === "resource_loss");
  for (const e of events.filter((e) => e.kind === "position_change")) {
    const overlap = losses.filter((l) => l.start <= e.end && l.end >= e.start);
    if (overlap.length)
      add(
        "exposure_review",
        e.start,
        e.end,
        "Ressourcenverlust während möglicher Bewegung",
        {
          movement_window: [e.start, e.end],
          resource_loss_windows: overlap.map((l) => [l.start, l.end]),
          source: "overlapping HUD observations",
          limitation:
            "Overlap does not prove incoming fire or poor positioning",
        },
        "Gab es auf dieser Route eine kürzere Strecke zwischen Deckungen oder einen sicheren Rückweg?",
        0.4,
      );
  }
  for (const e of events.filter((e) => e.kind === "ammo_refill")) {
    const near = losses.filter(
      (l) => l.start <= e.end + 2 && l.end >= e.start - 2,
    );
    if (near.length)
      add(
        "reload_pressure",
        Math.max(0, e.start - 2),
        Math.min(samples.at(-1).t, e.end + 2),
        "Munitionsauffüllung nahe Ressourcenverlust",
        {
          ammo_window: [e.start, e.end],
          resource_loss_windows: near.map((l) => [l.start, l.end]),
          source: "neighboring HUD signals",
          limitation: "Reload and incoming damage not confirmed",
        },
        "Hätte Deckung vor dem Nachladen oder die Zweitwaffe die Situation verbessert?",
        0.4,
      );
  }
  return events.sort(
    (a, b) => a.start - b.start || a.kind.localeCompare(b.kind),
  );
}
export function summarize(samples, events) {
  return {
    sample_count: samples.length,
    damage_readable_fraction:
      samples.filter((o) => o.damage != null && o.damage_confidence >= 0.65)
        .length / Math.max(1, samples.length),
    scene_cuts: samples.filter((o) => o.scene_cut).length,
    ocr_timeout_count: samples.reduce(
      (n, o) =>
        n + (o.issues || []).filter((i) => i.includes("timeout")).length,
      0,
    ),
    fight_count: events.filter((e) => e.kind === "fight").length,
    observed_outgoing_damage: events
      .filter((e) => e.kind === "damage_delta")
      .reduce((n, e) => n + e.evidence.damage_delta, 0),
  };
}
export function reviewMetrics(match) {
  const events = match.events || [];
  let enemy = null;
  const intervals = [];
  for (const e of events
    .filter((e) => e.origin === "manual" && e.review !== "dismissed")
    .sort((a, b) => a.start - b.start)) {
    if (e.kind === "enemy_visible") enemy = e;
    else if (e.kind === "first_shot" && enemy) {
      const seconds = e.start - enemy.start;
      if (seconds >= 0 && seconds <= 30)
        intervals.push({
          start: enemy.start,
          end: e.start,
          seconds: Number(seconds.toFixed(3)),
          source: "manual video annotations",
        });
      enemy = null;
    }
  }
  return {
    confirmed: events.filter((e) => e.review === "confirmed").length,
    dismissed: events.filter((e) => e.review === "dismissed").length,
    unreviewed: events.filter((e) => !e.review || e.review === "unreviewed")
      .length,
    manual_response_intervals: intervals,
  };
}
export function validateProfile(p) {
  if (!p || typeof p !== "object" || Array.isArray(p))
    throw Error("Ungültiges HUD-Profil");
  const allowed = [
    "damage_roi",
    "minimap_roi",
    "health_roi",
    "shield_roi",
    "ammo_roi",
  ];
  const result = Object.fromEntries(allowed.map((k) => [k, null]));
  for (const [key, v] of Object.entries(p)) {
    if (!allowed.includes(key)) throw Error("Unbekannter HUD-Bereich");
    if (
      v !== null &&
      (!Array.isArray(v) ||
        v.length !== 4 ||
        v.some((n) => !Number.isFinite(n)) ||
        v[0] < 0 ||
        v[1] < 0 ||
        v[2] < 0.01 ||
        v[3] < 0.01 ||
        v[0] + v[2] > 1 ||
        v[1] + v[3] > 1)
    )
      throw Error("HUD-Bereich liegt außerhalb des Bildes");
    result[key] = v;
  }
  return result;
}
