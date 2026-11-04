const browserBackend =
  document.documentElement.dataset.runtime === "browser"
    ? new (await import("./browser/client.js")).BrowserBackend()
    : null;
const $ = (id) => document.getElementById(id);
const keys = [
  "damage_roi",
  "minimap_roi",
  "health_roi",
  "shield_roi",
  "ammo_roi",
];
const names = {
  damage_roi: "Schadenszähler",
  minimap_roi: "Minimap",
  health_roi: "Gesundheit",
  shield_roi: "Schild",
  ammo_roi: "Munition",
};
const blank = () => Object.fromEntries(keys.map((k) => [k, null]));
let selected = null,
  current = null,
  objectUrl = null,
  profile = blank(),
  mode = "damage_roi",
  origin = null,
  snapshot = null;
let lastMatch = null,
  rendered = "",
  savedProfiles = [],
  recording = null,
  editingEvent = null;
const statusNames = {
  queued: "Wartet",
  analyzing: "Wird analysiert",
  ready: "Bereit",
  failed: "Fehlgeschlagen",
  unreviewed: "Ungeprüft",
  confirmed: "Bestätigt",
  dismissed: "Verworfen",
};
const time = (t) =>
  `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`;
const text = (tag, value, cls) => {
  const e = document.createElement(tag);
  e.textContent = value;
  if (cls) e.className = cls;
  return e;
};
async function api(url, options) {
  if (browserBackend) return browserBackend.request(url, options);
  const r = await fetch(url, options);
  if (!r.ok) {
    let msg;
    try {
      msg = (await r.json()).detail;
    } catch {
      msg = r.statusText;
    }
    throw new Error(typeof msg === "string" ? msg : JSON.stringify(msg));
  }
  return r.status === 204 ? null : r.json();
}
function configureDownload(element, mid, kind, eid) {
  const paths = {
    report: `/api/matches/${mid}/report`,
    export: `/api/matches/${mid}/export`,
    source: `/api/matches/${mid}/source`,
    clip: `/api/matches/${mid}/clips/${eid}`,
  };
  if (!browserBackend) {
    element.href = paths[kind];
    return;
  }
  element.href = "#";
  element.onclick = async (e) => {
    e.preventDefault();
    if (element.dataset.busy) return;
    const original = element.textContent;
    element.dataset.busy = "true";
    element.textContent =
      kind === "clip"
        ? "Clip wird in Echtzeit exportiert …"
        : "Download wird vorbereitet …";
    try {
      const { blob, name } = await browserBackend.download(mid, kind, eid);
      const url = URL.createObjectURL(blob),
        a = document.createElement("a");
      a.href = url;
      a.download = name;
      a.hidden = true;
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (err) {
      report(err);
    } finally {
      delete element.dataset.busy;
      element.textContent = original;
    }
  };
}
async function videoUrl(mid) {
  return browserBackend
    ? browserBackend.videoUrl(mid)
    : `/api/matches/${mid}/video`;
}
function report(err, target = "actionStatus") {
  $(target).textContent = err.message;
}
function profileValue() {
  const p = JSON.parse($("roiJson").value);
  if (!p || Array.isArray(p) || typeof p !== "object")
    throw new Error("HUD-Profil muss ein JSON-Objekt sein.");
  for (const [k, v] of Object.entries(p)) {
    if (!keys.includes(k)) throw new Error("Unbekanntes HUD-Feld: " + k);
    if (
      v !== null &&
      (!Array.isArray(v) ||
        v.length !== 4 ||
        v.some((n) => typeof n !== "number" || !Number.isFinite(n)) ||
        v[0] < 0 ||
        v[1] < 0 ||
        v[2] < 0.01 ||
        v[3] < 0.01 ||
        v[0] + v[2] > 1 ||
        v[1] + v[3] > 1)
    )
      throw new Error("Ungültiger Bereich: " + k);
  }
  return { ...blank(), ...p };
}
function fileSelected() {
  if (objectUrl) URL.revokeObjectURL(objectUrl);
  const file = $("file").files[0];
  if (!file) return;
  objectUrl = URL.createObjectURL(file);
  $("calibrationVideo").src = objectUrl;
  $("downloadRecording").hidden = false;
  $("downloadRecording").href = objectUrl;
  $("downloadRecording").download = file.name;
  snapshot = null;
  $("calibrationCanvas").classList.remove("active");
  renderRoi();
}
$("file").onchange = fileSelected;
function renderRoi() {
  $("roiStatus").textContent = keys
    .map(
      (k) =>
        `${names[k]}: ${profile[k] ? profile[k].map((x) => x.toFixed(3)).join(", ") : "unbekannt"}`,
    )
    .join(" · ");
  $("roiJson").value = JSON.stringify(profile, null, 2);
  const c = $("calibrationCanvas"),
    ctx = c.getContext("2d");
  if (!snapshot) return;
  ctx.putImageData(snapshot, 0, 0);
  keys.forEach((k, i) => {
    const v = profile[k];
    if (!v) return;
    ctx.strokeStyle = ["#c5f078", "#77caff", "#ff8b8b", "#dba3ff", "#ffdc7a"][
      i
    ];
    ctx.lineWidth = 3;
    ctx.strokeRect(
      v[0] * c.width,
      v[1] * c.height,
      v[2] * c.width,
      v[3] * c.height,
    );
    ctx.font = "18px sans-serif";
    ctx.fillStyle = ctx.strokeStyle;
    ctx.fillText(names[k], v[0] * c.width, Math.max(20, v[1] * c.height - 5));
  });
}
$("capture").onclick = () => {
  const v = $("calibrationVideo"),
    c = $("calibrationCanvas");
  if (!v.videoWidth) {
    $("roiStatus").textContent = "Zuerst ein lesbares Video auswählen.";
    return;
  }
  v.pause();
  c.width = v.videoWidth;
  c.height = v.videoHeight;
  c.getContext("2d").drawImage(v, 0, 0);
  snapshot = c.getContext("2d").getImageData(0, 0, c.width, c.height);
  c.classList.add("active");
  renderRoi();
};
for (const [id, key] of [
  ["damageMode", "damage_roi"],
  ["mapMode", "minimap_roi"],
  ["healthMode", "health_roi"],
  ["shieldMode", "shield_roi"],
  ["ammoMode", "ammo_roi"],
])
  $(id).onclick = () => {
    mode = key;
    $("roiStatus").textContent =
      `${names[key]} im Bild aufziehen. Alternativ Koordinaten im JSON-Feld eintragen.`;
  };
$("clearRoi").onclick = () => {
  profile = blank();
  renderRoi();
};
$("applyRoi").onclick = () => {
  try {
    profile = profileValue();
    renderRoi();
  } catch (err) {
    report(err, "roiStatus");
  }
};
function point(e) {
  const r = $("calibrationCanvas").getBoundingClientRect();
  return [
    Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)),
    Math.max(0, Math.min(1, (e.clientY - r.top) / r.height)),
  ];
}
$("calibrationCanvas").onpointerdown = (e) => {
  origin = point(e);
  e.currentTarget.setPointerCapture(e.pointerId);
};
$("calibrationCanvas").onpointerup = (e) => {
  if (!origin) return;
  const p = point(e),
    roi = [
      Math.min(origin[0], p[0]),
      Math.min(origin[1], p[1]),
      Math.abs(origin[0] - p[0]),
      Math.abs(origin[1] - p[1]),
    ];
  origin = null;
  if (roi[2] >= 0.01 && roi[3] >= 0.01) profile[mode] = roi;
  renderRoi();
};
$("calibrationCanvas").onpointercancel = () => {
  origin = null;
};
async function loadProfiles() {
  savedProfiles = await api("/api/profiles");
  $("profileSelect").replaceChildren(new Option("Profil auswählen", ""));
  for (const p of savedProfiles)
    $("profileSelect").append(new Option(p.name, p.id));
}
$("saveProfile").onclick = async () => {
  try {
    profile = profileValue();
    const r = await api("/api/profiles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: $("profileName").value, profile }),
    });
    await loadProfiles();
    $("profileSelect").value = r.id;
    $("roiStatus").textContent = "HUD-Profil gespeichert.";
  } catch (err) {
    report(err, "roiStatus");
  }
};
$("loadProfile").onclick = () => {
  const p = savedProfiles.find((p) => p.id === $("profileSelect").value);
  if (p) {
    profile = { ...blank(), ...p.profile };
    renderRoi();
  }
};
$("deleteProfile").onclick = async () => {
  const id = $("profileSelect").value;
  if (!id) return;
  try {
    await api(`/api/profiles/${id}`, { method: "DELETE" });
    await loadProfiles();
  } catch (err) {
    report(err, "roiStatus");
  }
};
$("upload").onsubmit = async (e) => {
  e.preventDefault();
  $("submit").disabled = true;
  try {
    profile = profileValue();
    const file = $("file").files[0];
    if (!file) throw new Error("Video auswählen.");
    if (file.size > 2 * 1024 ** 3) throw new Error("Maximal 2 GiB pro Video.");
    $("uploadStatus").textContent = browserBackend
      ? "Video wird lokal gespeichert …"
      : "Video wird hochgeladen …";
    const form = new FormData();
    form.append("file", file);
    form.append("profile", JSON.stringify(profile));
    const result = await api("/api/matches", { method: "POST", body: form });
    selected = result.id;
    current = null;
    cancelEdit();
    $("uploadStatus").textContent =
      "Aufnahme gespeichert. Analyse läuft lokal.";
    await refresh();
  } catch (err) {
    report(err, "uploadStatus");
  } finally {
    $("submit").disabled = false;
  }
};
$("recordStart").onclick = async () => {
  let stream, timer;
  $("recordStart").disabled = true;
  try {
    if (!navigator.mediaDevices?.getDisplayMedia || !window.MediaRecorder)
      throw new Error(
        "Bildschirmaufnahme wird hier nicht unterstützt. Lokal über localhost in Chrome/Edge öffnen oder eine OBS-Datei hochladen.",
      );
    stream = await navigator.mediaDevices.getDisplayMedia({
      video: { frameRate: 30 },
      audio: true,
    });
    const mime = [
      "video/webm;codecs=vp9,opus",
      "video/webm;codecs=vp8,opus",
      "video/webm",
    ].find((t) => MediaRecorder.isTypeSupported(t));
    const recorder = new MediaRecorder(
      stream,
      mime ? { mimeType: mime, videoBitsPerSecond: 6000000 } : undefined,
    );
    let chunks = [],
      size = 0;
    const started = Date.now();
    timer = setInterval(() => {
      $("recordStatus").textContent =
        `Aufnahme läuft · ${Math.floor((Date.now() - started) / 1000)} s · ${(size / 1024 ** 2).toFixed(1)} MiB`;
      if (Date.now() - started > 7200000 && recorder.state === "recording")
        recorder.stop();
    }, 1000);
    recording = recorder;
    recorder.ondataavailable = (e) => {
      if (e.data.size) {
        chunks.push(e.data);
        size += e.data.size;
        if (size > 1900 * 1024 ** 2 && recorder.state === "recording")
          recorder.stop();
      }
    };
    recorder.onerror = () => {
      $("recordStatus").textContent =
        "Aufnahmefehler. Vorhandene Daten werden gesichert.";
      if (recorder.state === "recording") recorder.stop();
    };
    recorder.onstop = () => {
      clearInterval(timer);
      stream.getTracks().forEach((t) => t.stop());
      recording = null;
      $("recordStart").disabled = false;
      $("recordStop").disabled = true;
      if (size) {
        const file = new File(
          chunks,
          `Apex-Aufnahme-${new Date().toISOString().replace(/[:.]/g, "-")}.webm`,
          { type: recorder.mimeType },
        );
        const dt = new DataTransfer();
        dt.items.add(file);
        $("file").files = dt.files;
        fileSelected();
        $("recordStatus").textContent =
          "Aufnahme bereit. HUD kalibrieren und „Aufnahme analysieren“ wählen.";
      } else $("recordStatus").textContent = "Keine Videodaten aufgenommen.";
      chunks = [];
    };
    stream.getVideoTracks()[0].onended = () => {
      if (recorder.state === "recording") recorder.stop();
    };
    recorder.start(1000);
    $("recordStart").disabled = true;
    $("recordStop").disabled = false;
  } catch (err) {
    if (timer) clearInterval(timer);
    stream?.getTracks().forEach((t) => t.stop());
    recording = null;
    $("recordStart").disabled = false;
    $("recordStop").disabled = true;
    report(err, "recordStatus");
  }
};
$("recordStop").onclick = () => {
  if (recording?.state === "recording") recording.stop();
};
window.addEventListener("beforeunload", (e) => {
  if (recording) {
    e.preventDefault();
    e.returnValue = "";
  }
});
function seek(t, end) {
  const v = $("player");
  v.currentTime = Math.max(0, t);
  v.play().catch(() => {});
  v.ontimeupdate = () => {
    if (end !== undefined && v.currentTime >= end) {
      v.pause();
      v.ontimeupdate = null;
    }
  };
}
function renderEvents(m) {
  $("events").replaceChildren();
  const kind = $("eventFilter").value,
    review = $("reviewFilter").value;
  const events = m.events.filter(
    (e) =>
      (!kind ||
        (kind === "manual" ? e.origin === "manual" : e.kind === kind)) &&
      (!review || (e.review || "unreviewed") === review),
  );
  if (!events.length)
    $("events").append(
      text(
        "p",
        "Keine passenden Ereignisse. Fehlende Signale sind kein Beleg für fehlerfreies Spiel. HUD-Sichtbarkeit und Filter prüfen.",
        "muted",
      ),
    );
  for (const e of events) {
    const card = text("article", "", "event");
    const state = e.review || "unreviewed";
    if (state === "dismissed") card.classList.add("dismissed");
    card.append(
      text(
        "span",
        `${time(e.start)}–${time(e.end)} · ${e.origin === "manual" ? "Manuell markiert" : Math.round(e.confidence * 100) + " % Heuristik"} · ${statusNames[state] || state}`,
        "badge",
      ),
      text("h4", e.title),
      text("p", e.advice),
    );
    const actions = text("div", "", "actions"),
      b = text("button", "Moment ansehen");
    b.onclick = () =>
      seek(Math.max(0, e.start - 3), Math.min(m.duration, e.end + 4));
    const a = text("a", "Clip herunterladen ↗");
    configureDownload(a, m.id, "clip", e.id);
    actions.append(b, a);
    const select = document.createElement("select");
    select.setAttribute("aria-label", `Review-Status: ${e.title}`);
    for (const [value, label] of [
      ["unreviewed", "Ungeprüft"],
      ["confirmed", "Bestätigt"],
      ["dismissed", "Verworfen"],
    ])
      select.append(new Option(label, value));
    select.value = state;
    select.disabled = ["queued", "analyzing"].includes(m.status);
    select.onchange = async () => {
      try {
        await api(`/api/matches/${m.id}/events/${e.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ review: select.value }),
        });
        await refresh();
      } catch (err) {
        report(err);
      }
    };
    actions.append(select);
    if (e.origin === "manual") {
      const edit = text("button", "Bearbeiten");
      edit.onclick = () => {
        editingEvent = e.id;
        $("manualKind").value = e.kind;
        $("eventStart").value = e.start;
        $("eventEnd").value = e.end;
        $("eventTitle").value = e.title;
        $("eventAdvice").value = e.advice;
        $("saveMoment").textContent = "Moment aktualisieren";
        $("cancelMoment").hidden = false;
        $("eventForm").closest("details").open = true;
        $("eventForm").scrollIntoView({ behavior: "smooth" });
      };
      actions.append(edit);
    }
    const del = text("button", "Markierung löschen");
    del.onclick = async () => {
      if (
        !confirm(
          "Diesen Befund löschen? Automatische Befunde können bei erneuter Analyse wieder erscheinen.",
        )
      )
        return;
      try {
        await api(`/api/matches/${m.id}/events/${e.id}`, { method: "DELETE" });
        if (editingEvent === e.id) cancelEdit();
        await refresh();
      } catch (err) {
        report(err);
      }
    };
    actions.append(del);
    const details = document.createElement("details");
    details.append(
      text("summary", "Belege & Grenzen"),
      text("pre", JSON.stringify(e.evidence, null, 2), "evidence"),
    );
    card.append(actions, details);
    $("events").append(card);
  }
}
$("eventFilter").onchange = $("reviewFilter").onchange = () => {
  if (lastMatch) renderEvents(lastMatch);
};
async function refresh() {
  const matches = await api("/api/matches");
  $("matches").replaceChildren();
  const query = $("matchSearch").value.toLowerCase();
  for (const m of matches.filter((m) => m.name.toLowerCase().includes(query))) {
    const b = text("button", m.name, "match");
    if (m.id === selected) b.classList.add("selected");
    b.append(
      text(
        "small",
        `${statusNames[m.status] || m.status} · ${Math.round(m.progress * 100)} %`,
      ),
    );
    b.onclick = () => {
      selected = m.id;
      current = null;
      rendered = "";
      cancelEdit();
      refresh().catch((err) => report(err));
    };
    $("matches").append(b);
  }
  if (!matches.length)
    $("matches").append(text("p", "Noch keine Aufnahmen.", "muted"));
  if (!selected) return;
  const id = selected,
    m = await api(`/api/matches/${id}`);
  if (selected !== id) return;
  lastMatch = m;
  $("empty").hidden = true;
  $("review").hidden = false;
  $("matchName").textContent = m.name;
  $("analysisStatus").textContent =
    m.status === "failed"
      ? `Fehler: ${m.error} · Nach Kalibrierung erneut analysieren.`
      : m.status === "ready"
        ? "Analyse abgeschlossen · Signale im Video prüfen."
        : `Analyse: ${Math.round(m.progress * 100)} % · Video wird lokal vorbereitet / ausgewertet.`;
  const busy = ["queued", "analyzing"].includes(m.status);
  $("reanalyze").disabled = $("deleteMatch").disabled = busy;
  $("calibrateExisting").disabled = !m.media_ready;
  if (current !== selected) {
    $("player").removeAttribute("src");
    $("player").load();
    current = selected;
  }
  if (m.media_ready && !$("player").getAttribute("src")) {
    const source = await videoUrl(id);
    if (selected !== id) return;
    $("player").src = source;
  }
  $("export").hidden = false;
  configureDownload($("export"), id, "report");
  $("export").download = `apex-${id}.json`;
  configureDownload($("archive"), id, "export");
  configureDownload($("originalVideo"), id, "source");
  const fingerprint = JSON.stringify([
    m.id,
    m.status,
    m.summary,
    m.events,
    m.notes,
  ]);
  if (fingerprint === rendered) return;
  rendered = fingerprint;
  $("stats").replaceChildren();
  const damage = m.events.filter(
    (e) => e.kind === "damage_delta" && e.review !== "dismissed",
  );
  for (const [label, value] of [
    ["Videolänge", time(m.duration)],
    [
      "Kampfphasen",
      m.events.filter((e) => e.kind === "fight" && e.review !== "dismissed")
        .length,
    ],
    [
      "Schadenszuwächse · beobachtet",
      damage.length
        ? damage.reduce((n, e) => n + e.evidence.damage_delta, 0)
        : "unbekannt",
    ],
    [
      "Counter lesbar",
      m.summary.sample_count
        ? Math.round(m.summary.damage_readable_fraction * 100) + " %"
        : "unbekannt",
    ],
  ]) {
    const box = text("div", label, "stat");
    box.prepend(text("strong", String(value)));
    $("stats").append(box);
  }
  $("qualityStatus").textContent = m.summary.sample_count
    ? `${m.summary.sample_count} Stichproben · ${m.summary.scene_cuts || 0} mögliche Bildschnitte · ${m.summary.ocr_timeout_count || 0} OCR-Aufrufe mit Zeitüberschreitung (als unbekannt behandelt). ${m.summary.damage_readable_fraction < 0.5 ? "Schadenszähler in weniger als der Hälfte der Frames lesbar; Schadenssummen sind besonders unvollständig. " : ""}Leere oder verdeckte Balken bleiben unbekannt. Alle Befunde im Clip prüfen.`
    : "Noch keine abgeschlossene Auswertung.";
  renderEvents(m);
  $("notes").replaceChildren();
  for (const n of m.notes) {
    const item = text("div", n.body, "note");
    const b = text("button", time(n.timestamp));
    b.onclick = () => seek(n.timestamp);
    const del = text("button", "Notiz löschen");
    del.onclick = async () => {
      try {
        await api(`/api/matches/${m.id}/notes/${n.id}`, { method: "DELETE" });
        await refresh();
      } catch (err) {
        report(err);
      }
    };
    item.prepend(b);
    item.append(del);
    $("notes").append(item);
  }
  $("responseIntervals").replaceChildren();
  const intervals = m.review_metrics.manual_response_intervals;
  if (intervals.length) {
    $("responseIntervals").append(
      text("h3", "Manuell markierte Antwortintervalle"),
    );
    for (const r of intervals) {
      const b = text(
        "button",
        `${time(r.start)} → ${time(r.end)}: ${r.seconds.toFixed(2)} s`,
      );
      b.onclick = () => seek(r.start, r.end + 2);
      $("responseIntervals").append(b);
    }
    $("responseIntervals").append(
      text(
        "p",
        "Differenz eurer Zeitmarken. Keine automatisch gemessene kognitive Reaktionszeit.",
        "muted",
      ),
    );
  }
}
$("matchSearch").oninput = () => refresh().catch((err) => report(err));
$("calibrateExisting").onclick = async () => {
  if (!lastMatch) return;
  profile = { ...blank(), ...lastMatch.profile };
  snapshot = null;
  $("calibrationCanvas").classList.remove("active");
  $("calibrationVideo").src = await videoUrl(selected);
  $("calibrationDetails").open = true;
  renderRoi();
  $("calibrationDetails").scrollIntoView({ behavior: "smooth" });
};
$("reanalyze").onclick = async () => {
  if (!selected) return;
  if (
    !confirm(
      "Automatische Befunde und ihre Bewertungen werden ersetzt. Eigene Markierungen und Notizen bleiben erhalten. Mit dem aktuell eingestellten HUD-Profil fortfahren?",
    )
  )
    return;
  try {
    profile = profileValue();
    await api(`/api/matches/${selected}/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(profile),
    });
    $("actionStatus").textContent = "Erneute Analyse gestartet.";
    await refresh();
  } catch (err) {
    report(err);
  }
};
$("deleteMatch").onclick = async () => {
  if (
    !selected ||
    !confirm(
      "Aufnahme mit Originalvideo, Clips, Befunden und Notizen dauerhaft löschen?",
    )
  )
    return;
  try {
    await api(`/api/matches/${selected}`, { method: "DELETE" });
    selected = null;
    lastMatch = null;
    current = null;
    rendered = "";
    cancelEdit();
    $("player").removeAttribute("src");
    $("player").load();
    $("review").hidden = true;
    $("empty").hidden = false;
    await refresh();
  } catch (err) {
    report(err);
  }
};
$("useTime").onclick = () => {
  $("noteTime").value = $("player").currentTime.toFixed(2);
};
$("markTime").onclick = () => {
  $("eventStart").value = $("eventEnd").value =
    $("player").currentTime.toFixed(2);
};
function cancelEdit() {
  editingEvent = null;
  $("saveMoment").textContent = "Moment speichern";
  $("cancelMoment").hidden = true;
}
$("cancelMoment").onclick = cancelEdit;
$("eventForm").onsubmit = async (e) => {
  e.preventDefault();
  if (!selected) return;
  try {
    await api(
      `/api/matches/${selected}/events${editingEvent ? "/" + editingEvent : ""}`,
      {
        method: editingEvent ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: $("manualKind").value,
          start: Number($("eventStart").value),
          end: Number($("eventEnd").value),
          title: $("eventTitle").value,
          advice: $("eventAdvice").value,
        }),
      },
    );
    $("eventStatus").textContent = "Moment gespeichert.";
    cancelEdit();
    await refresh();
  } catch (err) {
    report(err, "eventStatus");
  }
};
$("noteForm").onsubmit = async (e) => {
  e.preventDefault();
  if (!selected) return;
  try {
    await api(`/api/matches/${selected}/notes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        timestamp: Number($("noteTime").value),
        body: $("noteBody").value,
      }),
    });
    $("noteBody").value = "";
    $("noteStatus").textContent = "Notiz gespeichert.";
    await refresh();
  } catch (err) {
    report(err, "noteStatus");
  }
};
async function poll() {
  try {
    await refresh();
  } catch (err) {
    report(err, "uploadStatus");
  } finally {
    setTimeout(poll, 5000);
  }
}
renderRoi();
loadProfiles().catch((err) => report(err, "roiStatus"));
poll();

$("tryDemo").onclick = async () => {
  const button = $("tryDemo");
  button.disabled = true;
  $("uploadStatus").textContent = "Beispiel wird vorbereitet …";
  try {
    const result = await api("/api/demo", { method: "POST" });
    selected = result.id;
    current = null;
    rendered = "";
    cancelEdit();
    $("uploadStatus").textContent =
      "Synthetische Demo hinzugefügt. Analyse läuft lokal.";
    await refresh();
  } catch (err) {
    report(err, "uploadStatus");
  } finally {
    button.disabled = false;
  }
};
$("player").onerror = () => {
  $("analysisStatus").textContent =
    "Das Video konnte nicht geladen werden. Aufnahme erneut auswählen oder nach einem Analysefehler erneut analysieren.";
};
if (browserBackend) {
  browserBackend.onStatus = (message) => {
    $("systemStatus").textContent = message;
  };
  $("systemStatus").textContent = browserBackend.status;
} else
  api("/api/health")
    .then((s) => {
      $("systemStatus").textContent = Object.values(s.tools).every(Boolean)
        ? "BEREIT · ANALYSE LOKAL"
        : "Analysewerkzeuge fehlen: " +
          Object.entries(s.tools)
            .filter(([, ok]) => !ok)
            .map(([name]) => name)
            .join(", ");
    })
    .catch(() => {
      $("systemStatus").textContent = "Verbindung zur lokalen Anwendung prüfen";
    });

if (browserBackend)
  for (const element of [$("player"), $("calibrationVideo")])
    element.addEventListener("loadeddata", () => {
      if (
        !Number.isFinite(element.duration) &&
        !element.dataset.fixingDuration
      ) {
        element.dataset.fixingDuration = "true";
        browserBackend
          .normalizeVideo(element)
          .catch((err) => report(err))
          .finally(() => {
            delete element.dataset.fixingDuration;
          });
      }
    });
