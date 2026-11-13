// Times setup like a quick first-time learner in a private window: a fresh
// browser context from the first page load until the first lesson question is
// on screen. Logs each action and reports the machine time and a human-paced
// estimate (1.5 s a tap, 0.25 s a typed digit, plus the measured waits).
// Usage: BASE=http://localhost:8787 node scripts/setup-timer.cjs [w] [h] [basics|level]
const { chromium } = require("playwright");

const BASE = process.env.BASE || "http://localhost:8787";
const [, , W = "390", H = "844", START = "basics"] = process.argv;
const TAP = 1.5;
const DIGIT = 0.25;

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: +W, height: +H } });
  const page = await ctx.newPage();
  let taps = 0;
  let digits = 0;
  const log = (what) => console.log(`${((Date.now() - t0) / 1000).toFixed(2).padStart(6)} s  ${what}`);
  const tap = async (locator, what) => {
    await locator.click();
    taps += 1;
    log(`tap ${taps}: ${what}`);
  };
  const id = (t) => page.getByTestId(t);

  const t0 = Date.now();
  await page.goto(BASE);
  await id("test-sat").waitFor({ timeout: 30000 });
  log("test picker on screen");
  await tap(id("test-sat"), "SAT");
  await tap(id("setup-next"), "Continue");
  await tap(id("welcome-start"), "Get started");
  const first = page.locator("[data-testid^=date-2]").first();
  await first.waitFor();
  await tap(first, "the first test date");
  await tap(id("setup-next"), "Continue");
  await id("goal-10").waitFor();
  await tap(id("setup-next"), "Continue (10 minutes preselected)");
  await tap(id("score-1400"), "1400");
  await tap(id("setup-next"), "Continue");
  await tap(page.getByRole("radio", { name: "March" }), "March");
  await tap(page.getByLabel("Birth year"), "the year field");
  await page.getByLabel("Birth year").pressSequentially("2009");
  digits += 4;
  log("typed 2009");
  await tap(id("age-continue"), "Continue");
  await id("start-basics").waitFor({ timeout: 15000 });
  await tap(id(START === "level" ? "start-level" : "start-basics"), START === "level" ? "Find my level" : "Start from the basics");
  await tap(id("start-go"), "Start");
  await page.locator("[data-testid=stem]").first().waitFor({ timeout: 20000 });
  const machine = (Date.now() - t0) / 1000;
  log("first question on screen");
  const human = machine + taps * TAP + digits * DIGIT;
  console.log(`\n${W}x${H}, ${START}: ${taps} taps and ${digits} typed digits`);
  console.log(`machine time ${machine.toFixed(1)} s; at a human pace (${TAP} s a tap, ${DIGIT} s a digit) about ${human.toFixed(0)} s`);
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
