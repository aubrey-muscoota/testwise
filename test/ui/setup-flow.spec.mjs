// Setup's flow over the real app (not the lab), with the API mocked in the
// page: what a learner reaches after each answer, a reload, and an answer the
// server refuses. No screenshots; the lab spec (setup.spec.mjs) covers looks.
//
//   npm run build:app && npx playwright test test/ui/setup-flow.spec.mjs
import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

const fixtures = JSON.parse(readFileSync(new URL("../../app/src/lab/setup.json", import.meta.url), "utf8"));
const NOW = new Date("2026-11-12T12:00:00-05:00");
const SCORE = fixtures.exam.score.targets[0].value;

// Answers the app's API calls from `routes` ("GET /api/profile": body or
// (request) => [status, body]); anything else gets a 500. Returns the calls made.
async function mockApi(page, routes) {
  const calls = [];
  await page.route("**/api/**", async (route) => {
    const req = route.request();
    const key = `${req.method()} ${new URL(req.url()).pathname}`;
    calls.push(key);
    const r = routes[key];
    const [status, body] = typeof r === "function" ? r(req) : r !== undefined ? [200, r] : [500, { error: "not mocked" }];
    await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
  });
  return calls;
}

test.beforeEach(async ({}, info) => {
  test.skip(info.project.name !== "iphone-15", "flow checks run at one size");
});

test("a returning learner with XP and no profile goes on to Learn after the score", async ({ page }) => {
  await page.clock.install({ time: NOW });
  await page.addInitScript(() => {
    localStorage.setItem("testwise.learner", "legacy-learner");
    localStorage.setItem("testwise.placementDone.legacy-learner", "1");
  });
  const calls = await mockApi(page, {
    "GET /api/exam": fixtures.exam,
    "GET /api/tree": {
      exam: { id: fixtures.exam.id, name: fixtures.exam.name }, domains: [], learner: { age_confirmed: true, ai_consent: false },
      stats: { xp: 120, streak: 0, lessons_today: 0, xp_today: 0, reviews_due: 0 },
    },
    "GET /api/profile": { onboarded: false, exam_date: null, not_booked: false, target_score: null, daily_minutes: null },
    "POST /api/profile": { ok: true },
  });
  await page.goto("/");
  await page.getByTestId("date-none").click();
  await page.getByTestId("setup-next").click();
  await page.getByTestId("goal-10").click();
  await page.getByTestId("setup-next").click();
  await page.getByTestId(`score-${SCORE}`).click();
  await page.getByTestId("setup-next").click();
  await expect(page.getByTestId(`score-${SCORE}`)).toHaveCount(0);
  await expect(page.getByRole("tab", { name: /Learn/ }).first()).toBeVisible();
  expect(calls.filter((c) => c === "POST /api/profile")).toHaveLength(1);
});
