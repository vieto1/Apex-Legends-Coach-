import { zipSync, strToU8 } from "fflate";
import { LocalStore } from "./store.mjs";
import {
  detect,
  summarize,
  reviewMetrics,
  validateProfile,
} from "./domain.mjs";
import { BrowserVision } from "./vision.mjs";
const id = () => crypto.randomUUID();
const busy = (m) => ["queued", "analyzing"].includes(m.status);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export class BrowserBackend {
  constructor() {
    this.store = new LocalStore();
    this.urls = new Map();
    this.queue = Promise.resolve();
    this.status = "Lokale OCR wird geladen …";
    this.vision = new BrowserVision((message) => {
      if (!this.blocked) {
        this.status = message;
        this.onStatus?.(message);
      }
    });
    this.initialized = this.initialize();
    this.initialized.catch((e) => {
      this.blocked = true;
      this.status = e.message;
      this.onStatus?.(e.message);
    });
  }
  async initialize() {
    await this.store.open();
    const recover = async () => {
      for (const m of await this.store.all("matches"))
        if (busy(m))
          await this.store.change(m.id, (m) => ({
            ...m,
            status: "failed",
            error:
              "Analyse durch Schließen der Seite unterbrochen. Erneut analysieren.",
          }));
    };
    if (navigator.locks) {
      await new Promise((resolve, reject) => {
        navigator.locks
          .request(
            "apex-review-workspace",
            { ifAvailable: true },
            async (lock) => {
              if (!lock) {
                reject(
                  Error(
                    "Apex Review ist bereits in einem anderen Tab geöffnet. Anderen Tab schließen und diese Seite neu laden.",
                  ),
                );
                return;
              }
              try {
                await recover();
                resolve();
                await new Promise(() => {});
              } catch (e) {
                reject(e);
              }
            },
          )
          .catch(reject);
      });
    } else await recover();
  }
  async match(mid) {
    const m = await this.store.get("matches", mid);
    if (!m) throw Error("Aufnahme nicht gefunden");
    return { ...m, media_ready: true, review_metrics: reviewMetrics(m) };
  }
  async editable(mid) {
    const m = await this.match(mid);
    if (busy(m)) throw Error("Analyse läuft; bitte Abschluss abwarten");
    return m;
  }
  async normalizeVideo(video) {
    if (Number.isFinite(video.duration)) return;
    const at = video.currentTime;
    const p = waitEvent(video, "seeked");
    video.currentTime = 1e10;
    await p;
    if (!Number.isFinite(video.duration))
      throw Error("Videodauer nicht lesbar");
    await seek(video, Math.min(at, video.duration - 0.02));
  }
  async videoUrl(mid) {
    if (!this.urls.has(mid)) {
      const source = await this.store.get("sources", mid);
      if (!source) throw Error("Videodatei nicht vorhanden");
      this.urls.set(mid, URL.createObjectURL(source.blob));
    }
    return this.urls.get(mid);
  }
  enqueue(mid, profile) {
    this.queue = this.queue
      .then(() => this.analyze(mid, profile))
      .catch(async (e) => {
        await this.store.change(mid, (m) => ({
          ...m,
          status: "failed",
          error: e.message,
        }));
      });
  }
  async upload(blob, profile, name = blob.name || "Gameplay") {
    if (!(blob instanceof Blob) || !blob.size)
      throw Error("Videodatei auswählen");
    if (blob.size > 2 * 1024 ** 3) throw Error("Maximal 2 GiB pro Video");
    if ((await this.store.all("matches")).filter(busy).length >= 4)
      throw Error("Analyse-Warteschlange voll");
    const video = await openVideo(blob);
    const duration = video.duration,
      width = video.videoWidth,
      height = video.videoHeight;
    closeVideo(video);
    if (duration > 7200 || width > 3840 || height > 2160)
      throw Error("Video bis 2 Stunden und 3840×2160 erforderlich");
    const mid = id();
    await this.store.put("sources", { id: mid, blob });
    try {
      await this.store.put("matches", {
        id: mid,
        name: name.slice(0, 150),
        duration,
        status: "queued",
        progress: 0,
        error: null,
        profile,
        summary: {},
        events: [],
        notes: [],
        observations: [],
        created: new Date().toISOString(),
      });
    } catch (e) {
      await this.store.remove("sources", mid);
      throw e;
    }
    this.enqueue(mid, profile);
    navigator.storage?.persist?.().catch(() => {});
    return { id: mid };
  }
  async analyze(mid, profile) {
    let video, wake;
    try {
      await this.store.change(mid, (m) => ({
        ...m,
        status: "analyzing",
        progress: 0,
        error: null,
      }));
      const source = await this.store.get("sources", mid);
      video = await openVideo(source.blob);
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      const observations = [];
      this.vision.reset();
      if (Object.values(profile).some(Boolean)) await this.vision.ready;
      try {
        wake = await navigator.wakeLock?.request("screen");
      } catch {}
      for (let second = 0; second < Math.ceil(video.duration); second++) {
        await seek(video, Math.min(second, video.duration - 0.02));
        ctx.drawImage(video, 0, 0);
        observations.push(await this.vision.observe(canvas, second, profile));
        if (second % 2 === 0)
          await this.store.change(mid, (m) => ({
            ...m,
            progress: second / video.duration,
          }));
        await sleep(0);
      }
      const events = detect(observations).map((e) => ({
        ...e,
        id: id(),
        origin: "auto",
        review: "unreviewed",
      }));
      await this.store.change(mid, (m) => ({
        ...m,
        events: [...m.events.filter((e) => e.origin === "manual"), ...events],
        observations,
        summary: summarize(observations, events),
        status: "ready",
        progress: 1,
        error: null,
      }));
    } catch (e) {
      await this.store.change(mid, (m) => ({
        ...m,
        status: "failed",
        error: e.message,
      }));
    } finally {
      if (video) closeVideo(video);
      wake?.release?.().catch(() => {});
    }
  }
  async request(path, options = {}) {
    await this.initialized;
    const method = options.method || "GET";
    const body =
      typeof options.body === "string"
        ? JSON.parse(options.body)
        : options.body;
    const parts = path.split("/").filter(Boolean);
    if (path === "/api/health")
      return {
        status: "ok",
        tools: { browser: true, ocr: this.vision.state === "ready" },
        message: this.status,
        analysis: "browser-hud-v1",
      };
    if (path === "/api/profiles") {
      if (method === "GET")
        return (await this.store.all("profiles")).sort((a, b) =>
          a.name.localeCompare(b.name),
        );
      if (method === "POST") {
        if (!body.name?.trim()) throw Error("Profilname fehlt");
        const pid = id();
        await this.store.put("profiles", {
          id: pid,
          name: body.name.trim().slice(0, 80),
          profile: validateProfile(body.profile),
        });
        return { id: pid };
      }
    }
    if (parts[1] === "profiles" && method === "DELETE") {
      await this.store.remove("profiles", parts[2]);
      return null;
    }
    if (path === "/api/demo" && method === "POST") {
      const base = new URL("../demo/", import.meta.url);
      const [video, profile] = await Promise.all([
        fetch(new URL("demo.mp4", base)).then((r) => {
          if (!r.ok) throw Error("Demo konnte nicht geladen werden");
          return r.blob();
        }),
        fetch(new URL("profile.json", base)).then((r) => r.json()),
      ]);
      return this.upload(
        video,
        validateProfile(profile),
        "Synthetische-HUD-Demo.mp4",
      );
    }
    if (path === "/api/matches") {
      if (method === "GET")
        return (await this.store.all("matches")).sort((a, b) =>
          b.created.localeCompare(a.created),
        );
      if (method === "POST")
        return this.upload(
          body.get("file"),
          validateProfile(JSON.parse(body.get("profile") || "{}")),
        );
    }
    if (parts[1] !== "matches") throw Error("Unbekannte Browser-Funktion");
    const mid = parts[2];
    if (parts.length === 3) {
      if (method === "GET") return this.match(mid);
      if (method === "DELETE") {
        await this.editable(mid);
        await this.store.deleteMatch(mid);
        if (this.urls.has(mid)) URL.revokeObjectURL(this.urls.get(mid));
        this.urls.delete(mid);
        return null;
      }
    }
    if (parts[3] === "report") return this.match(mid);
    if (parts[3] === "analyze" && method === "POST") {
      await this.editable(mid);
      if ((await this.store.all("matches")).filter(busy).length >= 4)
        throw Error("Analyse-Warteschlange voll");
      const profile = validateProfile(body);
      await this.store.change(mid, (m) => ({
        ...m,
        status: "queued",
        progress: 0,
        error: null,
        profile,
      }));
      this.enqueue(mid, profile);
      return { id: mid };
    }
    if (parts[3] === "notes") {
      if (method === "POST") {
        const m = await this.match(mid);
        if (
          !Number.isFinite(body.timestamp) ||
          body.timestamp < 0 ||
          body.timestamp > m.duration ||
          !body.body?.trim() ||
          body.body.length > 2000
        )
          throw Error("Gültige Notiz und Videozeit erforderlich");
        await this.store.change(mid, (m) => ({
          ...m,
          notes: [
            ...m.notes,
            {
              id: id(),
              timestamp: body.timestamp,
              body: body.body.trim(),
              created: new Date().toISOString(),
            },
          ].sort((a, b) => a.timestamp - b.timestamp),
        }));
        return { saved: true };
      }
      if (method === "DELETE") {
        await this.store.change(mid, (m) => ({
          ...m,
          notes: m.notes.filter((n) => n.id !== parts[4]),
        }));
        return null;
      }
    }
    if (parts[3] === "events") {
      const m = await this.editable(mid),
        eid = parts[4];
      if (method === "POST" || method === "PUT") {
        if (
          ![
            "manual",
            "enemy_visible",
            "first_shot",
            "positioning",
            "rotation",
            "resources",
            "decision",
          ].includes(body.kind) ||
          !Number.isFinite(body.start) ||
          !Number.isFinite(body.end) ||
          body.start < 0 ||
          body.end < body.start ||
          body.end > m.duration ||
          !body.title?.trim() ||
          body.title.length > 150 ||
          (body.advice || "").length > 2000
        )
          throw Error("Gültiges Zeitfenster, Titel und Kategorie erforderlich");
        const old = m.events.find((e) => e.id === eid);
        if (method === "PUT" && old?.origin !== "manual")
          throw Error("Eigene Markierung nicht gefunden");
        const event = {
          ...body,
          id: eid || id(),
          origin: "manual",
          review: old?.review || "confirmed",
          confidence: 1,
          evidence: {
            source: "manual video annotation",
            limitation: "User annotation, not automatic inference",
          },
        };
        await this.store.change(mid, (m) => ({
          ...m,
          events: [...m.events.filter((e) => e.id !== event.id), event].sort(
            (a, b) => a.start - b.start,
          ),
        }));
        return { id: event.id };
      }
      if (method === "PATCH") {
        if (
          !["unreviewed", "confirmed", "dismissed"].includes(body.review) ||
          !m.events.some((e) => e.id === eid)
        )
          throw Error("Befund oder Review-Status ungültig");
        await this.store.change(mid, (m) => ({
          ...m,
          events: m.events.map((e) =>
            e.id === eid ? { ...e, review: body.review } : e,
          ),
        }));
        return { saved: true };
      }
      if (method === "DELETE") {
        await this.store.change(mid, (m) => ({
          ...m,
          events: m.events.filter((e) => e.id !== eid),
        }));
        return null;
      }
    }
    throw Error("Nicht unterstützte Browser-Aktion");
  }
  async download(mid, kind, eid) {
    if (kind === "clip") return this.clip(mid, eid);
    const m = await this.match(mid);
    if (kind === "source") {
      const source = await this.store.get("sources", mid);
      return { blob: source.blob, name: m.name };
    }
    const { observations, ...report } = m;
    if (kind === "report")
      return {
        blob: new Blob([JSON.stringify(report, null, 2)], {
          type: "application/json",
        }),
        name: "apex-review.json",
      };
    if (kind === "observations")
      return {
        blob: new Blob([JSON.stringify(observations, null, 2)], {
          type: "application/json",
        }),
        name: "observations.json",
      };
    if (kind === "export") {
      const markdown = [
        "# Apex Review",
        m.name,
        "Heuristische lokale Auswertung. Videozeiten beziehen sich auf das Original.",
        ...m.events.flatMap((e) => [
          `## ${e.start.toFixed(2)}–${e.end.toFixed(2)} s: ${e.title}`,
          `Review: ${e.review || "unreviewed"}`,
          e.advice,
          "```json",
          JSON.stringify(e.evidence, null, 2),
          "```",
        ]),
        "## Squad-Notizen",
        ...m.notes.map((n) => `${n.timestamp.toFixed(2)} s: ${n.body}`),
      ].join("\n\n");
      const archive = zipSync({
        "report.json": strToU8(JSON.stringify(report, null, 2)),
        "report.md": strToU8(markdown),
        "observations.json": strToU8(JSON.stringify(observations, null, 2)),
      });
      return {
        blob: new Blob([archive], { type: "application/zip" }),
        name: "apex-review.zip",
      };
    }
    throw Error("Unbekannter Download");
  }
  async clip(mid, eid) {
    if (!window.MediaRecorder)
      throw Error(
        "Clip-Export wird von diesem Browser nicht unterstützt. Original herunterladen und Zeitfenster verwenden.",
      );
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    const audio = AudioContext ? new AudioContext() : null;
    const resumed = audio?.resume();
    let video, stream, recorder, timer, frameRequest;
    try {
      const m = await this.editable(mid),
        e = m.events.find((e) => e.id === eid);
      if (!e) throw Error("Ereignis nicht gefunden");
      const start = Math.max(0, e.start - 3),
        end = Math.min(m.duration, e.end + 4);
      if (end - start > 120)
        throw Error(
          "Dieser Clip ist länger als zwei Minuten. Kürzeres eigenes Zeitfenster markieren oder Original mit Bericht herunterladen.",
        );
      const source = await this.store.get("sources", mid);
      video = await openVideo(source.blob);
      await seek(video, start);
      const c = document.createElement("canvas");
      c.width = video.videoWidth;
      c.height = video.videoHeight;
      const ctx = c.getContext("2d");
      ctx.drawImage(video, 0, 0);
      stream = c.captureStream(30);
      if (audio) {
        await resumed;
        const input = audio.createMediaElementSource(video),
          dest = audio.createMediaStreamDestination();
        input.connect(dest);
        for (const track of dest.stream.getAudioTracks())
          stream.addTrack(track);
        video.muted = false;
      }
      const mime = [
        "video/webm;codecs=vp8,opus",
        "video/webm",
        "video/mp4",
      ].find((t) => MediaRecorder.isTypeSupported(t));
      recorder = new MediaRecorder(
        stream,
        mime ? { mimeType: mime } : undefined,
      );
      const chunks = [];
      const result = new Promise((resolve, reject) => {
        recorder.ondataavailable = (e) => {
          if (e.data.size) chunks.push(e.data);
        };
        recorder.onerror = () => reject(Error("Clip-Aufnahme fehlgeschlagen"));
        recorder.onstop = () =>
          resolve(new Blob(chunks, { type: recorder.mimeType }));
      });
      const stop = () => {
        if (recorder.state === "recording") recorder.stop();
      };
      const draw = () => {
        ctx.drawImage(video, 0, 0);
        if (video.currentTime >= end || video.ended) stop();
        else frameRequest = requestAnimationFrame(draw);
      };
      video.onended = stop;
      video.ontimeupdate = () => {
        if (video.currentTime >= end) stop();
      };
      timer = setTimeout(stop, (end - start + 10) * 1000);
      recorder.start(100);
      await video.play();
      draw();
      const blob = await result;
      if (!blob.size) throw Error("Leerer Clip");
      return {
        blob,
        name: `apex-clip-${eid}.${blob.type.includes("mp4") ? "mp4" : "webm"}`,
      };
    } finally {
      clearTimeout(timer);
      cancelAnimationFrame(frameRequest);
      if (recorder?.state === "recording") recorder.stop();
      stream?.getTracks().forEach((t) => t.stop());
      if (video) closeVideo(video);
      if (audio) await audio.close();
    }
  }
}
function waitEvent(video, event, timeout = 20000) {
  return new Promise((resolve, reject) => {
    const done = () => {
      clearTimeout(timer);
      video.removeEventListener(event, success);
      video.removeEventListener("error", error);
    };
    const success = () => {
        done();
        resolve();
      },
      error = () => {
        done();
        reject(
          Error(
            "Videoformat wird im Browser nicht unterstützt. MP4 (H.264) oder WebM verwenden.",
          ),
        );
      };
    const timer = setTimeout(() => {
      done();
      reject(Error("Videodaten konnten nicht rechtzeitig gelesen werden"));
    }, timeout);
    video.addEventListener(event, success, { once: true });
    video.addEventListener("error", error, { once: true });
  });
}
export async function openVideo(blob) {
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  video.style.cssText =
    "position:fixed;left:-100px;width:1px;height:1px;opacity:0;pointer-events:none";
  document.body.append(video);
  video.src = URL.createObjectURL(blob);
  try {
    await waitEvent(video, "loadeddata");
    if (!Number.isFinite(video.duration)) {
      const p = waitEvent(video, "seeked");
      video.currentTime = 1e10;
      await p;
    }
    if (!Number.isFinite(video.duration) || video.duration <= 0)
      throw Error(
        "Videodauer nicht lesbar. Aufnahme als MP4/WebM exportieren.",
      );
    await seek(video, 0);
    return video;
  } catch (e) {
    closeVideo(video);
    throw e;
  }
}
export async function seek(video, t) {
  if (Math.abs(video.currentTime - t) < 0.001 && video.readyState >= 2) return;
  const promise = waitEvent(video, "seeked");
  video.currentTime = t;
  await promise;
}
function closeVideo(video) {
  video.pause();
  URL.revokeObjectURL(video.src);
  video.removeAttribute("src");
  video.load();
  video.remove();
}
