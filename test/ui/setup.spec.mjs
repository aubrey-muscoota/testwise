// Setup at three screen sizes against the baselines in test/ui/__screenshots__.
// The page is the setup review page (?lab=setup), which shows each of the
// app's own setup steps with fixtures from app/src/lab/setup.json
// (scripts/setup-lab-fixtures.mjs, built from the exam packs). The clock is
// fixed at Nov 12, 2026, so the date cards are the same on every run.
//
//   npm run build:app && npx playwright test            compare
//   npx playwright test --update-snapshots              accept a reviewed change
import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

const fixtures = JSON.parse(readFileSync(new URL("../../app/src/lab/setup.json", import.meta.url), "utf8"));
const NOW = new Date("2026-11-12T12:00:00-05:00");

const STEPS = ["picker", "welcome", "date", "calendar", "goal", "score", "age", "start", "edit-date", "edit-goal", "edit-score"];

async function open(page, step) {
  const errors = [];
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  await page.clock.install({ time: NOW });
  await page.goto(`/?lab=setup&step=${step}`);
  await page.getByTestId("lab-ready").waitFor({ timeout: 30_000 });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(1000);
  return errors;
}

for (const step of STEPS) {
  test(`setup ${step}`, async ({ page }) => {
    const errors = await open(page, step);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, "page wider than the viewport").toBeLessThanOrEqual(0);
    // One primary button, on screen.
    const primary = page.getByTestId(step === "welcome" ? "welcome-start" : step === "age" ? "age-continue" : step === "start" ? "start-go" : "setup-next");
    await expect(primary).toBeVisible();
    const box = await primary.boundingBox();
    expect(box.y + box.height, "button below the screen").toBeLessThanOrEqual(page.viewportSize().height);
    await expect(page).toHaveScreenshot(`setup-${step}.png`);
    expect(errors, "console errors").toEqual([]);
  });
}

test("the picker lists every pack; tests that aren't ready can't be picked", async ({ page }) => {
  await open(page, "picker");
  for (const x of fixtures.exams) await expect(page.getByTestId(`test-${x.id}`)).toBeVisible();
  const off = fixtures.exams.filter((x) => !x.ready);
  expect(off.length).toBeGreaterThan(0);
  await expect(page.getByTestId("setup-next")).toBeDisabled();
  for (const x of off) {
    await page.getByTestId(`test-${x.id}`).click({ force: true });
    await expect(page.getByTestId(`test-${x.id}`)).toContainText("Not ready yet");
  }
  await expect(page.getByTestId("setup-next")).toBeDisabled();
  const ready = fixtures.exams.find((x) => x.ready);
  await page.getByTestId(`test-${ready.id}`).click();
  await expect(page.getByTestId("setup-next")).toBeEnabled();
});

test("the date step shows only days after today, and the calendar escape works", async ({ page }) => {
  await open(page, "date");
  const ahead = fixtures.exam.test_dates.filter((d) => d.date > "2026-11-12").slice(0, 4);
  for (const d of ahead) await expect(page.getByTestId(`date-${d.date}`)).toBeVisible();
  await page.getByTestId("date-other").click();
  await expect(page.getByRole("button", { name: "Back to the dates" })).toBeVisible();
  await page.getByRole("button", { name: "Back to the dates" }).click();
  await page.getByTestId("date-none").click();
  await expect(page.getByTestId("setup-next")).toBeEnabled();
});

test("a day after the first test date drops it", async ({ page }) => {
  const first = fixtures.exam.test_dates[0].date;
  await page.clock.install({ time: new Date(`${first}T09:00:00-05:00`) });
  await page.goto(`/?lab=setup&step=date`);
  await page.getByTestId("lab-ready").waitFor({ timeout: 30_000 });
  await expect(page.getByTestId(`date-${fixtures.exam.test_dates[1].date}`)).toBeVisible();
  await expect(page.getByTestId(`date-${first}`)).toHaveCount(0);
});
