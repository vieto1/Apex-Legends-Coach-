const { chromium } = require("playwright");
const AxeBuilder = require("@axe-core/playwright").default;
const assert = require("node:assert/strict");
const base = process.env.APEX_PAGES_URL || "http://127.0.0.1:8789";
(async () => {
  const browser = await chromium.launch({
    executablePath: "/usr/bin/chromium",
    args: ["--no-sandbox"],
  });
  try {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
    });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    // Seed the unchanged storage schema to verify that the new brand retains old recordings.
    const seedUrl = base.replace(/\/$/, "") + "/__storage_seed__";
    await page.route(seedUrl, (r) =>
      r.fulfill({
        status: 200,
        contentType: "text/html",
        body: "<!doctype html><title>Storage check</title>",
      }),
    );
    await page.goto(seedUrl);
    await page.evaluate(async (base) => {
      const blob = await fetch(
        base.replace(/\/$/, "") + "/assets/demo/demo.mp4",
      ).then((r) => r.blob());
      const db = await new Promise((resolve, reject) => {
        const request = indexedDB.open(
          ["apex", "review", "private"].join("-"),
          1,
        );
        request.onupgradeneeded = () => {
          for (const name of ["matches", "sources", "profiles"])
            request.result.createObjectStore(name, { keyPath: "id" });
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      await new Promise((resolve, reject) => {
        const tx = db.transaction(["matches", "sources"], "readwrite");
        tx.objectStore("sources").put({ id: "retained-recording", blob });
        tx.objectStore("matches").put({
          id: "retained-recording",
          name: "Bestehende private Aufnahme",
          status: "ready",
          duration: 15,
          progress: 1,
          profile: {},
          summary: {},
          events: [],
          observations: [],
          notes: [
            {
              id: "retained-note",
              timestamp: 1,
              body: "Diese Notiz bleibt erhalten.",
            },
          ],
          created: new Date().toISOString(),
        });
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
      });
      db.close();
    }, base);
    await page.goto(base);

    await page.evaluate(() => document.fonts.ready);
    assert((await page.title()).includes("Cossa's KI"));
    assert(!/apex[ -]review/i.test(await page.locator("body").innerText()));
    assert.equal(await page.locator(".chapter-nav a").count(), 4);
    assert.equal(await page.locator("[data-chapter-section]").count(), 4);
    const desktop = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    console.log(
      "desktop accessibility",
      JSON.stringify(
        desktop.violations.map((v) => ({
          id: v.id,
          impact: v.impact,
          nodes: v.nodes.map((n) => ({
            target: n.target,
            summary: n.failureSummary,
          })),
        })),
      ),
    );
    assert.equal(desktop.violations.length, 0);
    await page.evaluate(() => scrollTo(0, 250));
    await page.waitForTimeout(150);
    assert(
      await page
        .locator(".sanctum-layer")
        .evaluate(
          (el) => parseFloat(el.style.getPropertyValue("--layer-y")) > 0,
        ),
    );
    await page.evaluate(() => scrollTo(0, 0));
    await page.waitForTimeout(150);
    await page.locator("#motionToggle").click();
    assert.equal(
      await page.locator("body").getAttribute("data-motion"),
      "paused",
    );
    await page.locator("#motionToggle").click();
    await page.screenshot({ path: "/tmp/cossas-ki-desktop.png" });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(500);
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    await page.locator("#navToggle").click();
    assert.equal(
      await page.locator("#navToggle").getAttribute("aria-expanded"),
      "true",
    );
    await page.keyboard.press("Escape");
    assert.equal(
      await page.locator("#navToggle").getAttribute("aria-expanded"),
      "false",
    );
    assert.equal(
      await page.evaluate(() => document.activeElement.id),
      "navToggle",
    );
    await page.screenshot({ path: "/tmp/cossas-ki-mobile.png" });
    await page.locator("#navToggle").click();
    await page.locator('#navLinks a[href="#analyse"]').click();
    await page.waitForTimeout(1300);
    assert.equal(
      await page.locator("#navToggle").getAttribute("aria-expanded"),
      "false",
    );
    assert(await page.locator("#analyseTitle").isVisible());
    const mobile = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    console.log(
      "mobile accessibility",
      mobile.violations.map((v) => ({
        id: v.id,
        impact: v.impact,
        nodes: v.nodes.map((n) => ({
          target: n.target,
          summary: n.failureSummary,
        })),
      })),
    );
    assert.equal(mobile.violations.length, 0);
    await page.screenshot({ path: "/tmp/cossas-ki-tools-mobile.png" });
    const archiveButton = page.getByRole("button", {
      name: "Bestehende private Aufnahme",
    });
    await archiveButton.focus();
    await page.waitForTimeout(5500);
    assert.equal(
      await page.evaluate(() => document.activeElement?.dataset.matchId),
      "retained-recording",
    );
    await page
      .getByRole("button", { name: "Bestehende private Aufnahme" })
      .click();
    await page
      .locator("#notes")
      .getByText("Diese Notiz bleibt erhalten.", { exact: false })
      .waitFor();
    for (const width of [320, 360, 390, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.waitForTimeout(80);
      const overflowing = await page
        .locator(".studio-shell")
        .evaluate((root) =>
          [
            ...root.querySelectorAll(
              "button,input,select,textarea,.panel,.stat",
            ),
          ]
            .filter(
              (el) =>
                el.getBoundingClientRect().width > 0 &&
                el.getBoundingClientRect().right > innerWidth + 1,
            )
            .map((el) => el.id || el.className),
        );
      assert.deepEqual(overflowing, [], `Overflow at ${width}px`);
    }

    await context.close();
    const reduced = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      reducedMotion: "reduce",
    });
    const rp = await reduced.newPage();
    await rp.goto(base);
    assert.equal(
      await rp.locator("body").getAttribute("data-motion"),
      "paused",
    );
    assert.equal(await rp.locator("#motionToggle").isDisabled(), true);
    await rp.evaluate(() => scrollTo(0, 280));
    await rp.waitForTimeout(100);
    assert.equal(
      await rp
        .locator(".sanctum-layer")
        .evaluate((e) => getComputedStyle(e).transform),
      "none",
    );
    assert.equal(
      await rp.locator(".leaves").evaluate((e) => getComputedStyle(e).display),
      "none",
    );
    await reduced.close();
    assert.deepEqual(errors, []);
    console.log(
      JSON.stringify({
        branding: true,
        chapters: 4,
        parallax: true,
        pauseMotion: true,
        mobileMenu: true,
        reducedMotion: true,
        accessibilityViolations: 0,
        retainedStorage: true,
        responsiveWidths: [320, 360, 390, 768, 1024, 1440],
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
