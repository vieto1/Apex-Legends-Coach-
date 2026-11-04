import { createWorker, PSM } from "tesseract.js";
const asset = (path) => new URL("../vendor/" + path, import.meta.url).href;
export class BrowserVision {
  constructor(onStatus = () => {}) {
    this.onStatus = onStatus;
    this.state = "loading";
    this.ready = this.init().catch((e) => {
      this.state = "failed";
      this.error = e;
      onStatus(
        "OCR konnte nicht geladen werden. Seite neu laden und Verbindung prüfen.",
      );
      throw e;
    });
    this.ready.catch(() => {});
  }
  async init() {
    this.worker = await createWorker("eng", 1, {
      workerPath: asset("worker.min.js"),
      corePath: asset("core/"),
      langPath: asset("lang/"),
      workerBlobURL: false,
      logger: (m) => {
        if (this.state !== "ready")
          this.onStatus(
            `Lokale Texterkennung wird vorbereitet: ${Math.round((m.progress || 0) * 100)} %`,
          );
      },
    });
    await this.worker.setParameters({
      tessedit_char_whitelist: "0123456789",
      tessedit_pageseg_mode: PSM.SINGLE_LINE,
    });
    this.state = "ready";
    this.onStatus("BEREIT · ANALYSE IM BROWSER · VIDEOS BLEIBEN LOKAL");
    return this.worker;
  }
  async number(canvas, roi) {
    if (!roi) return [null, 0];
    const w = Math.max(1, Math.round(roi[2] * canvas.width)),
      h = Math.max(1, Math.round(roi[3] * canvas.height));
    const scale = h < 40 ? 2 : 1,
      c = document.createElement("canvas");
    c.width = w * scale + 30;
    c.height = h * scale + 30;
    const ctx = c.getContext("2d", { willReadFrequently: true });
    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(
      canvas,
      roi[0] * canvas.width,
      roi[1] * canvas.height,
      w,
      h,
      15,
      15,
      w * scale,
      h * scale,
    );
    const image = ctx.getImageData(15, 15, w * scale, h * scale);
    let mean = 0;
    for (let i = 0; i < image.data.length; i += 4)
      mean += (image.data[i] + image.data[i + 1] + image.data[i + 2]) / 3;
    mean /= w * h * scale * scale;
    for (let i = 0; i < image.data.length; i += 4) {
      const gray = (image.data[i] + image.data[i + 1] + image.data[i + 2]) / 3;
      const white = mean < 127 ? gray < 128 : gray >= 128;
      image.data[i] = image.data[i + 1] = image.data[i + 2] = white ? 255 : 0;
    }
    ctx.putImageData(image, 15, 15);
    await this.ready;
    const { data } = await this.worker.recognize(c);
    const raw = data.text.trim();
    return /^\d{1,5}$/.test(raw)
      ? [Number(raw), Math.max(0, data.confidence / 100)]
      : [null, 0];
  }
  async observe(canvas, t, profile) {
    const [damage, dc] = await this.number(canvas, profile.damage_roi),
      [ammo, ac] = await this.number(canvas, profile.ammo_roi);
    const thumbnail = gray(canvas, [0, 0, 1, 1], 40, 24);
    let cut = false;
    if (this.previousFrame)
      cut = meanDifference(thumbnail, this.previousFrame) > 65;
    this.previousFrame = thumbnail;
    let motion = null;
    if (profile.minimap_roi) {
      const map = gray(canvas, profile.minimap_roi, 40, 40);
      if (this.previousMap && !cut) motion = translation(this.previousMap, map);
      this.previousMap = map;
    }
    return {
      t,
      damage,
      damage_confidence: dc,
      ammo,
      ammo_confidence: ac,
      health: profile.health_roi
        ? bar(canvas, profile.health_roi, "health")
        : null,
      shield: profile.shield_roi
        ? bar(canvas, profile.shield_roi, "shield")
        : null,
      minimap_motion: motion,
      scene_cut: cut,
      source: "browser local OCR and pixels",
      issues: [],
    };
  }
  reset() {
    this.previousMap = null;
    this.previousFrame = null;
  }
}
function pixels(canvas, roi, w, h) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(
    canvas,
    roi[0] * canvas.width,
    roi[1] * canvas.height,
    roi[2] * canvas.width,
    roi[3] * canvas.height,
    0,
    0,
    w,
    h,
  );
  return ctx.getImageData(0, 0, w, h).data;
}
function gray(canvas, roi, w, h) {
  const data = pixels(canvas, roi, w, h),
    result = new Float32Array(w * h);
  for (let i = 0; i < result.length; i++)
    result[i] = (data[i * 4] + data[i * 4 + 1] + data[i * 4 + 2]) / 3;
  return result;
}
function meanDifference(a, b) {
  return a.reduce((n, v, i) => n + Math.abs(v - b[i]), 0) / a.length;
}
export function translation(a, b) {
  let best = Infinity,
    bestX = 0,
    bestY = 0,
    still = 0;
  for (let dy = -4; dy <= 4; dy++)
    for (let dx = -4; dx <= 4; dx++) {
      let sum = 0,
        count = 0;
      for (let y = 8; y < 32; y++)
        for (let x = 8; x < 32; x++) {
          if (x >= 16 && x < 24 && y >= 16 && y < 24) continue;
          sum += Math.abs(a[y * 40 + x] - b[(y + dy) * 40 + x + dx]);
          count++;
        }
      const error = sum / count;
      if (dx === 0 && dy === 0) still = error;
      if (error < best) {
        best = error;
        bestX = dx;
        bestY = dy;
      }
    } // Require a clear, low-error translation match; rotation/zoom are otherwise unknown.
  if (best > 12 || still - best < 1) return null;
  return Math.hypot(bestX, bestY) * 4;
}
function bar(canvas, roi, kind) {
  const w = 200,
    h = 20,
    data = pixels(canvas, roi, w, h);
  let occupied = 0;
  for (let x = 0; x < w; x++) {
    let count = 0;
    for (let y = 0; y < h; y++) {
      const i = (y * w + x) * 4,
        r = data[i],
        g = data[i + 1],
        b = data[i + 2],
        v = Math.max(r, g, b),
        lo = Math.min(r, g, b),
        sat = v ? ((v - lo) / v) * 255 : 0;
      const white = sat < 65 && v > 180;
      const colored =
        kind === "health"
          ? r > 110 && r > g * 1.5 && r > b * 1.5
          : sat > 95 && v > 120;
      if (white || colored) count++;
    }
    if (count / h > 0.35) occupied++;
  }
  const fill = occupied / w;
  return fill > 0.015 ? fill : null;
}
