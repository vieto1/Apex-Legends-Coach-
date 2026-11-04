const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const base = process.env.APEX_PAGES_URL || "http://127.0.0.1:8787";
(async () => {
  const browser = await chromium.launch({
    executablePath: "/usr/bin/chromium",
    headless: true,
    args: ["--no-sandbox"],
  });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  const errors = [],
    requests = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("request", (r) =>
    requests.push({ method: r.method(), url: r.url() }),
  );
  let mid;
  try {
    await page.goto(base);
    await page.waitForFunction(
      () =>
        document.getElementById("systemStatus").textContent.includes("BEREIT"),
      null,
      { timeout: 90000 },
    );
    await page.locator("#tryDemo").click();
    await page.waitForFunction(
      () =>
        document
          .getElementById("analysisStatus")
          .textContent.includes("abgeschlossen") ||
        document
          .getElementById("analysisStatus")
          .textContent.includes("Fehler:"),
      null,
      { timeout: 120000 },
    );
    const status = await page.locator("#analysisStatus").innerText();
    assert(status.includes("abgeschlossen"), status);
    await page.waitForFunction(
      () => document.getElementById("player").readyState >= 2,
    );
    const stats = await page.locator("#stats").innerText();
    assert(stats.includes("90"), stats);
    assert((await page.locator("#events .event").count()) >= 7);
    await page.locator("#player").evaluate((v) => {
      v.currentTime = 1.23;
    });
    await page.locator("#useTime").click();
    assert.equal(
      await page.locator("#noteTime").evaluate((e) => e.checkValidity()),
      true,
    );
    await page.locator("#noteBody").fill("Private Browser-Notiz");
    await page.locator("#noteForm button.primary").click();
    await page.getByText("Notiz gespeichert.", { exact: true }).waitFor();
    await page
      .locator("#eventForm")
      .evaluate((el) => (el.closest("details").open = true));
    await page.locator("#eventStart").fill("1");
    await page.locator("#eventEnd").fill("2");
    await page.locator("#eventTitle").fill("Eigene Browser-Markierung");
    await page.locator("#saveMoment").click();
    await page
      .getByText("Eigene Browser-Markierung", { exact: true })
      .waitFor();
    await page.locator("#events select").first().selectOption("dismissed");
    await page.locator("#reviewFilter").selectOption("dismissed");
    assert.equal(await page.locator("#events .event").count(), 1);
    await page.locator("#reviewFilter").selectOption("");
    const zipPromise = page.waitForEvent("download");
    await page.locator("#archive").click();
    const zip = await zipPromise;
    assert.equal(await zip.failure(), null);
    const zipBytes = await fs.readFile(await zip.path());
    assert.equal(zipBytes.subarray(0, 2).toString(), "PK");
    const reportPromise = page.waitForEvent("download");
    await page.locator("#export").click();
    const report = await reportPromise;
    const data = JSON.parse(await fs.readFile(await report.path(), "utf8"));
    mid = data.id;
    assert(data.notes.some((n) => n.body === "Private Browser-Notiz"));
    assert(data.events.some((e) => e.origin === "manual"));
    // Clip encoding is performed by MediaRecorder in real time.
    const clipPromise = page.waitForEvent("download", { timeout: 30000 });
    await page
      .locator("#events")
      .getByRole("link", { name: "Clip herunterladen ↗", exact: true })
      .first()
      .click();
    const clip = await clipPromise;
    assert.equal(await clip.failure(), null);
    assert((await fs.stat(await clip.path())).size > 1000);
    await page.reload();
    await page
      .getByRole("button", { name: "Synthetische-HUD-Demo.mp4" })
      .first()
      .click();
    await page
      .locator("#notes")
      .getByText("Private Browser-Notiz", { exact: false })
      .waitFor();
    assert(
      await page
        .getByText("Eigene Browser-Markierung", { exact: true })
        .isVisible(),
    );
    await page.locator("#calibrateExisting").click();
    await page.locator("#capture").click();
    await page.locator("#profileName").fill("Browser-HUD");
    await page.locator("#saveProfile").click();
    await page.getByText("HUD-Profil gespeichert.", { exact: true }).waitFor();
    page.once("dialog", (d) => d.accept());
    await page.locator("#reanalyze").click();
    await page
      .getByText("Erneute Analyse gestartet.", { exact: true })
      .waitFor();
    await page.waitForFunction(
      () =>
        document
          .getElementById("analysisStatus")
          .textContent.includes("abgeschlossen"),
      null,
      { timeout: 120000 },
    );
    assert(
      (await page.locator("#notes").innerText()).includes(
        "Private Browser-Notiz",
      ),
    );
    assert(
      await page
        .getByText("Eigene Browser-Markierung", { exact: true })
        .isVisible(),
    );
    await page
      .locator("#calibrationDetails")
      .evaluate((el) => (el.open = false));
    await page.screenshot({
      path: "/tmp/apex-pages-desktop.png",
      fullPage: true,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    await page.screenshot({
      path: "/tmp/apex-pages-mobile.png",
      fullPage: true,
    });
    assert.deepEqual(errors, []);
    assert(!requests.some((r) => r.method !== "GET"));
    assert(
      !requests.some(
        (r) =>
          !r.url.startsWith(base) &&
          !r.url.startsWith("blob:") &&
          !r.url.startsWith("data:"),
      ),
    );
    page.once("dialog", (d) => d.accept());
    await page.locator("#deleteMatch").click();
    await page.waitForFunction(() => document.getElementById("review").hidden);
    console.log(
      JSON.stringify({
        browserOCR: true,
        observedDamage: 90,
        localPersistence: true,
        manualNotes: true,
        reanalysis: true,
        zip: true,
        clip: true,
        allRequestsGet: true,
        noExternalHosts: true,
        mobileOverflow: false,
        errors,
      }),
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
