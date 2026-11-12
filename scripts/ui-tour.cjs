// Playwright tour of the app screens: setup, placement, the Learn path (a
// node's card, a locked one, a lesson from the current circle and the next one
// opening, a review circle, a unit check), Progress, Practice and Me.
// Usage: BASE=http://localhost:8787 node scripts/ui-tour.cjs <outdir> <w> <h> <dpr> [video]
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const BASE = process.env.BASE || "http://localhost:8794";
const [, , out = "shots", W = "390", H = "844", DPR = "1", VIDEO] = process.argv;
fs.mkdirSync(out, { recursive: true });

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width: +W, height: +H },
    deviceScaleFactor: +DPR,
    ...(VIDEO ? { recordVideo: { dir: path.join(out, "video"), size: { width: +W, height: +H } } } : {}),
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  let lessonItems = [];
  page.on("response", async (r) => {
    const u = r.url();
    if (/\/api\/(lessons|practice)$/.test(u) && r.request().method() === "POST") {
      try { const j = await r.json(); if (j.items) lessonItems = j.items; } catch {}
    }
  });
  let n = 0;
  const shot = async (name, wait = 900) => {
    await page.waitForTimeout(wait);
    n += 1;
    const f = path.join(out, `${String(n).padStart(2, "0")}-${name}.png`);
    await page.screenshot({ path: f });
    console.log("shot", f);
  };
  const btn = (name) => page.getByRole("button", { name, exact: true }).first();
  const step = async (label, fn) => {
    try { await fn(); } catch (e) { console.log("FAILED at", label, e.message.split("\n")[0]); await shot("fail-" + label, 0); throw e; }
  };

  // Current question: returns the item on screen (the first in the queue we haven't answered).
  const currentItem = async () => {
    const stem = await page.locator("[data-testid=stem]").first().innerText().catch(() => "");
    return lessonItems.find((it) => stem && stem.trim().startsWith(it.stem.replace(/\$[^$]*\$/g, "").trim().slice(0, 12))) || null;
  };
  // The streak screen follows the first finished lesson of the day, whichever button led off the finish.
  const streakIfShown = async (name) => {
    const c = page.getByTestId("streak-continue");
    if (await c.waitFor({ timeout: 2500 }).then(() => true, () => false)) {
      await shot(name, 2200);
      await c.click();
    }
  };
  const answer = async (right, pickedShot) => {
    // Find item by matching radios.
    const radios = page.getByRole("radio");
    const count = await radios.count();
    let item = null;
    if (count) {
      const labels = [];
      for (let i = 0; i < count; i++) labels.push(await radios.nth(i).getAttribute("aria-label"));
      item = lessonItems.find((it) => it.choices && it.choices.every((c, i) => c === labels[i]));
      const pickText = right ? item.answer : item.choices.find((c) => c !== item.answer);
      await page.getByRole("radio", { name: pickText, exact: true }).first().click();
    } else {
      const input = page.getByLabel("Your answer");
      // SPR: the stem identifies the item.
      const txt = await page.locator("body").innerText();
      item = lessonItems.find((it) => it.type === "spr" && txt.includes(it.stem.slice(0, 20)));
      if (!item) item = lessonItems.find((it) => it.type === "spr");
      await input.fill(right ? item.answer : "99999");
    }
    if (pickedShot) await shot(pickedShot, 700);
    await btn("Check").click();
    return item;
  };

  await step("welcome", async () => {
    await page.goto(BASE);
    await page.getByRole("button", { name: "Start practicing" }).waitFor({ timeout: 30000 });
    await shot("welcome", 2600);
    await page.getByRole("button", { name: "Start practicing" }).click();
  });
  await step("age", async () => {
    await page.getByRole("radio", { name: "March" }).click();
    await page.getByLabel("Birth year").fill("2009");
    await shot("age");
    await btn("Continue").click();
  });
  await step("date", async () => {
    await page.getByRole("button", { name: "Next month" }).waitFor();
    await shot("onboarding-date", 3500);
    for (let i = 0; i < 4; i++) await page.getByRole("button", { name: "Next month" }).click();
    await page.getByRole("button", { name: "Saturday, March 13" }).click();
    await shot("onboarding-date-picked", 600);
    await page.getByTestId("onboarding-next").click();
  });
  await step("score", async () => {
    await page.getByRole("button", { name: /^Higher/ }).waitFor();
    for (let i = 0; i < 5; i++) await page.getByRole("button", { name: /^Higher/ }).click();
    await shot("onboarding-score", 2500);
    await page.getByTestId("onboarding-next").click();
  });
  await step("minutes", async () => {
    await page.getByRole("radio", { name: /^30 minutes/ }).click();
    await shot("onboarding-minutes", 2500);
    await page.getByTestId("onboarding-next").click();
  });
  await step("placement", async () => {
    await btn("Find my level").waitFor();
    await shot("placement-offer", 3000);
    await btn("Find my level").click();
    await page.getByRole("button", { name: "Check" }).waitFor({ timeout: 15000 });
    await shot("placement-question", 2000);
    // Right on the first eight, wrong after, so some skills test out and some don't.
    for (let i = 0; i < 30; i++) {
      if (await page.getByTestId("continue").count()) await page.getByTestId("continue").click();
      await page.waitForTimeout(400);
      if (await page.getByTestId("complete-continue").count()) break;
      if (!(await page.getByRole("button", { name: "Check" }).count())) { await page.waitForTimeout(600); continue; }
      await answer(i < 8);
      await page.waitForTimeout(250);
    }
    await shot("placement-done", 2500);
    await page.getByTestId("complete-continue").click();
    await streakIfShown("placement-streak");
  });
  const tab = (name) => page.getByRole("tab", { name, exact: true }).click();
  const current = () => page.locator('[aria-label$=", start here"]').first();
  // Walk the path through the API: finish the current circle `k` times (a miss every fifth answer).
  const walk = (k) => page.evaluate(async (k) => {
    const id = localStorage.getItem("testwise.learner");
    const h = { "content-type": "application/json", "x-learner": id, "x-tz-offset": String(new Date().getTimezoneOffset()) };
    const done = [];
    for (let round = 0; round < k; round++) {
      const p = await (await fetch("/api/path", { headers: h })).json();
      const n = [...p.units.flatMap((u) => u.nodes), p.end].find((x) => x.id === p.current);
      if (!n?.start) break;
      const l = await (await fetch(n.start.path, { method: "POST", headers: h, body: JSON.stringify(n.start.body) })).json();
      for (const [i, it] of l.items.entries()) {
        await fetch("/api/answers", { method: "POST", headers: h, body: JSON.stringify({ lesson_id: l.lesson_id, item_id: it.id, response: i % 5 === 4 && it.choices ? it.choices.find((c) => c !== it.answer) : it.answer, time_ms: 20000 }) });
      }
      await fetch("/api/lessons/finish", { method: "POST", headers: h, body: JSON.stringify({ lesson_id: l.lesson_id }) });
      done.push(n.id);
    }
    return done;
  }, k);
  const currentId = () => page.evaluate(async () => {
    const id = localStorage.getItem("testwise.learner");
    const p = await (await fetch("/api/path", { headers: { "x-learner": id, "x-tz-offset": String(new Date().getTimezoneOffset()) } })).json();
    return p.current;
  });

  await step("learn", async () => {
    await current().waitFor({ timeout: 15000 });
    await shot("learn", 3000);
    await current().click();
    await page.getByTestId("node-card").waitFor();
    await shot("learn-card", 900);
    await page.keyboard.press("Escape");
    const locked = page.locator('[aria-label$=", locked"]').first();
    await locked.scrollIntoViewIfNeeded();
    await locked.click();
    await page.getByTestId("node-card").waitFor();
    await shot("learn-locked", 900);
    await page.keyboard.press("Escape");
  });
  let before = null;
  await step("lesson", async () => {
    before = await currentId();
    await current().scrollIntoViewIfNeeded();
    await current().click();
    await page.getByTestId("node-start").click();
    await page.getByRole("button", { name: "Check" }).waitFor({ timeout: 15000 });
    await shot("lesson-question", 1800);
    await answer(true, "lesson-picked");
    await shot("lesson-right", 1200);
    await page.getByTestId("continue").click();
    await page.waitForTimeout(400);
    await answer(false);
    await shot("lesson-wrong", 1500);
    await btn("Ask Socrates").click();
    await shot("consent", 900);
    await btn("I agree, ask Socrates").click();
    await page.getByLabel("Your reply").waitFor({ timeout: 15000 }).catch(() => {});
    await shot("tutor", 3500);
    if (await page.getByLabel("Your reply").isVisible().catch(() => false)) {
      await page.getByLabel("Your reply").fill("I think I mixed up the sign");
      await page.getByRole("button", { name: "Send" }).click();
      await shot("tutor-reply", 3500);
    }
    await page.getByRole("button", { name: "Close Socrates" }).click();
    await page.waitForTimeout(400);
    const sol = page.getByRole("button", { name: "Show the solution" });
    if (await sol.count()) { await sol.first().click(); await shot("solution", 900); }
    // Finish the rest right.
    for (let i = 0; i < 20; i++) {
      if (await page.getByTestId("continue").count()) await page.getByTestId("continue").click();
      await page.waitForTimeout(500);
      if (await page.getByTestId("complete-continue").count()) break;
      if (!(await page.getByRole("button", { name: "Check" }).count())) { await page.waitForTimeout(800); continue; }
      await answer(true);
      await page.waitForTimeout(300);
    }
  });
  await step("complete", async () => {
    await page.getByTestId("complete-continue").waitFor({ timeout: 15000 });
    await shot("complete", 2200);
    await page.getByTestId("complete-continue").click();
    await streakIfShown("streak");
    // Back on Learn: the circle just finished turns gold and the next one opens.
    await current().waitFor({ timeout: 15000 });
    await shot("learn-unlock", 300);
    await shot("learn-after", 2200);
    const after = await currentId();
    if (after === before) throw new Error(`the next circle didn't open (still ${after})`);
    console.log("current", before, "->", after);
  });
  await step("rw-placement", async () => {
    await tab("Learn");
    await current().waitFor({ timeout: 15000 });
    const offer = btn("Find my level");
    if (!(await offer.count())) { console.log("no second-section offer"); return; }
    await offer.scrollIntoViewIfNeeded();
    await shot("learn-rw-offer", 1200);
    await offer.click();
    await page.getByRole("button", { name: "Check" }).waitFor({ timeout: 15000 });
    await shot("placement-rw-question", 2500);
    await page.getByRole("button", { name: "Quit placement quiz" }).click();
    await current().waitFor({ timeout: 15000 });
  });
  await step("review", async () => {
    // Walk on until a review circle is current, then look at it on Learn.
    for (let i = 0; i < 8 && !(await currentId()).startsWith("review:"); i++) await walk(1);
    await tab("Practice");
    await page.waitForTimeout(400);
    await tab("Learn");
    await current().waitFor({ timeout: 15000 });
    await shot("learn-review", 2500);
    await current().click();
    await page.getByTestId("node-card").waitFor();
    await shot("learn-review-card", 900);
    await page.getByTestId("node-start").click();
    await page.getByRole("button", { name: "Check" }).waitFor({ timeout: 15000 });
    await shot("review-question", 1800);
    await page.getByRole("button", { name: "Quit lesson" }).click();
    await current().waitFor({ timeout: 15000 });
  });
  await step("progress", async () => {
    await tab("Progress");
    await page.getByText("Show every week").or(page.getByText(/^This week/)).first().waitFor({ timeout: 15000 });
    await shot("progress", 1500);
    await page.mouse.wheel(0, 900);
    await shot("progress-scrolled", 800);
  });
  await step("practice", async () => {
    await tab("Practice");
    await page.getByTestId("mode-timed").waitFor({ timeout: 15000 });
    await shot("practice", 1500);
    // The recommended mode is the screen's button, not a row; "fresh" only
    // shows when Socrates can write questions here (its number is kept free).
    for (const m of ["weak", "mixed", "timed", "fresh"]) {
      let target = page.getByTestId(`mode-${m}`);
      if (!(await target.count())) {
        const best = page.getByTestId("practice-best");
        const label = (await best.getAttribute("aria-label").catch(() => "")) || "";
        const isBest = (m === "weak" && /^Practice /.test(label)) || (m === "mixed" && /mixed/.test(label));
        if (!isBest) { n += 1; console.log("skip", m); continue; }
        target = best;
      }
      await target.click();
      await page.getByRole("button", { name: "Check" }).waitFor({ timeout: 30000 });
      await shot(`practice-${m}`, 2500);
      await page.getByRole("button", { name: "Quit lesson" }).click();
      await page.getByTestId("mode-timed").waitFor({ timeout: 15000 });
    }
    await page.getByTestId("mode-skill").click();
    await shot("practice-skill-picker", 1000);
    await page.getByRole("button", { name: /^Linear equations in one variable/ }).first().click();
    await page.getByRole("button", { name: "Check" }).waitFor({ timeout: 15000 });
    await shot("practice-skill", 2000);
    await page.getByRole("button", { name: "Quit lesson" }).click();
  });
  await step("me", async () => {
    await tab("Me");
    await page.getByRole("button", { name: /^Test date/ }).waitFor({ timeout: 15000 });
    await shot("me", 1500);
    await page.getByRole("button", { name: /^Target score/ }).click();
    await shot("me-edit-score", 2500);
    await page.getByRole("button", { name: "Back" }).first().click();
  });
  await step("learn-later", async () => {
    // Further along: a unit check, then the second section's unit.
    for (let i = 0; i < 12 && !(await currentId()).startsWith("check:"); i++) await walk(1);
    await tab("Practice");
    await page.waitForTimeout(400);
    await tab("Learn");
    await current().waitFor({ timeout: 15000 });
    await shot("learn-check", 2500);
    await walk(2);
    await tab("Practice");
    await page.waitForTimeout(400);
    await tab("Learn");
    await current().waitFor({ timeout: 15000 });
    await shot("learn-next-unit", 2500);
  });
  await step("timeup", async () => {
    await tab("Practice");
    await page.getByTestId("mode-timed").waitFor({ timeout: 15000 });
    await page.clock.install();
    await page.getByTestId("mode-timed").click();
    await page.getByRole("button", { name: "Check" }).waitFor({ timeout: 30000 });
    const up = page.getByText(/^Time's up|^Time ran out/);
    for (let i = 0; i < 25; i++) { await page.clock.runFor(60000); if (await up.count()) break; }
    await up.first().waitFor({ timeout: 20000 });
    await page.clock.runFor(3000);
    await shot("timed-up", 300);
  });

  console.log("ERRORS", JSON.stringify(errors.slice(0, 20), null, 1));
  await ctx.close();
  await browser.close();
})().catch((e) => { console.error(e.message.split("\n")[0]); process.exit(1); });
