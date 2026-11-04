const { chromium } = require("playwright");
const assert = require("node:assert/strict");
(async () => {
  const browser = await chromium.launch({
    executablePath: "/usr/bin/chromium",
    args: ["--no-sandbox"],
  });
  const context = await browser.newContext();
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  try {
    await page.goto(process.env.APEX_PAGES_URL || "http://127.0.0.1:8787");
    await page.evaluate(() => {
      const c = document.createElement("canvas");
      c.width = 640;
      c.height = 360;
      const ctx = c.getContext("2d");
      window.recordTimer = setInterval(() => {
        ctx.fillStyle = "#20352b";
        ctx.fillRect(0, 0, 640, 360);
        ctx.fillStyle = "white";
        ctx.font = "30px sans-serif";
        ctx.fillText("SYNTHETIC " + Date.now(), 10, 100);
      }, 100);
      Object.defineProperty(navigator.mediaDevices, "getDisplayMedia", {
        value: async () => c.captureStream(10),
        configurable: true,
      });
    });
    await page.locator("#recordStart").click();
    await page.waitForTimeout(2300);
    await page.locator("#recordStop").click();
    await page.waitForFunction(
      () => document.getElementById("file").files.length > 0,
    );
    await page.locator("#submit").click();
    await page.waitForFunction(
      () =>
        document
          .getElementById("analysisStatus")
          .textContent.includes("abgeschlossen") ||
        document
          .getElementById("uploadStatus")
          .textContent.includes("Videoformat"),
      null,
      { timeout: 45000 },
    );
    const status = await page.locator("#analysisStatus").innerText();
    assert(
      status.includes("abgeschlossen"),
      await page.locator("#uploadStatus").innerText(),
    );
    await page.waitForFunction(
      () =>
        document.getElementById("player").readyState >= 2 &&
        Number.isFinite(document.getElementById("player").duration),
    );
    assert(
      await page
        .locator("#player")
        .evaluate((v) => v.duration > 1.5 && Number.isFinite(v.duration)),
    );
    assert.deepEqual(errors, []);
    const other = await page.context().newPage();
    await other.goto(process.env.APEX_PAGES_URL || "http://127.0.0.1:8787");
    await other.waitForFunction(
      () =>
        document
          .getElementById("uploadStatus")
          .textContent.includes("anderen Tab"),
      null,
      { timeout: 10000 },
    );
    await other.close();
    page.once("dialog", (d) => d.accept());
    await page.locator("#deleteMatch").click();
    await page.waitForFunction(() => document.getElementById("review").hidden);
    console.log(
      JSON.stringify({
        recording: true,
        webmDuration: true,
        localAnalysis: true,
        secondTabProtected: true,
        errors,
      }),
    );
  } finally {
    await page
      .evaluate(() => clearInterval(window.recordTimer))
      .catch(() => {});
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
